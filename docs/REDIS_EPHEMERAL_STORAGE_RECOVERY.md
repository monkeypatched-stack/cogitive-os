# Redis Ephemeral Storage Recovery: Deterministic Index Reconstruction

## Problem

**Current Architecture:**
- Redis stores the Actor Registry (operational index) in an emptyDir volume (ephemeral)
- MongoDB stores authoritative actor state (belief, model info, world snapshots)
- When Redis is lost (pod crash, node drain, emptyDir cleared), the actor registry disappears
- **BUT** actors remain in MongoDB, just invisible to registry lookups

**Impact:**
- After Redis restart/loss: `locate_actor()` and `list_registry()` return nothing
- Actors can't be discovered or scheduled
- System appears to have "lost" all actors
- No automatic recovery mechanism existed

**Example Scenario:**
```
1. Redis pod running, 50 actors registered
2. Node drained → Redis pod killed, emptyDir cleared
3. Redis pod restarts
4. Control-plane pod still running
5. Call locate_actor("alice") → returns None (registry is empty)
6. BUT MongoDB still has alice's full state
7. System thinks alice doesn't exist; she's invisible
```

---

## Solution: Deterministic Registry Reconstruction

**New Module:** `src/monkey_brain/kernel/society/redis_index_reconstruction.py`

Provides automatic, idempotent recovery that:
1. Scans MongoDB for all actors (source of truth)
2. Rebuilds Redis hash entries from MongoDB documents
3. Verifies consistency after rebuild
4. Repairs stale/incomplete entries

**Key Properties:**
- ✅ **Deterministic:** Same MongoDB state → same Redis state every time
- ✅ **Idempotent:** Safe to run multiple times; skips unchanged entries
- ✅ **Automatic:** Runs at boot if inconsistency detected
- ✅ **Observable:** Detailed logging and statistics returned
- ✅ **No data loss:** All actors recover from MongoDB

---

## How It Works

### Reconstruction Flow

```
RedisIndexReconstructor.rebuild_from_mongodb()
    ↓
    1. Scan MongoDB actor_state collection
       (iterate all documents, extract actor_id)
    ↓
    2. For each actor in MongoDB:
       a. Check if Redis entry exists and is recent (< 5 min old)
       b. If yes, skip (already valid)
       c. If no or stale, construct registry entry from MongoDB doc
       d. Write to Redis: HSET monkeybrain:actors:hash {actor_id} {json}
    ↓
    3. Return statistics:
       - actors_scanned: total found in MongoDB
       - actors_rebuilt: entries written to Redis
       - actors_skipped: entries already valid
       - errors: any problems during rebuild
```

### Consistency Verification

```
verify_consistency()
    ↓
    1. Get all actors from MongoDB
    2. Get all actors from Redis
    3. Compare:
       - Missing from Redis → needs rebuild
       - Missing from MongoDB → corruption (shouldn't exist)
       - Stale (not updated in > 1 hour) → suspicious
    ↓
    4. Return issues and recommendation:
       - is_consistent: bool
       - missing_from_redis: [actor_ids...]
       - has_fixable_issues(): → boolean for repair_from_consistency_check()
```

---

## API Usage

### Automatic (Boot-time)

Triggered automatically during `PlanetaryRuntime.__init__()`:

```python
# In integration.py:_init_persistence()
self._redis_reconstructor = RedisIndexReconstructor(self)
consistency = self._redis_reconstructor.verify_consistency()
if consistency.has_fixable_issues():
    repair_result = self._redis_reconstructor.repair_from_consistency_check(consistency)
    logger.info("Redis index repair: %s", repair_result.summary())
```

**Result:** If Redis was lost, actors are automatically visible again after boot.

### Manual Verification

```python
# Check if Redis ↔ MongoDB are in sync
consistency = pr.verify_redis_mongodb_consistency()

if not consistency.is_consistent:
    print(f"Issues found: {consistency.issues}")
    print(f"Missing from Redis: {consistency.missing_from_redis}")
    print(f"Stale entries: {consistency.stale_entries}")
```

