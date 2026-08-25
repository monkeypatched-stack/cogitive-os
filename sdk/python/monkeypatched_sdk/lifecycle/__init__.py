"""Lifecycle management – adapter startup, health monitoring, shutdown."""

from .manager import LifecycleEvent, LifecycleManager
from .registry import AdapterRegistry, capability_adapter

__all__ = [
    "LifecycleManager",
    "LifecycleEvent",
    "AdapterRegistry",
    "capability_adapter",
]
