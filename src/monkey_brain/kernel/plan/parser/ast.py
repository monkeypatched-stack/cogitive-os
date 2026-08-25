from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class EntityRef:
    type: str
    value: str


@dataclass(slots=True)
class Filter:
    field: str
    operator: str
    value: Any


@dataclass(slots=True)
class IntentAST:
    raw_query: str
    verb: str
    target: str | None = None
    entities: list[EntityRef] = field(default_factory=list)
    filters: list[Filter] = field(default_factory=list)
    projections: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
