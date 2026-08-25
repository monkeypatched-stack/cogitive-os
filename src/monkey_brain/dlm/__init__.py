"""DLM — Data Lifecycle Manager for AgentOS.

Manages the lifecycle of all runtime data.
Ensures AgentOS remains performant and storage-efficient.

Provides:
- TTL Management
- Garbage Collection
- Storage Monitoring
- Orphan Detection
- Lifecycle Policies
"""

from __future__ import annotations

from src.monkey_brain.dlm.dlm import Dlm
from src.monkey_brain.dlm.lifecycle import (
    LifecyclePolicy,
    StorageClass,
    ExpirationAction,
    get_policy,
    DATA_POLICIES,
)
from src.monkey_brain.dlm.ttl import TtlManager, TtlEntry
from src.monkey_brain.dlm.gc import GarbageCollector, CollectionResult
from src.monkey_brain.dlm.storage import StorageMonitor, StorageQuota, StorageSnapshot
from src.monkey_brain.dlm.orphans import OrphanDetector, Orphan, OrphanScanResult

__all__ = [
    "Dlm",
    "LifecyclePolicy",
    "StorageClass",
    "ExpirationAction",
    "get_policy",
    "DATA_POLICIES",
    "TtlManager",
    "TtlEntry",
    "GarbageCollector",
    "CollectionResult",
    "StorageMonitor",
    "StorageQuota",
    "StorageSnapshot",
    "OrphanDetector",
    "Orphan",
    "OrphanScanResult",
]
