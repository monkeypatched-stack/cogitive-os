# Transaction and audit security policy

This document separates **what CognitiveOS must guarantee** from **how
the current tree implements those guarantees**.

Implementation may change. The policy may not.

---

## Definitions

| Concept | Meaning |
| --- | --- |
| `operation_id` | Identity of one logical operation. |
| `commitment_id` | Identity of the authoritative commitment for that operation. In this codebase `operation_id` and `commitment_id` are the same identifier — there is exactly one commitment per operation, so no second identifier is minted for it. |
| **Operation** | The logical requested action, before any decision has been made about it. |
| **Commitment** | CognitiveOS's authoritative acceptance of the operation for execution, after trusted authentication, authorization, idempotency admission, and durable audit intent have all succeeded (`SecurityOperationState.AUDIT_INTENT_RECORDED`, `security_operation.py`). Commitment does **not** mean the effect happened, and does not mean an execution attempt was even made. |
| **Execution attempt** | One concrete try at causing the committed operation's effect (`execution_attempt_id`, `ExecutionAttemptState`, `execution_attempt.py`). A commitment may have zero attempts (crash before any attempt is allocated), one attempt, or several (safe retry) — see Policy 2 below. |
| **Effect** | The actual state mutation / external side effect the operation was for. |
| **Result** | The confirmed outcome of the effect: `SUCCEEDED`, `FAILED`, or `UNKNOWN`. |
| `UNKNOWN` | The result cannot currently be established (timeout after submission, crash, lost response, provider ambiguity). Not terminal — resolved only by reconciliation. |
| `RECONCILIATION_REQUIRED` | The unknown outcome requires an explicit recovery process before the operation may safely proceed further — no reconciliation owner yet. Distinct from `UNKNOWN` (a fact) and from `RECONCILING` (an active process); never conflated. See [execution-attempt-state-machine.md](execution-attempt-state-machine.md) for the full attempt-level reconciliation lifecycle (`RECONCILING`, reconciliation leases, concurrency, crash recovery). |

**Commitment answers** "Has CognitiveOS authoritatively accepted this
logical operation?" **Execution attempt answers** "Did CognitiveOS
attempt to cause the effect?" **Effect outcome answers** "Do we have
evidence the effect actually succeeded, failed, or is unresolved?" These
are three different questions, and this document — like the code — never
collapses one into another: `COMMITTED ≠ EXECUTED`, and an execution
attempt is never reported as a confirmed effect it cannot evidence.

**On exactly-once:** CognitiveOS guarantees exactly-once logical
commitment within its authoritative transaction domain where the
underlying transaction mechanism provides that guarantee. For external
effects, CognitiveOS does not universally guarantee exactly-once
physical execution. Instead, it uses stable operation identity,
idempotency where supported, at-most-once submission where necessary,
and reconciliation for unknown outcomes. "Exactly-once" and "at-most-once
submission" and "idempotent retry" are not interchangeable, and this
document does not use them interchangeably — see the table below.

These five events are never the same event, and none of them implies any
other:

```
operation created  ≠  request submitted  ≠  remote effect occurred
        ≠  CognitiveOS state committed  ≠  audit result persisted
```

| Guarantee | What CognitiveOS actually promises | Where |
| --- | --- | --- |
| Exactly-once **logical commitment** | One `operation_id` → at most one authoritative `SecurityOperation` row; a duplicate request resolves to the same commitment, never a second one. | `OperationLedger.create()` — `security_operation.py` |
| At-most-once **submission attempt** (non-idempotent external effect) | CognitiveOS submits at most once per execution attempt; it does not know whether the remote system received/executed the request if the response is lost. Never retried blindly. | `classify_external_exception` → `UnknownOutcomeError`; `execution_attempt.assert_retry_safe` |
| Idempotent **external effect** (only where the provider actually guarantees it) | Repeated submissions carrying the same `idempotency_key` resolve to one logical external effect, per the provider's own contract — not assumed for a provider that doesn't document it. | `RazorpayUPIProvider._idempotency_index`; `retry_execution_attempt(idempotent_effect=True)` |
| Reconciliation | An `UNKNOWN` outcome is resolved to `SUCCEEDED`/`FAILED`/(still)`UNKNOWN` only through an explicit, kernel-only reconciliation step — never inferred from a timeout, a retry, or an agent's claim. | `reconcile_operation`, `execution_attempt.reconcile_execution_attempt` |

```
              LOGICAL OPERATION
                     │
                operation_id
                     │
                     ▼
                COMMITMENT
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       ATTEMPT 1  ATTEMPT 2  ATTEMPT N
          │          │          │
          └──────────┼──────────┘
                     ▼
              EFFECT OUTCOME
                     │
              ┌──────┼──────┐
              ▼      ▼      ▼
          SUCCEEDED FAILED UNKNOWN
                              │
                              ▼
                        RECONCILIATION
```

