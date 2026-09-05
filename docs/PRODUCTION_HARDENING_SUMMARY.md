# Production Hardening Summary

**Date:** 2026-08-31  
**Scope:** P0 fixes from the production readiness audit, tier-2 multi-replica lifecycle hardening, and related test coverage.  
**Status:** Conditionally production-ready for single-replica deploys with full gate configuration; multi-replica chaos/soak not yet complete.

---

## Executive summary

This pass closed concrete defects found in the production readiness audit: broken execution paths, missing HTTP idempotency, ungoverned boot configuration, and multi-replica lifecycle bugs that caused incorrect `recover` / `migrate_away` decisions.

The system is **not** a claim of unconstrained multi-instance production readiness. It **is** a materially hardened baseline when `COGNITIVEOS_PRODUCTION_MODE=true`, Redis, OPA, and client idempotency keys are configured.

---

## Production gates

Central module: `src/monkey_brain/kernel/production_gates.py`

| Gate | Env var | When enabled |
|------|---------|--------------|
| Production mode (master switch) | `COGNITIVEOS_PRODUCTION_MODE=true` | Enables all gates below |
| Redis required at boot | `REQUIRE_REDIS` (or production mode) | `PlanetaryRuntime` raises if Redis unavailable |
| OPA required | `OPA_REQUIRED` (or production mode) | Governance denies when `OPA_URL` unset |
| Idempotency fail-closed | `IDEMPOTENCY_FAIL_CLOSED` (or production mode) | HTTP 503 when idempotency store cannot reserve |
| World API mutation block | production mode | `POST`/`PUT`/`DELETE` on `/world/*` SharedWorld CRUD → 403 |
| Capability dispatch dedup | production mode or `CAPABILITY_DISPATCH_DEDUP=true` | Redis claim before `handle()` |

**Dev/seed override for world API:** `ALLOW_DIRECT_WORLD_API=true`

---

## Recommended deployment configuration

```yaml
# deploy/k8s/configmap.yaml (representative)
COGNITIVEOS_PRODUCTION_MODE: "true"
OPA_URL: "http://opa:8181"
REDIS_HOST: "redis"
REDIS_PORT: "6379"
CAPABILITY_TIMEOUT_SECONDS: "120"
```

**Client requirements for mutating routes:**

- Send `Idempotency-Key` on `POST /prompt`, `POST /plan`, and `POST /execute`
- Use commerce/knowledge_graph routes (`/commerce`, `/orders`, etc.) for world state — not `/world/entities` SharedWorld CRUD

---

## What was implemented

### 1. Execution engine

- `IntegratedExecutionEngine` accepts and forwards `execution_graph` to `ActionExecutor`
- Graph-present execution always uses the graph-aware fallback path

**Files:** `src/monkey_brain/kernel/pipeline/execution_runtime/integration.py`

### 2. HTTP idempotency

- `@idempotent("plan.execute")` on `POST /plan`
- `@idempotent("execute.action")` on `POST /execute`
- Fail-closed mode returns 503 when Redis reserve fails in production

**Files:** `src/monkey_brain/api/routes/plan.py`, `execute.py`, `src/monkey_brain/api/idempotency.py`

### 3. Boot-time validation

- `validate_production_gates()` called from `PlanetaryRuntime._init_persistence()`
- `GovernanceEngine` denies when OPA is required but not configured

**Files:** `production_gates.py`, `integration.py`, `governance.py`

### 4. Capability execution safety

- `CAPABILITY_TIMEOUT_SECONDS` (default 120s) wraps capability `handle()` via `asyncio.wait_for`
- Redis dispatch dedup on `(execution_id, action_id)` before invoke; caches outcome after success

**Files:** `action_executor.py`, `capability_dispatch_store.py`

### 5. Distributed actor coordination

- **Lease fencing:** monotonic `INCR` on `monkeybrain:actor:fence:{actor_id}` at lease acquire
- **Belief checkpoint:** skipped when current fence > tick fence (stale owner detection)
- **`last_lease_fence`** tracked on `ActorRuntimeState`

**Files:** `integration.py`, `runtime.py`

### 6. World API governance

- Direct SharedWorld CRUD blocked in production mode (bypasses `TransitionGate`)
- `POST /world/query` remains allowed (read-only)

**Files:** `src/monkey_brain/api/routes/world.py`, `production_gates.py`

### 7. Capability promotion

- Promoted replay re-checks `required_permission` against `_resolved_permissions` at replay time

**Files:** `src/monkey_brain/kernel/pipeline/learning/capability_promotion.py`

### 8. Multi-replica lifecycle fixes

