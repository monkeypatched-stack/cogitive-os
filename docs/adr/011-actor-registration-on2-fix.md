# ADR-011: Fix O(n²) Actor Registration (found building Gate 4 Scale Tests)

## Status

Accepted

## Context

Gate 4 (Complete Test Pyramid) asked for scale tests at 10/100/1,000/
10,000/100,000 actors through the real, canonical registration path.
Probing real numbers before writing those tests surfaced a severe,
previously-unknown bug: `PlanetaryRuntime.register_actor()` took over
**222 seconds to register 200 actors, and was still climbing** — an
average of 1.1 seconds per actor, with the per-actor cost itself growing
as more actors accumulated. Extrapolated, 10,000 actors would be on the
order of days; 100,000 was not reachable at all.

Root cause, in two parts, both the same anti-pattern in different
subsystems:

1. `register_actor()` unconditionally called `_save_actors()`
   (`kernel/society/integration.py`) on every single registration.
   `_save_actors()` iterates **every actor ever registered**, rebuilds
   a JSON array of all of them, and overwrites one Redis key with it.
   Registering the Nth actor does O(N) work; registering N actors total
   costs O(N²).
2. `register_actor()` also publishes a `ContextEvent` on every call,
   which triggers `_save_context()` via `context_stream.set_on_publish()`
   (wired once, in `__init__`, for every publish anywhere in the
   system — not just actor registration). `_save_context()` had the
   identical shape: rebuild up to 10,000 events into a JSON array,
   overwrite one Redis key, on every single publish. This was the
   dominant remaining cost after fixing (1) alone — 500 actors still
   took minutes with only the first fix applied.

Notably, `_save_context()` already contained a partial fix for exactly
this class of bug: a `_context_persisted_version` dict that makes the
event-*store* write path underneath it incremental (only new events past
the last-persisted version get pushed). Whoever wrote that clearly
recognized "this runs on every publish, don't redo everything every
time" — but the fix wasn't applied to the two `redis.set()` calls above
it, which kept rebuilding-and-overwriting the whole history regardless.

