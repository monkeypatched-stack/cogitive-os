# ADR-012: Observability (Gate 5) — Metrics, Logging, Tracing Correlation

## Status

Accepted

## Context

Lemon (`src/introspection/lemon.py`) already existed as substantial
infrastructure — tracing, metrics (counter/gauge/histogram), structured
logging, health checks, alerts — and `PlanetaryRuntime.cycle()` already
emitted 8 of the 12 requested metrics on every planetary tick. Auditing
against the Gate 5 checklist found the gaps were narrow, not systemic:
planner latency, execution latency, graph size, and CPU usage were
missing; `LogEntry` had `trace_id`/`span_id`/`user_id` but not the
specific `correlation_id`/`request_id`/`actor_id`/`society_id` fields
asked for; and the 4 requested tracing spans (request/planner/execution/
graph update) turned out to be **two disconnected trace-id spaces** —
`services.common.trace_middleware.TraceMiddleware` already set a real
per-request `X-Trace-ID` in a contextvar, but Lemon's own `Tracer`
auto-generated an unrelated trace_id the moment any span was started,
so a client's trace_id never actually correlated with what Lemon
recorded internally.

## Decision

**Metrics** — added to the same `_obs.gauge(...)` call sites the existing
8 metrics already use:
- `pipeline.planner_latency_ms` (`belief_runtime.py::_generate_plan`)
- `pipeline.execution_latency_ms` (`action_executor.py::execute`, reusing
  the `total_ms` that method already computed for `ExecutionResult`
  but never emitted)
- `planetary.knowledge_graph_entities` / `planetary.world_graph_entities`
  / `planetary.world_graph_relationships` (`integration.py::cycle`) —
  reported separately per ADR-006's documented KnowledgeGraph/SharedWorld
  duality, not summed into one misleading number
- `planetary.cpu_time_seconds` (same `resource.getrusage` call the
  existing memory gauge already makes — cumulative user+system CPU
  time, not instantaneous percent; adding a sampling-based percent
  metric would need a new dependency (psutil) this gauge doesn't need)

All four verified live against the running server via `GET
/observability` (`lemon.export()`) after triggering a plan/tick.

**Tracing correlation** — `_obs.start_span()` (extended with `start_span`/
`finish_span`, mirroring the existing `counter`/`gauge`/`event` no-op-off
shape) now checks whether a Lemon trace is already open; if not, it starts
one using the CURRENT request's trace_id (`services.common.trace_context.
get_trace_id()`) instead of letting Lemon mint an unrelated one. Verified
live: a request sent with `X-Trace-ID: gate5-verify-trace-001` produced
`lemon.export()["summary"]["tracing"]["current_trace"] ==
"gate5-verify-trace-001"` — the planner span that ran during that request
now genuinely correlates with the trace_id echoed back to the client, not
a disconnected internal one.

Three of the four requested spans are wired: **planner**
(`belief_runtime.py`), **execution** (`action_executor.py`), **graph
update** (`POST /world/entities`, `routes/world.py`) — deliberately at
the REST boundary, not inside `KnowledgeGraph.add_entity()` itself.
**Request** tracing was already covered by the pre-existing
`TraceMiddleware`, which this ADR connects to Lemon rather than
duplicates.

**Not done**: `KnowledgeGraph.add_entity()` was NOT wrapped in a span.
`Tracer._traces` (`introspection/tracing.py`) is an unbounded dict — a
new trace_id key added every time `start_span()` runs with no current
trace open, no eviction. `add_entity()` is called far more frequently
than one span per HTTP request (a single Commerce checkout can call it
5-10+ times); wrapping it would reintroduce the same class of unbounded-
growth risk ADR-011 just fixed for actor/context persistence, just in
Lemon's tracer this time. Flagged as a real, separate finding — `Tracer`
itself needs bounding (an LRU cap, matching `TimelineStore`'s own
`DEFAULT_CAPACITY_PER_ACTOR_KIND` precedent) before it's safe to wrap
genuinely hot paths, not just REST-boundary ones.

**Logging fields**: `LogEntry` (`introspection/logging.py`) gained
`correlation_id`, `request_id`, `actor_id`, `society_id` as first-class
dataclass fields, included in `to_dict()`/`to_json()`, and threaded
through `StructuredLogger.log()`'s signature so passing them as kwargs
actually lands on the entry (previously `workflow_id`/`user_id` were
declared on the dataclass but never accepted as named `log()` parameters
— silently dropped into `**metadata` instead, or simply never
populated). **Not done**: retrofitting every existing `lemon.log()`/
`.info()`/`.warn()`/`.error()` call site across the codebase to actually
pass these new fields. That's a much larger, separate undertaking (the
capability exists and is real; systematically wiring it into every log
call site is future work, not part of this pass).

## Alternatives Considered

1. **Wrap every KnowledgeGraph mutation method in a span anyway** —
   rejected: confirmed real risk (unbounded `Tracer._traces` growth),
   directly analogous to the bug ADR-011 just fixed; better to under-
   deliver on "graph update" tracing's exact call-site placement than
   reintroduce an unbounded-growth bug in the same session that just
   fixed one.
2. **Build a new request-tracing middleware from scratch** — rejected:
   `TraceMiddleware` already does this correctly; the actual gap was
   correlation with Lemon, not the existence of request-level tracing.
3. **Add a CPU percent metric via psutil** — rejected for this pass: a
   new dependency for a metric `resource.getrusage`'s cumulative CPU
   time already approximates well enough; revisit if percent
   specifically becomes load-bearing for an alert rule.

## Consequences

- `overall_health()` (`lemon.summary()["health"]["overall"]`) already
  genuinely reflects real health checks (mongodb/redis/mem0/runtime/
  policy) — confirmed live, matching the user's explicit framing ("tell
  you whether the system is healthy," not just collect numbers) without
  needing new code.
- A future request-scoped debugging session can now follow one
  `X-Trace-ID` from the HTTP layer through planner and execution spans
  in the SAME Lemon trace — previously impossible.
- `Tracer`'s unbounded growth is now a documented, known constraint
  (not silently present) — the natural next step for whoever picks up
  wrapping additional hot paths (or the graph-update span more broadly)
  is bounding `Tracer._traces` first.
- Full request_id/actor_id/correlation_id population across every log
  call site remains a tracked gap, not a silent one.