| Issue | Fix |
|-------|-----|
| Reconcile lease masked staleness | `observe_actor(reconcile_lease_token=...)` excludes caller's own lease from staleness |
| `resident_here` too broad | True only when actor is `is_active` on this node, not merely registered |
| Ghost migration poisoned registry | `suspend_actor_for_migration()` deactivates local copy only when registry names another owner |
| Reconcile queue double-enqueue | `_should_enqueue_placement_change()` skips idempotent local placement bind |
| `PlanetaryRuntime.__init__` ordering | `_society_runtime` assignment after `SocietyRuntime` construction |

**Files:** `integration.py`, `actor_lifecycle_controller.py`, `actor_lifecycle.py`

### 9. Critical init bug

- Fixed `PlanetaryRuntime.__init__` referencing `_society_runtime` before it existed

---

## Architecture (production request path)

```
Client
  → POST /prompt | /plan | /execute  (+ Idempotency-Key)
  → require_permission + @idempotent
  → PlanetaryRuntime.execute_actor_request
  → SocietyRuntime.tick_one_actor
  → CognitiveRuntime → PlanCompiler → ActionExecutor
       → capability_dispatch_store (Redis claim, production)
       → TransitionGate (when wired by vertical)
       → CapabilityBus.handle()  (timeout-guarded)
       → execution_checkpoint_store (completed steps)
  → checkpoint_actor_belief (lease fence check)
```

---

## Test coverage

| Suite | Count | What it validates |
|-------|-------|-------------------|
| `tests/unit/test_production_gates.py` | 6 | Gate env behavior, execution graph forwarding |
| `tests/unit/test_multi_replica_safety.py` | 5 | Dispatch dedup, lease fence, reconcile lease staleness |
| `tests/unit/test_capability_promotion.py` | includes permission replay | Promoted capability permission denial |
| `tests/scenarios/test_horizontal_scheduler_scaling.py` | 16 | Multi-node scheduling, recovery, backpressure |
| Focused regression bundle | **36+** | All above passing as of 2026-08-31 |

Run:

```bash
python3 -m pytest \
  tests/unit/test_production_gates.py \
  tests/unit/test_multi_replica_safety.py \
  tests/scenarios/test_horizontal_scheduler_scaling.py \
  tests/unit/test_capability_promotion.py \
  -v
```

---

## Remaining gaps (not closed by this pass)

| Area | Risk | Notes |
|------|------|-------|
| Multi-replica K8s soak | High | `replicas: 1` in deployment; no chaos tests under real split-brain |
| At-least-once execution attempts require idempotent effects | High | Capabilities are at-least-once, never exactly-once; clients/capabilities need idempotent design |
| `world.py` vs knowledge_graph dual authority | Medium | Commerce uses KG; SharedWorld is separate — production blocks direct CRUD only |
| TransitionGate coverage | Medium | Order, Payment, SocialSourcing wired; not all grocery capabilities |
| Full Mongo/KG write fencing | Medium | Fence on belief checkpoint only, not all writes |
| Three execution engines | Low–Medium | Partial unification via `IntegratedExecutionEngine` + graph fallback |
| Auth/payment P0s from ADR-020 | High | Separate from this pass — see `docs/adr/020-production-hardening-audit.md` |

---

## Key files reference

| Area | Path |
|------|------|
| Production gates | `src/monkey_brain/kernel/production_gates.py` |
| Capability dispatch dedup | `src/monkey_brain/kernel/pipeline/capability_dispatch_store.py` |
| Action execution | `src/monkey_brain/kernel/pipeline/action_executor.py` |
| Execution engine | `src/monkey_brain/kernel/pipeline/execution_runtime/integration.py` |
| Planetary runtime | `src/monkey_brain/kernel/society/integration.py` |
| Lifecycle controller | `src/monkey_brain/kernel/society/actor_lifecycle_controller.py` |
| HTTP idempotency | `src/monkey_brain/api/idempotency.py` |
| World API guard | `src/monkey_brain/api/routes/world.py` |
| K8s config | `deploy/k8s/configmap.yaml` |

---

## Verdict

| Deployment profile | Ready? |
|--------------------|--------|
| Single replica + production gates + Redis + OPA + client idempotency keys | **Yes**, with monitoring |
| Multi-replica, continuous production, failure chaos | **No** — requires `replicas > 1` validation and external side-effect idempotency framework |

---

## Related documents

- `docs/adr/020-production-hardening-audit.md` — broader adversarial audit and P0 auth/payment findings
- `docs/HORIZONTAL_SCHEDULER_SCALING.md` — scheduler scaling design and qualification test scope
- `docs/ACTOR_LIFECYCLE.md` — lifecycle controller semantics
- `docs/adr/009-idempotency-for-mutating-endpoints.md` — idempotency design
