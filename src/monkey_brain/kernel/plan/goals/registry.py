"""Goal registry — stores registered goal definitions."""

from __future__ import annotations

import logging
from typing import Any

from src.monkey_brain.kernel.plan.goals.goal import Goal, GoalType

logger = logging.getLogger(__name__)


def build_goal_registry() -> GoalRegistry:
    """Build the goal registry with all default goals."""
    from src.monkey_brain.kernel.plan.intents.intent_registry import INTENT_DEFINITIONS

    registry = GoalRegistry()

    for intent_name, intent_def in INTENT_DEFINITIONS.items():
        goal = Goal(
            name=intent_def.intent,
            description=intent_def.description or f"Goal for {intent_def.intent}",
            goal_type=GoalType.QUERY,
            required_inputs=list(intent_def.required_inputs),
            required_outputs=list(intent_def.required_outputs),
            augmentations=list(intent_def.default_augmentations),
            constraints=dict(intent_def.constraints),
        )
        registry.register_goal(goal)

    return registry


class GoalRegistry:
    """Central registry for goal definitions."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            instance = super().__new__(cls)
            instance._goals = {}
            cls._instance = instance
        return cls._instance

    def register_goal(self, goal: Goal) -> None:
        self._goals[goal.name] = goal

    def get_goal(self, intent_name: str) -> Goal | None:
        return self._goals.get(intent_name)

    def list_goals(self) -> list[Goal]:
        return list(self._goals.values())

    def remove_goal(self, intent_name: str) -> bool:
        if intent_name in self._goals:
            del self._goals[intent_name]
            return True
        return False

    def has_goal(self, intent_name: str) -> bool:
        return intent_name in self._goals

    def summary(self) -> dict[str, Any]:
        return {
            "goals": {
                name: {
                    "goal_type": goal.goal_type.value,
                    "required_inputs": goal.required_inputs,
                    "required_outputs": goal.required_outputs,
                }
                for name, goal in self._goals.items()
            },
            "count": len(self._goals),
        }
