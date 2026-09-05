# Transaction and audit security policy

This document separates **what CognitiveOS must guarantee** from **how
the current tree implements those guarantees**.

Implementation may change. The policy may not.

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

### P7 — Exactly-once is a semantic goal

Where an external system supports idempotent APIs, CognitiveOS MUST
pass a stable operation identity. Where true exactly-once is impossible,
the system MUST provide stable identity + idempotency + durable state +
reconciliation. Uncertainty is never resolved by blindly retrying.

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
| P7 | HTTP `@idempotent` on mutating routes; kernel reserves `governed:{operation_id}`; Razorpay `receipt` / notes carry the key; abandoned reservations do not re-execute |
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
- True exactly-once against a PSP is limited by the PSP’s idempotency;
  CognitiveOS supplies a stable key and refuses blind retries.
- `ensure_governed` still short-circuits the pipeline under explicit
  insecure-dev (test/local only; production and policy tests unset it).
