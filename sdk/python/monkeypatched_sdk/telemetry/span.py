"""
Distributed Trace Span
======================

A lightweight context-manager that wraps a timed operation and
emits a trace record via TelemetryManager when it finishes.

Usage::

    async with await self.telemetry.start_span("cmms_create_work_order") as span:
        span.set_tag("equipment_id", equipment_id)
        result = await _call_cmms_api(payload)
"""

import time
from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from .manager import TelemetryManager


class Span:
    """
    A single timed unit of work within a distributed trace.

    Tags are arbitrary string key/value pairs that are forwarded to
    the configured telemetry exporter (Jaeger, OpenTelemetry, etc.).
    """

    def __init__(
        self,
        telemetry: "TelemetryManager",
        name: str,
        parent_span_id: Optional[str] = None,
    ) -> None:
        self.telemetry = telemetry
        self.name = name
        self.parent_span_id = parent_span_id
        self.start_time: float = time.monotonic()
        self.tags: Dict[str, Any] = {}
        self._finished = False

    def set_tag(self, key: str, value: Any) -> "Span":
        """Attach a tag to this span. Returns self for chaining."""
        self.tags[key] = str(value)
        return self

    def set_error(self, error: Exception) -> "Span":
        """Mark span as errored and record the exception message."""
        self.tags["error"] = "true"
        self.tags["error.message"] = str(error)
        return self

    async def finish(self) -> None:
        """Emit the span to the telemetry backend."""
        if self._finished:
            return
        self._finished = True
        duration = time.monotonic() - self.start_time
        await self.telemetry.emit_trace(
            span_name=self.name,
            duration=duration,
            tags=self.tags,
        )

    # ------------------------------------------------------------------
    # Async context-manager support
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "Span":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_val is not None:
            self.set_error(exc_val)
        await self.finish()
