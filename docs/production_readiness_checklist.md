# Production Readiness Checklist — Release Gate

**This is the release gate.** A build does not ship to production until
every box below is checked. Unlike a typical checklist, every item here
is tied to real, cited evidence (an ADR, a live verification, a file) —
not a self-report. Items that aren't actually verified are left
unchecked and say why, rather than assumed.

Last evaluated: 2026-08-03, against `beta-0.0.1` after Gates 3-11.
**Current gate status: NOT CLEARED — 5 of 25 items unmet or unverified
(see bottom).**

---

## Architecture

- [x] **World schema frozen** — `docs/adr/006-world-schema-v1-freeze.md`
- [x] **API versioned** — confirmed live: every business route sits
      under `/api/v1/...` (`docs/openapi.json`). Caveat: `/health`,
      `/live`, `/ready`, `/metrics` are intentionally unversioned
      (infra endpoints, not API surface) — documented, not an oversight.
- [ ] **No TODOs in production paths** — **NOT MET, but improved.**
      11 real `# TODO` comments in `src/monkey_brain/` (re-checked
      2026-08-26; was 25 on 2026-08-03 — some real resolution happened,
      not just drift). The `kernel.py:564` Mem0 comment cited in the
      2026-08-03 evaluation as "an entire subsystem dead on arrival" no
      longer reads that way — it now explicitly documents the disconnected
      Mem0Resource as **expected, not a bug** ("Mem0 is not configured in
      this deployment, so this resource never connects... Registered
      anyway... so /health has something [to report]"). That example was
      stale as of this re-check; the remaining 11 TODOs were not
      individually re-audited here. Per this project's standing practice,
      these are left in place until each is actually resolved.

## Quality

- [ ] **Unit test target met** — **NO FORMAL TARGET EXISTS.** 153 real
      unit test files under `tests/unit/` (re-checked 2026-08-26; was
      130 on 2026-08-03 — the suite has grown, not shrunk). No coverage
      threshold is
      configured anywhere (`pyproject.toml`, `pytest.ini`, `.coveragerc`
      — checked, none exist). Can't be "met" against a target that was
      never defined; defining one is a prerequisite to ever checking
      this box honestly.
- [ ] **Integration test target met** — same gap as above; no target
      defined.
- [ ] **Scenario suite passes** — **UNVERIFIED BY ME.** 56 files match
      `test_mb30*.py` under `tests/scenarios/` (re-checked 2026-08-26;
      the "60" and "test_mb3000–mb3060" range in the 2026-08-03
      evaluation was already an approximation, close but not exact); 84
      test files total exist under `tests/scenarios/`, so the mb30xx
      e-commerce-journey sequence is a subset, not the whole suite. This
      session has
      never run `pytest` against them — standing project instruction is
      "fix code only, never execute test runs." What IS verified this
      session is a separate, REST-level regression sweep
      (`scripts/gate9_benchmark.py`'s sibling script) — **154/154 pass,
      two consecutive clean runs** — but that exercises live HTTP
      endpoints directly, not this pytest suite. Someone (a human, or
      CI) needs to actually run `pytest tests/scenarios/` for this box
      to be honestly checked.
- [x] **No critical regressions** — 154/154 REST-level regression sweep,
      confirmed twice in a row after independent clean server restarts
      (`docs/adr/018-production-readiness-gate11.md`, "Final Regression
      Evidence").

## Reliability

- [ ] **World validator passes** — **DISABLED IN THIS ENVIRONMENT.**
      The validator itself is real (`kernel/validation/world_validator.py`,
      `docs/adr/010-world-validation-engine.md`), but every server
      restart this session ran with `WORLD_VALIDATION_GATE_EXECUTE=false`
      and `WORLD_VALIDATION_GATE_SAVE=false` — it doesn't actually gate
      anything in the environment these results came from. Needs a
      clean-state run with both gates `true` before this is a real pass.
- [ ] **Invariants enforced** — same caveat as above; the enforcement
      mechanism exists but was off throughout testing.
- [x] **Recovery tested** — `POST /backup` / `POST /restore`, real,
      live-verified (`docs/adr/013-persistence-gate6.md`).
- [x] **Checkpoint restore verified** — `RunStore`/process
      checkpoint-restore, live-verified including a real server restart
      (`docs/adr/013-persistence-gate6.md`).

## Operations

- [x] **Health endpoints** — `/health`, `/ready`, `/live`, all real and
      live-verified (`docs/adr/015-operations-gate8.md`).
- [x] **Metrics exported** — Lemon, `/metrics`,
      `/api/v1/agentos/observability` (`docs/adr/012-observability-gate5.md`).
- [x] **Structured logging** — JSON logs with correlation/request/actor
      IDs (`docs/adr/012-observability-gate5.md`).
- [x] **Distributed tracing** — real `Tracer`, `start_span`/`finish_span`
      wired throughout. Known caveat carried from Gate 5: `Tracer._traces`
      grows unboundedly — flagged, not yet fixed. Checked because
      tracing itself works, not because it's leak-free.
- [x] **Alerts configured** — 3 real rules registered, external webhook
      delivery live-verified (`docs/adr/018-production-readiness-gate11.md`,
      Addendum 2).

## Security

- [x] **Authentication** — real password auth + OTP + JWT, live-verified
      including account lockout (`docs/adr/014-security-gate7.md`).
- [x] **Authorization** — `require_permission`/OPA (`require_opa`)
      gating on every mutating route.
- [x] **Input validation** — `sanitize_input` on every route that
      accepts free text.
- [x] **Rate limiting** — `RateLimitMiddleware`, real 429s, confirmed
      live during Gate 11's review.
- [x] **Audit logging** — `@audited` decorator, real MongoDB-backed
      trail (`docs/adr/014-security-gate7.md`).

## Documentation

- [x] **API documentation** — live OpenAPI 3.1 spec, 337 paths / 384
      operations (re-verified 2026-08-26 against a running server; was
      277/319 on 2026-08-03), 100% have summaries (`docs/openapi.md`).
- [x] **Deployment guide** — `docs/deployment.md`.
- [x] **Runbooks** — `docs/troubleshooting.md`, 10 entries, all real
      incidents actually hit and diagnosed this build, not generic
      filler.
- [x] **Architecture documentation** — `docs/architecture.md`.

## Release

- [~] **E-commerce benchmark passes** — **NO TEST BY THIS NAME EXISTS.**
      The closest real artifact is the `tests/scenarios/` suite above
      (which IS an e-commerce customer-journey benchmark in substance —
      registration, cart, checkout, payment, fulfillment, returns), and
      it's in the same unverified-by-me state. Not marking this
      unchecked-and-separate from that item to avoid double-counting the
      same real gap; resolving "Scenario suite passes" resolves this
      too.
- [~] **Performance targets met** — **PARTIALLY.** Real SLA budgets
      exist and 13/13 pass for graph traversal, planning, reasoning,
      REST latency, and memory growth
      (`docs/adr/016-performance-gate9.md`). The one budget that does
      NOT reliably meet its own target: `planetary.cycle_per_actor`
      — LLM-latency-bound, serial, no throughput fix applied (only
      failure-mode protection: timeout + circuit breaker). This is a
      known, structural, unresolved limitation, not a documentation gap.
- [ ] **Scale targets met** — **NOT MET.** No scale targets are formally
      defined anywhere (same gap as the Quality section's test targets).
      What's known: cross-replica coordination races were real and are
      now fixed (`docs/adr/018`, Addenda 1-2), but multi-worker
      (`--workers > 1`) has never been exercised under real concurrent
      load — every server start this entire session used one worker.
- [ ] **Production review signed off** — **CONDITIONAL, not signed off.**
      `docs/adr/018-production-readiness-gate11.md` is the review; its
      own verdict is explicitly "CONDITIONAL PASS," not an unconditional
      signoff. This checklist item can't be checked by the same process
      that produced the conditional verdict — it needs a human decision
      on the open items above.

---

## Gate status

**13 / 25 checked. 2 partial. 10 unmet or unverified.**

Unmet items fall into three real categories, not one undifferentiated
pile:

1. **Actually broken / missing** (fix required): 25 production TODOs;
   no formal test/scale/coverage targets defined anywhere.
2. **Built and working, but not exercised as the gate requires**
   (verification required, not code): World validator disabled during
   testing; scenario/unit/integration pytest suites never run this
   session (only REST-level checks); multi-worker never load-tested.
3. **Structural, requires a scoped decision, not a quick fix**: the
   per-actor LLM-latency ceiling on planetary cycle throughput.

This checklist should be re-run (all boxes re-verified, not assumed
carried-forward) before every production release — that's what makes
it a gate rather than a snapshot.
