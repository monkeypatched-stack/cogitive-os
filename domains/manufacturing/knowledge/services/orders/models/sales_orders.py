from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.products.models.product_common import utc_now


class SalesOrderStatus(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    ALLOCATED = "allocated"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class SalesOrderLine(BaseModel):
    line_id: str | None = None
    product_id: str | None = None
    sku: str = Field(..., min_length=1)
    product_name: str | None = None
    workflow_id: str | None = None
    workflow_name: str | None = None
    quantity: float = Field(..., gt=0)
    unit_of_measure: str = "piece"
    unit_price: float = Field(default=0, ge=0)
    discount_amount: float = Field(default=0, ge=0)
    tax_amount: float = Field(default=0, ge=0)
    line_total: float | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def compute_line_total(self):
        self.line_total = round(
            (self.quantity * self.unit_price) - self.discount_amount + self.tax_amount,
            2,
        )
        return self


class SalesOrderBase(BaseModel):
    sales_order_number: str | None = None
    customer_id: str = Field(..., min_length=1)
    customer_name: str | None = None
    order_date: datetime = Field(default_factory=utc_now)
    requested_delivery_date: datetime | None = None
    promised_delivery_date: datetime | None = None
    status: SalesOrderStatus = SalesOrderStatus.DRAFT

    currency: str = Field(default="USD", min_length=3, max_length=3)
    lines: list[SalesOrderLine] = Field(default_factory=list)

    subtotal: float | None = Field(default=None, ge=0)
    discount_total: float = Field(default=0, ge=0)
    tax_total: float = Field(default=0, ge=0)
    shipping_total: float = Field(default=0, ge=0)
    grand_total: float | None = Field(default=None, ge=0)

    payment_terms: str | None = None
    payment_status: str | None = None
    shipping_address: str | None = None
    billing_address: str | None = None
    sales_channel: str | None = None
    salesperson_id: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None

    created_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def compute_totals(self):
        lines_subtotal = round(
            sum(line.quantity * line.unit_price for line in self.lines),
            2,
        )
        lines_discount = round(sum(line.discount_amount for line in self.lines), 2)
        lines_tax = round(sum(line.tax_amount for line in self.lines), 2)

        self.subtotal = lines_subtotal
        self.discount_total = max(self.discount_total, lines_discount)
        self.tax_total = max(self.tax_total, lines_tax)
        self.grand_total = round(
            self.subtotal - self.discount_total + self.tax_total + self.shipping_total,
            2,
        )
        return self


class SalesOrderCreate(SalesOrderBase):
    """Schema for creating a sales order."""


class SalesOrderUpdate(BaseModel):
    sales_order_number: str | None = None
    customer_id: str | None = None
    customer_name: str | None = None
    order_date: datetime | None = None
    requested_delivery_date: datetime | None = None
    promised_delivery_date: datetime | None = None
    status: SalesOrderStatus | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    lines: list[SalesOrderLine] | None = None
    discount_total: float | None = Field(default=None, ge=0)
    tax_total: float | None = Field(default=None, ge=0)
    shipping_total: float | None = Field(default=None, ge=0)
    payment_terms: str | None = None
    payment_status: str | None = None
    shipping_address: str | None = None
    billing_address: str | None = None
    sales_channel: str | None = None
    salesperson_id: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None


class SalesOrderResponse(SalesOrderBase):
    id: str
    sales_order_id: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedSalesOrderResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[SalesOrderResponse]
