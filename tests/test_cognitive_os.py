import pytest
import asyncio
from src.monkey_brain.kernel.cognitive_os.cognitive_os import (
    CognitiveOS, GoalEvaluation, CapabilityMatch, ResourceCheck, DecisionSynthesis,
    TRUST_COMMUNICATION_THRESHOLD,
)
from src.monkey_brain.kernel.ontology.entity import Actor


class TestCognitiveOSOwnership:
    def test_one_to_one(self):
        os = CognitiveOS()
        a1 = Actor(entity_id="alice", actor_type_id="human")
        os.set_actor(a1)
        assert os.actor is a1

    def test_reject_second(self):
        os = CognitiveOS()
        os.set_actor(Actor(entity_id="alice"))
        with pytest.raises(RuntimeError):
            os.set_actor(Actor(entity_id="bob"))

    def test_tick_delegates_to_actor_canonical_loop(self):
        os = CognitiveOS()

        class ManagedActor:
            entity_id = "managed"

            def set_world(self, world):
                self.world = world

            async def tick(self):
                return {"canonical": True}

        actor = ManagedActor()
        os.set_actor(actor)
        assert asyncio.run(os.tick()) == {"canonical": True}


class TestTrustEnforcement:
    def test_check_trust_high(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(type("Aff", (), {
            "affiliation_id": "f1", "affiliation_type": "family",
            "target_id": "bob", "target_name": "Bob",
            "trust_level": 0.9, "permissions": (), "policies": (),
            "priority": 0, "valid_from": "", "valid_until": "", "metadata": {},
        })())
        assert os._check_trust("bob") is True

    def test_check_trust_low(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(type("Aff", (), {
            "affiliation_id": "f1", "affiliation_type": "family",
            "target_id": "enemy", "target_name": "Enemy",
            "trust_level": 0.1, "permissions": (), "policies": (),
            "priority": 0, "valid_from": "", "valid_until": "", "metadata": {},
        })())
        assert os._check_trust("enemy") is False

    def test_send_message_blocked(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(type("Aff", (), {
            "affiliation_id": "f1", "affiliation_type": "family",
            "target_id": "enemy", "target_name": "Enemy",
            "trust_level": 0.1, "permissions": (), "policies": (),
            "priority": 0, "valid_from": "", "valid_until": "", "metadata": {},
        })())
        assert os.send_message("enemy", "test") is False

    def test_send_message_allowed(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(type("Aff", (), {
            "affiliation_id": "f1", "affiliation_type": "family",
            "target_id": "bob", "target_name": "Bob",
            "trust_level": 0.9, "permissions": (), "policies": (),
            "priority": 0, "valid_from": "", "valid_until": "", "metadata": {},
        })())
        assert os.send_message("bob", "test") is True

    def test_update_trust(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(type("Aff", (), {
            "affiliation_id": "f1", "affiliation_type": "family",
            "target_id": "bob", "target_name": "Bob",
            "trust_level": 0.5, "permissions": (), "policies": (),
            "priority": 0, "valid_from": "", "valid_until": "", "metadata": {},
        })())
        initial = os._get_actor_trust("bob")
        os._update_trust("bob", goal_achieved=True)
        assert os._get_actor_trust("bob") > initial


class TestReasoning:
    def _make_actor_with_ontology(self):
        a = Actor(entity_id="alice", actor_type_id="human",
                 goals=["wealth", "safety"], objective="cost")
        a.add_goal("mastery", priority=20)
        a.add_belief("observation", "market", confidence=0.7)
        a.add_belief("observation", "risk", confidence=0.4)
        a.add_capability("analysis", proficiency=0.8)
        a.add_capability("planning", proficiency=0.6)
        a.add_capability("investment", proficiency=0.7)
        a.add_capability("accounting", proficiency=0.5)
        a.add_capability("reasoning", proficiency=0.9)
        a.add_capability("communication", proficiency=0.6)
        a.add_resource("money", quantity=1000, unit="USD")
        a.add_resource("time", quantity=8, unit="hours")
        return a

    def test_evaluate_goals(self):
        os = CognitiveOS()
        a = self._make_actor_with_ontology()
        os.set_actor(a)
        evals = os.evaluate_goals()
        assert len(evals) >= 2
        wealth_eval = next(e for e in evals if e.goal_type_id == "wealth")
        assert wealth_eval.achievable is True
        assert wealth_eval.confidence > 0

    def test_match_capabilities(self):
        os = CognitiveOS()
        a = self._make_actor_with_ontology()
        os.set_actor(a)
        matches = os.match_capabilities()
        assert len(matches) > 0
        analysis_match = next(m for m in matches if m.capability_type_id == "analysis")
        assert analysis_match.available is True

    def test_check_resources(self):
        os = CognitiveOS()
        a = self._make_actor_with_ontology()
        os.set_actor(a)
        checks = os.check_resources({"money": 500, "time": 20})
        money_check = next(c for c in checks if c.resource_type_id == "money")
        assert money_check.available is True
        time_check = next(c for c in checks if c.resource_type_id == "time")
        assert time_check.available is False
        assert time_check.deficit == 12.0

    def test_synthesize(self):
        os = CognitiveOS()
        a = self._make_actor_with_ontology()
        os.set_actor(a)
        decision = os.synthesize()
        assert decision.selected_goal is not None
        assert decision.confidence > 0
        assert len(decision.reasoning) > 0

    def test_synthesize_no_actor(self):
        os = CognitiveOS()
        decision = os.synthesize()
        assert decision.selected_goal is None


class TestOntologyIntegration:
    def test_os_with_actor_using_ontology(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice", actor_type_id="human",
                 goals=["wealth"], objective="cost")
        a.add_capability("investment", proficiency=0.8)
        a.add_capability("accounting", proficiency=0.6)
        a.add_capability("analysis", proficiency=0.7)
        a.add_belief("observation", "market", confidence=0.7)
        a.add_resource("money", quantity=5000)
        os.set_actor(a)

        evals = os.evaluate_goals()
        assert len(evals) == 1
        assert evals[0].goal_type_id == "wealth"

        decision = os.synthesize()
        assert decision.selected_goal == "wealth"
        assert "investment" in decision.selected_capabilities
