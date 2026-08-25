"""
AdapterContext and AdapterResponse
====================================

These two value objects cross the boundary between the platform and every
adapter.  Keep them small, serialisable, and dependency-free.
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional


class AdapterContext:
    """
    Context passed to adapter.execute() on every invocation.

    The platform populates this from the active workflow execution so
    adapters can correlate their work with platform-level tracing.

    Attributes
    ----------
    capability_id:   The capability being exercised (e.g. "create_work_order").
    workflow_id:     The workflow that triggered this execution.
    execution_id:    The specific execution step ID.
    world_state:     A read-only snapshot of relevant world-model state.
    request_id:      A unique identifier for this single invocation.
    timestamp:       UTC time the context was created.
    """

    __slots__ = (
        "capability_id",
        "workflow_id",
        "execution_id",
        "world_state",
        "request_id",
        "timestamp",
    )

    def __init__(
        self,
        capability_id: str,
        workflow_id: str,
        execution_id: str,
        world_state: Dict[str, Any],
        request_id: str,
    ) -> None:
        self.capability_id = capability_id
        self.workflow_id = workflow_id
        self.execution_id = execution_id
        self.world_state = world_state
        self.request_id = request_id
        self.timestamp = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return (
            f"AdapterContext("
            f"capability={self.capability_id!r}, "
            f"workflow={self.workflow_id!r}, "
            f"execution={self.execution_id!r})"
        )


class AdapterResponse:
    """
    Standard return value from adapter.execute().

    Rules
    -----
    * Always return an AdapterResponse – never raise from execute().
    * On success: success=True, result={...}.
    * On failure: success=False, error="human-readable message".
    * metadata is for optional diagnostic data (timing, retries, etc.).

    Convenience constructors
    -------------------------
    AdapterResponse.ok(result)          → success
    AdapterResponse.fail(error_message) → failure
    """

    __slots__ = ("success", "result", "error", "metadata", "timestamp")

    def __init__(
        self,
        success: bool,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.success = success
        self.result = result
        self.error = error
        self.metadata = metadata or {}
        self.timestamp = datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # Convenience constructors
    # ------------------------------------------------------------------

    @classmethod
    def ok(
        cls,
        result: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "AdapterResponse":
        """Return a successful response."""
        return cls(success=True, result=result, metadata=metadata)

    @classmethod
    def fail(
        cls,
        error: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "AdapterResponse":
        """Return a failed response."""
        return cls(success=False, error=error, metadata=metadata)

    def __repr__(self) -> str:
        if self.success:
            return f"AdapterResponse(success=True, result={self.result!r})"
        return f"AdapterResponse(success=False, error={self.error!r})"
