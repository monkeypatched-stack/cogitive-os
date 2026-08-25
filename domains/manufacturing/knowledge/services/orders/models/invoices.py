from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    SENT = "sent"
    VIEWED = "viewed"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class RecurringFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class SendStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    DOWNLOADED = "downloaded"
    FAILED = "failed"


class NoteType(str, Enum):
    INTERNAL = "internal"
    CUSTOMER = "customer"
    TERMS = "terms"
    PAYMENT_INSTRUCTIONS = "payment_instructions"


class SourceType(str, Enum):
    MANUAL = "manual"
    QUOTE = "quote"
    ESTIMATE = "estimate"
    SALES_ORDER = "sales_order"
    RECURRING = "recurring"
    BULK_IMPORT = "bulk_import"


class TaxDetail(BaseModel):
    rate: Optional[str] = None
    amount: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class Seller(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    gstin_uin: Optional[str] = None
    gstin: Optional[str] = None
    state_name: Optional[str] = None
    state_code: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class Buyer(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    gstin_uin: Optional[str] = None
    gstin: Optional[str] = None
    state_name: Optional[str] = None
    state_code: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    customer_id: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class InvoiceDetails(BaseModel):
    invoice_no: Optional[str] = None
    date: Optional[str] = None
    due_date: Optional[str] = None
    payment_terms: Optional[str] = None
    ack_no: Optional[str] = None
    ack_date: Optional[str] = None
    irn: Optional[str] = None
    challan_no: Optional[str] = None
    challan_date: Optional[str] = None
    reverse_charge: Optional[str] = None
    lr_no: Optional[str] = None
    transport: Optional[str] = None
    transport_id: Optional[str] = None
    vehicle_number: Optional[str] = None
    po_number: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class InvoiceItem(BaseModel):
    sl_no: Optional[str] = None
    si_no: Optional[str] = None
    product_id: Optional[str] = None
    description: Optional[str] = None
    hsn_sac: Optional[str] = None
    quantity: Optional[str] = None
    rate: Optional[str] = None
    per: Optional[str] = None
    discount: Optional[str] = None
    taxable_value: Optional[str] = None
    amount: Optional[str] = None
    cgst: Optional[TaxDetail | Dict[str, Any]] = None
    sgst: Optional[TaxDetail | Dict[str, Any]] = None
    igst: Optional[TaxDetail | Dict[str, Any]] = None
    total: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class InvoiceTotal(BaseModel):
    taxable_value: Optional[str] = None
    cgst_amount: Optional[str] = None
    sgst_amount: Optional[str] = None
    igst_amount: Optional[str] = None
    total_tax_amount: Optional[str] = None
    grand_total: Optional[str] = None
    total_amount: Optional[str] = None
    total_quantity: Optional[str] = None
    amount_paid: Optional[str] = "0"
    balance_due: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class BankDetails(BaseModel):
    bank_name: Optional[str] = None
    branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class InvoiceAttachment(BaseModel):
    id: Optional[str] = None
    file_name: str
    file_url: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    category: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=utc_now)
    uploaded_by: Optional[str] = None


class InvoiceNote(BaseModel):
    note_type: NoteType
    content: str
    created_at: datetime = Field(default_factory=utc_now)
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None


class InvoiceVersion(BaseModel):
    version: int
    data_snapshot: Dict[str, Any]
    changes_summary: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    created_by: Optional[str] = None
    reason: Optional[str] = None


class InvoiceSendLog(BaseModel):
    sent_at: datetime = Field(default_factory=utc_now)
    to: List[EmailStr]
    cc: List[EmailStr] = Field(default_factory=list)
    bcc: List[EmailStr] = Field(default_factory=list)
    status: SendStatus
    provider_response: Optional[Dict[str, Any]] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    downloaded_at: Optional[datetime] = None
    delivery_confirmed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    sent_by: Optional[str] = None


class ScheduledSend(BaseModel):
    scheduled_for: datetime
    timezone: str = "UTC"
    to: List[EmailStr]
    cc: List[EmailStr] = Field(default_factory=list)
    bcc: List[EmailStr] = Field(default_factory=list)
    status: str = "queued"
    created_at: datetime = Field(default_factory=utc_now)
    sent_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None


class InvoiceShareLink(BaseModel):
    token: str
    expires_at: Optional[datetime] = None
    password_protected: bool = False
    password_hash: Optional[str] = None
    view_count: int = 0
    last_accessed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    created_by: Optional[str] = None
    is_active: bool = True


class RecurringInvoiceConfig(BaseModel):
    frequency: RecurringFrequency
    start_date: datetime
    end_date: Optional[datetime] = None
    occurrences: Optional[int] = None
    occurrences_completed: int = 0
    auto_send: bool = True
    auto_apply_payment_terms: bool = True
    paused: bool = False
    last_generated_at: Optional[datetime] = None
    next_generation_date: Optional[datetime] = None
    notify_before_generation: bool = True
    notification_days_before: int = 3
    allow_preview: bool = True
    allow_edit_before_send: bool = True


class SourceReference(BaseModel):
    source_type: SourceType
    source_id: Optional[str] = None
    source_number: Optional[str] = None
    conversion_date: Optional[datetime] = None
    converted_by: Optional[str] = None


class BulkImportInfo(BaseModel):
    batch_id: str
    import_date: datetime = Field(default_factory=utc_now)
    source_file: str
    row_number: Optional[int] = None
    validation_errors: List[str] = Field(default_factory=list)


class CustomerPortalAccess(BaseModel):
    enabled: bool = True
    customer_user_id: Optional[str] = None
    last_login: Optional[datetime] = None
    login_count: int = 0


class InvoiceTrackingEvent(BaseModel):
    event_type: str
    timestamp: datetime = Field(default_factory=utc_now)
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class Invoice(BaseModel):
    id: Optional[str] = None
    seller: Optional[Seller] = None
    buyer: Optional[Buyer] = None
    invoice_details: Optional[InvoiceDetails] = None
    items: List[InvoiceItem] = Field(default_factory=list)
    total: Optional[InvoiceTotal] = None
    bank_details: Optional[BankDetails] = None
    amount_in_words: Optional[str] = None
    tax_amount_in_words: Optional[str] = None
    declaration: Optional[str] = None
    status: InvoiceStatus = InvoiceStatus.DRAFT
    source_reference: Optional[SourceReference] = None
    bulk_import_info: Optional[BulkImportInfo] = None
    attachments: List[InvoiceAttachment] = Field(default_factory=list)
    notes: List[InvoiceNote] = Field(default_factory=list)
    versions: List[InvoiceVersion] = Field(default_factory=list)
    current_version: int = 1
    send_logs: List[InvoiceSendLog] = Field(default_factory=list)
    scheduled_sends: List[ScheduledSend] = Field(default_factory=list)
    share_links: List[InvoiceShareLink] = Field(default_factory=list)
    tracking_events: List[InvoiceTrackingEvent] = Field(default_factory=list)
    recurring: Optional[RecurringInvoiceConfig] = None
    parent_recurring_invoice_id: Optional[str] = None
    customer_portal_access: Optional[CustomerPortalAccess] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra="allow",
        json_encoders={ObjectId: str, datetime: lambda value: value.isoformat()},
    )