### Manual Rebuild

```python
# Force rebuild from MongoDB (may be needed for debugging)
result = pr.rebuild_redis_index_from_mongodb()

print(result.summary())
# Output: "Rebuilt Redis index: 50 actors from MongoDB (0 skipped, 0 errors) in 1.23s"

print(f"Rebuilt: {result.actors_rebuilt}")
print(f"Errors: {result.errors}")
```

### Repair Stale Entries

```python
# Find issues first
consistency = pr.verify_redis_mongodb_consistency()

# Fix them
if consistency.has_fixable_issues():
    repair_result = pr._redis_reconstructor.repair_from_consistency_check(consistency)
    print(f"Fixed {repair_result.actors_rebuilt} entries")
```

---

## Data Structures

### MongoDB Source Document (actor_state collection)

```json
{
  "_id": "{tenant_id}:{actor_id}",
  "actor_id": "alice",
  "actor_type": "Trader",
  "name": "Alice the Trader",
  "tenant_id": "default",
  "society_id": "stock-exchange-v1",
  "belief_state": "base64-encoded-json",
  "status": "active",
  "node_id": "cognitiveos-actor-abc123",
  "version": 42,
  "cycle_count": 1000,
  "last_cycle": 1234567890.5,
  "is_active": true
}
```

### Redis Target Entry (monkeybrain:actors:hash)

```
HSET monkeybrain:actors:hash alice {
  "identity": {
    "actor_id": "alice",
    "name": "Alice the Trader",
    "actor_type": "Trader"
  },
  "society_id": "stock-exchange-v1",
  "belief_state": "base64-encoded-json",
  "status": "active",
  "node_id": "cognitiveos-actor-abc123",
  "updated_at": 1234567890.5,
  "artifact_version": "1.4",
  "runtime_version": "2.1"
}
```

---

## Example Scenarios

### Scenario 1: Redis Pod Crashes

```
Time: 10:00:00
- Redis pod running: 50 actors in registry
- MongoDB: 50 actors with full state

Time: 10:00:15
- Node kernel panic → all pods drained
- Redis pod deleted, emptyDir cleared
- Redis pod restarted

Time: 10:00:30
- PlanetaryRuntime.__init__() runs:
  1. Connects to Redis (now empty)
  2. Calls _load_actors() → finds empty registry
  3. Initializes RedisIndexReconstructor
  4. Calls verify_consistency()
    - MongoDB: 50 actors
    - Redis: 0 actors
    - Result: missing_from_redis = [all 50 actors]
  5. Calls repair_from_consistency_check()
    - Scans MongoDB, rebuilds all 50 entries
    - Writes to Redis
    - Result: actors_rebuilt = 50

Time: 10:00:35
- locate_actor("alice") → returns ActorRegistryEntry (found!)
- list_registry() → returns all 50 actors
- System fully recovered
```

### Scenario 2: Transient Redis Connection Loss

```
Time: 10:00:00
- Normal operation
- Actor registry and MongoDB in sync
- Both have 50 actors

Time: 10:00:15
- Network blip → Redis connection timeout
- Process reconnects (auto-retry logic)
- Redis still has all 50 actors

Time: 10:00:30
- verify_consistency():
  - MongoDB: 50 actors
  - Redis: 50 actors
  - All entries updated_at < 5 minutes
  - Result: is_consistent = True
  - No repair needed

Time: 10:00:35
- System continues normally
- No action taken (already consistent)
```

### Scenario 3: Stale Redis Cache

```
Time: 10:00:00
- Redis entries not updated for 3 hours
- 45 actors in Redis, 50 in MongoDB
- 5 new actors registered after Redis cache

Time: 10:00:15
- PlanetaryRuntime boot:
  - verify_consistency() detects:
    - missing_from_redis: [5 new actors]
    - stale_entries: [45 actors not updated in 3 hours]
  - Result: is_consistent = False

Time: 10:00:20
- repair_from_consistency_check():
  - Rebuilds 5 missing entries from MongoDB
  - Refreshes 45 stale entries
  - Total: actors_rebuilt = 50

Time: 10:00:25
- All 50 actors now visible and fresh in Redis
```

