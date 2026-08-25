"""Protocol interfaces for pipeline contracts.

Defines the abstract interfaces that RuntimeContext and CompiledRequest
fields must satisfy. These are the type-safe alternatives to `Any`.

Dependency direction:
    contracts  ◀──  runtime
    protocols  ◀──  contracts
    protocols  ◀──  runtime

Protocols never import runtime implementations.
Runtime implementations satisfy protocols without importing them.
"""
from __future__ import annotations

from typing import Protocol, Any, runtime_checkable


@runtime_checkable
class WorldView(Protocol):
    """Read-only view of the world that actors reason over."""

    def states(self) -> list[str]:
        """Return all world states."""
        ...

    def domains(self) -> list[str]:
        """Return all world domains."""
        ...

    def nnz(self) -> int:
        """Return number of non-zero transitions."""
        ...

    def successors(self, state: str) -> list:
        """Return successor states for a given state."""
        ...

    def domain_of(self, state: str) -> str:
        """Return the domain of a state."""
        ...

    def feature(self, src: str, dst: str, feature_type: Any) -> float:
        """Return a feature value for a transition."""
        ...


@runtime_checkable
class ActorHandle(Protocol):
    """Handle to an actor registry or actor instance."""

    def get(self, actor_id: str) -> Any:
        """Retrieve an actor by ID."""
        ...


@runtime_checkable
class CapabilityBus(Protocol):
    """Bus for discovering and invoking capabilities."""

    def discover(self, name: str) -> Any:
        """Discover a capability by name."""
        ...


@runtime_checkable
class KnowledgeStore(Protocol):
    """Store for querying knowledge."""

    def query(self, question: str) -> Any:
        """Query the knowledge store."""
        ...


@runtime_checkable
class ContextStreamProtocol(Protocol):
    """Pub/sub stream for world updates."""

    def publish(self, event: Any) -> None:
        """Publish an event."""
        ...

    def subscribe(self, callback: Any) -> None:
        """Subscribe to events."""
        ...


@runtime_checkable
class ExecutionEngine(Protocol):
    """Engine for executing workloads."""

    async def execute(self, context: Any, **kwargs: Any) -> Any:
        """Execute a workload."""
        ...


@runtime_checkable
class LearningEngine(Protocol):
    """Engine for updating policies from outcomes."""

    def apply_learning(self, delta: Any, graph: Any) -> dict:
        """Apply learning delta and return metrics."""
        ...


@runtime_checkable
class MetricsCollector(Protocol):
    """Collector for metrics and telemetry."""

    def counter(self, name: str, **tags: Any) -> None:
        """Increment a counter."""
        ...

    def histogram(self, name: str, value: float, **tags: Any) -> None:
        """Record a histogram value."""
        ...

    def gauge(self, name: str, value: float, **tags: Any) -> None:
        """Record a gauge value."""
        ...


@runtime_checkable
class BeliefRuntimeProtocol(Protocol):
    """Protocol for belief formation and fusion."""

    def accept_proposal(self, proposal: Any) -> None:
        """Accept a belief proposal."""
        ...

    def fuse_observations(self) -> dict:
        """Fuse observations into belief."""
        ...


@runtime_checkable
class TrustNetworkProtocol(Protocol):
    """Protocol for trust scoring and weighting."""

    def trust(self, source: str, target: str) -> float:
        """Get trust score between source and target."""
        ...


@runtime_checkable
class AuditServiceProtocol(Protocol):
    """Protocol for audit logging."""

    def record(self, **kwargs: Any) -> None:
        """Record an audit entry."""
        ...


@runtime_checkable
class EventBusProtocol(Protocol):
    """Protocol for event publishing."""

    async def publish(self, event_type: str, payload: dict) -> None:
        """Publish an event."""
        ...
