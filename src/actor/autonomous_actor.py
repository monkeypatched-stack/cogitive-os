"""AutonomousActor — backward-compatible alias for ActorSystem.

All cognitive logic, pipeline orchestration, and async lifecycle
now live in ActorSystem (src/actor/actor.py).

This module exists only for imports that reference:
    from src.actor.autonomous_actor import AutonomousActor
"""

from src.actor.actor import ActorSystem, _CognitiveTickResult

# The canonical class
AutonomousActor = ActorSystem

# Backward-compatible alias
CognitiveLoopResult = _CognitiveTickResult

__all__ = ["AutonomousActor", "CognitiveLoopResult"]
