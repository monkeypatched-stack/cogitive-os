"""Production gate and hardened execution path tests."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.monkey_brain.kernel.pipeline.execution import Action
from src.monkey_brain.kernel.pipeline.execution_runtime.integration import IntegratedExecutionEngine
from src.monkey_brain.kernel.production_gates import (
    block_direct_world_api_mutations,
    capability_dispatch_dedup_enabled,
    idempotency_fail_closed,
    production_mode_enabled,
    require_redis,
    validate_production_gates,
)


class TestProductionGates:
    def test_production_mode_enables_all_gates(self, monkeypatch):
        monkeypatch.setenv("COGNITIVEOS_PRODUCTION_MODE", "true")
        monkeypatch.delenv("REQUIRE_REDIS", raising=False)
        assert production_mode_enabled()
        assert require_redis()
        assert idempotency_fail_closed()

    def test_validate_production_gates_raises_without_redis(self, monkeypatch):
        monkeypatch.setenv("COGNITIVEOS_PRODUCTION_MODE", "true")
        with pytest.raises(RuntimeError, match="Redis"):
            validate_production_gates(redis_available=False, opa_configured=True)

    def test_validate_production_gates_raises_without_opa(self, monkeypatch):
        monkeypatch.setenv("COGNITIVEOS_PRODUCTION_MODE", "true")
        with pytest.raises(RuntimeError, match="OPA"):
            validate_production_gates(redis_available=True, opa_configured=False)

    def test_block_direct_world_api_mutations(self, monkeypatch):
        monkeypatch.setenv("COGNITIVEOS_PRODUCTION_MODE", "true")
        monkeypatch.delenv("ALLOW_DIRECT_WORLD_API", raising=False)
        assert block_direct_world_api_mutations() is True
        monkeypatch.setenv("ALLOW_DIRECT_WORLD_API", "true")
        assert block_direct_world_api_mutations() is False

    def test_capability_dispatch_dedup_enabled_in_production(self, monkeypatch):
        monkeypatch.setenv("COGNITIVEOS_PRODUCTION_MODE", "true")
        assert capability_dispatch_dedup_enabled() is True


class TestIntegratedExecutionEngineGraph:
    @pytest.mark.asyncio
    async def test_forwards_execution_graph_to_fallback(self):
        fallback = MagicMock()
        fallback.execute = AsyncMock(return_value=MagicMock(goal_achieved=True, actions=()))
        engine = IntegratedExecutionEngine(fallback=fallback)
        graph = object()
        actions = (Action(action_id="a1", capability="UnknownCap"),)

        await engine.execute(actions, {}, execution_graph=graph)

        fallback.execute.assert_awaited_once_with(actions, {}, execution_graph=graph)
