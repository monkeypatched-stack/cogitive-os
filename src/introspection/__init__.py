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

from __future__ import annotations

from src.introspection.lemon import Lemon
from src.introspection.tracing import Tracer, Trace, Span
from src.introspection.metrics import MetricsCollector, Metric
from src.introspection.logging import StructuredLogger, LogEntry
from src.introspection.health import HealthMonitor, HealthCheck
from src.introspection.alerting import AlertManager, Alert, AlertRule, AlertSeverity

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
