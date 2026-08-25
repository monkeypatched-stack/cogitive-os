import pytest
from src.monkey_brain.kernel.ontology.entity import (
    Actor, Identity, GoalState, BeliefState, CapabilityState, ResourceState,
)


class TestIdentity:
    def test_create(self):
        i = Identity(actor_type_id="human", name="Alice")
        assert i.actor_type_id == "human"
        assert i.name == "Alice"

    def test_with_description(self):
        i = Identity(actor_type_id="ai_agent", name="Bot", description="AI assistant")
        assert i.description == "AI assistant"


class TestActorGoals:
    def test_add_goal(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        g = a.add_goal("wealth", priority=30)
        assert g.goal_type_id == "wealth"
        assert g.priority == 30
        assert len(a.goal_states) == 1

    def test_remove_goal(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_goal("wealth")
        a.add_goal("safety")
        assert a.remove_goal("wealth") is True
        assert len(a.goal_states) == 1

    def test_active_goals(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_goal("wealth")
        a.add_goal("safety")
        assert len(a.active_goals()) == 2

    def test_top_goal(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_goal("wealth", priority=40)
        a.add_goal("safety", priority=5)
        top = a.top_goal()
        assert top.goal_type_id == "safety"

    def test_update_progress(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_goal("wealth")
        a.update_goal_progress("wealth", 0.75)
        assert a.goal_states[0].progress == 0.75

    def test_current_goal_from_constructor(self):
        a = Actor(entity_id="a1", actor_type_id="human", goals=["wealth", "safety"])
        assert a._current_goal == "wealth"
        assert a._goals == ["wealth", "safety"]


class TestActorBeliefs:
    def test_add_belief(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        b = a.add_belief("observation", "store_a_stock", confidence=0.8)
        assert b.belief_type_id == "observation"
        assert b.confidence == 0.8
        assert len(a.beliefs) == 1

    def test_beliefs_about(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_belief("observation", "store_a", confidence=0.8)
        a.add_belief("observation", "store_b", confidence=0.6)
        a.add_belief("trust_belief", "store_a", confidence=0.9)
        about_a = a.beliefs_about("store_a")
        assert len(about_a) == 2

    def test_beliefs_by_type(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_belief("observation", "store_a", confidence=0.8)
        a.add_belief("trust_belief", "store_a", confidence=0.9)
        obs = a.beliefs_by_type("observation")
        assert len(obs) == 1

    def test_highest_confidence(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_belief("observation", "store_a", confidence=0.3)
        a.add_belief("observation", "store_a", confidence=0.9)
        best = a.highest_confidence("store_a")
        assert best.confidence == 0.9

    def test_decay_beliefs(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_belief("observation", "store_a", confidence=0.3)
        a.add_belief("observation", "store_b", confidence=0.02)
        removed = a.decay_beliefs(decay_rate=0.05)
        assert removed == 1
        assert len(a.beliefs) == 1


class TestActorCapabilities:
    def test_add_capability(self):
        a = Actor(entity_id="a1", actor_type_id="ai_agent")
        c = a.add_capability("coding", proficiency=0.8)
        assert c.capability_type_id == "coding"
        assert c.proficiency == 0.8

    def test_has_capability(self):
        a = Actor(entity_id="a1", actor_type_id="ai_agent")
        a.add_capability("coding")
        assert a.has_capability("coding") is True
        assert a.has_capability("diagnosis") is False

    def test_best_capability(self):
        a = Actor(entity_id="a1", actor_type_id="ai_agent")
        a.add_capability("coding", proficiency=0.5)
        a.add_capability("coding", proficiency=0.9)
        best = a.best_capability("coding")
        assert best.proficiency == 0.9


class TestActorResources:
    def test_add_resource(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        r = a.add_resource("money", quantity=1000, unit="USD")
        assert r.quantity == 1000

    def test_has_resource(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_resource("money", quantity=1000)
        assert a.has_resource("money", min_quantity=500) is True
        assert a.has_resource("money", min_quantity=2000) is False

    def test_resource_quantity(self):
        a = Actor(entity_id="a1", actor_type_id="human")
        a.add_resource("money", quantity=500)
        a.add_resource("money", quantity=300)
        assert a.resource_quantity("money") == 800


class TestActorOntologyIntegration:
    def test_actor_with_full_ontology(self):
        a = Actor(entity_id="alice", actor_type_id="human", name="Alice",
                 goals=["wealth", "safety"], objective="cost")

        # Identity
        assert a.actor_type_id == "human"
        assert a.identity.name == "Alice"

        # Goals
        a.add_goal("mastery", priority=20)
        assert len(a.goal_states) == 3
        assert a.top_goal().goal_type_id == "mastery"

        # Beliefs
        a.add_belief("observation", "store_a", confidence=0.8)
        a.add_belief("trust_belief", "store_b", confidence=0.6)
        assert len(a.beliefs) == 2

        # Capabilities
        a.add_capability("coding", proficiency=0.9)
        a.add_capability("analysis", proficiency=0.7)
        assert a.has_capability("coding")

        # Resources
        a.add_resource("money", quantity=5000, unit="USD")
        a.add_resource("time", quantity=8, unit="hours")
        assert a.resource_quantity("money") == 5000

        # Affiliations
        from src.monkey_brain.kernel.affiliations.family import FamilyAffiliation
        a.affiliations.add(FamilyAffiliation(
            affiliation_id="f1", affiliation_type="family",
            target_id="bob", target_name="Bob",
            trust_level=0.9, metadata={}, branch="creation", relation="spouse",
        ))
        assert len(a.affiliations.all()) == 1

    def test_actor_hash_and_eq(self):
        a1 = Actor(entity_id="alice", actor_type_id="human")
        a2 = Actor(entity_id="alice", actor_type_id="ai_agent")
        a3 = Actor(entity_id="bob", actor_type_id="human")
        assert a1 == a2
        assert a1 != a3
        assert len({a1, a2, a3}) == 2
