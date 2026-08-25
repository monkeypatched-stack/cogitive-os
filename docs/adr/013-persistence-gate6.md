# ADR-013: Persistence (Gate 6) — KnowledgeGraph Durability + Backup/Restore

## Status

Accepted

## Context

Auditing "everything important should survive restart" against what
already existed found most of the list already covered:
`SharedWorld`/world_graph, `PresenceTimeline` (via `TimelineStore`'s
Redis backend), `ContextStream` (and efficiently, post-ADR-011),
`Plan`s (`PlanStore`: filesystem + Neo4j), checkpoints (`ProcessManager`,
MongoDB-backed), and execution state (`RunStore`). One item was a
genuine, total gap: `KnowledgeGraph` — the Commerce/domain graph every
Product, Order, Merchant, and Shipment built through this session's
REST layer lives in — had **zero persistence**. The `context_event_store`
constructor parameter its docstring claimed provided "Integration with
ContextEventStore for persistence" was accepted and stored but never
actually used anywhere in the file. And there was no backup/restore/
migration tooling for any subsystem — only ad hoc per-subsystem snapshot
methods, nothing that captures or restores the whole world at once.

**Addendum — a follow-up "check Gate 6" pass found the initial audit's
"execution state: covered via RunStore" claim was wrong in this specific
deployment.** See the dedicated section below.

## Decision

**KnowledgeGraph persistence** — `KnowledgeGraph.set_on_change(callback)`
(new), mirroring `ContextStream.set_on_publish()`'s exact shape: every
mutation method (`add_entity`, `update_entity`, `compare_and_swap`,
`remove_entity`, `add_relationship`, `remove_relationship`) now calls
`self._notify_change(kind, id, action)`. `PlanetaryRuntime` wires this to
`_on_knowledge_graph_change()`, which writes ONE entity/relationship via
`HSET`/`HDEL` per mutation — O(1) per call from the start, deliberately
learning from ADR-011 rather than repeating its mistake (a full-graph
resync on every write, discovered there only after it became a severe
bug). `_load_knowledge_graph()` reads both hashes via `HGETALL` at boot,
alongside the existing `_load_actors()`/`_load_context()`/etc. calls.

Verified live end-to-end: created a product via `POST /products`,
confirmed it in the Redis hash, restarted the server (`KnowledgeGraph
loaded: 4 entities, 0 relationships` in the boot log), confirmed
`GET /products/{id}` still returns it.

**Backup / restore / migration** — `kernel/society/world_backup.py`:
`export_backup()` reads every `monkeybrain:*` Redis key generically by
pattern and type (STRING/HASH/LIST), not by hardcoding each subsystem's
key name a second time — a future new persisted subsystem is
automatically included without this file needing an update.
`restore_backup()` writes a backup's keys back, refusing to overwrite an
already-existing key unless `overwrite=True` is passed explicitly (a
restore is for repopulating an empty/fresh environment, not silently
clobbering a live one by default). Exposed as `POST /backup` /
`POST /restore` under Admin. "Migration" is the `schema_version` field
every backup carries — the same forward-compatible-legacy-fallback
pattern ADR-011 established per-key, applied once at the whole-backup
level: a future format change bumps `SCHEMA_VERSION` and `restore_backup()`
gains a branch for the old shape, rather than a new migration framework.

Verified live: backed up, deleted the KnowledgeGraph entities key
(simulating data loss), restored it (`keys_written: 1,
keys_skipped_existing: 34` — everything else correctly left alone),
restarted, confirmed the product was queryable again.

**Explicitly not built**: a live, in-place restore that takes effect
without a restart. `_load_*()` methods only run once, in `__init__`;
re-running them against an already-booted instance whose in-memory state
has since diverged from Redis risks resurrecting an entity a live actor
already deleted, or duplicating relationships. Restore takes effect on
the next process restart — documented in `world_backup.py`'s own
docstring rather than silently claimed to be instant when it isn't safe
to be.

## Addendum — the "check Gate 6" verification pass (same day)

Asked to verify (not just claim) each item survives a real restart,
live-testing surfaced two real bugs the original pass missed:

