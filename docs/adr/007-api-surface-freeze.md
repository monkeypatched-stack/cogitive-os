# ADR-007: Freeze the World-Model API Surface as v1.0, Scoped to world_schema.yaml

## Status

Accepted

## Context

This session built REST coverage for Commerce/Orders/Fulfillment/Events/
Presence/Verify incrementally, cataloguing progress against a
hand-maintained Postman collection (~150 requests). Pulling the live
app's actual `/openapi.json` for this freeze revealed the real surface
is much larger — 313 endpoints across 44 tags — because many routers
(Actors, Societies, Memberships, World, Planet) already had significant
coverage beyond what the Postman collection tracked (e.g. Memberships
alone has 28 real endpoints — roles, delegations, trust, suspend/resume/
terminate — versus the 7 the Postman collection listed).

Separately, the same app surface includes entire subsystems unrelated to
the Cognitive OS world model: code generation (`Codegen`), SDLC run
orchestration (`SDLC`), a query language (`OQL`), multi-runtime fleet
registration (`Fleet`), API key management (`Keys`), observability
dashboards, etc. Freezing "the API surface" without scoping it would
either wrongly include unrelated product surfaces in a world-model
contract, or require auditing 313 endpoints' worth of unrelated
subsystems before Gate 1 could close.

## Decision

Freeze `docs/api_specification_v1.0.md` /
`docs/api_specification_v1.0.json` as the world-model API contract,
generated directly from the live `/openapi.json` (ground truth, not the
Postman collection, which is now a curated demo/testing subset rather
than the source of truth) and **filtered to exactly the tags that
correspond to a [[006-world-schema-v1-freeze|world_schema.yaml]]
domain**: Planet, Societies, Actors, Memberships, World, Commerce,
Orders, Fulfillment, Events, Presence, Verify, plus the Cognition
lifecycle (Prompt, Plan, Execute, Simulate, Compare, Learning) and the
minimal platform contract needed to operate it (Runtime, Discovery,
Admin, Policy, Health, ActorProfile, KnowledgeGraph) — 244 endpoints.

The remaining 69 endpoints (Codegen, SDLC, OQL, Fleet, Keys, Data
Routing, Metadata, Workloads, Observability, Dashboard, Metrics,
State/mesh, Q&A, Query, Exchange, SittingFace, Agents, Capabilities,
Knowledge export/import) are explicitly out of scope: they exist, they
work, but they are not part of the frozen world-model contract, and
changes to them do not require reopening this ADR.

The CRUD/Cognition split established earlier this session —**APIs build
the world; `/prompt`/`/plan`/`/execute`/`/simulate`/`/compare`/`/learn`
reason over it; never the reverse**— is frozen as part of this surface,
not just a convention: it is the organizing principle the spec's
grouping follows.

One pre-existing inconsistency was found and is frozen *as a documented
issue*, not silently corrected: `POST /simulate` and `POST /compare` are
each served by two different route modules — a lightweight gateway
model and a separate, deeper predict/fix world-model simulator that
actually owns the bare path and requires an incompatible `graph` field.
Resolving this is future work; pretending it doesn't exist would make
this freeze inaccurate.

## Alternatives Considered

1. **Freeze the entire 313-endpoint surface** — rejected: conflates the
   Cognitive OS world model with unrelated dev-tooling/platform
   subsystems (Codegen, SDLC, Fleet, ...) that have their own,
   independent evolution and no relationship to world_schema.yaml.
2. **Keep using the hand-maintained Postman collection as the spec** —
   rejected: proven this session to already be significantly behind the
   live code (missing 21+ real Memberships endpoints alone); a frozen
   contract must be regenerable from ground truth, not hand-transcribed.
3. **Silently fix the /simulate and /compare collision as part of
   freezing** — rejected for this freeze: changing route ownership or
   request schemas is exactly the kind of code change Gate 1 says to
   hold off on; documenting the inconsistency preserves an accurate
   freeze without expanding this ADR's blast radius.

## Consequences

- `docs/api_specification_v1.0.json` is regenerable at any time via the
  live app's `/openapi.json`, filtered by the tag list in this ADR —
  it should never be hand-edited independently of the code it describes.
- Any new endpoint added under an in-scope tag going forward is
  automatically part of v1.0's domain (no re-freeze needed for routine
  additions within an already-covered entity); a genuinely new tag/
  subsystem being folded into the world model requires bumping to
  v1.1+ and updating this ADR.
- The Postman collection remains useful as a hand-picked demo/testing
  subset but is no longer the source of truth for "what the API surface
  is" — that role now belongs to the live OpenAPI schema, filtered per
  this ADR.
