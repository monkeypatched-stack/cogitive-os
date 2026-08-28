"""RedisWorldStore — cross-process, per-tenant world-tensor persistence.

Same `store` interface TenantWorld already accepts (get/flush/tenants/
resident_count/evictions — see tenancy.py::TenantWorld._tensor and
sharded_world.py::ShardedWorldStore, the interface's one prior
implementation), so this is a drop-in swap for ShardedWorldStore's
local-disk-shard tier — but network-reachable, closing the specific,
already-self-documented reason deploy/k8s/deployment.yaml pins
`replicas: 1` and deploy/k8s/pvc.yaml is `ReadWriteOnce`: the previous
default (world_tensor.py's single local JSON file, MB_WORLD_TENSOR_PATH)
meant a second replica either never saw the first's learned transitions,
or silently clobbered them on its own next whole-world save — last-write-
wins on ONE key covering every tenant.

Same bounded-LRU-plus-persistence-tier shape as ShardedWorldStore (a
tenant is loaded on first access and evicted to its backing store under
memory pressure); only the tier changes, from local disk to Redis, so
every replica reads/writes the SAME durable per-tenant record and
TenantWorld's own contract is untouched.

Persistence granularity is per-tenant (one Redis key per tenant id), not
the whole-world JSON blob the old file mode wrote on every single
observe_execution() call — a busy world with many tenants no longer pays
an O(all tenants) write for one tenant's new transition, the same lesson
already applied to actor persistence (PlanetaryRuntime._save_actor(), not
_save_actors(), on the hot registration path).
"""
from __future__ import annotations

import json
import logging
import os
from collections import OrderedDict
from typing import Any

from src.monkey_brain.kernel.compile.tensor import SparseTransitionTensor

logger = logging.getLogger("agentos.compile.redis_world_store")

_KEY_PREFIX = "monkeybrain:world_tensor:tenant:"
_TENANTS_SET_KEY = "monkeybrain:world_tensor:tenants"


def _redis_url() -> str:
    url = os.getenv("REDIS_URL", "").strip()
    if url:
        return url
    return f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/0"


class RedisWorldStore:
    """Per-tenant SparseTransitionTensor persistence, Redis-backed, with a
    bounded in-memory LRU — same shape as ShardedWorldStore, different
    persistence tier."""

    def __init__(self, *, max_resident: int = 128,
                 learning_rate: float = 0.1, discount: float = 0.95) -> None:
        self._max = max(1, max_resident)
        self._lr = learning_rate
        self._discount = discount
        self._resident: "OrderedDict[str, SparseTransitionTensor]" = OrderedDict()
        self._evictions = 0
        self._client: Any = None

    @classmethod
    def connect(cls, **kwargs: Any) -> "RedisWorldStore | None":
        """Construct and verify connectivity in one step. Returns None
        (never raises) if Redis is unreachable, so world_tensor.py's
        backend selection can fall back to another store without its own
        try/except — same "decide once, fail soft" shape as RunStore's
        _make_backend()/_RedisRunBackend.available()."""
        store = cls(**kwargs)
        try:
            import redis  # redis-py; already a declared dependency
            store._client = redis.from_url(
                _redis_url(), decode_responses=True,
                socket_connect_timeout=float(os.getenv("REDIS_CONNECT_TIMEOUT_SEC", "5")),
                socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT_SEC", "5")),
            )
            store._client.ping()
        except Exception as exc:
            logger.warning("RedisWorldStore: Redis unavailable (%s) — caller should fall back", exc)
            return None
        return store

    def _key(self, tenant: str) -> str:
        return f"{_KEY_PREFIX}{tenant}"

    def get(self, tenant: str) -> SparseTransitionTensor:
        """Return a tenant's world, loading it from Redis on first access
        in THIS process (LRU touch) — reflects whatever any process most
        recently flushed for this tenant, not just this process's own
        history. Starts fresh (never raises) if the Redis read fails or
        the tenant has no record yet."""
        t = self._resident.get(tenant)
        if t is not None:
            self._resident.move_to_end(tenant)
            return t
        t = SparseTransitionTensor(self._lr, self._discount)
        try:
            raw = self._client.get(self._key(tenant))
            if raw:
                t.load_dict(json.loads(raw))
        except Exception as exc:
            logger.warning(
                "RedisWorldStore.get(%r) load failed (starting fresh, non-fatal): %s", tenant, exc,
            )
        self._admit(tenant, t)
        return t

    def _admit(self, tenant: str, t: SparseTransitionTensor) -> None:
        self._resident[tenant] = t
        self._resident.move_to_end(tenant)
        while len(self._resident) > self._max:
            old_tenant, old_t = self._resident.popitem(last=False)  # least-recently-used
            self._persist(old_tenant, old_t)
            self._evictions += 1
            logger.info("[redis_world] evicted tenant %s to Redis (resident=%d)",
                        old_tenant, len(self._resident))

    def _persist(self, tenant: str, t: SparseTransitionTensor) -> None:
        try:
            self._client.set(self._key(tenant), json.dumps(t.to_dict(), default=str))
            self._client.sadd(_TENANTS_SET_KEY, tenant)
        except Exception as exc:
            logger.warning("RedisWorldStore: persist failed for tenant %r (non-fatal): %s", tenant, exc)

    def save(self, tenant: str) -> None:
        t = self._resident.get(tenant)
        if t is not None:
            self._persist(tenant, t)

    def flush(self) -> None:
        """Persist all currently-resident tenants to Redis — called after
        every observe_execution() (world_tensor.py::_maybe_save), same
        contract as ShardedWorldStore.flush()."""
        for tenant, t in self._resident.items():
            self._persist(tenant, t)

    def resident_count(self) -> int:
        return len(self._resident)

    def evictions(self) -> int:
        return self._evictions

    def tenants(self) -> list[str]:
        """All known tenants: resident locally, plus every tenant any
        process has ever flushed to Redis."""
        try:
            known = set(self._client.smembers(_TENANTS_SET_KEY))
        except Exception as exc:
            logger.warning("RedisWorldStore.tenants() Redis read failed: %s", exc)
            known = set()
        return sorted(known | set(self._resident))