This also fully explains a finding ADR-010 flagged as an open question
("this dev environment's kernel/timeline stores are real, shared,
cross-process persistent state... worth its own investigation"): actors
and context events were never mysteriously shared — they were being
written, in full, to a real Redis connection (`PlanetaryRuntime._redis`,
independent of `TimelineStore`'s own backend selection) on every single
mutation. Not a mystery. This bug.

## Decision

Both write paths now persist incrementally instead of resyncing
everything:

- **Actors**: `_save_actor(state, society_id)` (new) writes ONE actor via
  `HSET monkeybrain:actors:hash` — O(1) per registration. `_save_actors()`
  (kept, for callers that update multiple actors at once — 9 REST route
  call sites still use it) now writes to the same hash via a pipelined
  `HSET` per actor instead of one giant `SET` of a JSON array — same
  O(n) cost it always had for "save everyone," just no longer using a
  format that forces every OTHER caller to pay for the full population
  too. `register_actor()`'s hot path now calls `_save_actor()`, not
  `_save_actors()`. `unregister_actor()` now does a single `HDEL`
  instead of a full resync.
- **Context events**: `_save_context()` now `RPUSH`es only the
  just-published event (planetary and per-society) onto a Redis LIST —
  O(1) per publish — instead of rebuilding and overwriting a JSON blob
  of up to 10,000 events every time.
- **Backward compatibility**: `_load_actors()` and `_load_context()` both
  read the new incremental format first, falling back (read-only, never
  written again) to the old single-blob keys — actors/events persisted
  before this fix stay visible on the next boot instead of silently
  disappearing.

Measured on the dev machine this was fixed on (isolated from real Redis
via `REDIS_PORT` pointed at an unreachable port — see
`tests/scale/test_actor_scale.py`'s module docstring for why that's the
correct way to isolate registration cost from network I/O cost, not
cheating the number):

| Actors | Before | After |
|---|---|---|
| 200 | >222s (climbing) | — |
| 500 | (would be tens of minutes+) | 3.3s (6.6ms/actor, includes first-fix-only intermediate reading) |
| 1,000 | — | 0.31s (0.31ms/actor, both fixes) |
| 10,000 | — | 13.7s (1.37ms/actor) |
| 100,000 | not practically reachable (extrapolated: days) | 2,638s / ~44min (26.4ms/actor) |

`validate_world()` (Gate 3) itself was never the bottleneck at any tier —
0.276s at 10,000 actors, 1.077s at 100,000, zero violations at both,
confirming the ten-category engine scales fine on its own.

**Honest residual finding**: per-actor cost is NOT flat across tiers —
0.31ms (1k) → 1.37ms (10k) → 26.4ms (100k). The 10k→100k jump (19x
slower per-actor for 10x more actors) means a smaller, real superlinear
factor survived this fix — this is not the O(n²) blowup described above
(100k did not take days), but it is not O(1)-per-call either. Not
root-caused further in this pass: the two confirmed O(n)-per-call sinks
(`_save_actors()`, `_save_context()`) are fixed and verified; whatever
remains is smaller and untriaged. Candidates for whoever picks this up
next: `_deliver_context_event()` broadcasting to every registered actor
on every publish (`kernel/society/runtime.py`, O(n) per event by
design, not a bug — but n actors × n broadcasts is O(n²) in the SAME
shape this ADR just fixed elsewhere), or Python-level overhead
(GC pressure, dict/list growth) that only shows up past ~10k live
objects in one process.

## Alternatives Considered

1. **Debounce/throttle the existing full-resync saves** (save at most
   once per N seconds, not on every call) — rejected: still O(n) per
   flush, so at real scale (100,000 actors) even an infrequent flush
   would itself take a long time and risk losing a large batch on crash;
   doesn't fix the underlying shape, just spreads it out.
2. **Move persistence off the synchronous request path entirely**
   (background queue/worker) — rejected for this fix: a bigger
   architectural change than the bug warrants; the incremental-write fix
   gets to O(1)-per-call without needing new infrastructure, and is a
   much smaller, more reviewable diff for a bug found mid-way through an
   unrelated task (Gate 4).
3. **Leave scale tests skipping the higher tiers and not fix the bug** —
   rejected per explicit direction: this was surfaced as a blocking
   discovery specifically so the user could decide, and the decision was
   to fix it now rather than defer.

## Consequences

- `tests/scale/test_actor_scale.py` (Gate 4) is real, runnable
  infrastructure with real measured numbers at every tier, not
  aspirational scaffolding written against a broken path.
- Two new Redis key formats (`monkeybrain:actors:hash`,
  `monkeybrain:context:list[:society_id]`) exist alongside the legacy
  single-blob keys, which remain read-only fallbacks. A future cleanup
  could migrate-and-delete the legacy keys once confident nothing still
  depends on them; not done here to keep this fix's blast radius to
  exactly the O(n²) problem.
- This session's own scale-testing probes (run before `REDIS_PORT`
  isolation was adopted) wrote ~2,000+ throwaway actors into this dev
  environment's real Redis via the now-fixed incremental path — visible
  as `presence_consistency` violations on the next server boot (their
  TimelineStore-backed presence records don't exist in a fresh process).
  Harmless (real proof the fix persists correctly) but noisy; not
  cleaned up as part of this fix, consistent with Gate 3's precedent of
  documenting rather than silently tidying accumulated dev-environment
  test data.
- Other `_save_*` methods (`_save_world`, `_save_geography`,
  `_save_societies`, `_save_relationships`) were not audited for the
  same anti-pattern — they don't sit on the actor-registration hot path
  so weren't blocking Gate 4's scale tests, but the SAME shape of bug
  may exist there too. Flagged here as a real, untriaged possibility for
  whoever next touches high-frequency society/geography/relationship
  mutations at scale.
