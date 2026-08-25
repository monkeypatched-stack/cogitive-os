from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from services.procurement.models.purchase_orders import PurchaseOrder
from services.products.models.product_common import UnitOfMeasure


class GoodsReceiptStatus(str, Enum):
    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    QC_HOLD = "QC Hold"
    RELEASED = "Released"
    REJECTED = "Rejected"
    PARTIAL = "Partial"


class Attachment(BaseModel):
    attachment_id: UUID = Field(default_factory=uuid4)
    file_name: str
    file_url: str | None = None
    content_type: str | None = None
    uploaded_by: str | None = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditInfo(BaseModel):
    created_by: str | None = None
    updated_by: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReceivedLineItem(BaseModel):
    """One line of a Goods Receipt, linked to a PO line."""

    gr_line_id: str = Field(default_factory=lambda: str(uuid4()))
    po_line_id: str
    material_code: str
    received_qty: Decimal
    unit_of_measure: UnitOfMeasure
    batch_lot_number: Optional[str] = None
    expiry_date: Optional[datetime] = None
    manufacture_date: Optional[datetime] = None
    storage_location: Optional[str] = None
    pallet_ids: list[str] = Field(default_factory=list)
    barcode_scanned: Optional[str] = None
    qty_discrepancy: Optional[Decimal] = None
    damage_noted: bool = False
    damage_photos: list[Attachment] = Field(default_factory=list)
    notes: Optional[str] = None


class GoodsReceipt(BaseModel):
    """
    Inbound goods receipt transaction.
    Created when physical goods arrive at the facility.
    """

    gr_number: str
    gr_id: str = Field(default_factory=lambda: str(uuid4()))
    po: PurchaseOrder
    delivery_note_no: Optional[str] = None
    carrier_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    received_by: str
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dock_location: Optional[str] = None
    status: GoodsReceiptStatus = GoodsReceiptStatus.DRAFT
    lines: list[ReceivedLineItem]
    quarantine_label_printed: bool = False
    qc_notification_sent: bool = False
    attachments: list[Attachment] = Field(default_factory=list)
    audit: AuditInfo = Field(default_factory=AuditInfo)
    metadata: dict[str, Any] | None = None

    @field_validator("lines")
    @classmethod
    def at_least_one_line(cls, value: list) -> list:
        if not value:
            raise ValueError("A Goods Receipt must have at least one line item.")
        return value


class GoodsReceiptCreate(GoodsReceipt):
    """Schema for creating goods receipts."""


class GoodsReceiptUpdate(BaseModel):
    delivery_note_no: Optional[str] = None
    carrier_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    received_by: Optional[str] = None
    received_at: Optional[datetime] = None
    dock_location: Optional[str] = None
    status: Optional[GoodsReceiptStatus] = None
    lines: Optional[list[ReceivedLineItem]] = None
    quarantine_label_printed: Optional[bool] = None
    qc_notification_sent: Optional[bool] = None
    attachments: Optional[list[Attachment]] = None
    audit: Optional[AuditInfo] = None
    metadata: dict[str, Any] | None = None


class GoodsReceiptResponse(GoodsReceipt):
    model_config = ConfigDict(from_attributes=True)


class PaginatedGoodsReceiptResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[GoodsReceiptResponse]


class QuarantineHold(BaseModel):
    """Quarantine record placed automatically on GR, lifted after QC clearance."""

    hold_id: UUID = Field(default_factory=uuid4)
    gr_id: UUID
    material_code: str
    batch_lot_no: str
    qty_on_hold: Decimal
    uom: UnitOfMeasure
    hold_location: str
    held_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    released_at: Optional[datetime] = None
    released_by: Optional[str] = None
    release_reason: Optional[str] = None
    is_active: bool = True

    @model_validator(mode="after")
    def deactivate_when_released(self):
        if self.released_at is not None:
            self.is_active = False
        return self


class QuarantineHoldCreate(QuarantineHold):
    """Schema for creating quarantine holds."""


class QuarantineHoldUpdate(BaseModel):
    qty_on_hold: Optional[Decimal] = None
    uom: Optional[UnitOfMeasure] = None
    hold_location: Optional[str] = None
    released_at: Optional[datetime] = None
    released_by: Optional[str] = None
    release_reason: Optional[str] = None
    is_active: Optional[bool] = None


class QuarantineHoldResponse(QuarantineHold):
    model_config = ConfigDict(from_attributes=True)


class PaginatedQuarantineHoldResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[QuarantineHoldResponse]
