"""Lemon — Observability Layer for AgentOS.

Complete end-to-end visibility into every aspect of the runtime.

Provides:
- Distributed tracing (Trace, Span)
- Metrics collection (counters, gauges, histograms)
- Structured logging (JSON, trace-enriched)
- Health monitoring (healthy, degraded, unhealthy)
- Alerting (rules, firing, resolution)

Lemon observes everything.
Lemon changes nothing.
"""

from introspection.lemon import Lemon
from introspection.tracing import Tracer, Trace, Span
from introspection.metrics import MetricsCollector, Metric
from introspection.structured_logging import StructuredLogger, LogEntry
from introspection.health import HealthMonitor, HealthCheck
from introspection.alerting import AlertManager, Alert, AlertRule, AlertSeverity

__all__ = [
    "Lemon",
    "Tracer",
    "Trace",
    "Span",
    "MetricsCollector",
    "Metric",
    "StructuredLogger",
    "LogEntry",
    "HealthMonitor",
    "HealthCheck",
    "AlertManager",
    "Alert",
    "AlertRule",
    "AlertSeverity",
]
