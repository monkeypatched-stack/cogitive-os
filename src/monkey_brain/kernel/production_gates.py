"""Production safety gates — env-driven hard requirements for live deploys.

Set COGNITIVEOS_PRODUCTION_MODE=true to enable all gates below, or set
each individually (REQUIRE_REDIS, OPA_REQUIRED, IDEMPOTENCY_FAIL_CLOSED).
"""
from __future__ import annotations

import os


def _truthy(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("true", "1", "yes")


def production_mode_enabled() -> bool:
    return _truthy("COGNITIVEOS_PRODUCTION_MODE")


def require_redis() -> bool:
    return production_mode_enabled() or _truthy("REQUIRE_REDIS")


def require_opa() -> bool:
    return production_mode_enabled() or _truthy("OPA_REQUIRED")


def idempotency_fail_closed() -> bool:
    return production_mode_enabled() or _truthy("IDEMPOTENCY_FAIL_CLOSED")


def block_direct_world_api_mutations() -> bool:
    """Reject SharedWorld CRUD mutations when production mode is on.

    Commerce state should use knowledge_graph routes or actor capabilities.
    Override with ALLOW_DIRECT_WORLD_API=true for dev/seed only.
    """
    if not production_mode_enabled():
        return False
    return not _truthy("ALLOW_DIRECT_WORLD_API")


def capability_dispatch_dedup_enabled() -> bool:
    """Redis-backed (execution_id, action_id) dedup before capability invoke."""
    return production_mode_enabled() or _truthy("CAPABILITY_DISPATCH_DEDUP")


def validate_production_gates(*, redis_available: bool, opa_configured: bool) -> None:
    """Raise RuntimeError when a required production dependency is missing."""
    errors: list[str] = []
    if require_redis() and not redis_available:
        errors.append(
            "REQUIRE_REDIS/COGNITIVEOS_PRODUCTION_MODE: Redis is mandatory but unavailable"
        )
    if require_opa() and not opa_configured:
        errors.append(
            "OPA_REQUIRED/COGNITIVEOS_PRODUCTION_MODE: OPA_URL must be set for governance"
        )
    if errors:
        raise RuntimeError("; ".join(errors))
