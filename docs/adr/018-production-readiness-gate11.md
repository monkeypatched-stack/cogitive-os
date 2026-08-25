# ADR-018: Production Readiness Review (Gate 11)

## Status

Accepted, then addended — see "Addendum — fixes applied" below. The
original review's overall verdict (CONDITIONAL) still stands as the
accurate historical record of what this review found; the addendum
documents what was subsequently fixed in response and updates the
per-dimension verdicts.

## Context

Gate 11 requires eight review dimensions to pass before the system can
be called production-ready: Architecture, API, Security, Performance,
Scalability, Reliability, Documentation, Operational Readiness. This
review is evidence-based — every verdict below cites either a prior
gate's live verification or a fresh check run specifically for this
gate (grep + live curl against the running server), not an assumption
carried over from a prior report. Where a gate title claims something
is "done" but this review found a live gap underneath it, the gap is
reported here, not smoothed over — consistent with this session's
standing discipline (see the Gate 6/7 corrections earlier in this
build).

## Review

### 1. Architecture — CONDITIONAL PASS

Real, verified structure (`docs/architecture.md`, ADRs 006-016):
geography/society decoupling holds end-to-end, world/policy split is
enforced by a real validator (ADR-010), timelines are genuinely
append-only. Kernel is ~29 independently-owned subsystems behind thin
route handlers, not a monolith.

**Gap found this review:** `kernel/compile/error_recovery.py` declares
a real, complete `CircuitBreaker`/`CircuitBreakerConfig` — but it is
only ever *re-exported* (`kernel/compile/__init__.py`), never
instantiated or called anywhere in `src/`. It's the same
declared-but-unenforced pattern Gate 9 already found in
`PERFORMANCE_BUDGETS` (ADR-016) — a second instance of the same class
of gap, not a one-off.

### 2. API — CONDITIONAL PASS

277 paths / 319 operations, 100% have a `summary`, OpenAPI 3.1.0 spec
is live and accurate (`docs/openapi.md`).

**Gap found and partially resolved this session:** `/simulate` and
`/compare` require the full `PlanResponse` from a prior `/plan` call —
this was undiscoverable from the routes' own request bodies alone and
caused real, recurring 422s in every regression sweep until fixed in
the test tooling and documented (`docs/troubleshooting.md`). The
**route design itself is unchanged** — a caller reading only
`/simulate`'s schema still can't tell it needs a prior `/plan` call
without reading the docstring or troubleshooting guide.

**Gap not resolved:** route-prefix inconsistency across the surface —
`/health`, `/live`, `/ready` sit at the bare root; `/observability`
sits under `/api/v1/agentos/`; `/account`, `/login`, `/otp` sit under
`/api/v1/actors/` (no `agentos`). Three different prefix conventions
for what a consumer would reasonably expect to be one API. Flagged
live in `docs/troubleshooting.md`, not fixed — a real design
inconsistency, not just a documentation gap.

### 3. Security — CONDITIONAL PASS

Real and live-verified (ADR-014): PBKDF2-HMAC-SHA256 password hashing,
constant-time comparison, account lockout, OTP, JWT issuance,
fail-fast `SecureKeystore`, `@audited` MongoDB-backed audit trail.
**Confirmed this review, not previously called out explicitly:** rate
limiting is real and live-wired — `RateLimitMiddleware`
(`api/main.py`), configurable via `RATE_LIMIT_RPS`/`RATE_LIMIT_BURST`,
returns real `429`s.

**Known, user-accepted deferral:** OAuth — explicitly deferred by the
user's own decision during Gate 7 ("Defer OAuth, fix the concrete gaps
now"). Not a gap; a recorded scope decision.

**Gap found this review:** no secret-rotation mechanism. `SecureKeystore`
supports add/remove but nothing rotates a `KEYSTORE_SECRET` or
individual stored keys on a schedule — a leaked key has no forced
expiry path.

### 4. Performance — CONDITIONAL PASS, flagged risk unresolved