Full lifecycle, including the zero-attempt and retry cases:

```
PROPOSAL
   ↓
AUTHORIZATION
   ↓
COMMITMENT  ── crash here → commitment exists, ZERO execution attempts
   ↓
EXECUTION ATTEMPT #1
   ↓
   ├── SUCCESS
   ├── FAILURE
   └── UNKNOWN
          ↓
     RECONCILIATION
          ↓
     EXECUTION ATTEMPT #2   (same commitment — never a new operation_id)
```

See [execution-attempt-state-machine.md](execution-attempt-state-machine.md)
for the full attempt-level state graph.

### Invariants

These map onto the policy numbers (P1-P11) below; listed together here
because several of them span more than one P-number.

1. One logical security-critical operation → one stable `operation_id`.
2. One `operation_id` → at most one authoritative CognitiveOS commitment
   (P1, P2).
3. A commitment does not imply execution occurred, let alone that the
   effect succeeded (P3, P4).
4. One commitment may have multiple execution attempts only when retry
   semantics are safe (P7, P8) — an external retry reuses the same
   operation identity (and the same external idempotency key, whenever
   the external system supports one) rather than minting a new one.
5. Every execution attempt belongs to an existing logical commitment —
   never allocated before `AUDIT_INTENT_RECORDED` (P2).
6. A retry of the same logical operation does not create a new
   commitment (P7).
7. An unknown external outcome resolves to `UNKNOWN` /
   `RECONCILIATION_REQUIRED`, never a new commitment (P3, P8).
8. `UNKNOWN` must not be blindly retried when the effect is
   non-idempotent — doing so could duplicate the effect (P7).
9. Durable audit intent exists before any security-critical effect;
   an audit outage before the effect is DENY / NO EFFECT, never a bypass
   (P2, P4).
10. An execution attempt never claims to have produced an effect unless
    the effect is confirmed, and the system never claims a stronger
    execution guarantee (exactly-once, atomicity) than the underlying
    infrastructure actually provides for that specific effect (P3, P5,
    P6, P7).

---

## Security Policy

These invariants are independent of Mongo, Redis, outbox, queues, or any
particular class name.

### P1 — No unauthorized security-critical effect

A security-critical effect MUST NOT occur unless trusted authentication,
required MFA, permission/OPA authorization, successful idempotency
admission, and durable audit intent have all succeeded, in that order.

### P2 — Audit intent precedes effect

Durable evidence that the operation was authorized and admitted MUST
exist before the effect. If that evidence cannot be persisted, there is
**no effect**. The durable medium is unspecified by policy.

### P3 — Results represent reality

After the effect phase, outcomes are `SUCCEEDED`, `FAILED`, or
`UNKNOWN`. `UNKNOWN` means the system cannot currently determine whether
the effect occurred. `UNKNOWN` MUST NOT be silently rewritten to
`FAILED` or `SUCCEEDED` without evidence.

### P4 — Audit outage is not a bypass

If durable audit infrastructure is unavailable **before** the effect,
the operation is denied. There is no implicit “audit is down, execute
anyway” mode.

### P5 — Post-effect audit failure preserves uncertainty

If the effect has occurred and audit-result persistence fails, the
system MUST NOT claim the effect did not happen. It MUST retain enough
identity to mark `UNKNOWN` / `RECONCILIATION_REQUIRED` and recover.

### P6 — No false atomicity

Independent systems (for example a document store, a cache, and an
external HTTP API) are not one atomic transaction merely because the
application calls them in sequence. Cross-system consistency uses an
appropriate distributed mechanism (database transaction, outbox,
idempotency, durable operation state, reconciliation, compensation) —
chosen per operation, not claimed globally.

### P7 — Commitment is at-most-once; a single attempt submits at-most-once; a commitment may accumulate attempts at-least-once

CognitiveOS does not claim exactly-once execution of an external effect —
that guarantee is not generally available and the policy must not imply
it is. Three different granularities, none of them "exactly-once":

- **The commitment** (`operation_id`): **at most one**, ever (Invariant 2).
- **A single execution attempt**: submits to the external/system boundary
  **at most once** — an attempt never internally loops or resubmits; a
  lost response after submission is `UNKNOWN`, not grounds for that same
  attempt to try again.
- **The commitment's attempts, taken together**: where the effect
  mechanism allows a safe retry, the commitment may accumulate
  **at-least-once**, idempotent-retried attempts (attempt 1, attempt 2,
  ...) converging on a single confirmed effect through identity +
  idempotency + durable state + reconciliation. Uncertainty (`UNKNOWN`)
  is never resolved by blindly retrying a non-idempotent effect.

