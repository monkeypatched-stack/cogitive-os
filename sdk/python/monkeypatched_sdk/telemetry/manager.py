"""
Telemetry Manager
=================

Central coordinator for metrics and distributed tracing.

The TelemetryManager wraps a TelemetryExporter and provides the
higher-level API that adapters call via self.telemetry.

Built-in auto-instrumentation
------------------------------
The following metrics are emitted automatically by LifecycleManager
(adapters can add their own with emit_metric):

    adapter.<id>.execute_duration_ms  – execution time per call
    adapter.<id>.execute_success      – 1 per successful execution
    adapter.<id>.execute_error        – 1 per failed execution
    adapter.<id>.health_check         – 1 = healthy, 0 = unhealthy
"""

import logging
import time
from typing import Any, Dict, Optional

from .exporters import LoggingExporter, MetricType, TelemetryExporter
from .span import Span

logger = logging.getLogger(__name__)


class TelemetryManager:
    """
    Collects and exports metrics and distributed traces.

    Inject into adapters via LifecycleManager; use via:

        await self.telemetry.emit_metric("work_orders_created", 1)
        async with await self.telemetry.start_span("cmms_call") as span:
            span.set_tag("endpoint", "/api/work-orders")
            ...
    """

    def __init__(self, exporter: Optional[TelemetryExporter] = None) -> None:
        self.exporter: TelemetryExporter = exporter or LoggingExporter()
        self._in_memory: Dict[str, Any] = {}  # lightweight in-process counters

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    async def emit_metric(
        self,
        metric_name: str,
        value: float,
        metric_type: MetricType = MetricType.GAUGE,
        tags: Optional[Dict[str, str]] = None,
        source: str = "sdk",
    ) -> None:
        """
        Emit a metric data point.

        The metric name is prefixed with ``adapter.<source>.`` so all
        adapter metrics are namespaced in the backend.
        """
        full_name = f"adapter.{source}.{metric_name}"
        _tags = tags or {}

        # Track in-memory for get_metric_value()
        self._in_memory[full_name] = value

        try:
            await self.exporter.export_metric(
                name=full_name,
                value=value,
                metric_type=metric_type,
                tags=_tags,
                timestamp=time.time(),
            )
        except Exception as exc:
            logger.warning("Failed to export metric '%s': %s", full_name, exc)

    async def emit_counter(
        self,
        metric_name: str,
        increment: float = 1.0,
        tags: Optional[Dict[str, str]] = None,
        source: str = "sdk",
    ) -> None:
        """Increment a counter metric."""
        await self.emit_metric(
            metric_name=metric_name,
            value=increment,
            metric_type=MetricType.COUNTER,
            tags=tags,
            source=source,
        )

    def get_metric_value(self, full_name: str) -> Optional[float]:
        """Return the last recorded value for a metric (in-process only)."""
        return self._in_memory.get(full_name)

    # ------------------------------------------------------------------
    # Traces
    # ------------------------------------------------------------------

    async def start_span(
        self,
        span_name: str,
        parent_span_id: Optional[str] = None,
    ) -> Span:
        """
        Start a distributed trace span.

        Use as an async context manager::

            async with await self.telemetry.start_span("cmms_call") as span:
                span.set_tag("method", "POST")
                result = await call_cmms()
        """
        return Span(telemetry=self, name=span_name, parent_span_id=parent_span_id)

    async def emit_trace(
        self,
        span_name: str,
        duration: float,
        tags: Optional[Dict[str, str]] = None,
    ) -> None:
        """Export a completed trace span (called by Span.finish())."""
        try:
            await self.exporter.export_trace(
                span_name=span_name,
                duration=duration,
                tags=tags or {},
                timestamp=time.time(),
            )
        except Exception as exc:
            logger.warning("Failed to export trace '%s': %s", span_name, exc)
