# CognitiveOS Cloud/Edge Actor Convergence

Companion to `docs/ACTOR_SCHEDULER.md` (placement), `docs/HORIZONTAL_
SCHEDULER_SCALING.md` (scale), and `docs/ACTOR_ARTIFACT.md` (the
deployable-binary model). This document is about ONE thing: **is there
one Actor abstraction, or two** — and if there were two, what closed the
gap.

## 1. Unified Actor abstraction

There is one: `CognitiveActor` (`kernel/compile/cognitive_actor.py`) —
identity, belief, policy, goals, capabilities, affiliations, the full
Observe→Believe→Plan→Predict→Execute→Learn→Commit cognitive cycle,
delegating to the canonical `CognitiveRuntime`/`BeliefFormation` engine.
This is the SAME class regardless of whether the hosting process is
configured as `ACTOR_NODE_CLASS=cloud`, `edge`, `device`, or `robot` —
node class is a `ExecutionNode` scheduling label
(`kernel/society/actor_scheduler.py::NodeClass`), never a branch in
`CognitiveActor`'s own code. `src/monkey_brain/actor_runtime.py` (the
Actor Runtime — see `docs/ACTOR_ARTIFACT.md`) is what makes this concrete:
the exact same module boots the exact same `CognitiveActor`, through the
exact same `PlanetaryRuntime.register_actor`/`ActorLifecycleController.
reconcile` path, whether `ACTOR_NODE_CLASS=cloud` or `edge`.

**What is NOT unified, deliberately left alone:** `src/sync/edge_actor.py`
(`EdgeActor`) and its surrounding "Thesis 14" cluster
(`edge_node.py`/`cloud_aggregator.py`/`edge_cloud_sync.py`,
`src/sync/edge_server.py`) are a standalone, tabular-RL-only prototype
that predates the real Actor Registry/Scheduler/Lifecycle Controller —
its `actor_id` is a bare string, tied to no `ActorIdentity`, no
governance, no capabilities, no NATS. On inspection this was never a
second *semantic* Actor implementation competing with `CognitiveActor` in
the same sense a rewrite would imply — it's a self-contained research
demonstration with its own test suite (`tests/unit/test_edge_cloud.py`).
Per this task's own instruction ("do not break callers unnecessarily...
prefer EdgeActor → compatibility wrapper / runtime configuration rather
than maintaining a second semantic Actor implementation, or use the
repository's naming if cleaner") — the cleanest solution *was* to leave
it named and shaped exactly as it is, unchanged, with a clear status note
in both files pointing at `actor_runtime.py` as the real path (added this
pass) — because turning it INTO a wrapper around `CognitiveActor` would
either break its own existing tests (which assert on `EdgeActor`'s
specific tabular belief/policy shape) or require rewriting those tests
for no architectural benefit, since nothing in the real system actually
depends on `EdgeActor` for anything CognitiveOS-governed.

## 2. Actor vs. Runtime

Already drawn, before this pass, by `ActorRuntimeState`
(`kernel/society/runtime.py`) vs. `CognitiveActor`:

- **Actor** (`CognitiveActor`): identity, cognition, beliefs, memory,
  goals, capabilities, affiliations — everything that must survive a
  process restart with byte-for-byte the same meaning.
- **Runtime** (`ActorRuntimeState` + `PlanetaryRuntime` +
  `src/monkey_brain/actor_runtime.py`, new this pass): process
  lifecycle, health, node registration, checkpoint triggers,
  connectivity — everything that is disposable and reconstructible.

This pass makes the boundary a literal file boundary for the first time:
`actor_runtime.py` contains ZERO cognition — every real operation
(`restore_actor_belief`, `activate_actor`, `tick_one_actor`) is a call
into infrastructure that already existed. See `docs/ACTOR_ARTIFACT.md`
Section "Actor vs. Runtime" for the full table.

## 3. Cloud runtime

Unchanged: `kernel.py`'s full boot (`deploy/k8s/deployment.yaml`) —
persistent Mongo/Redis/Neo4j/NATS connections, ~295-agent boot, shared
Redis-backed execution engine (`vertical_router.py::build_execution_engine`).
Nothing about this pass makes cloud execution semantically special; it
is simply `ACTOR_NODE_CLASS=cloud` in the same `actor_runtime.py`
(`deploy/k8s/actor-deployment.yaml`) or the pre-existing full multi-actor
cloud deployment.

