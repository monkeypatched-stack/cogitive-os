from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.products.models.product_common import utc_now


class CycleCountStatus(str, Enum):
    DRAFT = "Draft"
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In-Progress"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class CycleCountScope(str, Enum):
    WAREHOUSE = "Warehouse"
    LOCATION = "Location"
    SKU = "SKU"
    BIN = "Bin"


class CycleCountLine(BaseModel):
    sku: str = Field(..., min_length=1)
    inventory_id: str | None = None
    location_id: str | None = None
    bin_location: str | None = None
    system_quantity: float = Field(default=0, ge=0)
    counted_quantity: float | None = Field(default=None, ge=0)
    unit_of_measure: str = Field(default="piece", min_length=1)
    variance_quantity: float = 0
    variance_reason: str | None = None
    counted_by: str | None = None
    counted_at: datetime | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def compute_variance(self):
        if self.counted_quantity is not None:
            self.variance_quantity = self.counted_quantity - self.system_quantity
        return self


class CycleCountBase(BaseModel):
    warehouse_id: str = Field(..., min_length=1)
    scope: CycleCountScope = CycleCountScope.WAREHOUSE
    location_id: str | None = None
    bin_location: str | None = None
    sku: str | None = None
    status: CycleCountStatus = CycleCountStatus.DRAFT
    scheduled_date: date | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    assigned_to: str | None = None
    created_by: str | None = None
    lines: list[CycleCountLine] = Field(default_factory=list)
    notes: str | None = None
    metadata: dict[str, Any] | None = None


class CycleCountCreate(CycleCountBase):
    """Schema for scheduling or creating a warehouse cycle count."""


class CycleCountUpdate(BaseModel):
    warehouse_id: str | None = None
    scope: CycleCountScope | None = None
    location_id: str | None = None
    bin_location: str | None = None
    sku: str | None = None
    status: CycleCountStatus | None = None
    scheduled_date: date | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    assigned_to: str | None = None
    created_by: str | None = None
    lines: list[CycleCountLine] | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None
    updated_by: str | None = None


class CycleCountResponse(CycleCountBase):
    id: str
    cycle_count_id: str
    updated_by: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(from_attributes=True)


class PaginatedCycleCountResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[CycleCountResponse]