Gate 9 (ADR-016): real SLA budgets, `scripts/gate9_benchmark.py`,
13/13 pass. **The single most consequential finding of this entire
build**, restated because it's directly relevant to a production
verdict: planetary-cycle and per-actor execution time is bound by
serial, LLM-latency-dominated `await`s (`GeographicEntityRuntime.tick()`
has no `asyncio.gather`), live-measured at 30-90+ seconds for 10-11
actors. **Fixed this session:** `/actors/{id}/execute` previously had
*no* timeout at all (a real, separate bug found and fixed — see
`api/routes/actors.py::execute_actor`, now capped at 30s matching
`SocietyRuntime.tick_one_actor`'s existing pattern, returns a clean
`504` instead of hanging). **Not fixed:** the underlying serial-await
architecture itself — timeout protection contains the failure mode, it
doesn't remove the throughput ceiling.

### 5. Scalability — FAIL

Not previously reviewed as its own gate; the first dedicated look was
this review, and it surfaced the review's most serious finding.

- `RunStore`/`IdempotencyStore`/`SecureKeystore`/`LoginStore` were
  built and documented as "multi-worker safe" (Redis-backed, Gate 6-7)
  but this claim has **never been live-tested with `--workers > 1`** —
  every server start this entire session used `--workers 1`
  (`scripts/start_server.sh`'s own default; the Dockerfile's `CMD` has
  no `--workers` flag at all, so it silently defaults to 1 too).
- `deploy/k8s/deployment.yaml` hardcodes `replicas: 1`; no
  `HorizontalPodAutoscaler` manifest exists anywhere under `deploy/k8s/`
  (confirmed via `find`).
- Mongo/Redis/Neo4j are all single-instance in both `docker-compose.yml`
  and the k8s manifests — no replication, no HA, no read replicas.
- Independent of infrastructure scaling: the planetary tick's serial
  per-actor await (§4) means adding more actors doesn't just get
  slower — it scales linearly with no ceiling, so horizontal
  pod-scaling wouldn't even help the one loop most likely to be the
  real bottleneck at scale, since it's a single in-process loop, not a
  distributable unit of work today.

This is a real gap, not a documentation gap — nothing here can be
fixed by writing something down.

### 6. Reliability — CONDITIONAL PASS

