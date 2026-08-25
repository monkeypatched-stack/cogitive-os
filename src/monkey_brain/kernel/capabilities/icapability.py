"""ICapability — interface and data types for capability effects."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class CapabilityEffects:
    """Represents the effects of executing a capability."""
    world: list[str] = field(default_factory=list)
    knowledge: list[str] = field(default_factory=list)
    confidence_delta: float = 0.0
    enable: list[str] = field(default_factory=list)

    def expected_utility(self) -> float:
        """Calculate expected utility of these effects."""
        base = 0.5
        world_bonus = len(self.world) * 0.1
        knowledge_bonus = len(self.knowledge) * 0.1
        confidence_bonus = max(0, self.confidence_delta) * 0.3
        enable_bonus = len(self.enable) * 0.05
        return max(0.0, base + world_bonus + knowledge_bonus + confidence_bonus + enable_bonus)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "world": self.world,
            "knowledge": self.knowledge,
            "confidence_delta": self.confidence_delta,
            "enable": self.enable,
            "expected_utility": self.expected_utility(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CapabilityEffects":
        """Create from dictionary."""
        return cls(
            world=d.get("world", []),
            knowledge=d.get("knowledge", []),
            confidence_delta=d.get("confidence_delta", 0.0),
            enable=d.get("enable", []),
        )


@dataclass
class FunctionalCapability:
    """A capability backed by a callable function."""
    name: str = ""
    fn: Callable = field(default_factory=lambda: lambda x: {})
    description: str = ""
    effects: CapabilityEffects = field(default_factory=CapabilityEffects)


__all__ = ["CapabilityEffects"]
