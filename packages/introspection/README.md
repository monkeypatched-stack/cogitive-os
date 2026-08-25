# MonkeyBrain Introspection

Lemon observability layer for the MonkeyBrain Cognitive Operating System.

## Features

- **Lemon** — unified observability facade
- **Tracer** — distributed tracing with traces and spans
- **MetricsCollector** — counters, gauges, and histograms
- **StructuredLogger** — JSON structured logging with trace enrichment
- **HealthMonitor** — health checks (healthy, degraded, unhealthy)
- **AlertManager** — alert rules, firing, and resolution

## Installation

```bash
pip install monkeybrain-introspection
```

## Quick Start

```python
from introspection import Lemon

lemon = Lemon()
lemon.start_trace("my-operation")
# ... do work ...
lemon.finish_trace()
```

## License

Proprietary
