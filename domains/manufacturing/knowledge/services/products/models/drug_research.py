from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

from services.products.models.product_common import ensure_utc, utc_now


class DrugFormulationResearchRecord(BaseModel):
    research_product_id: str = Field(..., min_length=1)
    generic_name: str = Field(..., min_length=1)
    formulation_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer_name: Optional[str] = None
    manufacturer_site: Optional[str] = None
    country: str = "India"
    source_authority: str = Field(default="Unspecified", min_length=1)
    source_url: Optional[str] = None
    source_record_id: Optional[str] = None
    approval_number: Optional[str] = None
    approval_date: Optional[datetime] = None
    dosage_form: Optional[str] = None
    route: Optional[str] = None
    strength: Optional[str] = None
    composition: list[str] = Field(default_factory=list)
    therapeutic_class: Optional[str] = None
    indications: list[str] = Field(default_factory=list)
    schedule: Optional[str] = None
    regulatory_status: Optional[str] = None
    product_category: Optional[str] = None
    storage_requirements: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_dates_and_aliases(self) -> "DrugFormulationResearchRecord":
        self.approval_date = ensure_utc(self.approval_date)
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        aliases = {
            item.strip()
            for item in [
                self.generic_name,
                self.formulation_name,
                self.brand_name,
                *self.composition,
                *self.aliases,
            ]
            if isinstance(item, str) and item.strip()
        }
        self.aliases = sorted(aliases)
        return self


class DrugFormulationResearchCreate(DrugFormulationResearchRecord):
    pass


class DrugFormulationResearchUpdate(BaseModel):
    generic_name: Optional[str] = None
    formulation_name: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer_name: Optional[str] = None
    manufacturer_site: Optional[str] = None
    country: Optional[str] = None
    source_authority: Optional[str] = None
    source_url: Optional[str] = None
    source_record_id: Optional[str] = None
    approval_number: Optional[str] = None
    approval_date: Optional[datetime] = None
    dosage_form: Optional[str] = None
    route: Optional[str] = None
    strength: Optional[str] = None
    composition: Optional[list[str]] = None
    therapeutic_class: Optional[str] = None
    indications: Optional[list[str]] = None
    schedule: Optional[str] = None
    regulatory_status: Optional[str] = None
    product_category: Optional[str] = None
    storage_requirements: Optional[str] = None
    tags: Optional[list[str]] = None
    aliases: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


class DrugAlternative(BaseModel):
    research_product_id: str
    display_name: str
    generic_name: str
    dosage_form: Optional[str] = None
    route: Optional[str] = None
    strength: Optional[str] = None
    manufacturer_name: Optional[str] = None
    therapeutic_class: Optional[str] = None
    score: float
    reason: str


class DrugResearchSearchResponse(BaseModel):
    query: str
    elasticsearch: dict[str, Any]
    direct_matches: list[DrugFormulationResearchRecord]
    alternatives: list[DrugAlternative]
    document_matches: list[dict[str, Any]] = Field(default_factory=list)


class ProductSimilarityCanvasNode(BaseModel):
    id: str
    type: str
    label: str
    data: dict[str, Any] = Field(default_factory=dict)


class ProductSimilarityCanvasEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    data: dict[str, Any] = Field(default_factory=dict)


class ProductSimilarityCanvasResponse(BaseModel):
    query: str
    data_sources: dict[str, Any]
    nodes: list[ProductSimilarityCanvasNode]
    edges: list[ProductSimilarityCanvasEdge]


class PaginatedDrugResearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[DrugFormulationResearchRecord]
