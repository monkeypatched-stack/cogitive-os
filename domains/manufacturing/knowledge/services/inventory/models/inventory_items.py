from decimal import Decimal
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InventoryItemModel(BaseModel):
    # Primary identifiers
    sku: str = Field(
        ...,
        description="Stock Keeping Unit. Unique alphanumeric identifier.",
        min_length=3,
        max_length=50,
    )
    name: str = Field(..., description="Name of the inventory item.", min_length=1)
    description: str | None = Field(None, description="Detailed product description.")
    category: str = Field(
        ...,
        description="Product category (e.g., Raw Materials, Electronics, Packaging).",
    )

    # Stock quantities and multi-location
    warehouse_id: str = Field(
        ...,
        description="ID of the physical warehouse holding this stock.",
    )
    bin_location: str | None = Field(
        None,
        description="Specific aisle/shelf/bin location within the warehouse.",
    )
    quantity_on_hand: int = Field(
        0,
        description="Physical inventory currently present in the warehouse.",
        ge=0,
    )
    quantity_allocated: int = Field(
        0,
        description="Stock reserved for pending customer orders.",
        ge=0,
    )
    quantity_available: int = Field(
        0,
        description="Net stock available for new orders (On Hand - Allocated).",
        ge=0,
    )

    # Reorder points and thresholds
    reorder_point: int = Field(
        ...,
        description="Minimum stock level that triggers an automatic reorder alert.",
        ge=0,
    )
    max_stock_level: int = Field(
        ...,
        description="Maximum storage capacity for this item to prevent overstocking.",
        ge=1,
    )
    lead_time_days: int = Field(
        14,
        description="Average days required to receive stock from the supplier after ordering.",
        ge=0,
    )

    # Financial and valuation metrics
    cost_price: Decimal = Field(
        ...,
        description="Unit cost paid to the supplier.",
        ge=Decimal("0.00"),
    )
    retail_price: Decimal = Field(
        ...,
        description="Standard selling price to consumers.",
        ge=Decimal("0.00"),
    )
    currency: str = Field(
        "USD",
        description="Three-letter ISO currency code.",
        min_length=3,
        max_length=3,
    )

    # Supplier linkage
    supplier_id: str = Field(
        ...,
        description="Associated supplier ID managing this capability/product.",
    )

    # Status flags
    is_active: bool = Field(
        True,
        description="Indicates if the item is actively being sold or ordered.",
    )
    requires_inspection: bool = Field(
        False,
        description="Flag for whether incoming stock needs Quality Assurance testing.",
    )

    # System timestamps
    last_counted_at: datetime | None = Field(
        None,
        description="Timestamp of the last physical inventory audit/cycle count.",
    )

    @field_validator("quantity_available")
    @classmethod
    def validate_available_qty(cls, value: int, info) -> int:
        data = info.data
        if "quantity_on_hand" in data and "quantity_allocated" in data:
            expected = data["quantity_on_hand"] - data["quantity_allocated"]
            if value != expected:
                raise ValueError(
                    f"quantity_available ({value}) must equal "
                    f"quantity_on_hand - quantity_allocated ({expected})"
                )
        return value

    @field_validator("max_stock_level")
    @classmethod
    def validate_stock_ceilings(cls, value: int, info) -> int:
        data = info.data
        if "reorder_point" in data and value <= data["reorder_point"]:
            raise ValueError("max_stock_level must be greater than the reorder_point")
        return value


class InventoryItemCreate(InventoryItemModel):
    """Schema for POST requests to create inventory."""


class InventoryItemUpdate(BaseModel):
    """Schema for PATCH requests. All fields are optional for partial updates."""

    name: str | None = None
    description: str | None = None
    category: str | None = None
    warehouse_id: str | None = None
    bin_location: str | None = None
    quantity_on_hand: int | None = None
    quantity_allocated: int | None = None
    quantity_available: int | None = None
    reorder_point: int | None = None
    max_stock_level: int | None = None
    lead_time_days: int | None = None
    cost_price: Decimal | None = None
    retail_price: Decimal | None = None
    currency: str | None = None
    supplier_id: str | None = None
    is_active: bool | None = None
    requires_inspection: bool | None = None
    last_counted_at: datetime | None = None


class InventoryItemResponse(InventoryItemModel):
    """Schema for standard API responses, including system tracking IDs."""

    id: str = Field(..., description="Unique database item record ID.")
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedInventoryResponse(BaseModel):
    """Schema for listing paginated stock indexes."""

    total: int
    page: int
    page_size: int
    results: list[InventoryItemResponse]
