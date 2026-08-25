# ADR-016: Performance (Gate 9) — Benchmarks and SLAs for All Six Categories

## Status

Accepted

## Context

Auditing "Benchmark: graph traversal / planning / reasoning / planetary
cycle / REST latency / memory growth. Establish SLAs." found — true to
this session's pattern — real, substantial infrastructure that was
never consolidated:

- `src/monkey_brain/kernel/fix/performance_budgets.py` already declares
  25 named `LatencyBudget`s (a real SLA table, target/p50/p95/p99/max/
  timeout per operation), with a working `PerformanceMonitor.record()`/
  `get_stats()` — but **nothing calls `.record()` anywhere in live code**.
  It's a declared SLA with zero enforcement.
- `tests/unit/test_performance.py` (a standalone script, not pytest
  assertions) already benchmarks graph/solver/knowledge/kernel/agent
  latency and memory, with real `bench()`/`bench_memory()` helpers.
- `tests/unit/test_operational_load.py` and
  `test_benchmark_recertification.py` already assert real baselines
  through `TestClient` (in-process, not real sockets) — e.g.
  `planet_tick_10_actors_ms=2.1`, `actor_tick_p50_ms=1.2`, and a real
  `growth_kb < 10240` (10MB) ceiling for 100 actors.
- Three separate "generic benchmark framework" scaffolds
  (`src/plasticity/testing/performance.py`, `src/cingulate/benchmark/*`)
  are dead — zero importers outside their own package, no CLI/pytest
  wiring. `plasticity/testing/performance.py` additionally has a live
  bug: `logger.debug(...)` in its exception handler references an
  undefined `logger` (would `NameError` on any warmup exception).

No REST endpoint or unified runner surfaces any of this, and none of it
had ever measured a real out-of-process network round-trip or the
actual live `/planet/tick` at today's actor count.

## Decision

**Consolidated `scripts/gate9_benchmark.py`** — one runnable suite
covering all six required categories, reusing real production code
paths (not the dead scaffolds) and comparing against
`performance_budgets.py`'s SLA table:

1. **Graph traversal** — `GraphSolver.solve()` (BFS reachability, cycle
   check, 100-node topological sort), against `solver.graph`.
2. **Planning** — `CognitiveKernel.step()`, against `kernel.step`.
3. **Reasoning** — `HeuristicReasoningScheduler.select()` (the real,
   pure function `performance_budgets.py`'s `reasoning.select` budget
   was already named for, but nothing had ever benchmarked), against
   `reasoning.select`.
4. **Planetary cycle** — one real `POST /api/v1/agentos/planet/tick`
   against the live server (not a loop — see below), against a new
   `planetary.cycle_per_actor` budget.
5. **REST latency** — real out-of-process `httpx` calls over the
   network to the live server (`/live`, `/health`, `/ready`,
   `GET /actors`, `GET /societies`) — the first REST-latency benchmark
   in this codebase to hit an actual socket rather than an in-process
   `TestClient`, against `capability.rest`.
6. **Memory growth** — `tracemalloc` delta over `KnowledgePack` scale-up
   (100/1000 items), against a new `actor.heap_growth` budget.

All six run in-process except #4 and #5, which auto-skip with a clear
message if `localhost:8031` isn't reachable, rather than failing hard.

Live run, this session: **13/13 pass** (full output run twice — the
first run had a display bug fixed before the second, see Errors below).

**New SLA: `planetary.cycle_per_actor`** (`performance_budgets.py`).
Investigating category 4 live surfaced the most important finding of
this gate: `GeographicEntityRuntime.tick()`
(`kernel/geography/runtime.py:342-369`) awaits each present actor's
ticker **serially** —
```python
for occupant_id in self._presence.occupants(self.entity_id):
    ...
    ticked = await self._actor_ticker(occupant_id)
```
no `asyncio.gather`, no concurrency — and the actor ticker invokes the
LLM planner per actor. Measured live: a 10-actor cycle took **30.1–32.6s**
(confirmed twice), matching the server's own log line exactly
(`Planetary cycle 7 completed: ... 10 actors, ... 30668.9ms`) and the
per-call breakdown in `logs/agentos.log` (`httpx: POST
http://127.0.0.1:11434/api/chat` — real local Ollama calls, ~9s apart,
one per actor). That's **~3.0-3.3s/actor**, not the millisecond-scale
numbers every other budget in this file uses. Because the cost is
per-actor and strictly serial, the budget is expressed per-actor
(target 2500ms, p50 3000ms, p95 4500ms, p99 6000ms, max 10000ms) rather
than as a flat cycle number — multiply by live actor count for the
expected total, which is what `scripts/gate9_benchmark.py` does.

