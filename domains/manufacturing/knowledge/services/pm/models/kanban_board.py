from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator

from services.workorders.models.work_orders import WorkOrderResponse, WorkOrderStatus

KanbanStatus = Literal[
    "todo",
    "in_progress",
    "ready_for_next_stage",
    "rejected",
    "completed",
    "Todo",
    "In Progress",
    "Ready for Next Stage",
    "Rejected",
    "Completed",
    "Done",
    "Cancelled",
    "On Hold",
]

WORK_ORDER_KANBAN_COLUMNS: list[WorkOrderStatus] = [
    "Todo",
    "In Progress",
    "Ready for Next Stage",
    "Rejected",
    "Completed",
    "Done",
    "Cancelled",
    "On Hold",
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class KanbanCard(BaseModel):
    card_id: UUID = Field(default_factory=uuid4)
    title: str = Field(..., min_length=1, max_length=160)
    status: KanbanStatus = "todo"
    workstation_id: Optional[str] = None
    work_order_id: Optional[str] = None
    process_definition_id: Optional[str] = None
    process_step_id: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = Field(None, max_length=40)
    quantity: Optional[int] = Field(None, ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    sort_order: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "KanbanCard":
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        return self


class KanbanCardCreate(KanbanCard):
    pass


class KanbanCardUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=160)
    status: Optional[KanbanStatus] = None
    workstation_id: Optional[str] = None
    work_order_id: Optional[str] = None
    process_definition_id: Optional[str] = None
    process_step_id: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = Field(None, max_length=40)
    quantity: Optional[int] = Field(None, ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    sort_order: Optional[int] = Field(None, ge=0)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "KanbanCardUpdate":
        self.updated_at = ensure_utc(self.updated_at)
        return self


class KanbanCardMove(BaseModel):
    status: KanbanStatus
    sort_order: Optional[int] = Field(None, ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "KanbanCardMove":
        self.updated_at = ensure_utc(self.updated_at)
        return self


class KanbanBoard(BaseModel):
    board_id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=160)
    workstation_id: Optional[str] = None
    line_id: Optional[str] = None
    stage_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=1000)
    cards: list[KanbanCard] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "KanbanBoard":
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        return self


class KanbanBoardCreate(KanbanBoard):
    pass


class KanbanBoardUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    workstation_id: Optional[str] = None
    line_id: Optional[str] = None
    stage_id: Optional[str] = None
    description: Optional[str] = Field(None, max_length=1000)
    cards: Optional[list[KanbanCard]] = None
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "KanbanBoardUpdate":
        self.updated_at = ensure_utc(self.updated_at)
        return self


class KanbanBoardResponse(KanbanBoard):
    class Config:
        from_attributes = True


class KanbanCardResponse(KanbanCard):
    class Config:
        from_attributes = True


class PaginatedKanbanBoardResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[KanbanBoardResponse]


class WorkOrderKanbanColumn(BaseModel):
    status: WorkOrderStatus
    title: str
    work_orders: list[WorkOrderResponse] = Field(default_factory=list)


class WorkOrderKanbanBoardResponse(BaseModel):
    columns: list[WorkOrderKanbanColumn]


class WorkOrderKanbanMove(BaseModel):
    status: WorkOrderStatus
