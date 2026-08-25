# ADR-020: Production Hardening Audit — Adversarial Test, Fix, Verify

## Status

In progress. Phase 0 (Production Risk Map) and Phase 1 (mandatory
regression coverage for the four already-known critical bug classes)
are complete, with real automated tests, actually executed. A second
pass (documented below, "PASS 2") found that most of Phases 2-26's
concerns already had real, substantial existing test infrastructure in
this repo (`tests/security/`, `tests/scenarios/`, `tests/affiliations/`,
`tests/stress/`, `tests/scale/`, `tests/benchmark/`, etc. — over 1000
tests) that had simply never been run and, where run, was substantially
stale against the current codebase. That infrastructure has now been
run, and every real (non-LLM-flake, non-pre-existing-and-unrelated)
failure found has been root-caused and fixed. Phases not covered by
that existing infrastructure (backup/recovery re-verification, formal
load/stress measurement, the full LLM-schema-validation boundary, a
completed audit-log fix) remain genuinely unstarted — see "What this
ADR does NOT claim" at the bottom.

Evidence discipline: every claim below is either a file:line citation,
a pytest run I actually executed and can reproduce, or an explicit
"unverified" label. Nothing here is asserted from memory of a prior
session or from what a docstring claims without checking it against
current code.

## Context

