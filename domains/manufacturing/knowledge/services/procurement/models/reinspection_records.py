from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReinspectionRecord(BaseModel):
    reinspection_id: str = Field(..., min_length=1)
    quarantine_hold_id: Optional[str] = None
    batch_id: Optional[str] = None
    material_id: Optional[str] = None
    container_id: Optional[str] = None
    original_issue: str = Field(..., min_length=1)
    reinspection_reason: Optional[str] = None
    inspected_by: str = Field(..., min_length=1)
    inspected_at: datetime = Field(default_factory=utc_now)
    result: Literal["Pass", "Fail", "Conditional Pass"] = "Pass"
    disposition: Optional[str] = None
    dispositioned_by: Optional[str] = None
    dispositioned_at: Optional[datetime] = None
    notes: Optional[str] = None
    status: Literal["Pending", "Completed"] = "Pending"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