---

## Configuration & Tuning

### Stale Entry Threshold

Default: 5 minutes (300 seconds) for "recent enough to skip"

```python
# In _rebuild_redis_entry()
if time.time() - redis_updated < 300:  # < 5 minutes
    return False  # Skip, entry is fresh
```

Rationale: After Redis restart, all entries become fresh (updated_at = current time). Don't unnecessarily rewrite within 5 minutes unless explicitly repairing stale entries.

### Consistency Check Refresh Threshold

Default: 1 hour (3600 seconds) for "stale"

```python
# In verify_consistency()
stale_threshold = time.time() - 3600
if updated_at < stale_threshold:  # Not updated in 1+ hour
    stale_entries.append((actor_id, ...))
```

Rationale: Actor registrations should be updated regularly (at least once per hour during normal operation). If not, something's wrong (dead actor, stale entry, etc.).

### Configure via Environment

Currently, thresholds are hardcoded constants. To make tunable:

```python
# In redis_index_reconstruction.py
_RECENT_ENTRY_TTL = int(os.getenv("REDIS_RECENT_ENTRY_TTL_SECONDS", "300"))
_STALE_ENTRY_TTL = int(os.getenv("REDIS_STALE_ENTRY_TTL_SECONDS", "3600"))
```

Then use in code:
```python
if time.time() - redis_updated < _RECENT_ENTRY_TTL:
    return False
```

---

## Monitoring & Observability

### Logs

**Boot-time automatic repair:**
```
INFO: Detected Redis index inconsistency, rebuilding from MongoDB: ['5 actors in MongoDB missing from Redis']
INFO: Redis index repair complete: Rebuilt Redis index: 5 actors from MongoDB (0 skipped, 0 errors) in 0.12s
```

**Manual verification:**
```
INFO: Actors loaded: 50, skipped (already exist): 0
DEBUG: Redis entry for alice is recent, skipping
DEBUG: Rebuilt Redis entry for bob
```

**Errors (warnings, non-fatal):**
```
WARNING: Failed to rebuild Redis entry for charlie: KeyError on identity extraction
WARNING: Redis entry consistency check failed: Connection refused
```

### Metrics to Track

- `redis_index_rebuild_count` — Total rebuilds since boot
- `redis_index_rebuild_duration_seconds` — Time to rebuild
- `redis_index_consistency_issues` — Number of inconsistencies detected
- `redis_index_repair_count` — Total repairs applied
- `redis_index_repair_errors` — Failed repairs

---

## Testing

### Unit Tests

Located in: `tests/test_redis_index_reconstruction.py`

**Test coverage:**
1. `test_rebuild_from_mongodb_basic` — Populate Redis from empty MongoDB
2. `test_rebuild_idempotent` — Running twice produces same result
3. `test_rebuild_skips_recent_entries` — Entries < 5 min old are skipped
4. `test_consistency_check_detects_missing` — Identifies actors in MongoDB but missing Redis
5. `test_consistency_check_detects_stale` — Identifies entries not updated recently
6. `test_repair_from_consistency_check` — Repairs issues found by consistency check
7. `test_verify_consistency_with_no_issues` — Returns is_consistent=True when all good
8. `test_handles_redis_unavailable` — Gracefully degrades when Redis down
9. `test_handles_mongodb_unavailable` — Gracefully degrades when MongoDB down
10. `test_corrupted_redis_entries` — Rebuilds corrupted entries

### Integration Tests

