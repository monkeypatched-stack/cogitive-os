from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class ChecklistItem(BaseModel):
    item_id: str = Field(..., min_length=1)
    work_order_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_at: Optional[datetime] = None
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_and_validate(self) -> "ChecklistItem":
        self.due_at = ensure_utc(self.due_at)
        self.completed_at = ensure_utc(self.completed_at)
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        if self.completed_at and not self.is_completed:
            raise ValueError("completed_at can only be set when is_completed is true")
        if self.is_completed and self.completed_at is None:
            self.completed_at = utc_now()
        return self


class ChecklistItemCreate(ChecklistItem):
    pass


class ChecklistItemUpdate(BaseModel):
    work_order_id: Optional[str] = Field(None, min_length=1)
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_at: Optional[datetime] = None
    is_completed: Optional[bool] = None
    completed_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "ChecklistItemUpdate":
        self.due_at = ensure_utc(self.due_at)
        self.completed_at = ensure_utc(self.completed_at)
        self.updated_at = ensure_utc(self.updated_at)
        return self


class Checklist(BaseModel):
    checklist_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    owner_id: Optional[str] = None
    process_definition_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    items: list[ChecklistItem] = Field(default_factory=list)
    is_archived: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "Checklist":
        self.created_at = ensure_utc(self.created_at)
        self.updated_at = ensure_utc(self.updated_at)
        return self


class ChecklistCreate(Checklist):
    pass


class ChecklistUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    owner_id: Optional[str] = None
    work_order_id: Optional[str] = None
    process_definition_id: Optional[str] = None
    tags: Optional[list[str]] = None
    items: Optional[list[ChecklistItem]] = None
    is_archived: Optional[bool] = None
    updated_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_datetimes(self) -> "ChecklistUpdate":
        self.updated_at = ensure_utc(self.updated_at)
        return self


class ChecklistResponse(Checklist):
    class Config:
        from_attributes = True


class PaginatedChecklistResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ChecklistResponse]
