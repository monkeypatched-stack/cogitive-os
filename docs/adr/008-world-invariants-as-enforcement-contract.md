# ADR-008: World Invariants as the Frozen Enforcement Contract

## Status

Accepted

## Context

`kernel/society/verification.py::verify_world_invariants()` and its
`POST /verify` / `GET /verify/invariants` REST surface already exist and
check four real conditions: every Society has a Space, every Actor has
exactly one open Presence, no orphaned geographic entities, no invalid
Memberships. As the platform grows (more entities via the frozen API
surface, then a benchmark suite, then scale testing), the risk is that
new invariants get invented ad hoc per test or per benchmark, rather
than accumulating in one place that both the schema and the API surface
agree is authoritative.

Gate 1 asks to "freeze invariants" alongside the ontology and API
surface — this needs to mean something concrete: which invariants are
load-bearing today, and what the contract is for adding more.

## Decision

The four invariants currently implemented in `verify_world_invariants()`
are frozen as v1.0 of the enforcement contract, and are the same four
listed in `docs/world_schema.yaml`'s top-level `invariants:` block —
that duplication is intentional (the schema states what must hold, the
verifier is what checks it; they are not two independent lists that can
drift, they are the same four things named twice by design):

1. Every Society has at least one associated Space.
2. Every registered Actor has exactly one OPEN current Presence.
3. No orphaned geographic entities (every non-Planet `parent_id`
   resolves to a real, registered entity).
4. No invalid Memberships (`actor_id` and `society_id` both resolve to
   something real).

`POST /verify` is read-only and non-mutating by construction — it must
stay that way; a verifier that can change state it's supposed to be
checking is not trustworthy.

New invariants may be added to this contract only when they correspond
to a relationship already present in the frozen `world_schema.yaml`
(ADR-006) — e.g. a future "no duplicate active Membership for the same
Actor+Society pair" check would be valid because Membership uniqueness
is implied by the schema; a check for something the schema doesn't
model would mean the schema needs updating first, not the verifier
growing ahead of it.

## Alternatives Considered

1. **Let each benchmark/test define its own invariant checks** —
   rejected: this is what produces silent drift between what different
   parts of the test suite believe "a consistent world" means; a shared
   `POST /verify` call is the only way every benchmark checks the same
   thing.
2. **Expand the invariant list now to anticipate Commerce/Cognition
   consistency checks** (e.g. "no negative Product.quantity", "every
   ContextEvent references a real Actor") — deferred, not rejected:
   real candidates, already noted as commerce-domain invariants in
   `world_schema.yaml`, but adding them to the enforced `POST /verify`
   contract is new code, which Gate 1's "stop adding concepts" directive
   argues should wait for the benchmark suite to prove they're needed
   rather than being spec'd speculatively.
3. **Make verification part of every mutating request instead of a
   separate endpoint** — rejected: expensive (scans all societies/
   actors/geography/memberships) and conflates "did this one write
   succeed" with "is the whole world still consistent" — the latter is
   deliberately a separate, explicit, benchmark-callable step.

## Consequences

- Every benchmark scenario built under Gate 1's later phases should call
  `POST /verify` after setup and after the `/prompt` reasoning step, and
  treat any violation as a scenario failure — this is the mechanism
  that turns "the platform is consistent" from a claim into something
  checked automatically.
- Adding a fifth invariant is a two-step change (schema first, then
  verifier), not a one-line addition to `verification.py` — intentional
  friction, matching ADR-006's "no new entities/relationships without a
  proven gap" stance.
- The Commerce-domain invariants already sketched in `world_schema.yaml`
  (no negative quantity, order/reservation consistency) remain
  documented-but-unenforced until a benchmark scenario actually needs
  them — tracked here as the reason they weren't added in this freeze.
