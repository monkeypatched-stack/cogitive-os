"""SDK Models."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Pipeline:
    pipeline_id: str = ""
    steps: list["PipelineStep"] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineStep:
    step_id: str = ""
    capability_name: str = ""
    inputs: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionResult:
    pipeline_id: str = ""
    success: bool = False
    steps: list[dict[str, Any]] = field(default_factory=list)
    final_state: dict[str, Any] = field(default_factory=dict)
    total_latency_ms: float = 0.0
