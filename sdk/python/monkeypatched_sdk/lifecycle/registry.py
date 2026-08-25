"""
Adapter Registry
================

The global registry of all @capability_adapter-decorated classes.

Adapters register themselves automatically when their module is
imported.  LifecycleManager calls AdapterRegistry.get_all() at
startup to discover and instantiate every registered adapter.

Usage::

    @capability_adapter(capability_id="create_work_order")
    class CMMSAdapter(CapabilityAdapter):
        ...

    # Auto-registered – no manual edit required.
"""

import logging
from typing import Any, Dict, List, Optional, Type

from ..contracts.adapter import CapabilityAdapter
from ..contracts.exceptions import AdapterValidationError

logger = logging.getLogger(__name__)

# Required method names that every CapabilityAdapter subclass must provide
_REQUIRED_METHODS = ("initialize", "execute", "health_check", "shutdown")


class AdapterRegistry:
    """
    Class-level singleton registry.

    Thread-safe for reads; writes happen only at import time.
    """

    _registry: List[Type[CapabilityAdapter]] = []

    @classmethod
    def register(cls, adapter_class: Type[CapabilityAdapter]) -> None:
        """Register an adapter class (idempotent)."""
        if adapter_class in cls._registry:
            return
        cls._registry.append(adapter_class)
        metadata: Dict[str, Any] = getattr(adapter_class, "_adapter_metadata", {})
        logger.debug(
            "Registered adapter %s → capability '%s' (v%s)",
            adapter_class.__name__,
            metadata.get("capability_id", "unknown"),
            metadata.get("version", "?"),
        )

    @classmethod
    def get_all(cls) -> List[Type[CapabilityAdapter]]:
        """Return all registered adapter classes."""
        return list(cls._registry)

    @classmethod
    def get_by_capability(cls, capability_id: str) -> Optional[Type[CapabilityAdapter]]:
        """Return the adapter class registered for a capability ID."""
        for adapter_class in cls._registry:
            metadata: Dict[str, Any] = getattr(adapter_class, "_adapter_metadata", {})
            if metadata.get("capability_id") == capability_id:
                return adapter_class
        return None

    @classmethod
    def get_by_name(cls, class_name: str) -> Optional[Type[CapabilityAdapter]]:
        """Return the adapter class matching the given class name."""
        for adapter_class in cls._registry:
            if adapter_class.__name__ == class_name:
                return adapter_class
        return None

    @classmethod
    def clear(cls) -> None:
        """Clear all registrations (useful in tests)."""
        cls._registry.clear()

    @classmethod
    def summary(cls) -> List[Dict[str, Any]]:
        """Return a summary of all registered adapters."""
        result = []
        for adapter_class in cls._registry:
            metadata = getattr(adapter_class, "_adapter_metadata", {})
            result.append(
                {
                    "class": adapter_class.__name__,
                    "module": metadata.get("module"),
                    "capability_id": metadata.get("capability_id"),
                    "version": metadata.get("version"),
                    "tags": metadata.get("tags", []),
                }
            )
        return result


def capability_adapter(
    capability_id: str,
    version: str = "1.0.0",
    tags: Optional[List[str]] = None,
    auto_register: bool = True,
):
    """
    Class decorator that marks a class as a capability adapter.

    Parameters
    ----------
    capability_id:   The platform capability this adapter implements
                     (must match a capability in the Capability Registry).
    version:         Semantic version string for the adapter.
    tags:            Arbitrary labels for discovery / filtering.
    auto_register:   Set False to skip automatic registry insertion
                     (useful in tests).

    Example::

        @capability_adapter(
            capability_id="create_work_order",
            version="1.0.0",
            tags=["cmms", "maintenance"],
        )
        class CMMSAdapter(CapabilityAdapter):
            async def initialize(self): ...
            async def execute(self, context, inputs): ...
            async def health_check(self): ...
            async def shutdown(self): ...
    """

    def decorator(cls: Type) -> Type:
        # Validate that all required methods are present
        missing = [m for m in _REQUIRED_METHODS if not callable(getattr(cls, m, None))]
        if missing:
            raise AdapterValidationError(
                f"{cls.__name__} is missing required methods: {missing}. "
                f"All capability adapters must implement: {list(_REQUIRED_METHODS)}."
            )

        # Attach metadata to the class
        cls._adapter_metadata: Dict[str, Any] = {
            "capability_id": capability_id,
            "version": version,
            "tags": tags or [],
            "class_name": cls.__name__,
            "module": cls.__module__,
        }

        if auto_register:
            AdapterRegistry.register(cls)

        return cls

    return decorator
