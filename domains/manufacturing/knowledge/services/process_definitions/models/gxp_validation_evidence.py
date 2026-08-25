from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GxpValidationEvidence(BaseModel):
    validation_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    validation_type: Literal["IQ", "OQ", "PQ", "DQ", "URS", "RA"]
    equipment_id: Optional[str] = None
    machine_id: Optional[str] = None
    workstation_id: Optional[str] = None
    plant_id: Optional[str] = None
    protocol_number: Optional[str] = None
    status: Literal["Draft", "In Progress", "Completed", "Approved", "Failed"] = "Draft"
    executed_by: Optional[str] = None
    executed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    conclusion: Optional[str] = None
    deviations: list[dict] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    next_requalification_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
