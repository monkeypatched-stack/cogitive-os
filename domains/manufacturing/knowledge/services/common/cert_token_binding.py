"""Cert-to-token binding dependency (dual-trust enforcement).

Spec: the cert's SAN (SPIFFE URI or DNS/IP) must match the JWT `sub` / `spiffe_id`
claim. This closes the gap between transport-layer identity (X.509) and
application-layer authorization (JWT).

Usage
    @router.get("/sensitive")
    async def endpoint(principal = Depends(get_principal_with_cert_binding)):
        ...

Fallback behaviour
    - No cert present (MTLS_ENABLED=false or client didn't send one):
      passes through — backward compatible with all existing endpoints.
    - Cert present but binding fails: 401 Unauthorized.
    - Cert present and binding passes: principal dict gains
        mtls_verified=True, cert_subject, cert_fingerprint.
"""

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status

from services.common.agent_auth import get_current_principal

logger = logging.getLogger(__name__)


def _san_matches(san_list: list[str], principal: dict) -> bool:
    candidates = {
        principal.get("sub", ""),
        principal.get("spiffe_id", ""),
        principal.get("client_id", ""),
    }
    candidates.discard("")
    for san in san_list:
        if san in candidates:
            return True
    return False


async def get_principal_with_cert_binding(
    request: Request,
    principal: dict[str, Any] = Depends(get_current_principal),
) -> dict[str, Any]:
    """get_current_principal + optional cert-to-token binding.

    When a client cert is present (attached by MTLSMiddleware) the cert's SAN
    must match the JWT sub/spiffe_id. When no cert is present the check is
    skipped and existing token-only auth applies.
    """
    cert = getattr(request.state, "mtls_cert", None)
    if cert is None:
        return principal

    if not _san_matches(cert.get("san", []), principal):
        logger.warning(
            "Cert-token binding mismatch: san=%s sub=%s spiffe_id=%s",
            cert.get("san"),
            principal.get("sub"),
            principal.get("spiffe_id"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Client certificate identity does not match token identity",
        )

    return {
        **principal,
        "mtls_verified": True,
        "cert_subject": cert.get("subject"),
        "cert_fingerprint": cert.get("fingerprint"),
    }
