import pytest
from src.monkey_brain.kernel.ontology import (
    ALL_CORE, ALL_WORLD, ALL_ACTOR, ALL_GOALS, ALL_BELIEFS,
    ALL_AFFILIATIONS, ALL_CAPABILITIES,
)


class TestOntologyHierarchy:
    def test_total_concept_count(self):
        assert len(ALL_CORE) >= 100

    def test_world_types(self):
        assert "material" in ALL_WORLD
        assert "data" in ALL_WORLD
        assert "energy" in ALL_WORLD

    def test_actor_types(self):
        assert "human" in ALL_ACTOR
        assert "ai_agent" in ALL_ACTOR
        assert "enterprise" in ALL_ACTOR

    def test_goal_types(self):
        assert "self_preservation" in ALL_GOALS
        assert "wealth" in ALL_GOALS
        assert "legacy" in ALL_GOALS

    def test_belief_types(self):
        assert "observation" in ALL_BELIEFS
        assert "trust_belief" in ALL_BELIEFS
        assert "causation" in ALL_BELIEFS

    def test_affiliation_types(self):
        assert "family" in ALL_AFFILIATIONS
        assert "employment" in ALL_AFFILIATIONS
        assert "ai_agent" in ALL_AFFILIATIONS

    def test_capability_types(self):
        assert "coding" in ALL_CAPABILITIES
        assert "diagnosis" in ALL_CAPABILITIES
        assert "teaching" in ALL_CAPABILITIES

    def test_no_id_collisions_within_categories(self):
        for name, category in [("world", ALL_WORLD), ("actor", ALL_ACTOR),
                               ("goals", ALL_GOALS), ("beliefs", ALL_BELIEFS),
                               ("affiliations", ALL_AFFILIATIONS), ("capabilities", ALL_CAPABILITIES)]:
            ids = list(category.keys())
            assert len(ids) == len(set(ids)), f"Duplicate id in {name}"
