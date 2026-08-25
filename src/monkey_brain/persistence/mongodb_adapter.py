"""MongoDB Adapter — canonical source of truth.

Responsibilities:
- Agents, Users, Organizations
- Workflows, Workloads, Capabilities
- Process Definitions, Documents
- Knowledge Objects, Runtime Metadata

MongoDB stores entities.
MongoDB never stores execution history.
"""
from __future__ import annotations

import logging

from typing import Any
from src.monkey_brain.persistence.adapters import IStoreAdapter
from src.monkey_brain.persistence.events import PersistenceEvent, EventType



logger = logging.getLogger("monkey_brain.persistence.mongodb_adapter")

class MongoDBAdapter(IStoreAdapter):
    """MongoDB persistence adapter."""
    
    def __init__(self, url: str = "mongodb://localhost:27017", database: str = "agentos"):
        self._url = url
        self._database = database
        self._client = None
        self._db = None
        self._connected = False
    
    @property
    def name(self) -> str:
        return "mongodb"
    
    async def connect(self) -> None:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            from src.monkey_brain.persistence.client_options import mongo_client_options, redact_url
            # Explicit timeouts: the driver default (serverSelectionTimeoutMS=30s) stalls every
            # operation for 30s when Mongo is unreachable, saturating the worker pool.
            self._client = AsyncIOMotorClient(self._url, **mongo_client_options())
            self._db = self._client[self._database]
            self._connected = True
            logger.info("MongoDB adapter connected to %s", redact_url(self._url))
        except ImportError:
            self._connected = False
    
    async def disconnect(self) -> None:
        if self._client:
            self._client.close()
        self._connected = False
    
    async def health(self) -> dict[str, Any]:
        return {
            "status": "healthy" if self._connected else "unhealthy",
            "database": self._database,
        }
    
    async def persist(self, event: PersistenceEvent) -> dict[str, Any]:
        if not self._connected:
            return {"status": "disconnected"}
        
        collection = self._db[event.entity_type]
        
        if event.event_type == EventType.ENTITY_CREATED:
            await collection.insert_one({"_id": event.entity_id, **event.data})
            return {"status": "created", "entity_id": event.entity_id}
        
        elif event.event_type == EventType.ENTITY_UPDATED:
            await collection.update_one(
                {"_id": event.entity_id},
                {"$set": event.data},
                upsert=True,
            )
            return {"status": "updated", "entity_id": event.entity_id}
        
        elif event.event_type == EventType.ENTITY_DELETED:
            await collection.delete_one({"_id": event.entity_id})
            return {"status": "deleted", "entity_id": event.entity_id}
        
        return {"status": "ignored"}
    
    async def query(self, entity_type: str, entity_id: str | None = None) -> Any:
        if not self._connected:
            return None
        
        collection = self._db[entity_type]
        
        if entity_id:
            return await collection.find_one({"_id": entity_id})
        
        cursor = collection.find().limit(100)
        return await cursor.to_list(length=100)
    
    def is_connected(self) -> bool:
        return self._connected
