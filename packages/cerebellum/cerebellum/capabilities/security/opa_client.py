"""OPA policy engine driver — cerebellum capability.

Owned here per INV-003. services/common/opa.py is a thin re-export.

OPA REST API:
  POST /v1/data/<path>  body: {"input": {...}}
  Response: {"result": true} or {"result": {"allow": true, "obligations": [...]}}
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_OPA_URL     = os.getenv("OPA_URL", "").rstrip("/")
_OPA_TIMEOUT = float(os.getenv("OPA_TIMEOUT_SECONDS", "2"))


async def evaluate_full(
    policy_path: str,
    input_data: dict[str, Any],
    *,
    default_allow: bool = True,
    opa_url: str = "",
    timeout: float = 0.0,
    fail_closed_on_error: bool = True,
) -> dict[str, Any]:
    """Query OPA and return the full result document.

    Returns:
        {"allowed": bool, "obligations": [...], "source": "opa"|"fallback"|"skip"}
        Plus "reason" (the policy's own deny_reason rule, e.g.
        opa/policies/agentos_governance.rego's structured deny_reason)
        when policy_path is a package root so OPA returns the whole
        document rather than a single rule's value.

    Doot audit P1-6 fix: "OPA not configured at all" (opa_url unset — an
    explicit deployment choice) and "OPA configured but the request
    itself failed" (bad status, timeout, connection error) used to share
    one default_allow fallback. That's wrong: a real request failure
    against a configured policy service is not the same as no policy
    layer existing, and silently answering "allow" for it is exactly
    the fail-open bug this closes. Unset OPA_URL still uses
    default_allow (unchanged — nothing to have failed). A configured-
    but-failing OPA now fails CLOSED (allowed=False) unless a caller
    explicitly passes fail_closed_on_error=False for a specific,
    deliberately low-risk operation — no such caller exists today.
    """
    url  = (opa_url or _OPA_URL).rstrip("/")
    tmo  = timeout or _OPA_TIMEOUT

    if not url:
        return {"allowed": default_allow, "obligations": [], "source": "skip"}

    error_fallback = default_allow if not fail_closed_on_error else False
    endpoint = f"{url}/v1/data/{policy_path.lstrip('/')}"
    try:
        async with httpx.AsyncClient(timeout=tmo) as client:
            r = await client.post(endpoint, json={"input": input_data})
            if r.status_code == 200:
                result = r.json().get("result", default_allow)
                if isinstance(result, bool):
                    return {"allowed": result, "obligations": [], "source": "opa"}
                if isinstance(result, dict):
                    return {
                        "allowed": bool(result.get("allow", default_allow)),
                        "obligations": result.get("obligations", []),
                        "reason": result.get("deny_reason", ""),
                        "source": "opa",
                    }
            else:
                logger.warning(
                    "OPA %d for %s — configured-but-unavailable, defaulting allow=%s",
                    r.status_code, policy_path, error_fallback,
                )
    except Exception as exc:
        logger.warning(
            "OPA unreachable (%s), configured-but-unavailable, allow=%s: %s",
            policy_path, error_fallback, exc,
        )

    return {"allowed": error_fallback, "obligations": [], "source": "fallback"}


async def evaluate(
    policy_path: str,
    input_data: dict[str, Any],
    *,
    default_allow: bool = True,
    opa_url: str = "",
    timeout: float = 0.0,
    fail_closed_on_error: bool = True,
) -> bool:
    result = await evaluate_full(
        policy_path, input_data,
        default_allow=default_allow,
        opa_url=opa_url,
        timeout=timeout,
        fail_closed_on_error=fail_closed_on_error,
    )
    return result["allowed"]


async def push_policy(policy_path: str, rego: str, opa_url: str = "") -> bool:
    """PUT a Rego policy document to OPA's Policies API."""
    url = (opa_url or _OPA_URL).rstrip("/")
    if not url:
        return False
    try:
        slug = policy_path.replace("/", "_")
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.put(
                f"{url}/v1/policies/{slug}",
                content=rego.encode(),
                headers={"Content-Type": "text/plain"},
            )
            return r.status_code in (200, 201)
    except Exception as exc:
        logger.warning("OPA policy push failed: %s", exc)
        return False
