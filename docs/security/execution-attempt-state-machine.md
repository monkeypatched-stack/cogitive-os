# Execution-attempt state machine

This document defines the state machine for **execution attempts** — a
layer that sits between [commitment](operation-boundaries.md) and
[external effect](transaction-and-audit-policy.md), and is deliberately a
**separate state machine from commitment**.

```
logical operation
    |
    v
commitment (SecurityOperationState: AUTHORIZED, AUDIT_INTENT_RECORDED, ...)
    |
    v
execution attempt(s) (ExecutionAttemptState: NOT_STARTED ... SUCCEEDED/FAILED/UNKNOWN/CANCELLED)
    |
    v
external effect / effect outcome
```

> Commitment is the logical acceptance of an operation. Execution attempt
> is an individual attempt to cause its effect. Attempt state records what
> the execution machinery knows about that attempt; it does not itself
> establish authorization or guarantee that an external effect occurred.

Canonical API: `src/monkey_brain/kernel/execution_attempt.py`
(`ExecutionAttemptState`, `AttemptStore`, `transition_attempt`,
`claim_reconciliation`, `record_reconciliation_result`;
`retry_execution_attempt`, `begin_reconciliation`, `complete_reconciliation`
in `security_boundary.py`).

## States

```
                    COMMITTED OPERATION
                           |
                           v
                         READY
                           |
                           v
                        STARTED
                           |
                           v
                       SUBMITTED
                      /    |     \
                     /     |      \
                    v      v       v
               SUCCEEDED FAILED  UNKNOWN
                                  |
                                  v
                       RECONCILIATION_REQUIRED
                                  |
                                  v
                             RECONCILING
                              /    |    \
                             v     v     v
                        SUCCEEDED FAILED UNKNOWN
                                              |
                                              v
                                   RECONCILIATION_REQUIRED
```

| State | Meaning | Must never mean |
| --- | --- | --- |
| `NOT_STARTED` | Attempt exists conceptually; execution has not begun. | An effect was attempted. |
| `READY` | Committed operation is eligible for execution; required security checks (AUTH/AUTHZ/idempotency admission) already succeeded. | An effect occurred. |
| `STARTED` | CognitiveOS has entered the effect-producing path. | The external system received anything yet. |
| `SUBMITTED` | The effect request was submitted to the external/system boundary. | The effect succeeded. |
| `SUCCEEDED` | The effect is sufficiently confirmed per the applicable contract. | "the function returned" / "HTTP request was sent", unless that genuinely is the confirmation mechanism. |
| `FAILED` | Sufficient evidence the intended effect did **not** occur. | A bare timeout (that is `UNKNOWN`). |
| `UNKNOWN` | The system cannot currently determine whether the effect occurred (timeout after submission, crash, lost response, provider ambiguity). | Reconciliation itself, or a terminal/successful state. |
| `RECONCILIATION_REQUIRED` | The unknown outcome requires an explicit recovery process before the operation may safely proceed further. No owner yet. | `UNKNOWN` (same fact, different concept — see below) — or that reconciliation is in progress. |
| `RECONCILING` | A trusted reconciliation worker currently holds the lease and is actively checking authoritative evidence. | That the outcome is now known — only `record_reconciliation_result()` establishes that. |
| `CANCELLED` | Deliberately prevented before the effect occurred. | A way to hide a submitted/ambiguous effect (`STARTED -> UNKNOWN` instead if unprovable). |

`SUCCEEDED`, `FAILED`, `CANCELLED` are terminal for the attempt. `UNKNOWN`,
`RECONCILIATION_REQUIRED`, and `RECONCILING` are **not** terminal — each is
operationally unresolved in its own distinct way:

> `UNKNOWN` means we do not know the effect outcome. `RECONCILIATION_REQUIRED`
> means the unknown outcome requires an explicit recovery process before the
> operation may safely proceed further. `RECONCILING` means a trusted
> reconciliation worker is actively checking authoritative evidence right
> now. These are never conflated — `UNKNOWN ≠ RECONCILIATION_REQUIRED ≠
> RECONCILING`.

## Valid transitions

```
NOT_STARTED -> READY -> STARTED -> SUBMITTED -> {SUCCEEDED, FAILED, UNKNOWN}
NOT_STARTED | READY | STARTED -> CANCELLED   (STARTED only with proof no effect was submitted)
STARTED -> UNKNOWN                            (cancellation requested but proof unavailable)
UNKNOWN -> RECONCILIATION_REQUIRED            (automatic bookkeeping — not itself an outcome claim)
RECONCILIATION_REQUIRED -> RECONCILING        (claim_reconciliation() ONLY — lease-checked, Part 12/13)
RECONCILING -> {SUCCEEDED, FAILED, UNKNOWN}   (record_reconciliation_result() ONLY — evidence-checked, Part 8)
RECONCILING -(UNKNOWN)-> RECONCILIATION_REQUIRED   (loops back; never rests on bare UNKNOWN again)
```

