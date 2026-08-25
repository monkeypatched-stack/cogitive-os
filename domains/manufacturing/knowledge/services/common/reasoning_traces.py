from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from services.common.compliance import redact_sensitive


def _compact(value: Any, max_length: int = 12000) -> Any:
    redacted = redact_sensitive(value)
    text = str(redacted)
    if len(text) <= max_length:
        return redacted
    return {
        "_truncated": True,
        "original_type": type(redacted).__name__,
        "preview": text[:max_length],
    }


def log_reasoning_trace(
    service_name: str,
    *,
    stage: str,
    trace_id: str | None = None,
    reasoning_summary: str | None = None,
    input_summary: Any = None,
    output_summary: Any = None,
    tool_calls: Any = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Log an application-level AI trace for ELK without storing private chain-of-thought."""

    reasoning_trace_id = trace_id or f"reasoning-{uuid4().hex}"
    logging.getLogger(f"{service_name}.reasoning_traces").info(
        "reasoning trace",
        extra={
            "event": "reasoning_trace",
            "trace_type": "reasoning",
            "reasoning_trace_id": reasoning_trace_id,
            "reasoning_stage": stage,
            "reasoning_summary": reasoning_summary,
            "input_summary": _compact(input_summary),
            "output_summary": _compact(output_summary),
            "tool_calls": _compact(tool_calls),
            "metadata": _compact(metadata or {}),
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return reasoning_trace_id