1. **`RunStore` and `IdempotencyStore` (Gate 2/ADR-009) were silently
   in-memory-only in this deployment, contradicting the original claim
   that execution state was "covered via RunStore".** Both
   `_make_backend()` functions checked `REDIS_URL` only, with no
   fallback to `REDIS_HOST`/`REDIS_PORT` — unlike `TimelineStore`,
   which already has that exact fallback (with a comment explaining
   why: "without this fallback, an environment configured the way this
   whole system already connects to Redis... silently gets an
   in-memory-only [store]"). Since `REDIS_URL` is not set in this
   environment (confirmed via `ps eww` on the running server process),
   both stores were falling through to `_InMemoryRunBackend()` /
   `_InMemoryIdempotencyBackend()` with **zero log output indicating
   it** in RunStore's case ("auto" mode with no url hit neither logged
   branch). Confirmed live: a `/plan` call's `run_id` was absent from
   Redis entirely before the fix. Fixed by applying the identical
   `REDIS_HOST`/`REDIS_PORT` fallback already proven in
   `TimelineStore._make_backend()` to both. Re-verified live: the log
   now shows `RunStore: SHARED Redis backend ... — multi-worker safe`
   and `IdempotencyStore: SHARED Redis backend ...`; a `/plan` call's
   `run_id` now appears in Redis; `POST /replay/{run_id}` after a real
   restart correctly reconstructs the persisted execution graph.
   For `IdempotencyStore` specifically, this was silently the exact
   multi-worker failure mode ADR-009 itself named as the reason Redis-
   backing matters — functionally invisible with `--workers 1` (this
   deployment), but would have silently broken the moment this ran with
   `--workers 2+`.
2. **`GET /processes` and every other route in `routes/process.py`
   (checkpoint, restore, suspend, resume, terminate) were broken** —
   `request: Any` instead of `request: Request` meant FastAPI couldn't
   recognize the special Request-injection parameter and instead
   treated it as a required JSON query parameter, so every call 422'd
   before reaching any real logic. Fixed by importing `Request` from
   `fastapi` and correcting all 8 occurrences. `GET /processes` now
   correctly returns `200 {"processes": [], "total": 0}` instead of
   422. A full checkpoint/restore round-trip was not exercised (no
   currently-running process to suspend-then-checkpoint in this
   session's flow — `ProcessManager` appears scoped to SDLC/long-running
   workflows this session never drove into that state), so checkpoint
   persistence itself is confirmed reachable but not proven end-to-end
   the way KnowledgeGraph/RunStore/PresenceTimeline/ContextStream were.

Both fixes are small, mechanical, and match a pattern already proven
correct elsewhere in the same codebase — not new design, just applying
established fixes that were never propagated to sibling stores.

## Alternatives Considered

1. **Hardcode each subsystem's key name in the backup module** (mirroring
   how `_save_world`/`_save_geography`/etc. each know their own key) —
   rejected: guarantees the backup silently misses whatever the NEXT
   persisted subsystem adds, exactly the kind of drift this session's
   "single source of truth" discipline (ADR-006 forward) has repeatedly
   tried to avoid. Generic key-pattern scanning is self-maintaining.
2. **Attempt a live, in-place restore** — rejected: real risk of
   resurrecting deleted data or duplicating relationships against
   diverged in-memory state; a restart-required restore is the safer,
   more honest contract, and matches how most real systems handle
   restore-from-backup anyway.
3. **Build a full migration framework (versioned migration functions,
   auto-detection, rollback)** — rejected as premature: there is
   exactly one schema version so far. `schema_version` tagging plus the
   already-proven per-key legacy-fallback pattern is enough until a
   second version actually exists to migrate between.

## Consequences

- Every Product/Order/Merchant/Shipment/Wallet built via the Commerce/
  Orders/Fulfillment REST layer (Gates 1-3) now genuinely survives a
  restart — previously all of it was memory-only.
- `POST /backup` / `POST /restore` give this environment (and any
  future one) a real, verified disaster-recovery primitive, scoped
  honestly (restart-required, not live).
- The generic key-pattern approach means future persisted subsystems
  are automatically covered by backup/restore with no code change to
  `world_backup.py` — a deliberate design choice to prevent this file
  going stale the way `context_event_store`'s dead parameter did.
- Execution state (RunStore) and idempotency guarantees (ADR-009) now
  genuinely survive restart and would genuinely share state across
  multiple workers in this environment — previously both silently
  didn't, with no operator-visible warning.
- `routes/process.py`'s checkpoint/suspend/resume/terminate endpoints
  are reachable again; a full checkpoint round-trip remains unverified
  end-to-end pending a real long-running process to exercise it against.
- This addendum is itself the reason "check" (verify, don't just
  restate the design) mattered here: the original pass's claims about
  RunStore and PresenceTimeline were both plausible from reading the
  code, and one of them was wrong in practice.
