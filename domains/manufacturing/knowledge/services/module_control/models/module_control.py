from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ActivationChallengeResponse(BaseModel):
    challenge_id: str
    expires_at: str
    delivery_mode: str
    otp_code: str | None = None


class ActivationVerifyRequest(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    otp_code: str = Field(..., min_length=4, max_length=12)
    password: str = Field(..., min_length=1)


class ActivationVerifyResponse(BaseModel):
    activation_token: str
    expires_at: str


class ModuleStateRequest(BaseModel):
    enabled: bool
    reason: str = Field(..., min_length=1, max_length=1000)


class PolicyPatchRequest(BaseModel):
    modules: dict[str, bool] = Field(default_factory=dict)
    integrations: dict[str, bool] = Field(default_factory=dict)
    limits: dict[str, int] = Field(default_factory=dict)
    endpoint_module_prefixes: dict[str, str] = Field(default_factory=dict)
    limit_collections: dict[str, list[str]] = Field(default_factory=dict)
    reason: str = Field(..., min_length=1, max_length=1000)


class IntegrationManifestRequest(BaseModel):
    manifest: dict[str, Any] = Field(..., min_length=1)
    reason: str = Field(..., min_length=1, max_length=1000)


class EvaluationRequest(BaseModel):
    module_id: str | None = None
    path: str | None = None
    integration_id: str | None = None
    limit_key: str | None = None
    collection: str | None = None


class ModuleControlPolicyResponse(BaseModel):
    policy_id: str
    version: int
    modules: dict[str, bool]
    integrations: dict[str, bool]
    integration_catalog: list[dict[str, Any]]
    module_catalog: dict[str, dict[str, Any]]
    limits: dict[str, int]
    endpoint_module_prefixes: dict[str, str]
    limit_collections: dict[str, list[str]]
    created_at: Any
    updated_at: Any
    updated_by: str
