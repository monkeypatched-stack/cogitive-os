"""Tests for Capability Discovery — agents declare required capabilities, resolved dynamically."""
import sys
import os

_repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for _p in (_repo, os.path.join(_repo, 'src')):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from src.monkey_brain.kernel.execute.agent_mesh import ExecutionPool, AgentSpec, AgentRole
from src.knowledge.pack import KnowledgePack
from src.monkey_brain.kernel.execute.capabilities.bus import CapabilityBus
from src.monkey_brain.kernel.capabilities.icapability import FunctionalCapability, CapabilityEffects


def test_required_capabilities_field():
    spec = AgentSpec(role=AgentRole.WORKER, required_capabilities=["notify", "query"])
    assert spec.required_capabilities == ["notify", "query"]


def test_spawn_with_required_caps():
    ep = ExecutionPool(KnowledgePack())
    spec = AgentSpec(role=AgentRole.SPECIALIST, required_capabilities=["notify"])
    agent = ep.spawn(spec)
    assert agent.spec.required_capabilities == ["notify"]


def test_spawn_with_bus_resolves_caps():
    bus = CapabilityBus()
    bus.register_capability(FunctionalCapability(
        name="notify", fn=lambda x: {"sent": True},
        description="Send notification", effects=CapabilityEffects(world=["notification"]),
    ))
    ep = ExecutionPool(KnowledgePack())
    spec = AgentSpec(role=AgentRole.SPECIALIST, required_capabilities=["notify"])
    agent = ep.spawn(spec, capability_bus=bus)
    assert "notify" in agent.spec.capabilities


def test_spawn_with_missing_cap_logs_warning():
    bus = CapabilityBus()
    ep = ExecutionPool(KnowledgePack())
    spec = AgentSpec(role=AgentRole.WORKER, required_capabilities=["nonexistent"])
    agent = ep.spawn(spec, capability_bus=bus)
    assert "nonexistent" not in agent.spec.capabilities


def test_spawn_log_records_required():
    ep = ExecutionPool(KnowledgePack())
    spec = AgentSpec(role=AgentRole.WORKER, required_capabilities=["notify"])
    ep.spawn(spec)
    log = ep._spawn_log[-1]
    assert log["required_capabilities"] == ["notify"]


def test_backward_compat_no_required():
    ep = ExecutionPool(KnowledgePack())
    agent = ep.spawn(AgentSpec(role=AgentRole.WORKER))
    assert agent.spec.required_capabilities == []


if __name__ == "__main__":
    ok = 0; f = []
    for name, fn in sorted((k, v) for k, v in globals().items() if k.startswith('test_') and callable(v)):
        try: fn(); ok += 1
        except Exception as e: f.append(f"{name}: {e}")
    print(f"\nCapabilityDiscovery: {ok}/{ok+len(f)} passed")
    for e in f: print(f"  FAIL: {e}")
