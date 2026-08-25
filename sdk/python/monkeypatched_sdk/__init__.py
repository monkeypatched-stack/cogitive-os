"""
Monkeypatched Adapter SDK

A minimal, portable framework for connecting external systems to the Monkeypatched
platform's capabilities without modifying platform code.

Usage:
    # As a cognitive runtime client
    from monkeypatched_sdk.client import MonkeyBrain

    mb = MonkeyBrain("http://localhost:8000")
    alice = mb.create_actor("Alice", objective="cost", goals=["buy_milk"])
    result = mb.tick(alice.actor_id)
    print(result.plan_steps)

    # As an adapter framework
    from monkeypatched_sdk import CapabilityAdapter, AdapterContext, AdapterResponse

    @capability_adapter(capability_id="create_work_order")
    class MyAdapter(CapabilityAdapter):
        async def initialize(self): ...
        async def execute(self, context, inputs): ...
        async def health_check(self): ...
        async def shutdown(self): ...
"""

__version__ = "1.0.0"
__author__ = "Monkeypatched"

# Core Contracts
from .authentication.api_key import APIKeyHandler
from .authentication.basic import BasicAuthHandler
from .authentication.factory import AuthFactory, AuthStrategy
from .authentication.jwt_handler import JWTHandler

# Authentication
from .authentication.oauth2 import OAuth2Handler

# Configuration
from .configuration.manager import (
    AdapterConfig,
    ConfigurationManager,
)
from .connections.database import DatabaseConnectionPool
from .connections.http import HTTPConnectionPool
from .connections.mqtt import MQTTConnectionPool
from .connections.opc_ua import OPCUAConnectionPool

# Connections
from .connections.pool import ConnectionPool
from .contracts.adapter import (
    AdapterStatus,
    CapabilityAdapter,
)
from .contracts.context import (
    AdapterContext,
    AdapterResponse,
)
from .contracts.exceptions import (
    AdapterError,
    AdapterExecutionError,
    AdapterInitializationError,
    ConfigurationError,
    HealthCheckError,
)

# Cognitive Runtime Client
from .client import (
    MonkeyBrain,
    ActorInfo,
    TickResult,
)

# Events
from .events.bus import EventBusAdapter

# Health
from .health.monitor import (
    ComponentHealth,
    HealthMonitor,
    HealthStatus,
)

# Lifecycle Management
from .lifecycle.manager import (
    LifecycleEvent,
    LifecycleManager,
)

# Registration
from .lifecycle.registry import (
    AdapterRegistry,
    capability_adapter,
)

# Agent & Capability Registries
from .registries.agent_registry import AgentRegistry
from .registries.capability_registry import CapabilityRegistry
from .registries.capability_bandit import CapabilityBandit
from .telemetry.exporters import (
    InfluxExporter,
    JaegerExporter,
    PrometheusExporter,
    TelemetryExporter,
)

# Telemetry
from .telemetry.manager import TelemetryManager
from .telemetry.span import Span

__all__ = [
    # Core
    "CapabilityAdapter",
    "AdapterStatus",
    "AdapterContext",
    "AdapterResponse",
    # Registration
    "AdapterRegistry",
    "capability_adapter",
    # Lifecycle
    "LifecycleManager",
    "LifecycleEvent",
    # Configuration
    "ConfigurationManager",
    "AdapterConfig",
    # Authentication
    "OAuth2Handler",
    "APIKeyHandler",
    "JWTHandler",
    "BasicAuthHandler",
    "AuthFactory",
    "AuthStrategy",
    # Events
    "EventBusAdapter",
    # Telemetry
    "TelemetryManager",
    "Span",
    "TelemetryExporter",
    "PrometheusExporter",
    "InfluxExporter",
    "JaegerExporter",
    # Connections
    "ConnectionPool",
    "HTTPConnectionPool",
    "MQTTConnectionPool",
    "OPCUAConnectionPool",
    "DatabaseConnectionPool",
    # Health
    "HealthMonitor",
    "HealthStatus",
    "ComponentHealth",
    # Exceptions
    "AdapterError",
    "AdapterInitializationError",
    "AdapterExecutionError",
    "HealthCheckError",
    "ConfigurationError",
    # Cognitive Runtime Client
    "MonkeyBrain",
    "ActorInfo",
    "TickResult",
]