A retry is a new **execution attempt** under the *same* commitment, never
a new commitment — see
[execution-attempt-state-machine.md](execution-attempt-state-machine.md)
for the attempt-level state machine (`execution_attempt.py`) and
`security_boundary.retry_execution_attempt()`.

### P8 — Crash recovery preserves safety

A process crash MUST NOT produce a duplicate or unauthorized
security-critical effect. The system must be able to distinguish
not-started, authorized, audit-recorded, executing, succeeded, failed,
unknown, and reconciliation-required where recovery requires it.

### P9 — Security-critical operations have durable identity

Recovery depends on knowing what happened: at least operation id, state,
principal, resource, action, authorization decision, audit intent,
execution result, timestamps. Do not store secrets unnecessarily.

### P10 — A cache/coordinator is not security authority

A short-lived store may cache, index, reserve idempotency keys, or
coordinate. It is not the durable security registry. Its failure MUST
NOT create authorization.

### P11 — Agents and LLMs cannot resolve security state

Untrusted proposers MUST NOT determine authorized, audit complete,
committed, succeeded, failed, MFA satisfied, or policy approved. They
may propose. The trusted kernel commits and records outcomes.

---

## Implementation

How **this repository** currently satisfies the policy. Not the policy.

| Policy | Current mechanism |
| --- | --- |
| P1 | `run_governed_mutation` / `ensure_governed`: AUTH → AUTHZ (OPA) → ledger + idempotency admission → durable `AuditLog.record` intent → effect |
| P2–P4 | `AuditLog` fail-closed (`AuditPersistenceError`) for security-critical events; intent errors release admission and do not call `mutate` |
| P3, P5 | Timeouts / connection-reset → `UnknownOutcomeError`; post-effect persist failure → `AuditResultUnavailable` + `RECONCILIATION_REQUIRED` |
| P6 | No Mongo multi-document sessions. No claim that Redis + HTTP share a transaction |
| P7 | HTTP `@idempotent` on mutating routes; kernel reserves `governed:{operation_id}`; Razorpay `receipt` / notes carry the key; abandoned reservations do not re-execute. A second effect-producing attempt under the same `operation_id` is only ever created by `retry_execution_attempt()`, which refuses a blind retry after a non-idempotent `UNKNOWN` outcome |
| P8–P9 | `SecurityOperation` ledger (process-local) **plus** durable audit records; `reconstruct_operations_from_audit` recovers state from audit evidence after process loss |
| P10 | Redis used for HTTP idempotency reservations; Mongo/`AuditLog` is authoritative for audit; Redis failure fail-closes when not insecure-dev |
| P11 | `reconcile_operation` requires governed/privileged context; agent payload keys are stripped |

**Mongo transactions:** not used. Internal mutations are ordered, not
multi-collection ACID.

**Outbox:** not a separate module. Audit intent is the durable
pre-effect record.

**External payments:** `RazorpayUPIProvider` maps HTTP timeouts after
possible submission to `ReservationStatus.UNKNOWN`, not `FAILED`.

---

## Recovery

| Event | Policy outcome | Current recovery |
| --- | --- | --- |
| Audit unavailable before effect | DENY, no effect | `AuditPersistenceError`; admission released |
| Crash after audit intent, before effect | No duplicate; state recoverable as executing/not finished | Abandoned idempotency reservation; audit intent without result → `EXECUTING` via reconstruction |
| External timeout after submission | UNKNOWN, no blind retry | `UnknownOutcomeError`; admission completed as unknown |
| Audit result unavailable after effect | UNKNOWN / reconciliation | `AuditResultUnavailable`; ledger `RECONCILIATION_REQUIRED` |
| Duplicate `operation_id` | No second effect | Ledger duplicate + `governed:{id}` reservation |

Reconciliation is kernel-only. Agents cannot mark UNKNOWN as SUCCEEDED.

---

## Limitations

- The in-process operation ledger is **not** the durable registry; audit
  records are. After a hard process kill, reconstruct from audit.
- Manufacturing-domain Mongo helpers are outside this kernel commitment
  API.
- Exactly-once delivery to a PSP is not achievable in general; CognitiveOS
  supplies a stable operation identity + idempotency key, refuses blind
  retries of a non-idempotent effect, and relies on reconciliation to
  converge an `UNKNOWN` outcome to a confirmed one — an at-most-one
  **commitment** with at-least-once, idempotent **execution attempts**,
  not an exactly-once effect guarantee.
- `ensure_governed` still short-circuits the pipeline under explicit
  insecure-dev (test/local only; production and policy tests unset it).
