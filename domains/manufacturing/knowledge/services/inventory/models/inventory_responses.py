from typing import Optional

from pydantic import BaseModel

from services.inventory.models.inventory_enums import InventoryStatus
from services.inventory.models.inventory_state import ProductInventoryRecord
from services.inventory.models.inventory_transactions import InventoryTransactionRecord


class PaginatedProductInventoryResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ProductInventoryRecord]


class PaginatedInventoryTransactionResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[InventoryTransactionRecord]


class InventorySummaryLocation(BaseModel):
    location_id: str
    location_name: str
    on_hand: float
    available: float
    status: InventoryStatus


class InventorySummary(BaseModel):
    product_id: str
    sku: str
    product_name: str
    total_on_hand: float
    total_reserved: float
    total_available: float
    total_incoming: float
    locations_count: int
    locations: list[InventorySummaryLocation]
    is_below_reorder: bool
    estimated_reorder_value: Optional[float] = None
    currency: str
