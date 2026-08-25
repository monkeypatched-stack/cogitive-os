"""MongoResource — health-state wrapper around MongoDBAdapter.

MongoDBAdapter.connect() is lazy: it only constructs the Motor client
without ever verifying reachability, so is_connected() alone can't tell a
genuinely-up MongoDB from a down one — this wrapper does a real ping.
Required: boot aborts if this never comes up (matches the existing
"Startup aborted — primary persistence unavailable" behavior in
bootstrap.py's init_persistence(), which never actually triggered before
since MongoDBAdapter.connect() never raises).
"""
from __future__ import annotations

from src.monkey_brain.kernel.resource_manager import (
    ErrorCategory,
    ResourceConfig,
    ResourceHealth,
    ResourceState,
)


class MongoResource:
    def __init__(self, adapter) -> None:
        self._adapter = adapter

    @property
    def name(self) -> str:
        return "mongodb"

    @property
    def config(self) -> ResourceConfig:
        # No config_keys: MONGODB_URL isn't actually required — MongoDBAdapter
        # already defaults to mongodb://localhost:27017 when unset, so a
        # missing env var isn't a genuine misconfiguration to flag; an
        # actually-unreachable server surfaces as NETWORK/AUTHENTICATION
        # from the ping in _ping() below instead.
        return ResourceConfig(name="mongodb", required=True)

    async def initialize(self) -> ResourceHealth:
        return await self._ping()

    async def health(self) -> ResourceHealth:
        return await self._ping()

    async def shutdown(self) -> None:
        await self._adapter.disconnect()

    async def _ping(self) -> ResourceHealth:
        client = getattr(self._adapter, "_client", None)
        if client is None:
            try:
                await self._adapter.connect()
            except Exception as exc:
                return ResourceHealth(
                    name=self.name, state=ResourceState.FAILED,
                    reason=str(exc)[:200], category=ErrorCategory.INTERNAL, required=True,
                )
            client = getattr(self._adapter, "_client", None)

        if client is None:
            return ResourceHealth(
                name=self.name, state=ResourceState.UNAVAILABLE,
                reason="Motor client not constructed — motor/pymongo not installed?",
                category=ErrorCategory.DEPENDENCY_MISSING, required=True,
            )

        try:
            await client.admin.command("ping")
            return ResourceHealth(name=self.name, state=ResourceState.READY, required=True)
        except Exception as exc:
            msg = str(exc).lower()
            category = ErrorCategory.AUTHENTICATION if ("auth" in msg or "401" in msg) else ErrorCategory.NETWORK
            return ResourceHealth(
                name=self.name, state=ResourceState.UNAVAILABLE,
                reason=str(exc)[:200], category=category, required=True,
            )
