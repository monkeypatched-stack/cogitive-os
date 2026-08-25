"""Governance must not deny everything when it was never provisioned (G-1),
and must enforce for real once OPA actually denies (G-2).

evaluate() used to return {"allowed": False, "reason": "no_charter"} whenever the runtime had no
charter — and register_charter() has NO callers in production, no charter is created at boot,
and there is no API to make one. So /plan and /execute returned 403 to EVERY authenticated
user. Verified live: a valid JWT carrying perm-execute-plan got
    403 {"error":"governance_denied","detail":"no_charter"}

A fail-closed control with no provisioning path is not security, it is an outage.

evaluate() now delegates to real OPA (opa/policies/agentos_governance.rego) via
services.common.opa.evaluate_full, with default_allow=True as the client-side safety
net when OPA_URL is unset/unreachable — same "not configured" behavior as before,
but a genuinely enforceable, externally-provisionable policy once OPA IS configured.
"""
from __future__ import annotations

import pytest

from src.monkey_brain.kernel.governance import GovernanceEngine


@pytest.mark.asyncio
async def test_unconfigured_governance_allows_instead_of_denying_everyone(monkeypatch):
    monkeypatch.delenv("OPA_URL", raising=False)
    eng = GovernanceEngine()
    assert eng.is_configured() is False
    d = await eng.evaluate("any-user", "plan", {})
    assert d["allowed"] is True                       # was: False / "no_charter" -> 403 for all
    assert d["reason"] == "governance_not_configured"


@pytest.mark.asyncio
async def test_opa_denial_is_surfaced_as_a_real_governance_decision(monkeypatch):
    """Once OPA is actually configured and denies, evaluate() must deny too —
    not silently allow just because SOME data path returned a dict."""
    async def fake_evaluate_full(policy_path, input_data, *, default_allow=True):
        assert policy_path == "agentos/governance"
        assert input_data["runtime_id"] == "mallory"
        assert input_data["action"] == "execute"
        return {"allowed": False, "obligations": [], "reason": "runtime_blocked", "source": "opa"}

    monkeypatch.setattr("services.common.opa.evaluate_full", fake_evaluate_full)

    eng = GovernanceEngine()
    denied = await eng.evaluate("mallory", "execute", {})
    assert denied["allowed"] is False
    assert denied["reason"] == "runtime_blocked"
    assert denied["violations"] == [{"rule": "runtime_blocked", "type": "opa"}]


@pytest.mark.asyncio
async def test_opa_allow_is_surfaced_as_a_real_governance_decision(monkeypatch):
    async def fake_evaluate_full(policy_path, input_data, *, default_allow=True):
        return {"allowed": True, "obligations": [], "reason": "", "source": "opa"}

    monkeypatch.setattr("services.common.opa.evaluate_full", fake_evaluate_full)

    eng = GovernanceEngine()
    allowed = await eng.evaluate("alice", "plan", {})
    assert allowed["allowed"] is True
    assert allowed["reason"] == ""
    assert allowed["violations"] == []


def test_audit_decisions_records_both_allow_and_deny(monkeypatch):
    """Every evaluate() call — allowed or denied — is recorded for audit_decisions()."""
    import asyncio

    async def fake_evaluate_full(policy_path, input_data, *, default_allow=True):
        return {"allowed": input_data["runtime_id"] != "mallory", "obligations": [],
                "reason": "" if input_data["runtime_id"] != "mallory" else "runtime_blocked", "source": "opa"}

    monkeypatch.setattr("services.common.opa.evaluate_full", fake_evaluate_full)

    eng = GovernanceEngine()
    asyncio.run(eng.evaluate("alice", "plan", {}))
    asyncio.run(eng.evaluate("mallory", "execute", {}))

    decisions = eng.audit_decisions()
    assert len(decisions) == 2
    assert decisions[0]["allowed"] is True
    assert decisions[1]["allowed"] is False
    assert decisions[1]["reason"] == "runtime_blocked"
