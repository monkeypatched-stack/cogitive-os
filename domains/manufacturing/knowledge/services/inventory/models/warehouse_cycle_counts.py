from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.products.models.product_common import utc_now


class CycleCountScope(str, Enum):
    WAREHOUSE = "warehouse"
    LOCATION = "location"
    BIN = "bin"
    SKU = "sku"


class CycleCountStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WarehouseCycleCountBase(BaseModel):
    warehouse_id: str = Field(..., min_length=1)
    cycle_count_number: str | None = None
    scope: CycleCountScope = CycleCountScope.WAREHOUSE
    status: CycleCountStatus = CycleCountStatus.PLANNED

    location_id: str | None = None
    bin_location: str | None = None
    sku: str | None = None
    product_id: str | None = None

    expected_count: int | None = Field(default=None, ge=0)
    counted_count: int | None = Field(default=None, ge=0)
    expected_quantity: float | None = Field(default=None, ge=0)
    counted_quantity: float | None = Field(default=None, ge=0)
    unit_of_measure: str | None = None

    variance_count: int | None = None
    variance_quantity: float | None = None

    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    counted_by: str | None = None
    approved_by: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None

    created_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def compute_variances(self):
        if self.scope == CycleCountScope.LOCATION and not self.location_id:
            raise ValueError("location_id is required when scope is location")
        if self.scope == CycleCountScope.BIN and not self.bin_location:
            raise ValueError("bin_location is required when scope is bin")
        if self.scope == CycleCountScope.SKU and not self.sku:
            raise ValueError("sku is required when scope is sku")

        has_count = self.expected_count is not None or self.counted_count is not None
        has_quantity = (
            self.expected_quantity is not None or self.counted_quantity is not None
        )
        if not has_count and not has_quantity:
            raise ValueError("Provide count or quantity fields for the cycle count")

        if self.expected_count is not None and self.counted_count is not None:
            self.variance_count = self.counted_count - self.expected_count
        if self.expected_quantity is not None and self.counted_quantity is not None:
            self.variance_quantity = round(
                self.counted_quantity - self.expected_quantity,
                4,
            )
        return self


class WarehouseCycleCountCreate(WarehouseCycleCountBase):
    """Schema for creating warehouse cycle count records."""


class WarehouseCycleCountUpdate(BaseModel):
    warehouse_id: str | None = None
    cycle_count_number: str | None = None
    scope: CycleCountScope | None = None
    status: CycleCountStatus | None = None
    location_id: str | None = None
    bin_location: str | None = None
    sku: str | None = None
    product_id: str | None = None
    expected_count: int | None = Field(default=None, ge=0)
    counted_count: int | None = Field(default=None, ge=0)
    expected_quantity: float | None = Field(default=None, ge=0)
    counted_quantity: float | None = Field(default=None, ge=0)
    unit_of_measure: str | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    counted_by: str | None = None
    approved_by: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None


class WarehouseCycleCountResponse(WarehouseCycleCountBase):
    id: str
    cycle_count_id: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedWarehouseCycleCountResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[WarehouseCycleCountResponse]