This also explains a real log line caught in the same run:
`"Previous planetary tick still running, skipping this cycle"` — the
server's own 300s auto-tick fired while a still-in-flight tick (started
independently) hadn't finished. At only 10 actors this is close enough
to be a visible near-miss; it is a genuine, live-demonstrated scaling
risk, not a hypothetical one — **once `actor_count * p95_per_actor`
approaches 300s (≈65 actors at the p95 budget above, ≈100 actors at the
currently-observed real per-actor cost), auto-ticks start piling up and
getting silently skipped.** Flagged in the budget's own docstring for
future scaling work; **not fixed here** — parallelizing the actor-tick
loop is a real runtime-behavior change (touches ordering/consistency
guarantees this session's [[project_world_policy_split]] memory already
flags as a deliberate design area) and "benchmark and establish SLAs"
is this gate's scope, not "optimize the tick loop."

**New SLA: `actor.heap_growth`** (`MEMORY_BUDGETS`, a new dataclass
alongside `LatencyBudget` since growth is KB, not ms) — reuses the
exact threshold already live-asserted in
`test_operational_load.py::test_memory_at_100_actors`
(`growth_kb < 10240` for 100 actors, i.e. 102.4KB/actor) rather than
inventing a new number.

## Alternatives Considered

1. **Build on top of one of the three existing dead benchmark
   frameworks** (`plasticity/testing/performance.py`,
   `cingulate/benchmark/*`) — rejected: both are unused by everything
   including each other's siblings, one has a live undefined-`logger`
   bug, and neither actually measures anything domain-specific (they're
   generic runners someone would still have to feed the same six
   benchmarks into) — adopting either would add a framework dependency
   for zero benchmarking value over a flat script.
2. **Loop the planetary-cycle benchmark for percentile stats, like the
   other five categories** — rejected: a tick is a real, expensive,
   state-advancing operation already running automatically every 300s;
   looping it purely to compute a benchmark p95 would materially add to
   the exact pile-up risk this gate's investigation just discovered.
   One real, honestly-labeled measurement (total + derived per-actor)
   is more useful here than a synthetic percentile over repeated calls.
3. **Fix the serial actor-tick loop now that it's found** — rejected
   for this gate: real, but a runtime-behavior change beyond "benchmark
   and establish SLAs," and risky to make opportunistically without a
   dedicated pass on the ordering/consistency implications.

## Consequences

- Every SLA number in this file is now either a real budget entry
  (25 pre-existing + 2 new) or a real measurement against it — nothing
  invented from scratch.
- Gate 9's most consequential output isn't a passing benchmark — it's
  the discovery that planetary cycle time is LLM-latency-bound and
  scales linearly (not O(1)) with actor count via serial awaits, with a
  live-observed near-miss on the 300s auto-tick interval already
  happening at just 10 actors. This is now a documented, budgeted,
  flagged risk rather than a silent one.
- `scripts/gate9_benchmark.py` is safe to re-run anytime: categories
  1-3 and 6 are fully in-process with no side effects; category 5 only
  issues read-only GETs; category 4 issues exactly one real tick per
  run (the same operation the server already performs on its own
  cadence), never a load-generating loop.
- `PERFORMANCE_BUDGETS`/`MEMORY_BUDGETS` remain declarative-only —
  `PerformanceMonitor.record()` still has no live caller. Enforcing
  budgets inline in the hot paths (vs. this gate's offline benchmark
  script) is a real, separate follow-on, not assumed done here.
