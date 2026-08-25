# ADR-010: World Validation Engine (Gate 3)

## Status

Accepted — supersedes ADR-008's deferral of Commerce/graph invariants.

## Context

ADR-008 froze `verify_world_invariants()` at four checks (society-has-space,
actor-has-presence, no-orphaned-geography, valid-memberships) and explicitly
deferred everything else — Commerce consistency, World Graph integrity,
duplicate identifiers, forbidden cycles — pending a benchmark suite proving
they were needed rather than speculative. Gate 3 is that proof: the user
commissioned this expansion directly, calling world validation "currently
missing and critical," which overrides ADR-008's deferral by explicit
decision, not by drift.

## Decision

`kernel/validation/world_validator.py::validate_world(planetary_runtime)`
replaces the four hand-rolled checks with ten categories: geography tree
(orphans + tier-order), cycles forbidden (geography parent_id acyclicity),
society hierarchy (has-space + duplicate society_id), presence consistency
(exactly-one-open + space_id resolves), membership consistency (actor/
society resolve + no duplicate active membership), inventory consistency
(no negative Product.quantity, reservation-vs-quantity), graph integrity
(World Graph relationships resolve), orphaned nodes (World Graph events/
resources resolve — checked against BOTH WorldEntity ids AND Actor ids,
since `WorldEvent.entity_id` legitimately references either in existing
domain code), duplicate identifiers (the same id reused across geography/
society/actor/world-entity namespaces), and referential integrity
(Shipment→Order, Order→Product). Each category is independently
try/excepted — one crashing never silently suppresses the other nine.

`kernel/society/verification.py::verify_world_invariants()` is now a
one-line delegate to `validate_world()` — same name, same four original
keys in its return shape (plus a new `categories` key), so no existing
caller needed to change. The dead 4-check implementation was deleted
rather than kept as a parallel path, per this session's standing
"single source of truth" discipline — see [[006-world-schema-v1-freeze]].

