from datetime import date, datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, computed_field, model_validator


class ChangeoverKPI(BaseModel):
    """Pre-computed changeover KPI snapshot for reporting."""

    id: UUID = Field(default_factory=uuid4)
    workstation_id: UUID
    period_start: date
    period_end: date
    total_changeovers: int = Field(default=0, ge=0)
    completed: int = Field(default=0, ge=0)
    aborted: int = Field(default=0, ge=0)
    avg_actual_minutes: Optional[float] = None
    avg_planned_minutes: Optional[float] = None
    avg_variance_minutes: Optional[float] = None
    best_actual_minutes: Optional[float] = None
    worst_actual_minutes: Optional[float] = None
    on_time_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    total_downtime_minutes: float = Field(default=0.0, ge=0)
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def period_valid(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be >= period_start")
        return self

    @model_validator(mode="after")
    def completed_plus_aborted_lte_total(self):
        if self.completed + self.aborted > self.total_changeovers:
            raise ValueError("completed + aborted cannot exceed total_changeovers")
        return self

    @computed_field  # type: ignore[misc]
    @property
    def oee_impact_hours(self) -> float:
        return self.total_downtime_minutes / 60


class ChangeoverKPICreate(ChangeoverKPI):
    pass


class ChangeoverKPIUpdate(BaseModel):
    workstation_id: Optional[UUID] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    total_changeovers: Optional[int] = Field(None, ge=0)
    completed: Optional[int] = Field(None, ge=0)
    aborted: Optional[int] = Field(None, ge=0)
    avg_actual_minutes: Optional[float] = None
    avg_planned_minutes: Optional[float] = None
    avg_variance_minutes: Optional[float] = None
    best_actual_minutes: Optional[float] = None
    worst_actual_minutes: Optional[float] = None
    on_time_rate_pct: Optional[float] = Field(None, ge=0, le=100)
    total_downtime_minutes: Optional[float] = Field(None, ge=0)
    generated_at: Optional[datetime] = None


class ChangeoverKPIResponse(ChangeoverKPI):
    class Config:
        from_attributes = True


class PaginatedChangeoverKPIResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[ChangeoverKPIResponse]