`RECONCILIATION_REQUIRED` and `RECONCILING` map to an **empty** edge set in
the generic transition table on purpose — the generic `transition_attempt()`
can *enter* `RECONCILIATION_REQUIRED` (from `UNKNOWN`) but can never leave
either of them. The only sanctioned way out of `RECONCILIATION_REQUIRED` is
`claim_reconciliation()`; the only sanctioned way out of `RECONCILING` is
`record_reconciliation_result()`. This structurally enforces, regardless of
any flag a caller might pass: `RECONCILIATION_REQUIRED -> SUCCEEDED` is
refused without actually performing reconciliation, and
`RECONCILING -> SUBMITTED` is refused on the same attempt — a new submission
requires a new execution attempt.

Rejected unconditionally (`InvalidAttemptTransition`): `NOT_STARTED/READY
-> SUCCEEDED|FAILED`; `SUCCEEDED|FAILED|CANCELLED -> anything` (terminal);
`UNKNOWN -> SUCCEEDED|FAILED` (must go through `RECONCILIATION_REQUIRED` /
`RECONCILING` first); `RECONCILIATION_REQUIRED -> anything` except via
`claim_reconciliation()`; `RECONCILING -> anything` except via
`record_reconciliation_result()`; any `-> CANCELLED` from `STARTED` once
`submitted=True` or without explicit `no_effect_submitted` evidence.

## Reconciliation lease and concurrency

`claim_reconciliation(attempt_id, lease_seconds=60.0)` is the one trusted
way to begin reconciliation. It mints a fresh `reconciliation_id`
(`{attempt_id}-REC-{generation}`, distinct from `execution_attempt_id` —
one execution attempt's `UNKNOWN` outcome may be reconciled, or reclaimed,
more than once) and a time-bound lease:

- **Concurrency (Part 12):** while the lease is live, a second
  `claim_reconciliation()` call raises `ReconciliationAlreadyInProgress` —
  exactly one worker owns `RECONCILING` at a time; a worker that loses the
  race must not independently retry/recover.
- **Crash recovery (Part 13):** once the lease expires, a *new*
  `claim_reconciliation()` call reclaims it — bumping the generation and
  minting a new `reconciliation_id`. A worker's late
  `record_reconciliation_result()` call, presenting its now-superseded
  `reconciliation_id`, is rejected with `StaleReconciliation` — a crashed
  worker can never overwrite a newer reconciliation's result, whether that
  newer reconciliation is still in progress or has already resolved.

`record_reconciliation_result(attempt_id, reconciliation_id, outcome,
evidence=...)` is the one trusted way to resolve it. `evidence` should be
built from a trusted source — an external provider status query by
idempotency key, a durable internal transaction record, a provider
receipt, authoritative device state (Part 8) — never an LLM/agent
assertion or a client-supplied success flag; the actual security boundary
is the governed/privileged-context guard both functions share (same as
`transition_attempt`), not inspection of the evidence dict's content.

`security_boundary.begin_reconciliation()` / `complete_reconciliation()`
wrap these two with durable, distinct audit evidence (Part 14):
`reconciliation_required`, `reconciliation_started`,
`reconciliation_succeeded`, `reconciliation_failed`,
`reconciliation_unresolved`, and (on `retry_execution_attempt`)
`retry_authorized` — see `_audit_reconciliation_event` in
`security_boundary.py`. `complete_reconciliation()` also calls
`security_operation.reconcile_operation()` for a `succeeded`/`failed`
result, keeping the commitment ledger and the attempt in lockstep — two
separate state machines, told the same authoritative outcome together.

## Commitment vs. attempt: two kinds of uncertainty

`run_governed_mutation` / `retry_execution_attempt`
(`security_boundary.py`) drive the commitment ledger
(`SecurityOperationState`) and the attempt (`ExecutionAttemptState`) in
lockstep, but they answer different questions:

- **Attempt state** answers "did the effect happen?" — driven by
  `classify_external_exception` (timeout/connection-reset -> `UNKNOWN`,
  anything else -> `FAILED`), or by the mutation actually returning
  (`SUCCEEDED`).
- **Commitment state** answers "is the durable record of this operation
  trustworthy?" — e.g. if the mutation succeeds but the post-effect audit
  write fails, the attempt is `SUCCEEDED` (we have direct evidence the
  effect ran) while the ledger becomes `RECONCILIATION_REQUIRED` (the
  durable audit trail is incomplete). These are not the same uncertainty
  and are not collapsed into one field.

## Retry: one commitment, many attempts

`retry_execution_attempt(operation_id=..., mutate=..., idempotent_effect=...)`
is the **only** sanctioned way to add attempt #2+ under an existing
commitment. It:

