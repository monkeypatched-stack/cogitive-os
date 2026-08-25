# Architecture

MonkeyBrain is a "Cognitive OS" — a runtime that hosts many persistent,
per-user/per-entity cognitive agents ("actors") inside a shared,
persistent world, rather than a single stateless request/response
service. This doc describes the real, current structure of the system
(entry point `src/monkey_brain/api/main.py`, port 8031), as verified
live across Gates 3-9 of this build.

## Layering

```
API layer        src/monkey_brain/api/routes/*.py   (45 route modules, 337 paths)
                        │
Kernel            src/monkey_brain/kernel/*          (29 subsystems — see below)
                        │
Persistence       MongoDB + Redis + Neo4j            (real, live-verified — ADR-013)
```

The kernel is not a single "engine" — it's ~29 independently-owned
subsystems (`kernel/geography`, `kernel/society`, `kernel/pipeline`,
`kernel/execute`, `kernel/timeline`, `kernel/plan`, `kernel/policy`,
`kernel/validation`, ...), composed by a small number of runtime/
integration classes rather than one monolithic loop. Route handlers
are thin — they call into kernel runtimes, they don't contain business
logic themselves.

**Not every subsystem directory is on the live tick path** — verified
by tracing real call sites, not by directory presence. `kernel/pipeline/`
(below) is the confirmed-live per-actor cognitive loop.
`kernel/predict/` (JEPA/MCTS/solver-mesh/model-checker) is a *different*,
disconnected tree — the real, live prediction stage is
`kernel/pipeline/prediction/`, not `kernel/predict/`, which has zero
call sites from the live tick loop. `kernel/predict/`/`kernel/learn/`
are referenced from `kernel/fix/*` and `runtime/simulation_pipeline.py`
— a separate PREDICT-FIX engine that is imported but never invoked from
`CognitiveRuntime.run()`, the actual live loop. Do not assume a
subsystem is live from its existence or its name resembling a live
one's; the two really-live prediction/learning stages are
`kernel/pipeline/prediction/` and `kernel/pipeline/learning/`,
confirmed by tracing `ComparisonIntegratedPolicy.configure()`'s real
stage list.

## The two axes: Geography and Society

Two structurally independent hierarchies compose the world, and this
session's Gate work repeatedly confirmed they stay decoupled
end-to-end (never merged into one tree):

- **Geography** (`kernel/geography/`): `Planet → Country → City → Space`
  — physical/locational containment. `GeographicEntityRuntime.tick()`
  is what actually walks presence and invokes each actor's cognition
  per cycle (see Gate 9 / ADR-016 for how this loop behaves under load).
- **Society** (`kernel/society/`): `Society → Team → Actor` —
  affiliation/governance, independent of physical location. A society
  *hosts* actors present in a geography; it never *contains* geography
  entities. `SocietyRuntime`/`kernel/society/integration.py` own
  membership, belief fusion, and context-stream publication.

An actor's tick, each planetary cycle, is coordinated across both axes:
geography determines *who is present and gets ticked*; society
determines *what governs their beliefs and actions once ticked*.

When a tick targets one actor, `GeographicEntityRuntime` selects exactly one
relevant hosted society so an actor with multiple memberships is not run
multiple times. An explicit `society_id` in the prompt request (or its
`context`) takes priority. Without one, the runtime chooses the first of the
actor's effective memberships in geographic host order; if no membership
lookup is configured, it falls back to the first hosted society containing the
active actor. Untargeted planetary cycles continue to tick every hosted
society.

## World vs. Policy