class InvoiceCreate(BaseModel):
    seller: Optional[Seller] = None
    buyer: Optional[Buyer] = None
    invoice_details: Optional[InvoiceDetails] = None
    items: List[InvoiceItem] = Field(default_factory=list)
    total: Optional[InvoiceTotal] = None
    bank_details: Optional[BankDetails] = None
    amount_in_words: Optional[str] = None
    tax_amount_in_words: Optional[str] = None
    declaration: Optional[str] = None
    status: InvoiceStatus = InvoiceStatus.DRAFT
    source_reference: Optional[SourceReference] = None
    recurring: Optional[RecurringInvoiceConfig] = None
    notes: List[InvoiceNote] = Field(default_factory=list)
    attachments: List[InvoiceAttachment] = Field(default_factory=list)
    created_by: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class InvoiceUpdate(BaseModel):
    seller: Optional[Seller] = None
    buyer: Optional[Buyer] = None
    invoice_details: Optional[InvoiceDetails] = None
    items: Optional[List[InvoiceItem]] = None
    total: Optional[InvoiceTotal] = None
    bank_details: Optional[BankDetails] = None
    amount_in_words: Optional[str] = None
    tax_amount_in_words: Optional[str] = None
    declaration: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    attachments: Optional[List[InvoiceAttachment]] = None
    notes: Optional[List[InvoiceNote]] = None
    recurring: Optional[RecurringInvoiceConfig] = None
    updated_by: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class BulkSendRequest(BaseModel):
    invoice_ids: List[str]
    to: Optional[List[EmailStr]] = None
    cc: List[EmailStr] = Field(default_factory=list)
    bcc: List[EmailStr] = Field(default_factory=list)
    schedule_for: Optional[datetime] = None
    timezone: str = "UTC"


class ShareLinkRequest(BaseModel):
    invoice_id: str
    expires_in_days: Optional[int] = 30
    password_protected: bool = False
    password: Optional[str] = None


class ScheduledSendRequest(BaseModel):
    invoice_id: str
    scheduled_for: datetime
    timezone: str = "UTC"
    to: List[EmailStr]
    cc: List[EmailStr] = Field(default_factory=list)
    bcc: List[EmailStr] = Field(default_factory=list)


class BulkInvoiceRow(BaseModel):
    seller_name: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_email: Optional[EmailStr] = None
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: Optional[str] = None


class BulkCreateRequest(BaseModel):
    batch_id: str
    invoices: List[BulkInvoiceRow]
    validate_only: bool = False
    auto_send: bool = False


class ConvertToInvoiceRequest(BaseModel):
    source_type: SourceType
    source_id: str
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    auto_send: bool = False
    override_data: Optional[Dict[str, Any]] = None


class VersionRestoreRequest(BaseModel):
    invoice_id: str
    version: int
    reason: Optional[str] = None


class InvoiceResponse(Invoice):
    model_config = ConfigDict(from_attributes=True, extra="allow")


class PaginatedInvoiceResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[InvoiceResponse]
