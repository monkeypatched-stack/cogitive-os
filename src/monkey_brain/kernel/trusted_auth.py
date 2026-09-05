"""Trusted authentication evidence — never taken from agent/LLM payloads.

MFA and authentication state are bound from verified JWT claims or service
credentials. Agents cannot set these fields.
"""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Mapping

MFA_SATISFIED = "satisfied"
MFA_NOT_SATISFIED = "not_satisfied"
MFA_UNKNOWN = "unknown"
MFA_NOT_REQUIRED = "not_required"

_VALID_MFA = frozenset({MFA_SATISFIED, MFA_NOT_SATISFIED, MFA_UNKNOWN, MFA_NOT_REQUIRED})

# Agent-supplied keys that must never be treated as security evidence.
UNTRUSTED_SECURITY_SIGNAL_KEYS = frozenset({
    "mfa_enforced",
    "mfa_status",
    "mfa_satisfied",
    "authenticated",
    "token_valid",
    "mfa_required",
    "trusted_auth",
    "authorized",
    "authorization",
    "is_admin",
    "role",
    "roles",
    "permissions",
    "policy_approval",
    "governance_approval",
    "governance_allowed",
    "opa_allow",
    "audit_authority",
    "execution_authority",
})

_current: ContextVar["TrustedAuthEvidence | None"] = ContextVar("trusted_auth", default=None)


@dataclass(frozen=True)
class TrustedAuthEvidence:
    authenticated: bool
    token_valid: bool
    principal_id: str
    principal_type: str  # human | service | unknown
    mfa_status: str
    session_id: str = ""
    permissions: tuple[str, ...] = ()

    def mfa_satisfied(self) -> bool:
        return self.mfa_status == MFA_SATISFIED

    def to_opa_auth(self) -> dict[str, Any]:
        from src.monkey_brain.kernel.production_gates import mfa_required

        required = mfa_required() and self.principal_type != "service"
        status = self.mfa_status if self.mfa_status in _VALID_MFA else MFA_UNKNOWN
        return {
            "authenticated": self.authenticated,
            "token_valid": self.token_valid,
            "principal": self.principal_id,
            "principal_type": self.principal_type,
            "mfa_status": status,
            "mfa_required": required,
            "mfa_satisfied": status == MFA_SATISFIED,
            "session_id": self.session_id,
            "agent_attested_mfa": False,
        }


def normalize_mfa_status(value: Any) -> str:
    if value is None:
        return MFA_UNKNOWN
    text = str(value).strip().lower()
    if text in _VALID_MFA:
        return text
    if text in ("true", "1", "yes"):
        return MFA_SATISFIED
    if text in ("false", "0", "no"):
        return MFA_NOT_SATISFIED
    return MFA_UNKNOWN


def evidence_from_jwt(payload: Mapping[str, Any]) -> TrustedAuthEvidence:
    principal = str(payload.get("sub") or payload.get("user_id") or "")
    mfa_status = normalize_mfa_status(payload.get("mfa_status"))
    permissions = payload.get("permissions") or []
    perms = tuple(
        p if isinstance(p, str) else str(p.get("permission_id", ""))
        for p in permissions
        if p
    )
    return TrustedAuthEvidence(
        authenticated=bool(principal),
        token_valid=True,
        principal_id=principal,
        principal_type="human",
        mfa_status=mfa_status,
        session_id=str(payload.get("jti") or ""),
        permissions=perms,
    )


def evidence_for_service(principal_id: str) -> TrustedAuthEvidence:
    return TrustedAuthEvidence(
        authenticated=True,
        token_valid=True,
        principal_id=principal_id,
        principal_type="service",
        mfa_status=MFA_NOT_REQUIRED,
    )


def unauthenticated_evidence() -> TrustedAuthEvidence:
    return TrustedAuthEvidence(
        authenticated=False,
        token_valid=False,
        principal_id="",
        principal_type="unknown",
        mfa_status=MFA_UNKNOWN,
    )


def bind_trusted_auth(evidence: TrustedAuthEvidence) -> None:
    _current.set(evidence)


def get_trusted_auth() -> TrustedAuthEvidence:
    return _current.get() or unauthenticated_evidence()


def _strip_untrusted_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return strip_untrusted_security_signals(value)
    if isinstance(value, list):
        return [_strip_untrusted_value(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_strip_untrusted_value(v) for v in value)
    return value


def strip_untrusted_security_signals(signals: Mapping[str, Any] | None) -> dict[str, Any]:
    """Drop agent-attested security properties (recursively)."""
    if not signals:
        return {}
    out: dict[str, Any] = {}
    for key, value in signals.items():
        if key in UNTRUSTED_SECURITY_SIGNAL_KEYS:
            continue
        out[key] = _strip_untrusted_value(value)
    return out


def mfa_allows_operation(evidence: TrustedAuthEvidence | None = None) -> bool:
    from src.monkey_brain.kernel.production_gates import mfa_required

    ev = evidence or get_trusted_auth()
    if ev.principal_type == "service":
        return ev.authenticated and ev.token_valid
    if not mfa_required():
        return True
    return ev.mfa_status == MFA_SATISFIED