## 4. Edge runtime

New this pass: `src/monkey_brain/actor_runtime.py` with `ACTOR_NODE_CLASS=edge`.
Genuinely lighter than the cloud boot — it constructs one
`PlanetaryRuntime`, hosts exactly one `actor_id` (via
`ACTOR_NODE_CAPACITY=1`, matching `edge-actor-deployment.yaml`'s
established one-actor-per-process precedent), and tolerates the same
already-existing fail-soft dependencies every other part of this
codebase already tolerates (Mongo down → `ActorStateStore` degrades,
NATS down → `connect_nats()` logs and continues, per their own existing
docstrings — nothing new was added to make these fail-soft, they already
were). What edge conditions genuinely change: an edge/device/robot
runtime **defaults to enforcing** the offline-safety capability gate
(`OFFLINE_SAFETY_GATE_ENABLED` defaults to `true` when `ACTOR_NODE_CLASS`
is edge/device/robot, unless explicitly overridden) — see Section 12
below. Actor identity, authority, cognitive model, and capability
semantics are unchanged.

## 5. Device/robot runtime

Same `actor_runtime.py`, `ACTOR_NODE_CLASS=device` or `robot`. No
`RobotActor`/`DeviceActor` class exists or was created. A device's
hardware-specific interfaces (motor, gripper, navigation) would be
exposed as ordinary capabilities on the `CapabilityBus`
(`kernel/domains/*.py`), reaching the actor through the SAME governed
path (`ActionExecutor`→`TransitionGate`→capability `.handle()`) every
other capability already uses — no capability bypass was introduced, and
none is needed: this pass added a classification layer
(`offline_safety.py`) that runs BEFORE dispatch, not a new dispatch path
that skips governance.

## 6. Actor identity

Unchanged from `docs/ACTOR_SCHEDULER.md`'s central invariant: `actor_id`
is permanent, assigned once at `PlanetaryRuntime.register_actor()`, never
re-derived from process/container/node identity. `actor_runtime.py`
enforces this at the boundary: it refuses to start unless `ACTOR_ID`
already has a registry record (`ReadinessState.NOT_FOUND`), and only
creates one when `ACTOR_BOOTSTRAP_IF_MISSING=true` is explicitly set —
see `docs/ACTOR_ARTIFACT.md` for the full identity-establishment model.

## 7. Persistent state

Unchanged: belief persists via `ActorStateStore`/Mongo
(`checkpoint_actor_belief`/`restore_actor_belief`), lifecycle/placement
via the Redis-backed Actor/Node Registries. `actor_runtime.py` never
invents a second persistence path — its own shutdown hook calls
`checkpoint_actor_belief` directly, its own startup reaches READY only
after `ActorLifecycleController.reconcile()` (which itself calls
`restore_actor_belief`) confirms the actor is genuinely ACTIVE.

## 8. Registry / 9. Scheduler / 10. Lifecycle Controller

Unchanged — all built earlier this session, documented in
`docs/ACTOR_SCHEDULER.md`/`DEPLOYMENT_ARCHITECTURE.md`. This pass's only
addition to the Registry: `ActorRegistryEntry.artifact_version`/
`runtime_version` (pure metadata — see `docs/ACTOR_ARTIFACT.md`).

## 11. Communication

Already location-independent (`AskActorCapability`'s `locate_actor()`
fallback, built earlier this session) — verified in this pass
specifically ACROSS node classes, not just across processes
(`tests/scenarios/test_actor_runtime_artifact.py::test_05`): an actor on
an `EDGE`-class node resolves correctly from a `CLOUD`-class caller
purely via the registry, never a node address.

## 12. Offline semantics

