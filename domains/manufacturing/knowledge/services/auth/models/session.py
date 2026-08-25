from typing import Any

from pydantic import BaseModel, Field


class SessionValueRequest(BaseModel):
    value: Any


class SessionValueResponse(BaseModel):
    key: str
    value: Any = None
    found: bool = True


class SessionBulkSaveRequest(BaseModel):
    items: dict[str, Any] = Field(default_factory=dict)


class SessionBulkGetRequest(BaseModel):
    keys: list[str] = Field(default_factory=list)


class SessionBulkResponse(BaseModel):
    items: dict[str, Any | None] = Field(default_factory=dict)
    missing: list[str] = Field(default_factory=list)
