import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from services.common.config import settings


def _create_token(data: dict, secret: str, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    return jwt.encode(payload, secret, algorithm=settings.ALGORITHM)


def _permission_claim(permission: Any) -> str | None:
    if hasattr(permission, "model_dump"):
        permission = permission.model_dump(mode="python")
    if isinstance(permission, str):
        return permission
    if not isinstance(permission, dict):
        return None
    permission_id = permission.get("permission_id")
    return str(permission_id) if permission_id else None


def create_access_token(user_id: str, email: str, role: str, permissions: list | None = None,
                        tenant: str | None = None) -> str:
    serialized = sorted({
        claim
        for permission in (permissions or [])
        if (claim := _permission_claim(permission))
    })
    claims: dict[str, Any] = {
        "sub": user_id, "email": email, "role": role, "permissions": serialized,
        # jti (Security audit P1-5): without a per-token id, a "revoked"
        # access token has no way to actually be looked up and rejected
        # before its natural expiry — see services.auth.helpers.revocation,
        # the same jti-blocklist mechanism agent tokens already use.
        "jti": uuid.uuid4().hex,
    }
    # Tenant is a first-class claim: it is what get_current_user puts into context and what
    # every downstream query is filtered by. Without it there is no tenant isolation.
    if tenant:
        claims["tenant"] = tenant
    return _create_token(
        claims,
        settings.ACCESS_TOKEN_SECRET,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

def create_refresh_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id},
        settings.REFRESH_TOKEN_SECRET,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def create_mfa_challenge_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "purpose": "mfa_challenge"},
        settings.ACCESS_TOKEN_SECRET,
        timedelta(minutes=5),
    )


def decode_access_token(token: str) -> dict:
    """Raises JWTError on invalid/expired token."""
    payload = jwt.decode(token, settings.ACCESS_TOKEN_SECRET, algorithms=[settings.ALGORITHM])
    if "permissions" not in payload and isinstance(payload.get("perms"), str):
        payload["permissions"] = [permission for permission in payload["perms"].split(",") if permission]
    return payload


def decode_refresh_token(token: str) -> dict:
    """Raises JWTError on invalid/expired token."""
    return jwt.decode(token, settings.REFRESH_TOKEN_SECRET, algorithms=[settings.ALGORITHM])


def decode_mfa_challenge_token(token: str) -> dict:
    payload = jwt.decode(token, settings.ACCESS_TOKEN_SECRET, algorithms=[settings.ALGORITHM])
    if payload.get("purpose") != "mfa_challenge":
        raise JWTError("Invalid MFA challenge token")
    return payload