`docs/production_readiness_checklist.md` (dated 2026-08-03, "NOT
CLEARED — 5 of 25 items unmet") already documented several real gaps.
This audit was commissioned specifically because four *additional*,
more severe bugs were found and fixed during ordinary demo-hardening
work in the days since: silent belief-persistence failure (a
`frozenset` crossing a JSON boundary), actor state becoming
disconnected from its own write path after a restart, a broken plan
that could replay forever, and a single bad episode permanently
zeroing an actor's ability to ever succeed again. The working
hypothesis — confirmed repeatedly below — is that these were not
isolated defects but symptoms of systemic gaps: no automated
regression suite was actually being *run*, and the existing one, once
run, turned out to be substantially stale.

---

## PHASE 0 — PRODUCTION RISK MAP

### Persistence & runtime state

| Subsystem | Current implementation | Source of truth | Persistence | Recovery behavior | Concurrency model | Failure behavior | Known risks | Test coverage |
|---|---|---|---|---|---|---|---|---|
| **Belief state** | `kernel/pipeline/belief_state.py::BeliefState` | In-process object; durable copy via `ActorStateStore` | MongoDB (`cognitive_platform.actor_state`), JSON via `to_dict()`/`from_dict()` | `restore_actor_belief()`/`checkpoint_actor_belief()` per request | None (last-write-wins, one actor = one document) | **Was silent** (a serialization `TypeError` was only `logger.warning`'d — belief simply never persisted, confirmed live via an empty Mongo collection after real ticks) | Fixed this session (see Phase 1A) but the failure-is-silent *pattern* (catch, log, continue) still exists at the call site — a *future* new serialization gap would again fail silently, not loudly | **Real, now** — `tests/unit/test_pipeline_belief_runtime.py`, 64 tests incl. 6 new |
| **Actor registry / society state** | `kernel/society/integration.py::PlanetaryRuntime` | In-memory `self._societies`/`self._actors`, rebuilt at boot | Redis (`monkeybrain:societies`, `monkeybrain:actors` hash), `db=0` | `_load_societies()`/`_load_actors()` at `__init__` | None observed (single-writer assumption throughout) | Was silently wiring a stale `context_stream` reference into the shared execution engine after any restart past the first — real actions became invisible to every read path, no error at all | Fixed this session (see Phase 1B). `_init_persistence()`'s `db=0` was **hardcoded with no env override at all** until this session — see "Redis DB isolation" finding below | **Real, now** — `tests/integration/test_actor_persistence_roundtrip.py`, 4 new rehydration tests |
| **Plan cache (hysteresis)** | `kernel/pipeline/planning/current_plan_store.py` + `kernel/pipeline/comparison/integration.py::_run_decide` | `ComparisonIntegratedPolicy._current_plans` (in-memory), Redis-backed | Redis, plain `SET`, **no CAS/version** (see concurrency finding below) | Lazy per-goal-key load on first tick after restart | **None — plain read-modify-write race** | Was able to replay an identical broken plan forever (confirmed live: 0/2, 0/6 successes across 3 consecutive retries) | Fixed this session (`last_execution_failed` bypass, see Phase 1C). The upstream skip-gate in `belief_runtime.py::_generate_plan` was *also* fixed but has **no direct unit test** — documented gap, see below | **Partial** — `tests/unit/test_plan_hysteresis_goal_scoping.py`, 18 tests incl. 6 new for the decision-level fix; skip-gate layer untested |
| **Prediction state (TransitionModel)** | `kernel/pipeline/prediction/transitions.py::TransitionModel` | In-memory on `policy`, Redis-backed | Redis, per-(actor,goal_key) | Reloaded lazily | None observed | Was able to permanently zero a whole plan's predicted probability from one real observed failure (dependency-cascade hard-zero in `risk.py::_path_probability`), causing permanent rejection | Fixed this session (Phase 1D) | **Real, now** — `tests/unit/test_prediction_risk.py` (3 new), `tests/unit/test_prediction_scenario_participation.py` (1 corrected), `tests/unit/test_learning_hardening.py` (22, all now passing) |
| **Knowledge Graph** | `kernel/knowledge_graph.py::KnowledgeGraph` | In-memory entity store | Redis-backed (confirmed elsewhere this session) | Not directly audited this pass | `compare_and_swap` used pervasively — reservations, inventory, wallet debits (`PaymentCapability`) | Correct where CAS is used | **`cancel_order()`/`approve_return()` (`grocery.py:7094-7099`, `:7231-7234`) still do a plain read-then-`update_entity` on wallet balance and `total_refunded` — the exact race class already fixed elsewhere in the same file, left unfixed here** (found by research agent this session, not yet fixed) | Unverified for the CAS gap specifically |
| **Episodic memory** | `kernel/learn/memory` (`MemoryManager`) | Redis-backed vector search | Redis | Not audited this pass | Not audited | Not audited | Not audited | Not audited |
| **Context stream** | `kernel/society/context_stream.py::SocietyContextStream` | In-process list on `PlanetaryRuntime` | Redis (`_save_context`, incremental RPUSH) | Rebuilt via rehydration (see Actor registry row) | Not audited | Was the specific victim of the rehydration-wiring bug (Phase 1B) | Fixed | Covered indirectly via Phase 1B tests |
| **Execution history / Timeline** | `kernel/timeline/store.py::TimelineStore` | Process-wide singleton | Redis-optional (per its own docstring) | Singleton reference reset ≠ underlying store reset — `tests/conftest.py::_reset_timeline_store` only clears the reference | Not audited | Append-only by design | Not audited | Not audited |
| **Execution checkpoints (crash-resume)** | `kernel/pipeline/execution_checkpoint_store.py` | Redis, keyed by `execution_id` | Redis | By design — a caller passes `meta.resume_execution_id` to replay | Not audited | **Real trap found this session** (see "Checkpoint-resume execution_id collision" below): reusing an `execution_id` for what should be a logically new tick silently replays a cached result instead of re-executing | `tests/scenarios/test_checkpoint_restart.py` exists, exercises the intended crash-resume path directly |

### Provider / LLM boundary

| Subsystem | Current implementation | Notes |
|---|---|---|
| Model backend | `kernel/execute/provider/model_backend.py` | Ollama (local) primary this session; `num_ctx: 8192` override fixed a real truncation bug earlier. Latency observed this session: milliseconds to 280+ seconds, with outright timeouts — **not production SLA-shaped**. |
| Plan validation boundary | `kernel/pipeline/plan_compiler.py::compile_plan` + `belief_runtime.py`'s rejection gates | **Real structural gap the mission specifically asks about (Phase 6/9): there is currently no formal JSON-schema validation step between "LLM returned text" and "plan object exists."** `LLMPlanner` parses the LLM's JSON directly into `Plan`/`PlanStep` objects; malformed shape fails via Python `TypeError`/`KeyError`, not a named, tested validation contract. `compile_plan` validates *after* construction (capability existence, permission resolution) but does not itself defend against, e.g., wrong types for `cost`/`confidence` reaching the dataclass constructor. **Not fixed this pass — flagged as a P1 finding**, see below. |
| Adversarial LLM output handling | Ad hoc, discovered empirically this session (missing/duplicate mandatory steps, hallucinated capability names, hallucinated product IDs) | Each *specific* case found this session was patched via prompt engineering + a runtime guard (e.g. `_NO_PERMISSION_NEEDED_ACTIONS`, ungrounded-product refusal). **No systematic adversarial test suite exists** (Phase 7 of the mission) — this is real, not built. |

### Authentication, authorization, secrets, payments, audit (from this session's research pass — file:line cited, not re-verified independently in this ADR)

| Subsystem | Finding | Severity |
|---|---|---|
| Auth (`api/dependencies.py`) | Secure-by-default (`AGENTOS_AUTH_REQUIRED` defaults true); real JWT path exists. **`PUT /api/v1/actors/{actor_id}/account` (`actor_profile.py`) has no `require_permission`/`get_current_user` at all — an unauthenticated caller can set a new password for any actor_id.** | **P0** |
| Authorization / tenant isolation | Routes gated by broad permissions (`perm-manage-actors`) never compare the authenticated caller against the target `actor_id`/order owner — any caller with that permission can read/mutate any other actor's memory, goals, executions, wallet, orders. `login()` never populates JWT `permissions`/`tenant` claims, so a real actor login can't pass any `require_permission()` check at all. | **P0** |
| Secrets | `ACCESS_TOKEN_SECRET`/`REFRESH_TOKEN_SECRET` default to `""`, used unconditionally in `jwt.encode`, with **no startup assertion** that they're non-empty in a real deployment. | **P0** |
| Payments | Real CAS-protected ledger with idempotency-key support (`api/idempotency.py`) at most routes — genuinely more hardened than expected. **But `pay_for_order` (`orders.py:102`) accepts a client-supplied `body.total` that overrides the authoritative order total with no cross-check.** Combined with the tenant-isolation gap, an authorized-but-wrong caller can charge an arbitrary wallet an arbitrary amount unrelated to the real order. | **P0** |
| Audit logging | Two parallel systems. `kernel/audit.py`'s hash-chained `AuditLog` is real but **in-memory only — `set_store()` is never called anywhere**, so it's wiped every restart. The `@audited` decorator's real sink is `logger.info()` unless `AUDIT_MONGODB_ENABLED` is explicitly set (off by default) — **`docs/production_readiness_checklist.md`'s claim "Audit logging — real MongoDB-backed trail, checked" is not true by default.** | **P1** |
| Redis DB isolation | `_init_persistence()` hardcoded `db=0` with no env override until this session (now fixed, see Phase 1B). **13 other Redis connection sites in the codebase still have no consistent isolation story** — most use `redis.from_url(REDIS_URL)`, which doesn't respect the new `REDIS_DB` var at all. | **P1** |
| SSRF / prompt injection | No capability found that fetches an attacker/LLM-supplied URL directly; Tavily search hits a fixed host. Capability dispatch always resolves through the registered bus, not free-form text — no `eval`/dynamic-dispatch-from-string pattern found. **Not exhaustively traced** (Tavily result content flowing into later LLM prompts was not fully followed downstream). | Unverified, likely low |

---

## PHASE 1 — MANDATORY REGRESSION COVERAGE (COMPLETE)

All four bug classes named as mandatory in the mission brief now have
real, executed, passing automated tests — not just written-but-unrun
files (the prior standing project rule against running tests was
explicitly overridden for this initiative, by the user, this session).

### A. Belief persistence — `tests/unit/test_pipeline_belief_runtime.py` (64 tests, 6 new)

Root causes found and fixed, not just the originally-reported one:

1. `_json_safe()` (the function *built specifically* to prevent
   exactly this bug class after an earlier incident) never handled
   `set`/`frozenset` — fixed generically, not just at the one call
   site that broke.
2. `BeliefState.update_plan()` — a real public method with **zero
   callers anywhere in `src/monkey_brain/`** — silently violated
   `Plan.steps`'s own `tuple[PlanStep, ...]` contract by storing bare
   strings. Fixed to construct real `PlanStep` objects.
3. `BeliefState.from_dict()` only coerced `Plan`'s own top-level tuple
   fields back from JSON-list; every *nested* tuple field
   (`PlanStep.preconditions`, `PlanStep.depends_on`, and — found by
   extending the audit per the mission's own "audit every persisted
   type" instruction — `Hypothesis.evidence`, `Prediction.based_on`,
   `LearnedUpdate.evidence`) silently stayed a list after every real
   restart.
4. `add_hypothesis`/`record_prediction`/`record_learning` — used
   extensively in the **live production Learn stage**
   (`belief_runtime.py:1340-1563`) — had the identical bug at
   *construction* time, not just on restore. This was live, silent,
   and had never crashed because nothing had yet compared these
   tuples for equality/hashability in a way that surfaced it.

### B. Actor write/read path after restart — `tests/integration/test_actor_persistence_roundtrip.py` (4 new tests)

Two real `PlanetaryRuntime()` instances sharing one Redis (a genuine
"process A writes, process B is a cold restart reading the same
durable store" simulation, not two views of one in-memory object).
Confirms: actor survives restart with exact state; multiple actors
survive; a **new write made against the rehydrated instance survives
to a third instance** (proving the rehydrated instance's own write
path is itself durable, not just its read path); and the specific
regression — `id(execution_engine._context_stream) is
id(planetary_runtime.context_stream)` after rehydration.

**Incident during this work, disclosed in full:** running
`pytest tests/unit/` without stopping the live dev server first
triggered a pre-existing, `autouse=True`, whole-suite fixture
(`tests/conftest.py::_flush_shared_redis`) that flushes the shared
Redis before every test — its own docstring already warns "never run
pytest against the same Redis a live dev server is using." The live
demo world's Redis-backed state was wiped as a result (MongoDB belief
checkpoints, which are a separate store, survived). Recovered by
re-seeding. Root-caused and partially fixed (`REDIS_DB` env override
added to `PlanetaryRuntime`, backward-compatible, opt-in); **not**
fully fixed — see "Redis DB isolation" above.

### C. Broken plan cache — `tests/unit/test_plan_hysteresis_goal_scoping.py` (18 tests, 6 new)

Confirms the two-layer fix holds: `_run_decide` force-replaces a
`Current Plan` marked `last_execution_failed`, unconditionally,
regardless of score, while a **healthy** standing plan is still
protected by normal 10% hysteresis (regression-proofing the fix didn't
turn every "keep" into "replace"). Also unit-tests
`_record_plan_outcome_feedback` directly: real failure marks the flag,
real success clears it, a zero-action no-op tick does not mark it
failed, and a majority-failing partial episode (matching the exact
live repro) does mark it failed.

**Documented gap:** the *other* half of the real fix — `belief_runtime.py::_generate_plan`'s
incremental-scheduling skip-gate now also checks
`not current_record.last_execution_failed` before reusing a cached
plan without calling the LLM at all — has no direct unit test. Testing
it requires mocking `ContextConstructionEngine`/`LLMPlanner` and a full
`CognitiveState`; judged lower value than the decision-level coverage
given time, but it is the layer that made the original live bug
possible in the first place (without it, `_run_decide`'s fix alone was
observed live to be a no-op, since there was no genuinely different
candidate plan to replace with).

### D. Prediction gate / actor lockout — `tests/unit/test_prediction_risk.py` (25 tests, 3 new), `test_prediction_scenario_participation.py` (19, 1 corrected), `test_learning_hardening.py` (22, all fixed)

Confirms: one real observed failure degrades but never zeroes a
multi-step plan's probability; probability recovers after a later
success on the same action; repeated failures degrade monotonically
and boundedly, never jumping to an unrecoverable absolute zero.

**Real bug found and fixed that was masking this entirely** in the
pre-existing test suite: `test_learning_hardening.py`'s helpers
(`_state()`, `_learn_tick()`, `_run_decide_gate()`) either never called
`belief.update_goal()` (so every learned transition was silently keyed
under an empty goal, defeating the goal-scoping fix from earlier this
session) or reused a hardcoded `execution_id` across multiple calls
within one test — which, because the crash-resume checkpoint mechanism
is real and Redis-backed, made every call after the first silently
*replay a cached result instead of re-executing*. This produced a
false "0/300 exploration fires" result that looked exactly like a
broken recovery mechanism; with a unique `execution_id` per call the
observed rate was 14/300 (4.7%), matching the configured 5% almost
exactly. **The epsilon-exploration recovery mechanism itself was never
broken** — the test harness was. 12 of the file's 22 tests were
silently vacuous (passing while testing nothing, or failing) before
this fix; all 22 now genuinely exercise real code.

### New findings surfaced purely by finally *running* the existing suite

- `tests/integration/test_actor_persistence_roundtrip.py`: 3 of 12
  tests referenced a dataclass field (`belief_tensor`) renamed to
  `belief_state` at some unknown prior point — genuinely broken,
  crashing with `TypeError`, not merely stale in spirit. Fixed
  mechanically. The remaining 9 tests in that class are still weak
  (pickle round-trips on ad-hoc dicts unrelated to the real
  `PersistedActorState` shape) — not rewritten this pass, flagged as a
  P2 follow-up.
- A stray `NameError` (undefined variable `pr`, should have been
  `live_pr`) in `test_prediction_scenario_participation.py`, dead code
  duplicating an assertion two lines above. Removed.
- Full baseline run: **229 failing / 2151 passing / 7 skipped** before
  this pass began. After Phase 1's fixes: **212 failing / 2182
  passing / 7 skipped** (17 resolved as a direct side effect,
  unrelated to deliberately chasing them). The remaining 212 span ~25
  files with, on first sampling, at least one more distinct root cause
  (a full-stack `TestExpandedDomains` test expecting 2 registered
  actors and getting 0) that was **not** investigated further this
  pass — explicitly out of scope for the reasons in "What this ADR
  does NOT claim" below.
- 3 test files (`test_cognitive_kernel.py`, `test_epa.py`,
  `test_performance.py`) fail to even *collect* — they import
  `kernel/cognitive_kernel.py`, which imports a third-party `cortex`
  package whose own import chain references a `Pipeline` class that no
  longer exists in this codebase. `cognitive_kernel.py` appears to be
  dead/legacy code (the actually-used cognitive engine is
  `belief_runtime.py::CognitiveRuntime`, confirmed extensively
  elsewhere this session) — **not investigated further or fixed**; a
  real question for a human decision (delete `cognitive_kernel.py` and
  its tests, or repair the `cortex` dependency) rather than something
  to guess at.

---

## PASS 2 — RUNNING AND REPAIRING THE EXISTING PHASE 2-26 INFRASTRUCTURE

The repo already contains substantial test infrastructure directly
addressing many mission phases — it had simply never been run, or was
last run against an earlier version of the codebase. Ran it, root-caused
every real failure, fixed the code or the test as appropriate (never
weakened an assertion to make it pass), left LLM-quality and pre-existing
unrelated failures as explicitly identified, not silently ignored.

### Security (Phase 13) — `tests/security/`, 309 tests

Baseline: 299 passed, 10 failed (all pre-existing, unrelated to anything
touched this pass — exchange-server mTLS, health-endpoint hardcoding,
network-delivery trust policy, etc.; not triaged further, listed in the
"remaining P1/P2" section below).

**Real P0 found and fixed, not covered by any existing test**:
`api/routes/actor_profile.py`'s `get_account`/`update_account`/
`list_sessions` and **every route in `api/routes/knowledge_graph.py`**
(6 routes: get/add entities, get/add relationships, create_snapshot) had
**zero auth dependency at all** — any unauthenticated caller could read
or WRITE another actor's account state or entire knowledge graph, and
`update_account` can set/replace a real, PBKDF2-hashed login password.
`test_route_authorization.py` already proves this exact class of gap
gets caught for the *manufacturing* domain (`domains/manufacturing/
knowledge/services/`) via a file-level "does this file mention a guard
anywhere" scan — but that scan was never pointed at
`src/monkey_brain/api/routes/`, and file-level checking would have
missed this specific bug anyway (`actor_profile.py` uses
`require_permission` elsewhere in the same file).

Fixed:
- New `require_self_or_permission(permission, id_param="actor_id")`
  dependency (`api/dependencies.py`) — the caller IS the entity named by
  the path param, OR holds `permission`. Generalized over `id_param` so
  it works for both `actor_id` (actor_profile.py) and `person_id`
  (knowledge_graph.py).
- Applied to all 9 previously-unguarded routes across both files.
- New `tests/security/test_monkeybrain_route_authorization.py`: a
  precise, AST-based (not file-level regex) per-route scanner covering
  all 374 routes in `src/monkey_brain/api/routes/`, plus 5 functional
  tests exercising `require_self_or_permission` itself with real signed
  JWTs (self-allowed, different-actor-denied, elevated-permission-
  allowed, unauthenticated-rejected, alternate id_param name) — 18
  tests, all passing. This is now permanent regression coverage: any
  future route added without a guard fails this suite immediately.

Also found (RLS): `test_rls_enforcement.py`'s 6 failures are stale, not
a vulnerability — the test expects a Postgres-cursor-based Row-Level-
Security mechanism `ActorStateStore` no longer uses (it migrated to
MongoDB). Verified directly: every real Mongo query in
`actor_state_store.py` DOES filter by `tenant_id` explicitly (composite
`{tenant_id}:{actor_id}` key plus an explicit query filter on every
`find_one`/`find`/`update_one`) — application-level tenant isolation is
intact, just implemented differently than these tests assume. Not fixed
this pass (would mean rewriting 6 tests for the Mongo model) — flagged
as P2 below.

### Scenario suite (Phase 21's "golden path") — `tests/scenarios/`, 76 files

Baseline: 345 passed, 22 failed. After fixes: all real (non-LLM-flake)
failures resolved. Root causes found, each affecting multiple files:

1. **The session-wide autouse fake LLM backend was fundamentally
   broken for any test that reaches a real planning tick.**
   `tests/conftest.py::_GenericPlanningBackend.complete()` was a
   synchronous method; the real code path
   (`llm_planner.py`'s `CircuitBreaker.acall`) always does
   `await func(*args, **kwargs)`. Calling a sync function returns its
   result immediately (a plain string), and `await`-ing a string raises
   `TypeError: 'str' object can't be awaited`. This is autouse —
   applied to the entire 2380+-test suite — so any test that
   constructed a bare `CognitiveRuntime()`/`LLMPlanner()` and actually
   exercised real planning (not just system-level checks) hit this.
   Fixed by making `complete()` `async def`. Verified no regression:
   full `tests/unit/` failure count unchanged (212 before and after,
   same failures) — this fix only *unmasked* one previously-hidden bug
   (below), it didn't break anything.
   - **Unmasked**: `test_pipeline_execution.py`'s own local
     `MockExecutor.execute()` was also synchronous, and had never
     actually been reached before (planning crashed first, so
     `_execute_plan`'s empty-plan early-return short-circuited before
     ever calling it). Fixed the same way.
2. **`_force_ollama_backend`-style test helpers (4 files) patched the
   wrong symbol.** They set `model_backend._default_backend` directly,
   but the autouse fixture above patches `model_backend.get_backend`
   itself — `_GenericPlanningBackend`'s own docstring already documents
   the correct escape hatch (patch `get_backend`, not
   `_default_backend`), and one file (`test_mb3002_browse_catalog.py`)
   already had the fix; it was never propagated to
   `test_mb3020_shipment_tracking.py`, `test_rest_setup_and_prompt_
   reasoning.py`, or `test_mb3060_end_to_end_cognitive_os_prompt.py`.
   Fixed all three the same way.
3. **A 0-arg `context_factory` lambda**, predating the (already-shipped,
   confirmed via `runtime.py`'s own comment) "Context-Aware Personalized
   Planning" refactor that made `context_factory` a 1-arg callable.
   `test_mb3060`'s own scenario helper still passed a 0-arg lambda.
4. **Stale `ProductSelectionCapability` result-shape assertions.** Two
   files (`test_mb3060`, `test_rest_setup_and_prompt_reasoning`) checked
   for a nested `candidates -> products` shape that doesn't match
   ANY current branch of that capability's real implementation (real
   shape: flat `{"selected": [...]}`) — a genuinely different, older
   API shape. Fixed both to match the real, current contract.
5. **`goal_key` mismatch**: `belief.plan = plan` sets `Plan.goal`, but
   `_learn_transitions` computes `goal_key` from `belief.goal.name/
   description` (a derived property backed by GoalTimeline) — same bug
   class fixed in Phase 1's `test_learning_hardening.py`, found again in
   3 more files (`test_compound_disruption.py`, `test_fault_
   injection.py`, `test_learning_inspection.py`). Fixed identically:
   `belief.update_goal(name=goal)` before use.
6. **A real refinement to Phase 1C's own low-success-episode guard**,
   found via `test_fault_injection.py`: the guard (added this session,
   `_learn_transitions`) computed its success ratio from raw
   `execution.success_count`/`failure_count`, which folds in steps
   BLOCKED by an earlier real failure (dependency cascade) as if they
   were additional failures — undercounting the real success rate among
   genuinely-attempted steps and wrongly discarding learnable evidence
   from a normal partial-failure episode. Fixed to compute the ratio
   from the Comparator's own `node_diffs` (`actual_success` True/False/
   absent), which already correctly excludes never-attempted steps.
   Re-verified all of Phase 1C/1D's own regression tests still pass
   (43/43) after this refinement.
7. **`DelegateTaskCapability._find_actor_by_name` renamed** (this
   session, Phase 1C-adjacent work) to `_find_actor_by_id_or_name` — one
   scenario test still referenced the old name directly, a genuine
   regression from that earlier rename, now fixed.
8. **`_FRAUD_VELOCITY_THRESHOLD` deliberately raised from 3 to 10** in a
   prior pass (documented: threshold-3 tripped on ordinary demo usage)
   — 4 tests across `test_fraud_policy.py`/`test_mb3014_fraud_
   detection.py` still seeded only 3 orders, silently no longer
   exercising the real gate at all. Updated seed counts (and one stale
   module docstring) to match the current, intentional threshold.
9. **`DeliveryCapability` address resolution now scoped to the
   requesting actor** (a real, documented, intentional prior security
   fix — "could silently resolve to a stranger's address") —
   `test_mb3010_checkout.py`'s fixture never added the required
   `actor_id` attribute to its seeded address entity. Fixed the
   fixture.

Remaining after fixes: 3 real-LLM tests are genuinely flaky when run in
a long sequence together (each makes a real Ollama call) — confirmed
one specific case is the model itself hallucinating a product id
(`laptop_123`) that the system correctly refuses to substitute, exactly
the same class of "LLM output validation" gap already flagged as Phase
7 (unstarted) in this ADR's Phase 0 section — not a code defect, not
fixed by changing code.

### Affiliations (`tests/affiliations/`, 61 tests)

Two failures, both fixed:
- `test_types.py`: hardcoded `len(ALL_TYPES) == 39`; the real registry
  has grown to 50. Updated.
- `test_integration.py::test_trust_evolution`: called
  `trust_engine.update_from_outcome()` directly, which writes to
  `TrustEngine`'s own internal dict — but `AffiliationManager.get_trust()`
  reads `Affiliation.trust_level` directly whenever a real affiliation
  exists (its own docstring: "the same field every live caller reads...
  rather than a separate trust store that could drift from it"), only
  falling back to `trust_engine` when no affiliation is on file. The
  test exercised the wrong one of two intentionally-parallel update
  paths for a scenario (a real affiliation exists) where
  `AffiliationManager.update_trust_from_outcome()` — the documented
  "Primary trust evolution mechanism" — is the correct one. Fixed the
  test to call it.

### Other directories run clean on the first pass, no fixes needed

`tests/fault_injection/` (10/10), `tests/planetary/` (7/7),
`tests/benchmark/` (103/103), `tests/benchmarks/` (2/2, 7 correctly
skipped), `tests/domains/` (17/17), `tests/ontology/` (29/29),
`tests/pilot/` (7/7), `tests/stress/` (10/10), `tests/scale/` (3/3, 2
correctly skipped). `tests/chaos/`, `tests/load/`, `tests/e2e/` are
correctly gated behind `RUN_INTEGRATION=1` (need a live server) and
skip cleanly by default, matching `tests/conftest.py`'s own documented
design.

### A real, disclosed incident during this pass

Running `pytest tests/unit/` without first stopping the live demo
server triggered a pre-existing, `autouse=True`, whole-suite fixture
(`tests/conftest.py::_flush_shared_redis`) that flushes the shared Redis
before every test — its own docstring already warns "never run pytest
against the same Redis a live dev server is using." The live demo
world's Redis-backed state was wiped as a result (a stray MongoDB belief
checkpoint survived, orphaned). Recovered by re-seeding. Partially fixed
the underlying gap: `PlanetaryRuntime._init_persistence()`'s Redis `db`
was hardcoded to `0` with **no environment-variable override at all**
(host/port were overridable, db was not) — added `REDIS_DB` support,
backward-compatible (defaults to `0`, unchanged). **Not fully fixed**:
13 other Redis connection sites in the codebase use `redis.from_url()`
and don't respect `REDIS_DB` at all — real, isolated test/dev separation
would need all of them updated, plus `_flush_shared_redis` itself
redirected to the isolated db. Flagged as P1 below, not completed this
pass; the working discipline for the remainder of this session was
"never run pytest while the dev server is running," matching what the
fixture's own docstring already recommends.

---

## PHASES 2-26 (remaining) — NOT STARTED

Persistence hardening (CRUD/corruption/concurrent-write matrix for
every listed store), crash-injection testing at each execution
boundary, idempotency audit for every side-effecting capability beyond
Payment, concurrency/locking audit beyond the two gaps already found,
the LLM-to-capability schema-validation boundary (flagged as P1
above, not built), adversarial LLM plan testing (Phase 7's 20-item
list), the deterministic execution contract / execution graph
validation (Phases 8-9), failure semantics (root-cause vs.
blocked-downstream — partially already true per this session's earlier
"blocked_by_dependency" work, not re-verified here), grounding
integrity (spot-checked live earlier this session, not re-audited with
this rigor), state-consistency invariant tests (Phase 12), the
security audit beyond what the research agent found (Phase 13), web
search security (Phase 14), payment adversarial testing beyond the
one gap found (Phase 15), latency/timeout/cancellation policy (Phase
16 — latency numbers are anecdotal from this session, not measured
systematically), observability/correlation-ID audit (Phase 17), the
audit-log fix itself (Phase 18 — found broken, not yet fixed), backup/
recovery restoration testing (Phase 19 — `docs/adr/013` claims this
was live-verified in a prior session; not re-verified here), the
broader automated regression suite (Phase 20 — this ADR only closes
the four mandatory bug classes plus opportunistic fixes to files it
touched), the golden-path/failure matrix (Phase 21), property/invariant
testing (Phase 22), the silent-fallback sweep (Phase 23 — one instance
found and fixed this session already, `_learn_transitions`'s low-
success-episode guard; not swept exhaustively), production
configuration separation (Phase 24 — related finding: no dev/test/prod
Redis separation exists at all, see above), and load/stress testing
(Phase 25) are **all unstarted**.

---

## Classification of findings (P0-P3)

**P0 — blocks production:**
- ~~Unauthenticated account-takeover route~~ **FIXED** — `get_account`/
  `update_account`/`list_sessions` (`actor_profile.py`) and all 6
  `knowledge_graph.py` routes now require `require_self_or_permission`,
  with permanent AST-scanner regression coverage
  (`test_monkeybrain_route_authorization.py`).
- **Still open, broader than the routes just fixed**: routes gated by a
  bare `require_permission("perm-manage-actors")`/`"perm-view-actors"`
  elsewhere in the codebase (e.g. much of `actors.py`, `commerce.py`,
  `orders.py`, per the original research-agent finding) still never
  compare the authenticated caller against the resource's own owning
  actor_id — any caller holding that one broad permission can access
  every OTHER actor's data too, not just the two files fixed this pass.
  `require_self_or_permission` is the right primitive for this now that
  it exists; applying it broadly is unstarted.
- Empty-string JWT signing secret with no startup guard — not fixed.
- Client-supplied payment amount (`orders.py:102`, `pay_for_order`) not
  cross-checked against the authoritative order total — not fixed.
- No LLM-to-capability schema validation boundary (structural — currently ad hoc per-bug patching) — not fixed.

**P1 — serious production risk:**
- Audit logging silently degrades to plain log lines unless `AUDIT_MONGODB_ENABLED` is explicitly set — not fixed.
- In-memory-only tamper-evident audit log (`AuditLog.set_store()` never called) — not fixed.
- Redis DB isolation: `PlanetaryRuntime` now supports `REDIS_DB` (fixed this pass), but 13 other Redis connection sites (`redis.from_url()`-based) still don't respect it — a real isolated test/dev/prod separation needs all of them, plus `_flush_shared_redis` redirected. Caused one real incident this pass (disclosed above), recovered.
- `cancel_order`/`approve_return` wallet mutations are unprotected read-modify-write races (same bug class already fixed elsewhere in the same file) — not fixed.
- `_generate_plan`'s skip-gate fix (Phase 1C) has no direct regression test — not fixed.
- 212 pre-existing `tests/unit/` failures, mostly untriaged (root-caused and fixed the ones this pass's own work touched or that shared a root cause with them; the bulk — `test_sprint15_generalization.py`'s 42, `test_generalization.py`'s 18, `test_chaos_engineering.py`'s 18, etc. — remain unexamined).
- 10 pre-existing `tests/security/` failures (exchange-server mTLS, health-endpoint hardcoding, network-delivery trust policy, compliance-result bounding) — unrelated to this pass's work, not triaged.

**P2 — important but manageable:**
- `test_rls_enforcement.py`'s 6 failures are stale (test Postgres RLS, real store is Mongo with correct application-level tenant_id filtering, verified) — not rewritten for the current architecture.
- `tests/integration/test_actor_persistence_roundtrip.py`'s remaining 9 tests are vacuous (pickle round-trips on ad-hoc dicts, not the real persistence path) — the 3 that were outright broken (stale field name) are fixed; these 9 are weak but not wrong.
- `cognitive_kernel.py`/`cortex` dead-code-or-broken-dependency question needs a human decision (blocks 4 test files from even collecting: `test_cognitive_kernel.py`, `test_epa.py`, `test_performance.py`, `test_system_validation.py`).
- Local-LLM latency (ms to 280s+ observed) has no formal timeout/cancellation policy.
- 3 real-LLM scenario tests are flaky when run in a long sequence (model occasionally hallucinates an ungrounded product id — the system correctly refuses it, but the test's own success assertion is optimistic about model reliability) — a Phase 7 (adversarial LLM testing) gap, not a code defect.

**P3 — improvement:**
- `RuntimeWarning: coroutine 'subscribe_actor_inbox' was never awaited` observed during the new Phase 1B tests (NATS not connected in a sync test context) — likely benign, not chased down.

---

## What this ADR does NOT claim

Per the mission's own explicit instruction: if any of the following
is incomplete, say so plainly rather than hiding it behind "production
ready."

- **This system is not production-ready.** Four P0 findings above are
  still unresolved (one, the unauthenticated account-takeover/knowledge-
  graph routes, was found AND fixed this pass — the rest were not).
- **Real PCI-compliant payment integration does not exist** — the
  wallet is a simulated internal ledger. Production checkout is
  blocked pending payment-provider integration and PCI/compliance
  work, exactly as the mission's own required disclosure states.
- **Authentication/security hardening is incomplete** — the specific
  routes with zero auth are now fixed and have permanent regression
  coverage, but tenant-isolation (self-vs-other-actor checking) is not
  applied broadly across the codebase yet — see the P0 list above.
- **Automated regression coverage is real but partial.** Pass 1 (Phase
  1) and Pass 2 (this pass) together give real, executed coverage for
  the four originally-known bug classes, security route authorization,
  the full `tests/scenarios/` golden-path suite, and `tests/
  affiliations/`. 212 `tests/unit/` failures and 10 `tests/security/`
  failures remain, most genuinely untriaged (the ones sharing a root
  cause with something this pass touched were fixed; the bulk were
  not examined). 20 of 26 mission phases have not been started at all.
- **Backup/recovery was not re-tested this pass** — this ADR relies on
  a prior session's claim (`docs/adr/013`) without independent
  verification.
- **Load/stress testing was not performed as a measurement exercise**
  (no throughput/P50/P95/P99 numbers were captured), though
  `tests/stress/`, `tests/scale/`, `tests/load/` do exist and the two
  that run without a live server (`stress`, `scale`) pass cleanly.
