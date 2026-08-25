# ADR-006: Freeze the World Schema as v1.0

## Status

Accepted

## Context

Over the course of this session the platform accumulated a real ontology
piecemeal — Geography (Planet→...→Space), Governance (Society/Policy),
Actors (PresenceTimeline, Membership), Commerce (Merchant/Product/Order/
Shipment), and Cognition (Observation/Belief/Goal/Plan/Action/
ContextEvent) — without a single declarative document describing it.
Each part was independently correct, but nothing forced the REST API,
the graph invariant checks, the benchmark bootstrap, and documentation to
stay consistent with each other as the system grew. This is exactly the
drift risk that produces silent divergence: one part of the system adds
a concept the others never learn about.

Before adding more capabilities (benchmark suite, scale testing,
additional domains), the ontology needs to be named, fixed, and made the
single source of truth everything else derives from.

## Decision

`docs/world_schema.yaml` is the canonical, frozen ontology as of v1.0
(2026-08-03). It was built by auditing the actual implementation — not
by transcribing an illustrative sketch — checked against both the
KnowledgeGraph/SharedWorld code and the live OpenAPI surface (271
routes) before freezing, which surfaced several real structures an
initial draft had missed (Team, Address, Delegation, GovernancePolicy,
World.Location).

Two categories of finding were deliberately left as documented gaps
rather than "fixed" as part of this freeze:

1. **Structural drift**: Commerce entities (Product, Order, Shipment,
   ...) have no dedicated `EntityType` — they're `EntityType.OTHER`
   with the real type carried in `attributes`/ID-prefix. Customer and
   Role are logical roles (an Actor; a string on `Membership.roles`),
   not separate first-class entities. Policy exists in two
   unreconciled forms (free-text `Society.policies` strings vs.
   structured `GovernancePolicy` registry entries).
2. **A second, disconnected world graph**: `kernel/society/world.py::
   SharedWorld` (Entity/Location/Relationship/Event/Resource, reachable
   via `/world/*`) is a genuinely separate graph from the
   `KnowledgeGraph` Commerce lives in. Both are real, both are frozen
   into v1.0 as distinct sections (`commerce` vs `world_graph`) — this
   ADR does not merge them.

Freezing means: **no new top-level entities, and no changes to existing
containment/reference relationships, without a proven architectural
gap** — a real scenario the current schema cannot represent, not a
convenience refactor.

## Alternatives Considered

1. **Keep the ontology implicit in code** — rejected: this is the
   status quo that produced the drift risk in the first place; nothing
   would force the REST surface, invariant checks, and benchmarks to
   agree with each other going forward.
2. **Express the ontology as Python classes/Protocols only** — rejected:
   couples the "what is a world made of" question to one language's type
   system, and doesn't give a human-readable, diffable artifact
   reviewers can freeze/version independently of code changes.
3. **Fix the structural drift (harden EntityType, promote Customer/Role
   to first-class) before freezing** — rejected for this freeze,
   deferred: bigger, riskier change touching ~15+ already-tested call
   sites; freezing what exists today is lower-risk than freezing a
   simultaneously-refactored ontology, and the drift is now visible and
   documented instead of hidden.

## Consequences

- `docs/world_schema.yaml` is the reference every future REST endpoint,
  invariant check (`kernel/society/verification.py`), and benchmark
  bootstrap should be checked against.
- The two documented-but-unresolved gaps (EntityType drift, SharedWorld/
  KnowledgeGraph duality) are known technical debt, not silent
  architecture — a future ADR can decide to close either, but doing so
  requires bumping this schema's version and explaining why.
- Adding a genuinely new entity or relationship now has a real cost
  (update the schema, justify the gap) rather than being a routine code
  change — this is intentional friction.