- never mints a new `operation_id` (no second commitment is ever created);
- refuses when the operation already `SUCCEEDED`, or is currently in
  flight (`AUTHORIZED`/`AUDIT_INTENT_RECORDED`/`EXECUTING`);
- refuses a **blind** retry when the latest attempt is unresolved —
  `UNKNOWN`, `RECONCILIATION_REQUIRED`, or `RECONCILING`, none of which is
  positive evidence either way — unless the caller explicitly asserts
  `idempotent_effect=True` (the effect itself is safe to repeat, e.g. it
  carries a stable idempotency key the external system honors) or the
  attempt was already reconciled to `FAILED` (positive evidence nothing
  happened, recorded terminal — no longer one of the unresolved states, so
  no flag is even needed) — `UnsafeBlindRetry` otherwise (Part L rule 10 /
  Invariant 8: non-idempotent unresolved effects are never blindly retried);
- re-runs AUTH -> AUTHZ -> IDEMPOTENCY -> AUDIT_INTENT -> MUTATION ->
  AUDIT_RESULT in full for the new attempt — nothing about attempt #2 is
  trusted from attempt #1's evidence or from agent-supplied state, and
  reconciliation never substitutes for re-authorization: a reconciled
  `FAILED` attempt makes retry *safe*, not *authorized* — AUTHZ can still
  independently deny it.

`execution_attempt.new_attempt_after()` allocates `attempt_number`
under a lock, so `operation_id-ATT-1`, `operation_id-ATT-2`, ... are
unique even under concurrent retries; `AttemptStore.claim_start()` gives
exactly one worker ownership of a `READY -> STARTED` transition.

## Reconciliation convenience wrapper

`execution_attempt.reconcile_execution_attempt(operation_id, confirmed=...)`
is a single-shot convenience that bootstraps `UNKNOWN -> RECONCILIATION_
REQUIRED` if needed, then claims and resolves reconciliation in one call —
useful for tests and simple synchronous reconciliation jobs. A caller that
needs to hold the lease across an async external query (the realistic
shape of an actual reconciliation worker) should call
`claim_reconciliation()` / `record_reconciliation_result()` (or their
audited `security_boundary` wrappers, `begin_reconciliation()` /
`complete_reconciliation()`) directly instead.

Call `security_operation.reconcile_operation()` (commitment) alongside
whichever of the above resolves the **attempt** — they are separate state
machines and neither implies the other; `complete_reconciliation()` does
this automatically for `succeeded`/`failed` outcomes.

## Crash recovery

`execution_attempt.reconstruct_attempts_from_audit(entries)` recovers
attempt state from durable audit evidence after a process/worker restart,
mirroring `security_operation.reconstruct_operations_from_audit()` at
attempt granularity: a terminal outcome recorded on a `.result` audit
entry wins outright; otherwise the furthest lifecycle stage recorded
(`attempt.ready` < `attempt.started` < `attempt.submitted`) wins. The
in-process `AttemptStore` is a cache/coordinator, not the durable
registry (P10) — it is never trusted across a restart.

## One canonical definition

`ExecutionAttemptState` (this module) is the **only** execution-attempt
state type in the repository — verified by
`tests/security/test_execution_attempt_state_definitions.py`, which
structurally scans every `.py` file under `src/`, `packages/`, `domains/`,
`services/`, `tests/` for a second class defining the same member set and
fails the build if one appears.

Other state enums in the repository (`SecurityOperationState` —
commitment; `ReservationStatus` — external payment-provider status;
`NodeState`/`ProcessState`/`RuntimeProcessState` — plan-graph and
actor/process scheduling; `TransactionStatus` — society negotiation;
`CapabilityState` — capability health/degradation) are legitimately
**different lifecycles**, not duplicates, and are left as-is.

**Known, deliberate exception:** `RECONCILIATION_REQUIRED` exists as a
member of both `ExecutionAttemptState` and `SecurityOperationState`. This
is not drift — the commitment ledger and the attempt track the *same*
reconciliation event from two different layers (durable-record trust vs.
effect certainty; see "Commitment vs. attempt: two kinds of uncertainty"
above) and are always driven together by
`security_boundary._mark_unknown_and_require_reconciliation()` /
`complete_reconciliation()`. It is pinned by a dedicated test so a future
rename of either spelling without the other is caught.

**Cross-enum type safety:** `ExecutionAttemptState` and
`SecurityOperationState` (and `ReservationStatus`) are all `(str, Enum)` —
a same-spelled member (`SUCCEEDED`, `FAILED`, `UNKNOWN`, ...) compares
**equal by string value** across different enum classes, and hashes
identically. A plain `in`/`==` check against a transition table would
silently accept the wrong enum's member. `AttemptStore.transition()` and
`record_reconciliation_result()` guard against this with an explicit
`isinstance` check (`_require_own_enum`); `OperationLedger.transition()`
has the symmetric guard for commitment state. `isinstance` checks the
actual class, not the string value, so it does not share this hazard.