New this pass: `kernel/pipeline/offline_safety.py`. Classifies every
capability into `SAFE_OFFLINE` / `REQUIRES_WORLD_STATE` /
`REQUIRES_AUTHORITY` / `REQUIRES_SYNC`, and assesses this process's
current `ConnectivityStatus` (`CONNECTED`/`DEGRADED`/`DISCONNECTED`,
based on Redis + NATS reachability). Wired into `ActionExecutor` as an
optional gate (`connectivity_check`), evaluated BEFORE the negotiation
gate, refusing a capability call outright — never invoking `.handle()` —
when connectivity is insufficient for that capability's class. Produces
exactly the vocabulary Section 31 of the originating task asked for:
`WAITING_FOR_WORLD_STATE`, `WAITING_FOR_AUTHORITY`, `DISCONNECTED`. An
unclassified capability defaults to the conservative bucket
(`REQUIRES_AUTHORITY`) — never assumed safe by omission.

**Deliberately opt-in, not universal:** wiring this unconditionally into
every `PlanetaryRuntime` (`OFFLINE_SAFETY_GATE_ENABLED=true` always) would
have gated every `REQUIRES_AUTHORITY`/`REQUIRES_WORLD_STATE` capability on
Redis reachability, breaking any test or lightweight deployment that
currently runs with `self._redis is None` — a well-supported, intentional
configuration throughout this codebase, not a degraded state. Default:
off for cloud, **on by default** for edge/device/robot (`actor_runtime.py`
sets it unless the operator overrides), matching where this actually
matters.

## 13. Migration

Unchanged, `docs/ACTOR_SCHEDULER.md`'s safe checkpoint-and-restart model
— exercised in this pass specifically across node CLASSES
(`test_03_migration_cloud_to_edge_preserves_identity`): an actor
migrates `CLOUD`→`EDGE`, same `actor_id`, checkpoint→suspend on the cloud
side, resume from the same checkpoint on the edge side.

## 14. Failure recovery

Unchanged mechanism (`docs/ACTOR_SCHEDULER.md`'s staleness-based
recovery, `docs/HORIZONTAL_SCHEDULER_SCALING.md`'s failure model),
exercised across node classes
(`test_04_edge_node_failure_recovers_actor_on_cloud`): an EDGE node dies,
a CLOUD node recovers the same actor_id with no duplicate registry entry.

## 15. Governance

Unchanged and untouched by this pass: `TransitionGate`/
`domain_security.py` remain the sole authority decision point, evaluated
identically regardless of `ACTOR_NODE_CLASS`. The offline-safety gate
(Section 12) is a *connectivity* precondition ("can we safely reach
authority right now"), never an authority decision itself — it either
lets a call reach `TransitionGate` normally or refuses it before
`TransitionGate` is even consulted; it never grants or overrides a
governance verdict.

## 16. Capability model

Unchanged: capabilities differ by what's registered on the
`CapabilityBus` for a given vertical, never by node class. No
edge-specific capability bypass exists; Section 12's gate is the only
edge-specific *addition*, and it is strictly a refusal mechanism, never a
grant.

## 17. Kubernetes mapping

Same table as `docs/ACTOR_SCHEDULER.md`, restated for this specific
question: **container replacement ≠ Actor replacement.** A Pod is
disposable; `actor_runtime.py`'s own restart behavior proves this in code
— `tests/scenarios/test_actor_runtime_artifact.py::test_18` kills a
runtime process (graceful shutdown) and boots a fresh one with the same
`ACTOR_ID`, asserting exactly one registry entry exists afterward. See
`docs/ACTOR_ARTIFACT.md` for the full artifact/container/binary mapping.

## Known limitations

1. **`EdgeActor` was not touched or migrated** — a deliberate choice
   (Section 1), not an oversight; it remains a disconnected prototype.
2. **Offline classification (`offline_safety.py`) covers only the
   capabilities explicitly listed** — an unlisted capability defaults
   safely (REQUIRES_AUTHORITY) but is not individually verified; keeping
   this list current as new capabilities are added is a manual,
   unenforced discipline, not a compile-time check.
3. **No real edge hardware, no real intermittent-connectivity network
   simulation** was tested — `ConnectivityStatus` assessment (Redis/NATS
   ping) was verified via a fake Redis, not a real flaky network.
4. **Consequential-action-non-replay across migration/restart** relies
   entirely on the pre-existing `execution_checkpoint_store.py`/
   `resume_execution_id` mechanism, unmodified by this pass — verified by
   inspection (the mechanism is unconditionally consulted by
   `ActionExecutor`, independent of node class), not by a new end-to-end
   test with a real LLM-driven payment capability (no LLM was invoked in
   this session's testing, per its own conventions).