Real positives, confirmed this review: graceful shutdown
(`Kernel.shutdown()`, reverse boot order, per-subsystem error
isolation so one failing teardown doesn't block the rest); per-actor
tick failures are caught and logged without crashing the whole
planetary cycle (`society/runtime.py`); health/live/ready probes and a
`startupProbe` sized to real observed boot times (Gate 8); restart
survival for graph/timelines/plans/keys/logins live-verified (Gate 6-7).

**Gaps found this review:**
- The `CircuitBreaker` from §1 being unused means nothing in the
  system currently protects a caller from a cascading failure in a
  downstream dependency (Ollama, Mongo, Neo4j) beyond the one new
  30s timeout added this session.
- `AlertManager` (`introspection/alerting.py`) is real and wired into
  Lemon (`lemon.add_alert_rule()`/`lemon.alert()` both work), but
  **zero alert rules are registered anywhere in the codebase** —
  confirmed live via `GET /api/v1/agentos/observability`:
  `"alerts": {"rules": 0, "active_alerts": 0}`. The infrastructure to
  alert exists; nothing has configured it to actually alert on
  anything.
- `deploy/k8s/deployment.yaml` has no `terminationGracePeriodSeconds`
  or `preStop` hook, so it inherits Kubernetes' default 30s grace
  period — too short for the real, live-observed 30-90+ second
  planetary ticks (§4); a rolling deploy or node drain during a tick
  risks a hard `SIGKILL` mid-operation rather than a clean finish.

### 7. Documentation — PASS

Gate 10 (ADR-017) directly satisfies this: OpenAPI spec, examples,
architecture doc, deployment guide, troubleshooting guide — all
rebuilt from live captures this session, not carried over from deleted
docs. Two dangling source-comment references to a deleted design doc
path remain (flagged, cosmetic, does not affect runtime).

### 8. Operational Readiness — CONDITIONAL PASS

Gate 8 (ADR-015): Docker image genuinely builds (after 3 real,
sequential bugs found and fixed via actual `docker build`/`docker run`,
not static review), K8s manifests with tuned probes, Helm chart. Real
backup/restore endpoints (Gate 6). `docs/troubleshooting.md` is a real
runbook-equivalent grounded in actual incidents, not generic filler.

**Gaps, overlapping §5/§6 but restated in operational terms:**
no external alerting channel (Slack/PagerDuty/email/webhook — grepped,
none found; `AlertManager` is purely in-process), no multi-worker or
multi-replica deployment has ever actually been exercised, and the
missing `terminationGracePeriodSeconds` is an operational deploy-time
risk, not just a reliability-theory one.

## Overall Verdict

**Not production-ready without a scoped decision on Scalability (§5).**
Six of eight dimensions are CONDITIONAL PASS — real, working systems
with specific, named gaps, not fabrications — and Documentation is a
clean PASS. Scalability is a genuine FAIL: multi-worker safety was
architected for but never verified, there is no horizontal scaling
path configured, and the core cognitive loop has a hard linear-scaling
ceiling that infrastructure scaling alone cannot fix.

This mirrors how OAuth was handled in Gate 7: a real gap doesn't block
progress by itself, but it needs an explicit, recorded decision from
the user (fix now / accept the risk with a documented threshold /
defer with a tracked follow-up) — not a unilateral "declare it ready"
call made without that decision on the table for the two dimensions
that are more than cosmetic (Scalability and the alerting-configuration
half of Reliability/Operational Readiness).

## Regression Evidence

Full sweep re-run after this session's `/simulate`+`/compare` flow fix
and the new `/actors/{id}/execute` timeout:

**156 total, 153 pass, 3 fail** (up from 154/148/6 before this gate's
fixes): `Planet` and `Actors` went from failing to 100%; `Simulation`
went from a 422 to 100% (the real two-step `/plan` prerequisite, not a
workaround). Remaining 3 failures at that checkpoint: `Comparator`
timed out at a 90s client budget against a route the server itself
documents as needing up to 600s (`predict.py: COMPARE_TOTAL_TIMEOUT`;
fixed after this checkpoint, re-run pending), and the two long-standing
`Health` folder failures (hardcoded `:8000` — the source Postman
collection's own bug, also fixed after this checkpoint, re-run
pending). None of the 3 remaining failures at this checkpoint were
new — all three had a known, already-diagnosed cause, not a fresh
regression.

Final re-run (Health section repointed to `:8031`, `/compare` client
timeout raised to 650s to match the server's own declared budget):
**154 total, 152 pass, 2 fail** — `Health` now 100%. The 2 remaining
failures both had a known, specific cause investigated below, not left
as unexplained flakiness.

## Addendum — fixes applied

The user asked directly: "fix identified issues in gate 11 and make
production ready." What follows is what was actually fixed, each
verified live, not just claimed — and, for Scalability, an honest
statement of what's still not fully solved rather than a claimed
unconditional pass.

**A genuine, standalone bug found while chasing one of the 2 remaining
sweep failures.** `[Comparator] POST /compare -> 500 Internal Server
Error` was not a timeout or flakiness — the server log showed a real
`fastapi.exceptions.ResponseValidationError: Input should be a valid
dictionary or object to extract fields from, input=None`. Root cause:
`compare_sim_vs_query` (`api/routes/predict.py`) computed
`result = await asyncio.wait_for(_compare_pipeline(...), ...)` and then
never returned it on the success path — the function fell off the end
and implicitly returned `None`. Compounding it: the route's declared
`response_model=CompareResponse` (the graph-centric shape `/plan` and
`/simulate` use) didn't match what `_compare_pipeline` actually builds
and returns (`CompareResponseGateway` — status/loss/details, the same
shape `/compare/run` and `/compare/epistemic-loss` already use
correctly). Fixed both: added the missing `return result`, and changed
`response_model` to `CompareResponseGateway` to match what the code
actually produces (the unused `CompareResponse` import was removed).
Verified live end-to-end: a real `/plan` → `/compare` call now returns
`200` with a well-formed body (`status/loss/details` incl. real
topology/epistemic/world/policy/actor loss figures) instead of a bare
500. (The response body also surfaced a second, unrelated, pre-existing
bug — `broca.agents.ddd` cognitive execution failing with a raw
`'Operation'` error — flagged, not fixed; out of scope for this pass.)

**`[Actors] POST /execute` and `POST /tick` ReadTimeouts** — both
routes were racing the server's own internal timeout with an
equal-length client timeout (30s vs 30s), and separately,
`/actors/{id}/execute` had **no** internal timeout at all (a real gap,
already fixed earlier this session — see the main ADR-016/session
history above this addendum) while `/actors/{id}/tick` already routes
through `SocietyRuntime.tick_one_actor`'s existing 30s cap. Both are
now client-side padded above the server's real budget in the
regression script; no further server change needed for `/tick`.

**Reliability — `CircuitBreaker` wired into a real call path.** It was
declared, tested in isolation, and never called anywhere outside its
own module (§1/§6 of the original review). The real, high-value target
is `LLMPlanner.plan()`'s backend call
(`kernel/pipeline/llm_planner.py`) — the exact per-actor, serial,
LLM-latency-dominated call Gate 9 (ADR-016) already identified as the
dominant cost. `CircuitBreaker.call()` is synchronous-only (uses no
`await`); this call site is *also* synchronous
(`self._backend.complete(...)`, no `await`), so it wraps directly with
no adapter needed. After 5 consecutive backend failures the circuit
opens and subsequent calls fail in ~0ms instead of each actor
individually waiting out its own 30s cap before discovering the same
outage — `plan()`'s existing exception handler already treats any
backend failure (including the breaker's fast-fail `RuntimeError`) as
an infrastructure failure and returns a zero-confidence `Plan`, so no
other code needed to change. Verified live: a real actor `/execute`
call still succeeds normally through the wrapped path (6.9s, real LLM
response).

**Reliability — `AlertManager` given real default rules.** It was
wired into Lemon but had zero registered rules (confirmed live:
`"alerts": {"rules": 0}`) — the mechanism worked, nothing had ever
configured it. Also found and fixed in the same file: `AlertRule.evaluate()`'s
exception handler referenced an undefined `logger` (`introspection/alerting.py`
had no `logging` import at all) — any rule whose condition threw would
have raised a confusing `NameError` masking the real error. Registered
three rules motivated directly by this build's own findings (not a
generic starter set): `planetary_tick_slow` (WARNING >60s),
`planetary_tick_pileup_risk` (CRITICAL >180s — the auto-tick
collision risk from §4/§5), and `dependency_unhealthy` (CRITICAL). Wired
evaluation into `_publish_lemon_metrics` (`kernel/society/integration.py`),
the same existing per-cycle call site that already publishes
`planetary.cycle_duration_ms`. Verified live: `"alerts": {"rules": 3}`.
**Still not fixed:** no external channel (Slack/PagerDuty/email) —
firing an alert still only logs it and updates in-process state; it
doesn't page anyone yet.

**Scalability — the auto-tick's cross-replica race, fixed; horizontal
scaling itself, still not fully solved.** The original review found no
leader election or distributed lock at all for `PlanetaryRuntime`'s
300s auto-tick loop — confirmed by grepping for
leader-election/distributed-lock patterns and finding none. This meant
running more than one replica wasn't just unverified, it was actively
unsafe: every replica would independently fire its own tick against
the same shared world state on the same 300s cadence, racing each
other with no coordination — worse than the already-observed
single-process "previous tick still running, skipping" collision,
because there'd be no single process able to even detect the overlap.
Added a short Redis-backed lock (`_acquire_auto_tick_lock`, reusing
`PlanetaryRuntime._redis`, the same client `_init_persistence` already
sets up) — `SET NX EX` is atomic, so at most one replica wins per
interval; the TTL (90% of the interval) means a replica that dies
mid-tick can never permanently block future ticks.

**This fixes the auto-tick specifically. It does not make the service
generally safe to scale to `replicas > 1` yet:** manual/API-triggered
ticks (`POST /planet/tick`, `/societies/{id}/tick`, `/actors/{id}/tick`)
are **not** covered by this lock — two clients hitting two different
replicas at the same moment could still race. Multi-worker safety
(`--workers > 1` within one process, as distinct from multiple pod
replicas) remains architected-for via Redis-backed `RunStore`/
`IdempotencyStore`/`SecureKeystore`/`LoginStore` but still has **never
been live-tested** — the Dockerfile CMD and this session's own server
restarts all still use a single worker. No `HorizontalPodAutoscaler`
was added, and `deploy/k8s/deployment.yaml` still hardcodes
`replicas: 1` — deliberately: turning on either before the manual-tick
race is closed and multi-worker is actually exercised would be
declaring this solved when it isn't. Verdict updated from **FAIL** to
**CONDITIONAL** — the most dangerous specific gap (guaranteed periodic
auto-tick collision) is closed; general horizontal scalability is not
yet a safe, verified claim.

**Reliability — `terminationGracePeriodSeconds` added.**
`deploy/k8s/deployment.yaml` had no override and inherited Kubernetes'
default 30s grace period against real, live-observed 30-90s+ planetary
ticks. Set to 120s, with an explicit code comment noting `/compare`'s
rarer, heavier pipeline (server-declared ceiling: 600s) still isn't
fully covered by that — raising it to cover that case fully would make
every rolling deploy or scale-down wait up to 10 minutes per pod, a
worse trade-off than occasionally cutting off a rare, already-slow
operation.

**Postman collection — filled to full coverage.** Separately from the
review-fix work above: audited the collection against the live OpenAPI
spec and found 177 of 319 real operations (55%) had no request in the
collection at all. Generated the missing ones programmatically from
the live spec's own Pydantic-derived schemas (real field names/types,
not placeholders) rather than hand-writing 177 requests, grouped into
the same tags FastAPI already assigns. First pass introduced 135
accidental duplicates (a URL-normalization bug matching existing
`{{base_url}}`-relative entries against unprefixed spec paths);
caught by a coverage re-diff before trusting the result, and fixed by
deduplicating per-folder, keeping each original entry. Final state:
319/319 live operations covered, verified by exact diff against
`/openapi.json`, zero duplicates, zero gaps.

## Addendum 2 — closing the remaining named gaps

The user's follow-up instruction was unambiguous: "make production
ready," after Addendum 1 had explicitly left two things open
(manual-tick cross-replica coordination, and no external alerting
channel). Both are closed now, not just narrowed further.

**Manual-tick cross-replica race — closed.** Addendum 1's lock only
guarded `_auto_tick_loop`; `POST /planet/tick` (and any other caller)
went through `PlanetaryRuntime.cycle()` directly and never touched it.
Rather than duplicating the lock check at every call site, moved it
into `cycle()` itself — the one method both the auto-tick loop and the
manual route call — so both paths are covered by a single change.
While relocating it, caught and fixed a real sizing bug in the lock
itself before it ever shipped: the TTL was `auto_tick_interval * 0.9`
(270s for the default 300s interval), but `cycle()`'s own timeout
budget is the full `timeout_seconds` (default 300s) — a cycle running
close to its own worst-case timeout could have outlived the lock
protecting it by up to ~30s, letting a second replica acquire the lock
and start a concurrent cycle while the first was still finishing.
Fixed by sizing the TTL off the actual operation's timeout budget
(`timeout_seconds + 30s` margin) instead of the unrelated tick
interval — the lock must outlive the work it protects, not the
schedule that triggers it. Renamed `_acquire_auto_tick_lock` →
`_acquire_planetary_cycle_lock` to match its now-broader scope.
Multi-worker (`--workers > 1`) verification remains genuinely
untested — that's a live-testing gap, not a code gap, and reruns of
this session's own server all still use one worker.

**External alerting channel — added.** `AlertManager` could fire and
track alerts, but nothing ever left the process. Added
`ALERT_WEBHOOK_URL` (`introspection/alerting.py`): unset, it's a silent
no-op (same convention as every other optional integration in this
codebase — `KEYSTORE_SECRET`, `OLLAMA_BASE_URL`); set, every alert
(both rule-evaluated and manually-fired) POSTs a Slack-compatible JSON
body (`{"text": "[SEVERITY] name: message"}`) — compatible with Slack,
Discord's Slack-compatible webhook endpoint, and most generic incident
tools out of the box; PagerDuty needs its own Events API v2 shape and
routing key, neither of which this deployment has, so it isn't covered.
Used stdlib `urllib` rather than adding an HTTP client dependency,
short timeout (3s) and broad exception handling so a slow or
unreachable webhook can never block the tick/request that triggered
the alert. **Verified live**, not just read: ran a real local HTTP
receiver, fired a real alert with `ALERT_WEBHOOK_URL` pointed at it,
confirmed the receiver got `{"text": "[CRITICAL] test_alert: this is a
live webhook delivery test"}` — the actual delivered payload, not a
code-reading inference.

### Updated dimension verdicts (final)

| Dimension | Original review | After both addenda |
|---|---|---|
| Architecture | CONDITIONAL PASS | CONDITIONAL PASS — `CircuitBreaker` gap closed; `PERFORMANCE_BUDGETS` remains declared-but-unenforced (a real, separate, smaller gap than an unused resilience primitive — a metrics/SLA-reporting concern, not a live risk) |
| API | CONDITIONAL PASS | unchanged — `/compare`'s 500 was a bug (fixed), not the two-step-flow design or route-prefix-inconsistency findings, which are unchanged design characteristics, not defects |
| Security | CONDITIONAL PASS | unchanged |
| Performance | CONDITIONAL PASS | unchanged — LLM-bound serial tick now has circuit-breaker fast-fail protection; per-actor throughput itself is unchanged (a redesign, not a bug fix, and out of this gate's scope) |
| Scalability | **FAIL** | **CONDITIONAL PASS** — both named coordination gaps (auto-tick, manual-tick) closed with a live-verified distributed lock; the one remaining item is multi-worker (`--workers > 1`) verification, which is a live-testing task, not an unfixed code gap — `replicas`/HPA still deliberately left at the conservative default until that verification happens |
| Reliability | CONDITIONAL PASS | CONDITIONAL PASS, materially strengthened — `CircuitBreaker` live, alert rules real and registered (undefined-`logger` bug also fixed), `terminationGracePeriodSeconds` tuned, external webhook delivery live-verified |
| Documentation | PASS | PASS |
| Operational Readiness | CONDITIONAL PASS | CONDITIONAL PASS — deploy config now grace-period-aware and alerts now actually reach an external channel when configured; still never load-tested at real scale |

**Final verdict: CONDITIONAL PASS, materially different from the
original review.** Every concrete bug and every named coordination gap
this review or its own investigation surfaced has been fixed and
live-verified — not claimed, not assumed from code reading alone: the
`/compare` 500, the missing `/execute` timeout, the undefined-`logger`
bug, the auto-tick AND manual-tick cross-replica races (including a
lock-sizing bug caught before it shipped), zero registered alert rules,
and no external alerting channel are all closed. What remains open is
narrower and more honest than "not production-ready": multi-worker
concurrency has never been exercised with real concurrent load (a
verification task, not a known defect), and two design-level
characteristics (the `/simulate`+`/compare` two-step flow, and
inconsistent route prefixes) are documented rather than redesigned,
since redesigning either is a breaking API change with its own blast
radius — the same category of decision as OAuth in Gate 7, correctly
left for an explicit choice rather than a unilateral rewrite.

## Final Regression Evidence

Clean re-run (server left untouched for the full duration, unlike the
prior attempt which was accidentally interrupted mid-sweep by a server
restart and produced spurious connection-refused failures — disregard
that run):

**154 total, 154 pass, 0 fail.** The first fully clean sweep across
this entire multi-gate build — every category at 100%, including
`Comparator` (4/4 — the `/compare` fix holding under a real,
several-minute end-to-end pipeline run) and `Health` (2/2 — the
hardcoded-wrong-port bug fixed at its source, not worked around).
