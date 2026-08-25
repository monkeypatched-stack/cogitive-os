"""Core Ontology — the stable, versioned foundation.

~160 concepts organized into categories:
    World    — what exists (16 types)
    Actor    — what actors are (17 types)
    Cognition — goals (24 types) + beliefs (14 types)
    Social   — affiliations/relationships (21 types)
    Capability — what actors can do (21 types)

Domain extensions (healthcare, manufacturing, etc.) extend this
core without modifying it.
"""
from typing import Any
from .world import ALL_WORLD, WorldConcept
from .actor import ALL_ACTOR, ActorConcept, ActorTrustModel, ActorLifecycle
from .cognition import (
    ALL_GOALS, GoalConcept, GoalConstraints,
    ALL_BELIEFS, BeliefConcept, ConfidenceModel,
)
from .social import ALL_AFFILIATIONS, AffiliationConcept, SocialTrustModel, SocialLifecycle
from .capability import ALL_CAPABILITIES, CapabilityConcept, PrerequisiteModel

ALL_CORE: dict[str, Any] = {}
ALL_CORE.update(ALL_WORLD)
ALL_CORE.update(ALL_ACTOR)
ALL_CORE.update(ALL_GOALS)
ALL_CORE.update(ALL_BELIEFS)
ALL_CORE.update(ALL_AFFILIATIONS)
ALL_CORE.update(ALL_CAPABILITIES)

__all__ = [
    "ALL_CORE", "ALL_WORLD", "ALL_ACTOR", "ALL_GOALS", "ALL_BELIEFS",
    "ALL_AFFILIATIONS", "ALL_CAPABILITIES",
    "WorldConcept", "ActorConcept", "GoalConcept", "BeliefConcept",
    "AffiliationConcept", "CapabilityConcept",
]
