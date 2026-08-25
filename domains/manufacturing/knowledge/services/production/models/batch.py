"""
Batch - First-class entity for production batch management.

Represents a production batch/lot with:
- Unique identification (batch_id/lot_number)
- Product information
- Size/quantity
- Route (manufacturing route)
- Template version (SOP/process template)
- Execution state
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BatchStatus(str, Enum):
    """Batch lifecycle states."""

    CREATED = "created"  # Just created, not started
    PLANNING = "planning"  # Planning stage
    READY = "ready"  # Ready for execution
    IN_PROGRESS = "in_progress"  # Currently executing
    ON_HOLD = "on_hold"  # Paused/held
    COMPLETED = "completed"  # Successfully completed
    FAILED = "failed"  # Failed
    CANCELLED = "cancelled"  # Cancelled


class BatchSize(BaseModel):
    """Batch size specification."""

    quantity: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=50)  # "kg", "L", "units", etc.

    def __str__(self) -> str:
        return f"{self.quantity}{self.unit}"


class BatchRoute(BaseModel):
    """Manufacturing route information."""

    route_id: str = Field(..., min_length=1)
    route_name: str = Field(..., min_length=1)
    version: str = Field(default="1.0")
    description: Optional[str] = Field(None, max_length=1000)


class BatchTemplate(BaseModel):
    """Batch processing template (SOP/Process)."""

    template_id: str = Field(..., min_length=1)
    template_name: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)  # e.g., "2.1.0"
    revision: Optional[str] = Field(None)
    effective_date: Optional[datetime] = None


class Product(BaseModel):
    """Product information."""

    product_id: str = Field(..., min_length=1)
    product_name: str = Field(..., min_length=1)
    sku: str = Field(..., min_length=1)
    product_code: Optional[str] = None
    category: Optional[str] = None


class Batch(BaseModel):
    """Production Batch - First-class entity."""

    model_config = ConfigDict(str_strip_whitespace=True)

    # Identity
    batch_id: str = Field(default_factory=lambda: str(uuid4()))
    lot_number: str = Field(..., min_length=1, description="Unique lot/batch number")

    # Product & Manufacturing Info
    product: Product = Field(..., description="Product being manufactured")
    size: BatchSize = Field(..., description="Batch size/quantity")
    route: BatchRoute = Field(..., description="Manufacturing route")
    template: BatchTemplate = Field(..., description="Processing template/SOP")

    # State
    status: BatchStatus = Field(default=BatchStatus.CREATED)
    quantity_produced: Optional[float] = Field(None, ge=0)
    quantity_waste: Optional[float] = Field(None, ge=0)
    yield_percentage: Optional[float] = Field(None, ge=0, le=100)

    # Scheduling
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None

    # Quality & Tracking
    quality_status: Optional[str] = None  # "pass", "fail", "pending"
    test_results: dict = Field(default_factory=dict)

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    workstation_id: Optional[str] = None
    operator_id: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("batch_id", "lot_number", mode="before")
    @classmethod
    def normalize_ids(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            return value.lower()
        return value

    def get_identifier(self) -> str:
        """Get unique batch identifier."""
        return f"{self.lot_number}_{self.product.product_id}_{self.batch_id[:8]}"

    def get_route_info(self) -> dict:
        """Get route information."""
        return {
            "route_id": self.route.route_id,
            "route_name": self.route.route_name,
            "version": self.route.version,
        }

    def get_template_info(self) -> dict:
        """Get template information."""
        return {
            "template_id": self.template.template_id,
            "template_name": self.template.template_name,
            "version": self.template.version,
        }

    def get_product_info(self) -> dict:
        """Get product information."""
        return {
            "product_id": self.product.product_id,
            "product_name": self.product.product_name,
            "sku": self.product.sku,
        }

    def to_dict(self) -> dict:
        """Convert batch to dictionary."""
        return {
            "batch_id": self.batch_id,
            "lot_number": self.lot_number,
            "identifier": self.get_identifier(),
            "product": self.product.model_dump(),
            "size": self.size.model_dump(),
            "route": self.route.model_dump(),
            "template": self.template.model_dump(),
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class BatchQuery(BaseModel):
    """Query for finding unique batches."""

    product_id: str = Field(..., description="Product ID")
    size_quantity: Optional[float] = Field(None, description="Batch size quantity")
    size_unit: Optional[str] = Field(None, description="Batch size unit")
    route_id: Optional[str] = Field(None, description="Route ID")
    template_version: Optional[str] = Field(None, description="Template version")
    status: Optional[BatchStatus] = Field(None, description="Batch status filter")
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None


class BatchQueryResult(BaseModel):
    """Result of a batch query."""

    total_count: int = Field(default=0)
    matching_batches: list[Batch] = Field(default_factory=list)
    query_timestamp: datetime = Field(default_factory=datetime.utcnow)
    query_time_ms: float = Field(default=0.0)

    def __len__(self) -> int:
        return len(self.matching_batches)

    def get_latest_batch(self) -> Optional[Batch]:
        """Get the most recently created matching batch."""
        if not self.matching_batches:
            return None
        return max(self.matching_batches, key=lambda b: b.created_at)


class BatchExecution(BaseModel):
    """Batch execution record."""

    execution_id: str = Field(default_factory=lambda: str(uuid4()))
    batch_id: str
    batch_lot_number: str

    # Execution timeline
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None

    # Execution state
    status: str = Field(default="pending")  # pending, running, completed, failed
    progress_percentage: float = Field(default=0.0, ge=0, le=100)

    # Results
    quantity_produced: Optional[float] = None
    quantity_defective: Optional[float] = None
    yield_loss: Optional[float] = None

    # Quality checks
    quality_checks_passed: list[str] = Field(default_factory=list)
    quality_checks_failed: list[str] = Field(default_factory=list)

    # Execution details
    workstation_id: Optional[str] = None
    operator_id: Optional[str] = None
    supervisor_approval: Optional[bool] = None

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    errors: list[str] = Field(default_factory=list)

    def is_complete(self) -> bool:
        """Check if execution is complete."""
        return self.status in ["completed", "failed"]

    def get_success_rate(self) -> Optional[float]:
        """Get execution success rate."""
        if self.quantity_produced is None or self.quantity_produced == 0:
            return None
        if self.quantity_defective is None:
            return 100.0
        return max(
            0,
            (self.quantity_produced - self.quantity_defective)
            / self.quantity_produced
            * 100,
        )
