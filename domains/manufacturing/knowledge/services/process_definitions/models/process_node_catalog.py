from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ProcessNodeCatalogItem(BaseModel):
    type: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    key: str = Field(..., min_length=1)
    description: Optional[str] = None
    config_schema: dict[str, Any] = Field(default_factory=dict)
    defaults: dict[str, Any] = Field(default_factory=dict)


class ProcessNodeCatalogCategory(BaseModel):
    category: str = Field(..., min_length=1)
    nodes: list[ProcessNodeCatalogItem] = Field(default_factory=list)


class ProcessNodeCatalogResponse(BaseModel):
    categories: list[ProcessNodeCatalogCategory] = Field(default_factory=list)
    nodes: list[ProcessNodeCatalogItem] = Field(default_factory=list)
