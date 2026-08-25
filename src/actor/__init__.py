"""Actor Architecture — single canonical ActorSystem class.

ActorSystem extends CognitiveActor extends Entity:
  - Identity, type hierarchy (Person, Robot, etc.)
  - Beliefs, policy, Φ (cognitive core)
  - Action recording via ActorRuntime
  - Async autonomous cognitive loop
"""

from src.actor.actor import ActorSystem, AutonomousActor
from src.actor.layers import (
    Request,
    Intent,
    Goal,
    GoalIR,
    World,
    ActorLayerMetrics,
    Explore,
    Plan,
    Execute,
    Response,
    Entity,
    Constraint,
    Relationship,
)
from src.shared.kernel_protocols import IntentIRProtocol as IntentIR

__all__ = [
    "ActorSystem",
    "AutonomousActor",
    "Request",
    "Intent",
    "Goal",
    "IntentIR",
    "GoalIR",
    "World",
    "ActorLayerMetrics",
    "Explore",
    "Plan",
    "Execute",
    "Response",
    "Entity",
    "Constraint",
    "Relationship",
]
