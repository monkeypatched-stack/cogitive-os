"""Canvas UI graph schemas — spatial node and edge representations for the frontend."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CanvasGraphNode:
    node_id: str = ""
    entity_id: str = ""
    collection: str = ""
    name: str = ""
    x: float | None = None
    y: float | None = None
    properties: dict = field(default_factory=dict)


@dataclass
class CanvasGraphEdge:
    edge_id: str = ""
    source_node_id: str = ""
    target_node_id: str = ""
    relationship_type: str | None = None
    label: str | None = None
    properties: dict = field(default_factory=dict)