The world model (`P(S'|S)`, what's physically/logically true) is kept
separate from actor policy (`Q(S,A)`, what a given actor decides to do).
Actions are expressed as **masks over a shared world tensor**, not as
per-actor private copies of the graph — this is why the World Validation
Gate (`kernel/validation/world_validator.py`, ADR-010) exists as a
single, shared enforcement point rather than N per-actor validators.

## Timelines

`kernel/timeline/` is append-only: `Presence`, `Membership`, `Goal`,
`Belief`, `Execution`, `Relationship`, and `Activity` timelines are
separate logs, not one combined event stream — `BeliefState.goal` is a
derived property over the Goal timeline, not a stored field. This is
what Gate 6 (Persistence, ADR-013) verified actually survives restart:
graph, `PresenceTimeline`, `ContextStream`, plans, checkpoints, and
execution state are each backed by their own Redis-persisted store
(`RunStore`, `IdempotencyStore`, `SecureKeystore`, `LoginStore`, the
timeline stores themselves) — verified live, not assumed, after two
real bugs were found and fixed (both stores were silently
in-memory-only due to a missing `REDIS_HOST`/`REDIS_PORT` fallback).

## Cognitive pipeline (per actor tick)

The real, live per-tick stage order — traced directly from
`ComparisonIntegratedPolicy.configure()` (`kernel/pipeline/comparison/
integration.py`), the policy every real actor tick runs through
(`build_comparison_integrated_runtime()`, wired in at actor creation via
`SocietyRuntime`):

```
observe → believe → plan → predict → decide → execute
  (per action, inside execute: TransitionGate → Negotiation if required → Commit)
→ observe_outcome → compare → learn → learn_transitions → compile_phi → commit
```

- **Plan** (`pipeline/llm_planner.py`) — real local-Ollama-backed
  planning, not a mock. Dominates actor-tick latency (~3s/actor
  locally, per Gate 9) — `GeographicEntityRuntime.tick()` awaits each
  present actor's ticker *serially*, no `asyncio.gather`, so planetary
  cycle time is O(actors), not O(1). See
  [`troubleshooting.md`](troubleshooting.md#planet-tick-is-slow-or-times-out).
- **Predict** (`pipeline/prediction/`) — a genuine blind forecast
  against the pre-execution `world_snapshot`, deterministic
  transition-model simulation (not the disconnected `kernel/predict/`
  JEPA/MCTS tree — see the subsystem note above).
- **Decide** — plan hysteresis: keeps or replaces the standing plan for
  this goal; on "keep" it re-predicts the Current Plan in the same
  tick rather than looping back into a fresh `plan` stage.
- **Execute** — `TransitionGate`/Negotiation/Commit run *inside* this
  stage, per action, before any capability mutates shared state — not
  as separate stages after Compare/Learn.
- **Compare** (`kernel/comparator_runtime.py`) is measurement-only —
  it does not itself mutate learning state.
- **Learn** (`pipeline/learning/integration.py`, reward/belief/world
  update) and **LearnTransitions** (`pipeline/comparison/
  integration.py::_apply_transition_learning`, the TransitionModel/
  PolicyStore update) are two distinct stages, gated on Comparator
  evidence — not one combined "learning" step.

## Execution & capabilities

`kernel/execute/` (agent mesh, sandboxing, `SecureKeystore` for
credentials — ADR-014) and `kernel/capabilities/` turn a validated plan
into real side effects (REST calls, NATS, etc. — see
`capability.rest`/`capability.nats` budgets in
`kernel/fix/performance_budgets.py`).

## Security (Gate 7 — ADR-014)

Real password auth (PBKDF2-HMAC-SHA256, salted, constant-time compare,
account lockout after 5 failures), real OTP (6-digit, 5-min expiry,
3-attempt limit, code only ever returned in the API response in dev
mode), real JWT issuance (`create_access_token`), a fail-fast
`SecureKeystore` (refuses to boot without `KEYSTORE_SECRET` rather than
minting an ephemeral key), and an `@audited` decorator wired into the
real MongoDB-backed audit framework for money-moving and admin routes.
None of this is scaffolding — every claim here was verified against a
live server, including a full restart-survival check.

## Policy & Governance

See [`SECURITY_RUNTIME_GRAPH.md`](../SECURITY_RUNTIME_GRAPH.md) for the
full stage-by-stage trace. Summary: three independent OPA chokepoints,
all real, all converging on one client
(`services.common.opa` → `cerebellum.capabilities.security.opa_client`;
`domains/manufacturing/knowledge` is `sys.path`-inserted at boot
specifically so this resolves — it's CognitiveOS-core infrastructure,
not a foreign package, despite the directory name):

- `kernel/governance.py::GovernanceEngine` (via `get_governance_engine()`
  and `api/dependencies.py::sanitize_and_check_governance()`) gates
  `/plan`, `/execute`, `/predict`, `/simulate`, `/compare`, `/query`
  against `opa/policies/agentos_governance.rego`.
- `api/routes/actors.py`'s `require_opa("agentos/routes/allow", ...)`
  gates actor-management routes for agent-type Bearer principals only
  (human/`X-User-ID` callers pass through by the policy's own rule)
  against `opa/policies/agent_routes.rego`.
- `kernel/plan/goals/executor.py::GoalExecutor._authorize()` gates real
  goal execution — the layer closest to mutation — against
  `opa/policies/agentos_execute.rego`, with `default_allow=False`
  (stricter than the other two).

Fail-open vs. fail-closed: `OPA_URL` unset uses `default_allow` (an
explicit "no policy layer configured" deployment choice); `OPA_URL`
configured but erroring/timing out fails **closed** (denies), not open.

Delegation (`kernel/society/delegation.py::DelegationRegistry.
effective_delegated_permissions()`) is consulted from the same
authorization chokepoint every human-JWT route depends on
(`api/dependencies.py::require_permission`/`require_self_or_permission`)
as an additive widening check, only reached once the base JWT
permission has already failed.

## Observability (Gate 5 — ADR-012)

`src.introspection.lemon` ("Lemon") is the real metrics/tracing/logging
backbone, exposed live at `GET /api/v1/agentos/observability` (not the
bare `/observability` you'd expect by analogy with `/health` — see
[`troubleshooting.md`](troubleshooting.md#observability-endpoint-404s-at-the-bare-path)),
plus `/metrics`, `/api/v1/agentos/observability/triggers`, and
`/api/v1/agentos/observability/{panel}`.

## Performance SLAs (Gate 9 — ADR-016)

`kernel/fix/performance_budgets.py` declares real latency budgets
(`PERFORMANCE_BUDGETS`, 25+ entries) and memory-growth budgets
(`MEMORY_BUDGETS`) per operation. `scripts/gate9_benchmark.py` measures
graph traversal, planning, reasoning, planetary cycle, REST latency,
and memory growth against them — runnable any time, safe to re-run
(no destructive load).

## Operations (Gate 8 — ADR-015)

See [`deployment.md`](deployment.md) for the Docker image, Kubernetes
manifests, and Helm chart — all three are real and build/deploy
successfully as of Gate 8 (previously, the Dockerfile had never
successfully produced a working image; three real build bugs were
found and fixed via an actual `docker build`, not static review).

## API surface

337 paths / 384 operations, all documented — see
[`openapi.md`](openapi.md) for the live and frozen OpenAPI 3.1.0 spec,
and [`examples.md`](examples.md) for real request/response pairs.

## Decision record

Every architectural decision referenced above has a corresponding ADR
in [`docs/adr/`](adr/) (006 through 016 — the record for Gates 3
through 9 of this build). Read those for the *why*, not just the *what*.
