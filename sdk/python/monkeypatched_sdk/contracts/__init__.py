"""Core contracts – the public interface all adapters must implement."""

from .adapter import AdapterStatus, CapabilityAdapter
from .context import AdapterContext, AdapterResponse
from .exceptions import (
    AdapterError,
    AdapterExecutionError,
    AdapterInitializationError,
    AdapterValidationError,
    AuthenticationError,
    ConfigurationError,
    ConnectionPoolExhausted,
    HealthCheckError,
)

__all__ = [
    "CapabilityAdapter",
    "AdapterStatus",
    "AdapterContext",
    "AdapterResponse",
    "AdapterError",
    "AdapterInitializationError",
    "AdapterExecutionError",
    "HealthCheckError",
    "ConfigurationError",
    "AdapterValidationError",
    "ConnectionPoolExhausted",
    "AuthenticationError",
]
