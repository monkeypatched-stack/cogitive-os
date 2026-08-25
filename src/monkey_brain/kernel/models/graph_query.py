"""GraphRAG query request/response schemas."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.monkey_brain.kernel.models.graph import SemanticHit, GraphPath


@dataclass
class GraphRagQueryRequest:
    question: str = ""
    top_k: int = 8
    user_id: str | None = None
    role: str | None = None
    session_id: str | None = None


@dataclass
class GraphRagQueryResponse:
    question: str = ""
    answer: str = ""
    semantic_hits: list[SemanticHit] = field(default_factory=list)
    graph_paths: list[GraphPath] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    llm_answered: bool = False
    user_id: str | None = None
    role: str | None = None
    session_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
