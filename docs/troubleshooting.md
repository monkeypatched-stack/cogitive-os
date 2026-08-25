# Troubleshooting Guide

Every entry here is a real issue actually hit and diagnosed during this
build (Gates 3-10), not a hypothetical. Each links to the ADR with the
full root-cause writeup where one exists.

## Health shows a disconnected check

`GET /health` can report `"mem0": {"status": "disconnected"}` while
`"status": "healthy"` overall. This is correct, not a bug — mem0 isn't
in the required-subsystem set (`Kernel` only fails fast on
Mongo/Redis/Neo4j/Runtime/Policy/Broca). If `/health`'s top-level
`status` is `unhealthy`, look at which specific check flipped, not just
that one flipped.

## Observability endpoint 404s at the bare path

`GET /observability` returns 404. The real route is under the versioned
prefix: `GET /api/v1/agentos/observability` (plus
`.../observability/triggers` and `.../observability/{panel}`). Unlike
`/health`/`/ready`/`/live`, the observability router was mounted with a
prefix — confirmed live, not a regression.

## Login returns 423 Locked

`POST /api/v1/actors/{id}/login` returns `423` even with the *correct*
password. This is intended behavior, not a bug: `LoginInfo` locks an
account for 30 minutes after 5 consecutive failed attempts
(`kernel/login_info.py`), and the lock check runs before password
verification — so a correct 6th attempt during the lockout window still
423s. See `docs/adr/014-security-gate7.md`.

## Keys endpoints return 503 keystore unavailable

`POST /api/v1/agentos/keys` (and other `SecureKeystore`-backed routes)
return `503` with a message naming `KEYSTORE_SECRET`. This is
intentional fail-fast behavior added in Gate 7 — the keystore used to
silently mint an ephemeral encryption key if the env var was unset
(meaning every stored secret became unrecoverable on restart). Set
`KEYSTORE_SECRET` to a valid Fernet key:
```bash
export KEYSTORE_SECRET=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```
and persist it somewhere real for production — losing it makes every
previously-stored key permanently undecryptable, by design.

## Planet tick is slow or times out

`POST /api/v1/agentos/planet/tick` can take 30-90+ seconds and, under
load, a client-side 30s timeout will see a `ReadTimeout` (confirmed
live, reproduced twice in this session's Gate 9 regression sweep — once
on `/planet/tick` itself, once on `POST /actors/{id}/execute`).

**Update**: `GeographicEntityRuntime.tick()` (`kernel/geography/runtime.py`)
no longer awaits same-Space occupants serially — per `docs/adr/019-
runtime-performance-audit.md`, occupants of one Space are now ticked
concurrently via `asyncio.gather` (each occupant only reads state already
settled before the gather and only writes its own keyed entries, so this
is safe). What's still serial: the loop across **child geography entities**
(`Planet → Country → City → Space`) — one Space fully finishes before the
next starts. So cycle time is no longer strictly `O(actor_count)`; it's
closer to `O(spaces) × O(slowest actor in that space)`, each actor tick
still ~3s locally against Ollama. Still slow at scale, just not for the
reason originally written here.

At scale this is a real livelock risk, not just slowness: the server's
own 300s auto-tick can fire while a previous tick is still running,
producing `"Previous planetary tick still running, skipping this
cycle"` in the logs — already observed at just 10 actors. If you're
benchmarking or load-testing, raise your client timeout well past 60s
for this one route, and don't call it in a tight loop
(`scripts/gate9_benchmark.py` deliberately calls it exactly once).

## State does not survive a restart

If something you expect to persist (a plan, a run, a keystore entry)
disappears after a server restart, check the startup log for which
backend each store selected — `RunStore`, `IdempotencyStore`, and
`SecureKeystore` all log a line like `"SHARED Redis backend at
redis://..."` when properly connected. If that line is missing, the
store silently fell back to in-memory-only. This was a real bug fixed
in Gates 6-7 (`REDIS_URL` was checked but `REDIS_HOST`/`REDIS_PORT` — the
env vars the rest of the app actually uses — were not, unlike
`TimelineStore`) — if you see it again in a store not covered by that
fix, it's almost certainly the same missing-fallback pattern; compare
against `TimelineStore._make_backend()`.

## Docker build fails

If `docker build -f docker/services/agentos/Dockerfile .` fails, see
`docs/adr/015-operations-gate8.md` — three real, sequential bugs were
found and fixed here (broken `COPY` source paths, missing `scipy` in
`requirements.txt`, missing `PYTHONPATH` for bare `monkey_brain.*`
imports). Check those three first before assuming a new issue; full
detail in [`deployment.md`](deployment.md).

## Health folder in the Postman collection fails against port 8000

**Fixed** — re-checked `MonkeyBrain_2.0_Runtime_Gateway.postman_collection.json`
directly: every `localhost:*` reference in the collection (13 total,
including both `[Health]` entries) now points at `localhost:8031`. Zero
`8000` references remain. If you still see a connection-refused or
`404 {"message":"no Route matched..."}` against this collection, it's a
new/different issue, not this pre-existing hardcoded-port bug — don't
assume it's the same root cause without re-checking the collection file
yourself.

## Simulate and Compare return 422 missing graph field

`POST /api/v1/agentos/simulate` and `POST /api/v1/agentos/compare`
422 with `"graph"` reported as a required-but-missing body field even
when called the way the route's own summary suggests. This is a known,
pre-existing route/schema mismatch (not introduced by Gates 3-10) — it
shows up consistently across every regression sweep this session
(2 of the same 4-6 recurring failures). Not yet root-caused or fixed;
flagged here so it isn't re-investigated as new each time.

**Unverified update**: `predict.py`'s own inline comments now describe
handling a "missing execution graph" case by returning `SimulateResponse`
with an empty graph/answer (HTTP 200), which reads like a related fix —
but this is inferred from a comment, not confirmed against a live 422
repro. Re-test against a running server before trusting either this note
or the original entry above.

## World validation blocks writes with accumulated test data

If world-mutating calls start failing validation after heavy local
testing, check `WORLD_VALIDATION_GATE_EXECUTE` / `WORLD_VALIDATION_GATE_SAVE`
— these env-var overrides (both `false` throughout this session's dev
testing) exist specifically because `kernel/validation/world_validator.py`
enforces real invariants (`docs/adr/010-world-validation-engine.md`) and
a dev environment with a lot of accumulated ad-hoc test data can
legitimately violate them. Don't disable these in production — they're
a real correctness gate, not a workaround for a bug.
