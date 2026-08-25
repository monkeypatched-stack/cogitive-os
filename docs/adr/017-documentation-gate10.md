# ADR-017: Documentation (Gate 10) — Delete and Rebuild

## Status

Accepted

## Context

The user's instruction for this gate was explicit and destructive:
"delete all documentation and then update Gate 10 — Documentation."
`docs/` alone held 100+ files (16 of them this session's own ADRs —
the decision record for Gates 3-9), plus ~38 root-level `.md` reports
(`WAVE_*`, `CERTIFICATION_*`, `FINAL_*`, `README.md`, etc.) and dozens
of per-service `README.md` files under `domains/`, `packages/`, `sdk/`.

Given the blast radius, the ambiguity of "all documentation," and this
session's established (memory-recorded) preference for additive,
non-destructive changes in this codebase, this was not executed
unilaterally — the user was asked to confirm scope via two explicit
questions before anything was deleted:

1. What counts as "documentation" to delete — everything (`docs/` +
   root reports + all READMEs), only `docs/`, or only stale/generated
   reports? → **Answer: everything under `docs/` plus root-level `.md`
   reports.**
2. Should this session's own Gate 3-9 ADR chain (006-016) survive? →
   **Answer: keep them.**

## Decision

**Deleted** (127 files, confirmed via `git status --short | grep '^ D'`):
- All of `docs/` except `docs/adr/006-*` through `docs/adr/016-*` —
  including 26 pre-existing, unrelated ADRs (`001-005`, a `0001-0021`
  series that were all templated "todo-list-service"/"todo-agent"
  architecture-decision boilerplate, evidently from a prior, unrelated
  exercise, not this project's real decision history), the constitution
  docs, prediction/learning domain docs, `examples/`, `compose/`, and
  assorted stale reports.
- All 38 root-level `.md` files (`README.md` included, per the
  confirmed scope), a mix of genuine historical snapshots (`WAVE_1`
  through `WAVE_5`+`7` "convergence reports," `CERTIFICATION_PHASE_*`,
  `FINAL_*`) that had accumulated with no single one established as
  current/canonical.
- Per-service `README.md` files (`sdk/`, `packages/*/`,
  `domains/manufacturing/knowledge/services/*/`) were **not** touched —
  out of the confirmed "root-level" scope.

**Rebuilt**, per Gate 10's five requirements, each grounded in a live
verification pass rather than restating what the old docs claimed:

1. **OpenAPI spec** — already real and complete: FastAPI auto-generates
   it from actual route signatures (`GET /openapi.json`, `/docs`,
   `/redoc`; confirmed live: 3.1.0, 277 paths / 319 operations, 100% of
   operations have a `summary`). Froze a snapshot at `docs/openapi.json`
   and added `docs/openapi.md` explaining the live-vs-frozen
   relationship and how to regenerate.
2. **Examples** (`docs/examples.md`) — every example is a real, live
   capture against the running server on 2026-08-03 (health/liveness,
   actor CRUD, societies, a real planetary tick, the Gate 7 auth flow
   including a genuine wrong-password 401, and a keystore write) — not
   hand-authored sample JSON. One capture surfaced a real routing
   surprise worth documenting: `login`/`account`/`otp` routes live
   under `/api/v1/actors/...`, not `/api/v1/agentos/actors/...` like
   everything else — confirmed by checking the live spec after an
   initial 404.
3. **Architecture docs** (`docs/architecture.md`) — rebuilt from the
   real, current kernel directory structure (verified via `find`, not
   assumed from memory) plus this session's Gates 3-9 findings:
   geography/society decoupling, world/policy split, append-only
   timelines, the real security stack, and the Gate 9 discovery that
   planetary-cycle cost is per-actor and serial.
4. **Deployment guide** (`docs/deployment.md`) — consolidates Gate 8's
   real, live-verified Docker/K8s/Helm work (ADR-015) into a single
   how-to, including the three real Dockerfile bugs so they're not
   re-diagnosed by a future reader hitting the same build failure.
5. **Troubleshooting guide** (`docs/troubleshooting.md`) — ten entries,
   every one a real issue actually hit and diagnosed this session
   (423 lockout, 503 keystore, the observability route prefix, the
   planetary-tick livelock risk, the Redis-fallback persistence bug
   class, the known pre-existing `/simulate`/`/compare` 422s, the
   Postman collection's hardcoded wrong port) — not generic filler.

Added a root `README.md` as the entry point tying the five together —
not one of the five explicitly named requirements, but a repo with
none felt like a real gap given "documentation" was the whole point of
this gate.

## Alternatives Considered

1. **Execute the delete without confirming scope first** — rejected:
   "all documentation" is genuinely ambiguous at this repo's size
   (100+ files under `docs/` alone), the action is irreversible via
   normal editing, and it directly conflicts with this project's
   established no-overwrite/no-delete working pattern recorded from
   earlier sessions — exactly the kind of decision that's the user's to
   make, not a default to assume.
2. **Keep the old ADRs (001-005, 0001-0021) as historical record** —
   rejected per explicit user answer: only 006-016 were named as
   worth keeping; the rest were unrelated (a different, apparently
   templated "todo-list-service" project) boilerplate, not this
   project's history.
3. **Leave the two dangling `docs/compose/specs/...` comment references**
   (`kernel/affiliations/relationship_bridge.py`,
   `kernel/society/domain.py`) **unfixed** — accepted as a known,
   flagged consequence rather than chased: both are prose citations in
   docstrings/comments, not runtime file reads (confirmed via grep for
   `open()`/`Path()` against any deleted `docs/` path — none found), so
   nothing breaks; fixing every stale doc-comment reference across the
   codebase is a larger, separate cleanup than this gate's scope.

## Consequences

- 127 files deleted; 11 pre-existing Gate ADRs (006-016) plus 6 new
  files (`architecture.md`, `openapi.md`, `openapi.json`, `examples.md`,
  `deployment.md`, `troubleshooting.md`) plus root `README.md` and this
  ADR (017) constitute the entire documentation surface going forward.
- Every claim in the new docs was verified live during this gate (not
  copied from the deleted docs) — the OpenAPI spec is a live export,
  every example response is an actual captured payload, the
  architecture doc's kernel module list was confirmed via `find`, not
  recalled from memory.
- Two source comments (`relationship_bridge.py`, `society/domain.py`)
  now cite a deleted design doc path; flagged, not fixed, per
  Alternatives Considered above.
- `docs/adr/` numbering has a gap (001-005 and the templated 0001-0021
  series are gone) — 006 is now the effective start of this project's
  real ADR history. Future ADRs should continue from 018.
