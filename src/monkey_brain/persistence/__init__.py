"""AgentOS Persistence Layer — first-class runtime subsystem.

Provides:
- PersistenceManager: single gateway to storage
- Reducer: pure state mutation
- Events: immutable persistence events
- Adapters: store-specific implementations

Every persistence technology owns exactly one responsibility.
No database duplicates another's responsibility.
Every write originates from a runtime state transition.
Reducers own state mutation.
Persistence layers persist the results of state mutations.
"""

from __future__ import annotations

from src.monkey_brain.persistence.manager import PersistenceManager
from src.monkey_brain.persistence.reducer import Reducer, StateMutation
from src.monkey_brain.persistence.events import (
    PersistenceEvent,
    EventType,
    EntityCreated,
    EntityUpdated,
    EntityDeleted,
    RelationshipCreated,
    MemoryStored,
    WorkflowStarted,
    WorkflowCompleted,
    MetricRecorded,
)
from src.monkey_brain.persistence.adapters import IStoreAdapter

__all__ = [
    "PersistenceManager",
    "Reducer",
    "StateMutation",
    "PersistenceEvent",
    "EventType",
    "EntityCreated",
    "EntityUpdated",
    "EntityDeleted",
    "RelationshipCreated",
    "MemoryStored",
    "WorkflowStarted",
    "WorkflowCompleted",
    "MetricRecorded",
    "IStoreAdapter",
]
