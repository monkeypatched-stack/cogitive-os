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


async def run_governed_mutation(
    *,
    action: str,
    resource: str,
    mutate: Callable[[], Awaitable[T]] | Callable[[], T],
    extra: dict[str, Any] | None = None,
    skip_authz: bool = False,
    operation_id: str | None = None,
) -> T:
    """Execute a security-sensitive mutation only after the full pipeline.

    skip_authz is for callers that already completed GovernanceEngine.evaluate
    in the same request (HTTP routes). AUTH, idempotency, and audit still run.

    Audit intent failure: no effect.
    Audit result failure after effect: UNKNOWN / reconciliation required,
    never reported as a clean success.
    External timeout: UNKNOWN, not FAILED.
    """
    from src.monkey_brain.kernel.security_operation import (
        AuditResultUnavailable,
        DuplicateSecurityOperation,
        SecurityOperation,
        SecurityOperationState,
        UnknownOutcomeError,
        classify_external_exception,
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
    mutations = 0
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
                details=_audit_evidence(policy, op_id, tx_class.value),
                critical=True,
                correlation_id=op_id,
            )
        except AuditPersistenceError:
            _release_admission(op_id)
            raise
        ledger.transition(op_id, SecurityOperationState.AUDIT_INTENT_RECORDED)
        _note("AUDIT_INTENT")

        ledger.transition(op_id, SecurityOperationState.EXECUTING)
        try:
            result = mutate()
            if hasattr(result, "__await__"):
                result = await result  # type: ignore[misc]
            mutations = 1
            _note("MUTATION")
        except Exception as exc:
            kind = classify_external_exception(exc)
            outcome = "unknown" if kind == "unknown" else "failure"
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
                logger.error("audit result persistence failed after mutation error op=%s", op_id)
                raise AuditResultUnavailable(
                    "audit result unavailable after effect error",
                    operation_id=op_id,
                    effect_occurred=mutations > 0,
                ) from exc
            ledger.transition(op_id, state)
            if kind == "unknown":
                _complete_admission(op_id, {"outcome": "unknown"})
                raise UnknownOutcomeError(str(exc), operation_id=op_id) from exc
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
                },
                critical=True,
                correlation_id=op_id,
            )
        except AuditPersistenceError as exc:
            ledger.transition(
                op_id, SecurityOperationState.RECONCILIATION_REQUIRED,
                audit_result="unavailable", mutations=mutations,
            )
            raise AuditResultUnavailable(
                "audit result unavailable after successful effect",
                operation_id=op_id,
                effect_occurred=True,
            ) from exc
        ledger.transition(op_id, SecurityOperationState.SUCCEEDED)
        _note("AUDIT_RESULT")
        _complete_admission(op_id, {"outcome": "success"})
        return result  # type: ignore[return-value]
    finally:
        snap = _pipeline.get()
        if snap:
            _LAST_PIPELINE[:] = list(snap)
        _commitment.reset(committed)
        _pipeline.reset(token)


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