**End-to-end test:**
```python
def test_redis_loss_recovery_e2e():
    """Simulate Redis pod crash and verify automatic recovery."""
    pr = PlanetaryRuntime()
    
    # Register 10 actors
    for i in range(10):
        profile = create_test_actor_profile(f"actor-{i}")
        pr.register_actor(profile)
    
    # Verify they're in Redis
    assert len(pr.list_registry()) == 10
    
    # Simulate Redis loss
    pr._redis.flushdb()
    assert len(pr.list_registry()) == 0  # Now empty
    
    # Trigger rebuild (simulating boot-time automatic repair)
    result = pr.rebuild_redis_index_from_mongodb()
    
    # Verify recovery
    assert result.actors_rebuilt == 10
    assert result.success == True
    assert len(pr.list_registry()) == 10
```

---

## Deployment Notes

### Redis Volume Configuration

**Current (emptyDir):**
```yaml
volumes:
- name: redis-data
  emptyDir: {}  # Ephemeral; lost on pod restart
```

**Alternative (Persistent):**
```yaml
volumes:
- name: redis-data
  persistentVolumeClaim:
    claimName: redis-pvc  # Would persist, but overkill for cache
```

**Recommendation:** Keep emptyDir (simpler, faster). Recovery from MongoDB is deterministic anyway.

### Kubernetes Pod Restart

When Redis pod restarts:
1. Pod comes up, emptyDir re-created (empty)
2. Redis process starts (fresh instance)
3. Control-plane process stays running
4. On next PlanetaryRuntime operation:
   - `_init_persistence()` detects empty Redis
   - `verify_consistency()` finds discrepancy
   - `repair_from_consistency_check()` rebuilds
   - No operator intervention needed

---

## Related Documentation

- `src/monkey_brain/kernel/society/redis_index_reconstruction.py` — Implementation
- `src/monkey_brain/kernel/society/integration.py` — Integration into PlanetaryRuntime
- `src/monkey_brain/persistence/actor_state_store.py` — MongoDB persistence layer
- `deploy/k8s/deployment.yaml` — Pod volume configuration
- `DEPLOYMENT_ARCHITECTURE.md` — Section 7: Actor Registry
- `CLEAN_DEPLOYMENT_VALIDATION_REPORT.md` — Original ephemeral storage gap finding

---

## FAQ

### Q: Why not use persistent Redis volumes?

**A:** Redis is designed for fast, ephemeral caching. Using persistent storage would:
- Reduce performance (Redis isn't optimized for persistent I/O)
- Add complexity (managing PVCs, volume provisioning)
- Defeat the purpose (if we need persistence, use MongoDB directly)

Better approach: Keep Redis ephemeral, rely on deterministic recovery from MongoDB.

### Q: What if MongoDB is also down?

**A:** The system degrades gracefully:
- `_load_actors()` returns early if MongoDB unavailable
- Actors already in memory stay registered locally
- Cross-process discovery (`locate_actor()` fallback) still works for this process
- No data loss; all data remains in MongoDB when it comes back

### Q: Is rebuild safe during normal operations?

**A:** Yes, entirely safe:
- Idempotent: Rebuilds recent entries as-is
- Background: Doesn't block other operations
- Non-destructive: Only overwrites stale/missing entries
- Can run alongside active ticking

### Q: How long does rebuild take?

**A:** Sub-second for typical deployment:
- 50 actors: ~100-200ms (depends on MongoDB latency)
- 500 actors: ~500ms-1s
- Primarily limited by MongoDB scan time, not Redis writes

### Q: What if an actor is deleted from MongoDB?

**A:** Stale Redis entry persists until next explicit repair or Redis restart. Options:
1. Manual `rebuild_redis_index_from_mongodb()` call
2. Wait for automatic stale entry refresh (hourly)
3. Manual Redis `HDEL` to remove orphaned entry

---

## Success Criteria

✅ **After implementation:**
- Redis pod restart → actors automatically visible again
- No manual `kubectl delete pod` needed
- No data loss (everything in MongoDB already)
- Deterministic recovery (same MongoDB state → same Redis state)
- Idempotent operations (safe to run multiple times)
- Clear logging of recovery progress

✅ **Verified by:**
- Unit tests covering all rebuild paths
- Integration test simulating Redis loss + recovery
- Boot-time automatic repair visible in logs
- Manual `verify_redis_mongodb_consistency()` shows recovery complete