**REST surface**: `POST /verify/world` is the canonical new entry point
(matching the user's example exactly); `POST /verify` and `GET /verify/
invariants` are kept as aliases calling the same engine, not a lesser one.

**The four trigger points**, each a real tradeoff rather than a uniform
mechanism:

1. **After bootstrap** — `main.py`'s `lifespan()`, right after
   `Kernel.boot(app)` completes. Logs the report (INFO if clean, WARNING
   with violation counts if not) but does NOT block startup — a
   non-critical seed issue must not take the whole app down, matching
   every other optional-phase failure mode `lifespan()` already uses.
2. **Before execute** — `POST /actors/{id}/execute` (actors.py) and
   `POST /prompt` (prompt.py), both HARD gates by default: a structurally
   broken world returns 409 (actors.py) or a soft-fail error body
   (prompt.py, matching that route's existing error convention) instead
   of running the action. Deliberately WORLD-WIDE, not scoped to the
   specific actor being executed — a broken Membership anywhere blocks
   every actor's execute, not just the affected one. This is coarse by
   design: precisely scoping "which violations are relevant to THIS
   actor's execution" is real, unbuilt logic; a global gate is the
   correct conservative default until a proven false-positive-blocking
   case argues for narrowing it. `WORLD_VALIDATION_GATE_EXECUTE=false`
   exists as an escape hatch once Gate 7 (Scale Testing) has a real
   number for what a full world scan costs per call at 10k actors —
   default is ON because correctness matters more than that unmeasured
   cost today.
3. **Before save** — wired into `POST /knowledge-graph/{person_id}/
   snapshot`, the ONE persistence-adjacent operation that exists in this
   codebase today. This is an honest partial fit, not a clean one: that
   endpoint snapshots one person's private KnowledgeGraph, while
   `validate_world()` checks the WHOLE world — there is no general
   "save/export the world" operation to hook cleanly. Documented here
   rather than silently forced to look like a better fit than it is; a
   future whole-world persistence operation should call the same
   `validate_world()` this does. `WORLD_VALIDATION_GATE_SAVE=false` is
   the matching escape hatch.
4. **In CI** — `tests/scenarios/test_gate3_world_validation.py`, added as
   its own step in `.github/workflows/architecture-conformance.yml`.
   Deliberately does NOT boot the full FastAPI app (`TestClient(app)`
   requires reachable Mongo/Redis/Neo4j, which CI doesn't have
   configured) — instead constructs a `PlanetaryRuntime` directly, the
   same infra-free pattern `tests/test_wave3_planetary_world_convergence.py`
   already uses successfully in this exact CI job.

## A real discovery made while building this

Verifying the engine live surfaced that this dev environment's
`kernel/timeline` stores (PresenceTimeline, MembershipRegistry,
SocietyContextStream/WorldEvents) are **real, shared, cross-process
persistent state** — confirmed by observing that a brand-new
`PlanetaryRuntime()`, constructed fresh with zero prior calls, in a
brand-new Python process, still reported the exact same 22 violations
(same actor names, same membership_ids) as the long-running dev server
this whole session has been testing against. A freshly-registered actor
was even found present in `_actors` across 10 unrelated, independently-
constructed `SocietyRuntime` instances. This is NOT something Gate 3
caused or should fix — it predates this work — but it directly shaped
this ADR's test design (relative assertions about a specific, just-created
id, never "assert the whole world is clean") and is flagged here because
it is a real, load-bearing fact about this environment that the next
person debugging "why does my fresh test see other people's data" will
need. Worth its own investigation later; explicitly out of scope for
Gate 3.

Also surfaced (frozen as a known-documented issue, not fixed here,
matching [[007-api-surface-freeze]]'s precedent for the `/simulate`+
`/compare` collision): `DELETE /actors/{id}` does not fully clean up
Membership and World Graph Event references in every case — the two
`membership_invalid_actor` and several `event_references_missing_entity`
violations this session's own accumulated test data produces trace back
to actors deleted via that exact endpoint during Gate 1/2 testing.

## Alternatives Considered

1. **Keep `verify_world_invariants()`'s four checks frozen per ADR-008,
   add the other six as a SEPARATE, new function/endpoint** — rejected:
   produces exactly the "two divergent verifiers" outcome ADR-008 itself
   warned against; a caller of the old function would get a weaker
   answer than a caller of the new one for no good reason once the user
   has explicitly commissioned the fuller check.
2. **Scope the "before execute" gate to only the specific actor being
   executed** — rejected for now: real future work, but requires
   building "which violations are reachable from this actor" traversal
   logic that doesn't exist; a correct-but-coarse global gate ships
   today, a precise one is a tracked follow-up.
3. **Fabricate a new `/world/save` endpoint just to give "before save" a
   clean hook** — rejected: out of scope for a validation-engine ADR to
   also invent a new persistence feature; wiring the one real
   persistence-adjacent operation that exists, honestly caveated, is
   more truthful than inventing a better-looking integration point.
4. **Boot the full app in the CI test (TestClient(app))** — rejected:
   confirmed this needs real Mongo/Redis/Neo4j reachable, which CI's
   `architecture-conformance.yml` job doesn't provision; would fail or
   hang in CI. The lightweight `PlanetaryRuntime()` pattern already
   proven to work in this exact job is the only CI-safe option.

## Consequences

- `POST /verify/world` (and its `/verify` aliases) now report ten
  categories instead of four, live-verified against the real server's
  actual accumulated state, catching real, previously-invisible drift
  (dangling memberships and World Graph events from imperfect actor
  deletion) on the first run.
- Two REST endpoints now have real teeth: `POST /actors/{id}/execute`
  and `POST /prompt` both currently 409/soft-fail against this session's
  live dev server, because that server's accumulated test data is
  genuinely inconsistent — this is Gate 3 working as designed, not a
  bug, but it means continued ad hoc testing against that specific
  long-running process needs either a restart or
  `WORLD_VALIDATION_GATE_EXECUTE=false` until the underlying dangling-
  reference drift is cleaned up or DELETE's cascade is fixed.
- The cross-process persistent-state discovery and the DELETE-cascade
  gap are both real, separately-actionable findings, not resolved by
  this ADR — tracked here for whoever picks them up next.
