from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from services.inventory.models.inventory_enums import (
    InventoryTransactionType,
    ReferenceType,
    StockMovementDirection,
)
from services.products.models.product_common import ensure_utc, utc_now


class InventoryTransactionBase(BaseModel):
    inventory_id: str
    product_id: str
    location_id: str
    reference_type: Optional[ReferenceType] = None
    reference_id: Optional[str] = None
    transaction_type: InventoryTransactionType
    direction: StockMovementDirection
    quantity: float = Field(..., gt=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)
    batch_number: Optional[str] = None
    serial_numbers: Optional[list[str]] = None
    expiry_date: Optional[date] = None
    from_location_id: Optional[str] = None
    to_location_id: Optional[str] = None
    reason_code: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("direction", mode="before")
    @classmethod
    def normalize_direction(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value


class InventoryTransactionRecord(InventoryTransactionBase):
    transaction_id: str
    total_value: Optional[float] = None
    posted: bool = False
    posted_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def compute_values(self) -> "InventoryTransactionRecord":
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        self.posted_at = ensure_utc(self.posted_at)

        if self.unit_cost is not None:
            self.total_value = round(self.quantity * self.unit_cost, 2)
        return self


class InventoryTransactionCreate(InventoryTransactionBase):
    pass


class InventoryTransactionUpdate(BaseModel):
    reference_type: Optional[ReferenceType] = None
    reference_id: Optional[str] = None
    transaction_type: Optional[InventoryTransactionType] = None
    direction: Optional[StockMovementDirection] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    unit_cost: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    updated_by: Optional[str] = None

    @field_validator("direction", mode="before")
    @classmethod
    def normalize_direction(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value
