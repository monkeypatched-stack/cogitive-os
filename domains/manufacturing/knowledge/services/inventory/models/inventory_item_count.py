from enum import Enum
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from services.products.models.product_common import utc_now


class ItemType(str, Enum):
    COMPONENT = "component"
    PRODUCT = "product"
    SPARE_PART = "spare_part"
    RAW_MATERIAL = "raw_material"


class UnitOfMeasure(str, Enum):
    PIECE = "piece"
    BOX = "box"
    PALLET = "pallet"
    OTHER = "other"


class InventoryItemCountBase(BaseModel):
    item_type: ItemType
    sku: str = Field(..., min_length=1, description="Stock Keeping Unit")
    srn: str | None = Field(None, description="Serial Reference Number")
    count: int = Field(ge=0, description="Count of units on hand")
    unit_of_measure: UnitOfMeasure = Field(
        ...,
        description="Unit of measure for the quantity (e.g., pieces, boxes, pallets)",
    )
    warehouse_id: str | None = None
    bin_location: str | None = None
    counted_by: str | None = None
    counted_at: datetime = Field(default_factory=utc_now)


class InventoryItemCountCreate(InventoryItemCountBase):
    """Schema for creating an inventory item count."""


class InventoryItemCountUpdate(BaseModel):
    item_type: ItemType | None = None
    sku: str | None = None
    srn: str | None = None
    count: int | None = Field(default=None, ge=0)
    unit_of_measure: UnitOfMeasure | None = None
    warehouse_id: str | None = None
    bin_location: str | None = None
    counted_by: str | None = None
    counted_at: datetime | None = None


class InventoryItemCountResponse(InventoryItemCountBase):
    id: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedInventoryItemCountResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[InventoryItemCountResponse]
