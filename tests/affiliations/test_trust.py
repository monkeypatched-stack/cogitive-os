import pytest
from src.monkey_brain.kernel.affiliations.trust import TrustEngine


class TestTrustEngine:
    def test_default_trust(self):
        te = TrustEngine()
        assert te.get_trust("alice", "bob") == 0.5

    def test_set_trust(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.9)
        assert te.get_trust("alice", "bob") == 0.9

    def test_clamp_trust_bounds(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 1.5)
        assert te.get_trust("alice", "bob") == 1.0
        te.set_trust("alice", "bob", -0.5)
        assert te.get_trust("alice", "bob") == 0.0

    def test_update_good_recommendation(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.7)
        te.update_from_outcome("alice", "bob", goal_achieved=True, recommendation_valid=True)
        assert te.get_trust("alice", "bob") > 0.7

    def test_update_bad_recommendation(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.7)
        te.update_from_outcome("alice", "bob", goal_achieved=False, recommendation_valid=False)
        assert te.get_trust("alice", "bob") < 0.7

    def test_update_obligation_met(self):
        te = TrustEngine()
        te.set_trust("alice", "employer", 0.6)
        te.update_from_outcome("alice", "employer", goal_achieved=True, obligation_met=True)
        assert te.get_trust("alice", "employer") > 0.6

    def test_update_obligation_breach(self):
        te = TrustEngine()
        te.set_trust("alice", "employer", 0.6)
        te.update_from_outcome("alice", "employer", goal_achieved=False, obligation_met=False)
        assert te.get_trust("alice", "employer") < 0.6

    def test_query_trusted(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.8)
        te.set_trust("alice", "carol", 0.3)
        te.set_trust("alice", "dave", 0.9)
        trusted = te.query_trusted("alice", min_trust=0.5)
        assert "bob" in trusted
        assert "dave" in trusted
        assert "carol" not in trusted

    def test_decay_faster_than_growth(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.5)
        te.update_from_outcome("alice", "bob", goal_achieved=True)
        after_good = te.get_trust("alice", "bob")
        te.set_trust("alice", "bob", 0.5)
        te.update_from_outcome("alice", "bob", goal_achieved=False)
        after_bad = te.get_trust("alice", "bob")
        assert (0.5 - after_bad) > (after_good - 0.5)

    def test_symmetric_default(self):
        te = TrustEngine()
        te.set_trust("alice", "bob", 0.8)
        assert te.get_trust("bob", "alice") == 0.5
