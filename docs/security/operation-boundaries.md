# Security-critical operation boundaries

CognitiveOS splits **proposal** (LLM, planner, simulation, ranking) from
**commitment** (trusted auth → MFA → permission → OPA → idempotency →
durable audit intent → effect → durable audit result).

Unknown operations default to **security-critical**. Agents cannot declare a
mutating name `READ_ONLY`.

Canonical APIs:

- `classify_operation()` in `src/monkey_brain/kernel/operation_classification.py`
- `ensure_governed()` / `run_governed_mutation()` in `src/monkey_brain/kernel/security_boundary.py`

`ensure_governed` is a no-op for `READ_ONLY` / `PROPOSAL_ONLY`, for nested
calls already inside a commitment, and in explicit insecure-dev mode.
Production and invariant tests (insecure-dev unset) take the full pipeline.

## Inventory (representative; side-effect based)

```
operation: action_executor.execute
file: src/monkey_brain/kernel/pipeline/action_executor.py
entry point: ActionExecutor.execute
caller: grocery/planetary execution engine, tests
resource: capability actions
mutation: capability.handle() may mutate KG / payments / world
external side effect: possible (payment, NATS)
authority change: no (kernel auth)
security critical: yes (name contains execute)
required authentication: trusted_auth unless insecure-dev
required MFA: when mfa_required and human principal
required permission: HTTP edge if entered via API
required OPA: GovernanceEngine unless skip_authz / insecure-dev
required idempotency: store available
required audit: intent then result
governed executor: ensure_governed

operation: runtime.execute
file: src/monkey_brain/runtime/runtime.py
entry point: Runtime.execute
caller: GoalExecutor mutating workloads
resource: workload_id
mutation: capability.execute per step
security critical: yes
governed executor: ensure_governed (nested skip inside GoalExecutor)

operation: kernel.execute
file: src/monkey_brain/kernel/kernel.py
entry point: Kernel.execute
caller: runtime selector dispatch
security critical: yes (execute)
governed executor: ensure_governed

operation: orders.create / payment / cancel / refund
file: src/monkey_brain/api/routes/orders.py
entry point: FastAPI + perm-manage-actors + authorize_acting_for
mutation: KnowledgeGraph order/payment entities
security critical: yes
governed executor: _commit_order → ensure_governed(skip_authz=True)

operation: world.* create/update/delete
file: src/monkey_brain/api/routes/world.py
entry point: perm-manage-world + block_direct_world_api_mutations
mutation: SharedWorld entities/relationships/events/resources/locations
security critical: yes
note: production still 403s direct SharedWorld CRUD (TransitionGate bypass).
      When allowed (insecure-dev + ALLOW_DIRECT_WORLD_API), still ensure_governed.

operation: actor.tick
file: src/monkey_brain/actor_runtime.py
entry point: POST /execute
caller: control-plane proxy with X-Internal-Service-Token
mutation: actor tick / beliefs / requests
authority: evidence_for_service(actor-runtime:{id})
security critical: yes
required authentication: internal service token unless insecure-dev
governed executor: ensure_governed
trust basis: INTERNAL_SERVICE_TOKEN; agent JSON cannot mint this header in production

operation: payments.webhook
file: src/monkey_brain/api/routes/payments.py
entry point: require_razorpay_webhook_auth (HMAC)
mutation: pending payment resolve + actor resume
security critical: yes
authority: Razorpay HMAC, then evidence_for_service("razorpay-webhook")
governed executor: ensure_governed(skip_authz=True)
why agent-controlled input cannot reach it: invalid HMAC → 401 before mutate

operation: simulate-capture / dev-complete
file: src/monkey_brain/api/routes/payments.py
security critical: yes
required: insecure-dev only (403 otherwise)

operation: MongoAuditStore.append
file: src/monkey_brain/kernel/audit.py
privileged infra: yes
authority: kernel AuditLog
why trusted: append-only; cannot grant authz
required audit: this IS the audit path

operation: Redis actor index hset (reconstruction)
file: src/monkey_brain/kernel/society/integration.py
privileged infra: yes
authority: Mongo actor_state
why trusted: Redis cannot create actors when Mongo is reachable and empty

operation: JWT jti blocklist
file: services/auth/helpers/revocation.py
privileged infra: yes
required authentication: prior verified token / admin
Redis unavailable: fail-closed except insecure-dev
```

## Non-critical (verified by classifier + side effects)

```
GET /world, GET entities — read
query (sanitized + governance) — read/proposal; sanitizer ImportError denies
plan generation — proposal unless it commits (plan HTTP still governance-checked)
LLM inference / predict / simulate (non-capture) — proposal
```

`plan()` that only returns a PlanResponse is proposal. `/execute` of that plan is commitment.

## Privileged internal

Internal is not trusted automatically. Privileged paths must document
authority, trust basis, why agent input cannot reach them, and audit.

## Remaining gaps (human review)

- Manufacturing domain Mongo `insert_one` helpers remain outside the
  CognitiveOS `ensure_governed` pipeline; they are reached via manufacturing
  FastAPI routers (auth/permission) rather than the kernel commitment API.
- Grocery `*.handle()` still mutates the KG; ungoverned calls now fail
  closed via `assert_state_mutation_allowed` on KnowledgeGraph writes
  (unless insecure-dev or `privileged_infrastructure`).
- `ensure_governed` still skips the full AUTH→… pipeline in insecure-dev;
  production and invariant tests unset that flag.
- HTTP `@idempotent` requires `Idempotency-Key` outside insecure-dev; routes
  that never applied `@idempotent` still rely on the kernel store probe.
