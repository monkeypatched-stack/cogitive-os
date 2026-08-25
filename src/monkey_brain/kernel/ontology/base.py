"""Base OntologyType — the foundation for all semantic concepts.

Every ontology concept (ActorType, CapabilityType, GoalType, etc.)
derives from this base. It defines the shared metadata pattern:
    - id: unique identifier
    - category: grouping within the ontology
    - description: human-readable explanation

Domain extensions subclass this to add domain-specific metadata.
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class OntologyType:
    """Base for all semantic concepts in the platform.

    Core ontologies are stable, versioned, and backward compatible.
    Domain extensions (healthcare, manufacturing, etc.) extend the core
    without modifying it.
    """
    id: str
    category: str
    description: str = ""
