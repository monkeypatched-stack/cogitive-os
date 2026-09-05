"""Kernel security boundary — agents/LLMs propose; this module decides.

Pipeline for every security-sensitive mutation:

    AUTH → AUTHZ (OPA) → IDEMPOTENCY → AUDIT_INTENT → MUTATION → AUDIT_RESULT

Unknown/missing infrastructure is deny unless COGNITIVEOS_ALLOW_INSECURE_DEV_MODE.

Internal mutations that do not go through this boundary (classified, not exempted
by being "internal"):

mutation: MongoAuditStore.append / MemoryDurableAuditStore.append
authority: kernel AuditLog
why trusted: append-only forensic record; no authorization grant
required authentication: caller already passed AUTH or is recording a denial
required policy: none (recording is not permission)
required audit: this IS the audit path

mutation: Redis actor index hset during Mongo reconstruction
authority: Mongo actor_state documents
why trusted: cache of durable registry; Redis cannot create actors
required authentication: control-plane process identity
required policy: none (index rebuild)
required audit: reconstruction is logged, not a user mutation

mutation: JWT jti revocation list / refresh-token store
authority: auth service after verified credentials
why trusted: identity plane, not agent-proposed
required authentication: valid prior credential or admin
required policy: auth service routes
required audit: auth.denied / login events

mutation: capability dispatch dedup Redis claims
authority: kernel execution after AUTHZ
why trusted: anti-replay, not source of permission
required authentication: already on governed path
required policy: already evaluated
required audit: execution audit around the capability
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Awaitable, Callable, Iterator, TypeVar

from src.monkey_brain.kernel.audit import AuditPersistenceError, get_audit_log
from src.monkey_brain.kernel.production_gates import (
    idempotency_fail_closed,
    insecure_dev_mode,
    require_opa,
)
from src.monkey_brain.kernel.trusted_auth import (
    get_trusted_auth,
    mfa_allows_operation,
    strip_untrusted_security_signals,
)

logger = logging.getLogger("agentos.security_boundary")

T = TypeVar("T")

PIPELINE_STAGES = (
    "AUTH",
    "AUTHZ",
    "IDEMPOTENCY",
    "AUDIT_INTENT",
    "MUTATION",
    "AUDIT_RESULT",
)

_pipeline: ContextVar[list[str] | None] = ContextVar("governed_pipeline", default=None)
_commitment: ContextVar[bool] = ContextVar("commitment_active", default=False)
_privileged_infra: ContextVar[bool] = ContextVar("privileged_infra", default=False)
_LAST_PIPELINE: list[str] = []


class SecurityBoundaryDenied(Exception):
    """Raised when the kernel refuses a proposed mutation."""

    def __init__(self, reason: str, *, stage: str = "") -> None:
        self.reason = reason
        self.stage = stage
        super().__init__(reason)


def pipeline_stages() -> list[str]:
    current = _pipeline.get()
    if current:
        return list(current)
    return list(_LAST_PIPELINE)


def commitment_active() -> bool:
    """True while a security-critical effect is inside run_governed_mutation."""
    return bool(_commitment.get())


def privileged_infra_active() -> bool:
    """True inside an explicit privileged-infrastructure context."""
    return bool(_privileged_infra.get())


@contextmanager
def privileged_infrastructure(reason: str) -> Iterator[None]:
    """Allow kernel/test bootstrap writes that are not agent-proposed.

    Document `reason` at each call site. Agent-controlled code must not
    enter this context.
    """
    token = _privileged_infra.set(True)
    try:
        logger.debug("privileged infrastructure: %s", reason)
        yield
    finally:
        _privileged_infra.reset(token)


def assert_state_mutation_allowed(operation: str) -> None:
    """Fail closed unless this write is inside a commitment or privileged infra.

    Insecure-dev remains the local-test bypass (same posture as ensure_governed).
    """
    if commitment_active() or privileged_infra_active():
        return
    if insecure_dev_mode():
        return
    raise SecurityBoundaryDenied(f"ungoverned state mutation: {operation}", stage="MUTATION")


def _note(stage: str) -> None:
    current = _pipeline.get()
    if current is not None:
        current.append(stage)


def build_opa_input(*, action: str, resource: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """OPA input from kernel evidence only. Agent extra cannot set auth."""
    evidence = get_trusted_auth()
    trusted = evidence.to_opa_auth()
    ctx = strip_untrusted_security_signals(extra or {})
    ctx["trusted_auth"] = trusted
    ctx["auth"] = trusted
    return {
        "auth": trusted,
        "action": action,
        "resource": resource,
        "context": ctx,
        "runtime_id": evidence.principal_id or "unknown",
    }


async def _authorize(action: str, resource: str, extra: dict[str, Any] | None) -> dict[str, Any]:
    from src.monkey_brain.kernel.governance import get_governance_engine

    gov = get_governance_engine()
    opa_input = build_opa_input(action=action, resource=resource, extra=extra)
    result = await gov.evaluate(opa_input["runtime_id"], action, opa_input["context"])
    if not result.get("allowed"):
        raise SecurityBoundaryDenied(result.get("reason") or "denied by policy", stage="AUTHZ")
    return result


def _assert_auth() -> None:
    evidence = get_trusted_auth()
    if insecure_dev_mode():
        _note("AUTH")
        return
    if not evidence.authenticated or not evidence.token_valid:
        raise SecurityBoundaryDenied("unauthenticated", stage="AUTH")
    if not mfa_allows_operation(evidence):
        raise SecurityBoundaryDenied("mfa_required", stage="AUTH")
    _note("AUTH")


def _assert_idempotency(operation_id: str = "") -> None:
    if insecure_dev_mode() and not idempotency_fail_closed():
        _note("IDEMPOTENCY")
        return
    try:
        from src.monkey_brain.api.idempotency import get_idempotency_store
        store = get_idempotency_store()
        if store is None or not store.is_available():
            raise SecurityBoundaryDenied("idempotency store missing", stage="IDEMPOTENCY")
        ping = getattr(store._backend, "ping", None)
        if callable(ping):
            ping()
        if operation_id:
            claimed, existing = store.reserve(f"governed:{operation_id}", operation_id)
            if not claimed:
                if existing is None:
                    raise SecurityBoundaryDenied("idempotency store missing", stage="IDEMPOTENCY")
                if existing.state in ("abandoned", "completed", "in_progress"):
                    raise SecurityBoundaryDenied(
                        f"idempotency admission denied ({existing.state})",
                        stage="IDEMPOTENCY",
                    )
    except SecurityBoundaryDenied:
        raise
    except Exception as exc:
        if idempotency_fail_closed():
            raise SecurityBoundaryDenied(f"idempotency unavailable: {exc}", stage="IDEMPOTENCY") from exc
        logger.warning("idempotency store probe failed in insecure-dev: %s", exc)
    _note("IDEMPOTENCY")


def _release_admission(operation_id: str) -> None:
    try:
        from src.monkey_brain.api.idempotency import get_idempotency_store
        get_idempotency_store().release(f"governed:{operation_id}")
    except Exception:
        logger.debug("idempotency release skipped for %s", operation_id, exc_info=True)


def _complete_admission(operation_id: str, body: dict[str, Any]) -> None:
    try:
        from src.monkey_brain.api.idempotency import get_idempotency_store
        get_idempotency_store().complete(f"governed:{operation_id}", operation_id, body)
    except Exception:
        logger.debug("idempotency complete skipped for %s", operation_id, exc_info=True)


def _reopen_admission_for_retry(operation_id: str) -> None:
    """Re-open the governed:{operation_id} reservation for a sanctioned
    execution-attempt retry (Part C/F/G).

    Only called from retry_execution_attempt(), never from the first-
    attempt path — a first attempt that completed (success OR unknown)
    stays fail-closed to any *other* caller re-using the same
    operation_id (see test_duplicate_operation_id_no_second_effect).
    Retrying is safe here specifically because retry_execution_attempt()
    already validated it via execution_attempt.assert_retry_safe() before
    calling this.
    """
    try:
        from src.monkey_brain.api.idempotency import get_idempotency_store
        get_idempotency_store().release(f"governed:{operation_id}")
    except Exception:
        logger.debug("idempotency reopen skipped for %s", operation_id, exc_info=True)


def _audit_evidence(policy: dict[str, Any], operation_id: str, tx_class: str) -> dict[str, Any]:
    evidence = get_trusted_auth()
    return {
        "stage": "AUDIT_INTENT",
        "operation_id": operation_id,
        "transaction_class": tx_class,
        "principal_type": evidence.principal_type,
        "mfa_status": evidence.mfa_status,
        "authenticated": evidence.authenticated,
        "policy_allowed": bool(policy.get("allowed")),
        "policy_decision": str(policy.get("reason") or "allow"),
        "opa_source": str(policy.get("source") or ""),
    }


def _audit_attempt_event(
    *,
    evidence: Any,
    action: str,
    resource: str,
    operation_id: str,
    attempt: Any,
    event: str,
    outcome: str = "pending",
) -> None:
    """Best-effort durable evidence for an attempt lifecycle event (Part I:
    attempt_created/started/submitted/... at minimum). This is supplementary
    to the gating `.intent`/`.result` audit calls below (which already fail
    closed per P2/P4) — a failure here is logged, not raised, so telemetry
    about a NOT_STARTED/READY/STARTED/SUBMITTED transition never itself
    blocks or reverses a pipeline stage that already passed its own gate.
    """
    try:
        get_audit_log().record(
            runtime_id=evidence.principal_id or "unknown",
            event_type="execute",
            action=f"{action}.attempt.{event}",
            actor=evidence.principal_id,
            target=resource,
            outcome=outcome,
            details={
                "stage": f"ATTEMPT_{event.upper()}",
                "operation_id": operation_id,
                "execution_attempt_id": attempt.execution_attempt_id,
                "attempt_number": attempt.attempt_number,
                "state": attempt.state.value,
            },
            critical=False,
            correlation_id=operation_id,
        )
    except Exception:
        logger.debug(
            "attempt audit event %s skipped for %s", event, attempt.execution_attempt_id, exc_info=True,
        )


def _audit_reconciliation_event(
    *,
    evidence: Any,
    action: str,
    resource: str,
    operation_id: str,
    attempt: Any,
    event: str,
    outcome: str = "pending",
    extra: dict[str, Any] | None = None,
) -> None:
    """Durable, distinct evidence for a reconciliation lifecycle event
    (Part 14): reconciliation_required / reconciliation_started /
    reconciliation_succeeded / reconciliation_failed /
    reconciliation_unresolved / retry_authorized. Best-effort like
    _audit_attempt_event — supplementary telemetry, not the gating record.
    """
    try:
        details: dict[str, Any] = {
            "stage": f"RECONCILIATION_{event.upper()}",
            "operation_id": operation_id,
            "execution_attempt_id": attempt.execution_attempt_id,
            "attempt_number": attempt.attempt_number,
            "reconciliation_id": attempt.reconciliation_id,
            "state": attempt.state.value,
        }
        if extra:
            details.update(extra)
        get_audit_log().record(
            runtime_id=evidence.principal_id or "unknown",
            event_type="execute",
            action=f"{action}.reconciliation.{event}",
            actor=evidence.principal_id,
            target=resource,
            outcome=outcome,
            details=details,
            critical=False,
            correlation_id=operation_id,
        )
    except Exception:
        logger.debug(
            "reconciliation audit event %s skipped for %s", event, attempt.execution_attempt_id, exc_info=True,
        )


def _mark_unknown_and_require_reconciliation(
    *, evidence: Any, action: str, resource: str, operation_id: str, attempt: Any, extra: dict[str, Any] | None = None,
) -> None:
    """UNKNOWN is never a resting state (Part 3/16): the moment an attempt
    lands on UNKNOWN, it advances immediately to RECONCILIATION_REQUIRED —
    automatic bookkeeping, not itself an outcome claim, so it needs no
    reconciliation evidence of its own.
    """
    from src.monkey_brain.kernel.execution_attempt import ExecutionAttemptState, transition_attempt

    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.UNKNOWN, evidence=extra)
    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.RECONCILIATION_REQUIRED)
    _audit_reconciliation_event(
        evidence=evidence, action=action, resource=resource, operation_id=operation_id,
        attempt=attempt, event="required",
    )


async def _execute_attempt_pipeline(
    *,
    action: str,
    resource: str,
    op_id: str,
    mutate: Callable[[], Awaitable[T]] | Callable[[], T],
    policy: dict[str, Any],
    ledger: Any,
    evidence: Any,
    idempotent_effect: bool,
    reconciled: bool = False,
) -> T:
    """Shared tail of the governed pipeline: IDEMPOTENCY -> DURABLE
    COMMITMENT (AUDIT_INTENT) -> EXECUTION ATTEMPT -> EFFECT OUTCOME ->
    DURABLE AUDIT RESULT (Policy 10), driving both the commitment ledger
    (P1-P9) and the execution-attempt state machine (Part A-D) in
    lockstep.

    The execution attempt is allocated only AFTER ledger.transition(...,
    AUDIT_INTENT_RECORDED) — i.e. only once the commitment is itself
    durable (Policy 1: commitment requires durable audit intent, not
    merely AUTH+AUTHZ+idempotency admission). If audit-intent persistence
    fails, no attempt is ever created for this call (Invariant 5: every
    execution attempt belongs to an EXISTING commitment).

    One trusted transition mechanism (Part M step 4): both
    run_governed_mutation (attempt #1) and retry_execution_attempt
    (attempt #2+) call this — neither duplicates the state-transition
    logic itself, and neither allocates an attempt on its own.
    """
    from src.monkey_brain.kernel.execution_attempt import (
        ExecutionAttemptState,
        new_attempt_after,
        transition_attempt,
    )
    from src.monkey_brain.kernel.security_operation import (
        AuditResultUnavailable,
        SecurityOperationState,
        UnknownOutcomeError,
        classify_external_exception,
    )

    mutations = 0
    _assert_idempotency(op_id)
    try:
        get_audit_log().record(
            runtime_id=evidence.principal_id or "unknown",
            event_type="execute",
            action=f"{action}.intent",
            actor=evidence.principal_id,
            target=resource,
            outcome="pending",
            policy_decision=str(policy.get("reason") or "allow"),
            # Commitment evidence ONLY (Policy 5) — no execution_attempt_id
            # here: no attempt has been allocated yet at this point.
            details=_audit_evidence(policy, op_id, ledger.get(op_id).transaction_class.value),
            critical=True,
            correlation_id=op_id,
        )
    except AuditPersistenceError:
        _release_admission(op_id)
        raise
    ledger.transition(op_id, SecurityOperationState.AUDIT_INTENT_RECORDED)
    _note("AUDIT_INTENT")

    # COMMITTED. Only now may an execution attempt exist for this operation.
    attempt = new_attempt_after(op_id, idempotent_effect=idempotent_effect, reconciled=reconciled)
    _audit_attempt_event(
        evidence=evidence, action=action, resource=resource, operation_id=op_id,
        attempt=attempt, event="created",
    )
    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.READY)
    _audit_attempt_event(
        evidence=evidence, action=action, resource=resource, operation_id=op_id,
        attempt=attempt, event="ready",
    )
    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.STARTED)
    _audit_attempt_event(
        evidence=evidence, action=action, resource=resource, operation_id=op_id,
        attempt=attempt, event="started",
    )
    ledger.transition(op_id, SecurityOperationState.EXECUTING)
    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.SUBMITTED)
    _audit_attempt_event(
        evidence=evidence, action=action, resource=resource, operation_id=op_id,
        attempt=attempt, event="submitted",
    )
    try:
        result = mutate()
        if hasattr(result, "__await__"):
            result = await result  # type: ignore[misc]
        mutations = 1
        _note("MUTATION")
    except Exception as exc:
        kind = classify_external_exception(exc)
        outcome = "unknown" if kind == "unknown" else "failure"
        attempt_state = ExecutionAttemptState.UNKNOWN if kind == "unknown" else ExecutionAttemptState.FAILED
        state = (
            SecurityOperationState.RECONCILIATION_REQUIRED
            if kind == "unknown"
            else SecurityOperationState.FAILED
        )
        try:
            get_audit_log().record(
                runtime_id=evidence.principal_id or "unknown",
                event_type="execute",
                action=f"{action}.result",
                actor=evidence.principal_id,
                target=resource,
                outcome=outcome,
                details={
                    "stage": "AUDIT_RESULT",
                    "mutations": mutations,
                    "operation_id": op_id,
                    "execution_state": state.value,
                    "execution_attempt_id": attempt.execution_attempt_id,
                    "attempt_number": attempt.attempt_number,
                    "state": attempt_state.value,
                },
                critical=True,
                correlation_id=op_id,
            )
            _note("AUDIT_RESULT")
        except AuditPersistenceError:
            ledger.transition(
                op_id, SecurityOperationState.RECONCILIATION_REQUIRED,
                audit_result="unavailable", mutations=mutations,
            )
            # Effect outcome genuinely unresolved (audit-result persistence
            # failed too) — never claim FAILED/SUCCEEDED here (P5).
            _mark_unknown_and_require_reconciliation(
                evidence=evidence, action=action, resource=resource, operation_id=op_id,
                attempt=attempt, extra={"audit_result": "unavailable"},
            )
            logger.error("audit result persistence failed after mutation error op=%s", op_id)
            raise AuditResultUnavailable(
                "audit result unavailable after effect error",
                operation_id=op_id,
                effect_occurred=mutations > 0,
            ) from exc
        if kind == "unknown":
            _mark_unknown_and_require_reconciliation(
                evidence=evidence, action=action, resource=resource, operation_id=op_id, attempt=attempt,
            )
            ledger.transition(op_id, state)
            _complete_admission(op_id, {"outcome": "unknown"})
            raise UnknownOutcomeError(str(exc), operation_id=op_id) from exc
        transition_attempt(attempt.execution_attempt_id, attempt_state)
        ledger.transition(op_id, state)
        _release_admission(op_id)
        raise

    try:
        get_audit_log().record(
            runtime_id=evidence.principal_id or "unknown",
            event_type="execute",
            action=f"{action}.result",
            actor=evidence.principal_id,
            target=resource,
            outcome="success",
            details={
                "stage": "AUDIT_RESULT",
                "mutations": mutations,
                "operation_id": op_id,
                "execution_state": SecurityOperationState.SUCCEEDED.value,
                "execution_attempt_id": attempt.execution_attempt_id,
                "attempt_number": attempt.attempt_number,
                "state": ExecutionAttemptState.SUCCEEDED.value,
            },
            critical=True,
            correlation_id=op_id,
        )
    except AuditPersistenceError as exc:
        ledger.transition(
            op_id, SecurityOperationState.RECONCILIATION_REQUIRED,
            audit_result="unavailable", mutations=mutations,
        )
        # The effect DID occur (mutate() returned) — the attempt itself
        # succeeded. What's unresolved is durable confirmation of that
        # fact, which is a commitment/audit-durability concern, not an
        # execution-attempt-outcome concern (Part E: attempt state must
        # not claim more, or less, certainty than its own evidence supports).
        transition_attempt(
            attempt.execution_attempt_id, ExecutionAttemptState.SUCCEEDED,
            evidence={"audit_result": "unavailable"},
        )
        raise AuditResultUnavailable(
            "audit result unavailable after successful effect",
            operation_id=op_id,
            effect_occurred=True,
        ) from exc
    transition_attempt(attempt.execution_attempt_id, ExecutionAttemptState.SUCCEEDED)
    ledger.transition(op_id, SecurityOperationState.SUCCEEDED)
    _note("AUDIT_RESULT")
    _complete_admission(op_id, {"outcome": "success"})
    return result  # type: ignore[return-value]


async def run_governed_mutation(
    *,
    action: str,
    resource: str,
    mutate: Callable[[], Awaitable[T]] | Callable[[], T],
    extra: dict[str, Any] | None = None,
    skip_authz: bool = False,
    operation_id: str | None = None,
    idempotent_effect: bool = False,
) -> T:
    """Execute a security-sensitive mutation only after the full pipeline.

    skip_authz is for callers that already completed GovernanceEngine.evaluate
    in the same request (HTTP routes). AUTH, idempotency, and audit still run.

    Audit intent failure: no effect.
    Audit result failure after effect: UNKNOWN / reconciliation required,
    never reported as a clean success.
    External timeout: UNKNOWN, not FAILED.

    Creates execution ATTEMPT #1 under a brand-new commitment. A retry that
    must reuse this operation_id (Part F/G) goes through
    retry_execution_attempt(), never through this function again with the
    same operation_id — see DuplicateSecurityOperation below.

    idempotent_effect documents (on attempt #1) whether the underlying
    external effect honors a stable idempotency key end to end; it is not
    itself trusted as retry authorization — retry_execution_attempt()
    requires its own explicit idempotent_effect argument.
    """
    from src.monkey_brain.kernel.security_operation import (
        DuplicateSecurityOperation,
        SecurityOperation,
        SecurityOperationState,
        classify_transaction,
        get_operation_ledger,
        new_operation_id,
    )

    if commitment_active():
        result = mutate()
        if hasattr(result, "__await__"):
            return await result  # type: ignore[misc]
        return result  # type: ignore[return-value]
    token = _pipeline.set([])
    committed = _commitment.set(True)
    op_id = operation_id or new_operation_id()
    tx_class = classify_transaction(action)
    ledger = get_operation_ledger()
    evidence = get_trusted_auth()
    try:
        _assert_auth()
        policy = {"allowed": True, "reason": "skipped"}
        if skip_authz:
            _note("AUTHZ")
        else:
            if require_opa() or not insecure_dev_mode():
                policy = await _authorize(action, resource, extra)
            _note("AUTHZ")
        try:
            ledger.create(SecurityOperation(
                operation_id=op_id,
                action=action,
                resource=resource,
                state=SecurityOperationState.AUTHORIZED,
                transaction_class=tx_class,
                principal_id=evidence.principal_id,
                mfa_status=evidence.mfa_status,
                policy_decision=str(policy.get("reason") or "allow"),
                idempotency_key=str((extra or {}).get("idempotency_key") or op_id),
            ))
        except DuplicateSecurityOperation as exc:
            raise SecurityBoundaryDenied(
                f"duplicate operation {exc.operation_id}",
                stage="IDEMPOTENCY",
            ) from exc
        return await _execute_attempt_pipeline(
            action=action, resource=resource, op_id=op_id, mutate=mutate,
            policy=policy, ledger=ledger, evidence=evidence,
            idempotent_effect=idempotent_effect,
        )
    finally:
        snap = _pipeline.get()
        if snap:
            _LAST_PIPELINE[:] = list(snap)
        _commitment.reset(committed)
        _pipeline.reset(token)


async def retry_execution_attempt(
    *,
    operation_id: str,
    mutate: Callable[[], Awaitable[T]] | Callable[[], T],
    extra: dict[str, Any] | None = None,
    skip_authz: bool = False,
    idempotent_effect: bool = False,
) -> T:
    """The ONLY sanctioned way to add execution attempt #2+ under an
    existing commitment (Part C, F, G, M).

    Never mints a new operation_id and never re-authorizes from stored or
    agent-supplied state (Part H) — AUTH, AUTHZ, IDEMPOTENCY admission,
    AUDIT_INTENT, MUTATION and AUDIT_RESULT are all re-run in full for the
    new attempt, exactly as for attempt #1.

    Refused when:
      - there is no existing commitment for operation_id
      - the operation already SUCCEEDED (retrying a succeeded operation
        would risk a duplicate effect)
      - the operation is currently in flight (AUTHORIZED /
        AUDIT_INTENT_RECORDED / EXECUTING — another attempt is already
        running or a prior one never reached a resolved state)
      - the latest attempt is UNKNOWN and idempotent_effect is False and
        no reconciliation has resolved it (Part L rule 10 — never a blind
        retry of a non-idempotent, unresolved effect)
    """
    from src.monkey_brain.kernel.execution_attempt import UnsafeBlindRetry, assert_retry_safe, get_attempt_store
    from src.monkey_brain.kernel.security_operation import SecurityOperationState, get_operation_ledger

    ledger = get_operation_ledger()
    op = ledger.get(operation_id)
    if op is None:
        raise SecurityBoundaryDenied(f"no commitment for {operation_id}", stage="IDEMPOTENCY")
    if op.state is SecurityOperationState.SUCCEEDED:
        raise SecurityBoundaryDenied(
            f"operation {operation_id} already succeeded; retry refused", stage="IDEMPOTENCY",
        )
    if op.state in (
        SecurityOperationState.AUTHORIZED,
        SecurityOperationState.AUDIT_INTENT_RECORDED,
        SecurityOperationState.EXECUTING,
    ):
        raise SecurityBoundaryDenied(
            f"operation {operation_id} already in flight; retry refused", stage="IDEMPOTENCY",
        )
    if commitment_active():
        raise SecurityBoundaryDenied("cannot retry from inside an active commitment", stage="IDEMPOTENCY")

    prior_attempt = get_attempt_store().latest_for(operation_id)
    # Explicitly reconciled at the ATTEMPT layer (Part 15/16) — set only by
    # reconcile_execution_attempt() / record_reconciliation_result(), never
    # trusted from agent-supplied state.
    reconciled = bool(prior_attempt.evidence.get("reconciled")) if prior_attempt is not None else False
    # Read-only safety check BEFORE touching ledger/attempt state at all —
    # a refused retry must leave the prior attempt and the commitment
    # exactly as they were (Part L rule 10). The attempt itself is
    # allocated later, inside _execute_attempt_pipeline, only once
    # re-commitment (AUDIT_INTENT_RECORDED) is durable again.
    try:
        assert_retry_safe(operation_id, idempotent_effect=idempotent_effect, reconciled=reconciled)
    except UnsafeBlindRetry as exc:
        raise SecurityBoundaryDenied(str(exc), stage="IDEMPOTENCY") from exc

    if prior_attempt is not None:
        _audit_reconciliation_event(
            evidence=get_trusted_auth(), action=op.action, resource=op.resource, operation_id=operation_id,
            attempt=prior_attempt, event="retry_authorized", outcome="success",
            extra={"idempotent_effect": idempotent_effect, "reconciled": reconciled},
        )

    token = _pipeline.set([])
    committed = _commitment.set(True)
    evidence = get_trusted_auth()
    action, resource = op.action, op.resource
    try:
        _assert_auth()
        policy = {"allowed": True, "reason": "skipped"}
        if skip_authz:
            _note("AUTHZ")
        else:
            if require_opa() or not insecure_dev_mode():
                policy = await _authorize(action, resource, extra)
            _note("AUTHZ")
        ledger.transition(operation_id, SecurityOperationState.AUTHORIZED, retrying=True)
        _reopen_admission_for_retry(operation_id)
        return await _execute_attempt_pipeline(
            action=action, resource=resource, op_id=operation_id, mutate=mutate,
            policy=policy, ledger=ledger, evidence=evidence,
            idempotent_effect=idempotent_effect, reconciled=reconciled,
        )
    finally:
        snap = _pipeline.get()
        if snap:
            _LAST_PIPELINE[:] = list(snap)
        _commitment.reset(committed)
        _pipeline.reset(token)


def begin_reconciliation(operation_id: str, *, lease_seconds: float = 60.0) -> str:
    """Kernel-only entrypoint to BEGIN reconciliation with a durable audit
    trail (Part 11/12/14): RECONCILIATION_REQUIRED -> RECONCILING.

    Returns the reconciliation_id the caller must present to
    complete_reconciliation(). Raises ReconciliationAlreadyInProgress if
    another worker's lease is still live — that caller must not
    independently retry/recover (Part 12).
    """
    from src.monkey_brain.kernel.execution_attempt import get_attempt_store, claim_reconciliation

    attempt = get_attempt_store().latest_for(operation_id)
    if attempt is None:
        raise KeyError(operation_id)
    reconciliation_id = claim_reconciliation(attempt.execution_attempt_id, lease_seconds=lease_seconds)
    from src.monkey_brain.kernel.security_operation import get_operation_ledger

    op = get_operation_ledger().get(operation_id)
    evidence = get_trusted_auth()
    action = op.action if op is not None else "reconciliation"
    resource = op.resource if op is not None else ""
    attempt = get_attempt_store().get(attempt.execution_attempt_id)  # refresh: reconciliation_id/state just changed
    _audit_reconciliation_event(
        evidence=evidence, action=action, resource=resource, operation_id=operation_id,
        attempt=attempt, event="started",
    )
    return reconciliation_id


def complete_reconciliation(
    operation_id: str,
    reconciliation_id: str,
    *,
    confirmed: str,
    evidence_source: str,
    evidence: dict[str, Any] | None = None,
) -> Any:
    """Kernel-only entrypoint to RESOLVE reconciliation with a durable
    audit trail (Part 8/11/13/14): RECONCILING -> SUCCEEDED|FAILED|
    (looped back to) RECONCILIATION_REQUIRED.

    `evidence_source` names the trusted evidence origin (external provider
    status query, durable internal transaction record, provider receipt,
    authoritative device state — Part 8) and is recorded, never trusted by
    content alone: the security boundary is claim_reconciliation()'s own
    governed/privileged-context guard plus the reconciliation_id/lease
    check (StaleReconciliation), not inspection of this string.
    """
    from src.monkey_brain.kernel.execution_attempt import (
        ExecutionAttemptState,
        get_attempt_store,
        record_reconciliation_result,
    )
    from src.monkey_brain.kernel.security_operation import get_operation_ledger, reconcile_operation

    if confirmed not in ("succeeded", "failed", "unknown"):
        raise ValueError("confirmed must be succeeded|failed|unknown")
    attempt = get_attempt_store().latest_for(operation_id)
    if attempt is None:
        raise KeyError(operation_id)
    outcome = {
        "succeeded": ExecutionAttemptState.SUCCEEDED,
        "failed": ExecutionAttemptState.FAILED,
        "unknown": ExecutionAttemptState.UNKNOWN,
    }[confirmed]
    result = record_reconciliation_result(
        attempt.execution_attempt_id, reconciliation_id, outcome,
        evidence={**(evidence or {}), "reconciled": True, "evidence_source": evidence_source},
    )
    op = get_operation_ledger().get(operation_id)
    evidence_auth = get_trusted_auth()
    action = op.action if op is not None else "reconciliation"
    resource = op.resource if op is not None else ""
    event = {
        "succeeded": "succeeded",
        "failed": "failed",
        "unknown": "unresolved",
    }[confirmed]
    _audit_reconciliation_event(
        evidence=evidence_auth, action=action, resource=resource, operation_id=operation_id,
        attempt=result, event=event, outcome=confirmed,
        extra={"evidence_source": evidence_source},
    )
    # Keep the commitment ledger's own outcome in lockstep — two separate
    # state machines (Part E), both told the same authoritative result.
    if op is not None and confirmed in ("succeeded", "failed"):
        with privileged_infrastructure(f"reconciliation resolved {operation_id}: {confirmed}"):
            reconcile_operation(operation_id, confirmed=confirmed)
    return result


async def ensure_governed(
    action: str,
    resource: str,
    effect: Callable[[], Awaitable[T]] | Callable[[], T],
    *,
    extra: dict[str, Any] | None = None,
    skip_authz: bool = False,
) -> T:
    """Single commitment API for security-critical effects.

    READ_ONLY / PROPOSAL_ONLY run immediately.
    Nested calls inside an active commitment are not re-gated.
    Insecure-dev may skip the outer gate (existing unit-test posture).
    Unknown/mutating operations use run_governed_mutation.
    """
    from src.monkey_brain.kernel.operation_classification import (
        OperationClass,
        classify_operation,
    )

    kind = classify_operation(action)
    if kind in (OperationClass.READ_ONLY, OperationClass.PROPOSAL_ONLY):
        result = effect()
        if hasattr(result, "__await__"):
            return await result  # type: ignore[misc]
        return result  # type: ignore[return-value]
    if commitment_active():
        result = effect()
        if hasattr(result, "__await__"):
            return await result  # type: ignore[misc]
        return result  # type: ignore[return-value]
    if insecure_dev_mode():
        result = effect()
        if hasattr(result, "__await__"):
            return await result  # type: ignore[misc]
        return result  # type: ignore[return-value]
    return await run_governed_mutation(
        action=action, resource=resource, mutate=effect, extra=extra, skip_authz=skip_authz,
    )
