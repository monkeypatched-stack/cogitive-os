"""
Comprehensive Affiliations System Test Suite

Tests the full affiliations subsystem including:
- AffiliationManager: CRUD, trust, permissions, discovery
- TrustEngine: Trust evolution, decay, recovery
- Affiliation types: 40+ pre-built types
- Serialization: to_dict/from_dict roundtrip
- Integration with Actor and CognitiveOS
"""
import pytest
from src.monkey_brain.kernel.affiliations.manager import AffiliationManager
from src.monkey_brain.kernel.affiliations.trust import TrustEngine
from src.monkey_brain.kernel.affiliations.affiliation import Affiliation
from src.monkey_brain.kernel.affiliations.types import (
    FAMILY, FRIENDSHIP, MARRIAGE, EMPLOYMENT, CUSTOMER, SUPPLIER,
    AI_AGENT, PEER, COLLABORATOR, STUDENT, TEACHER, PATIENT, DOCTOR,
    ALL_TYPES, AffiliationType, TrustModel, LifecycleRules, Cardinality,
)
from src.monkey_brain.kernel.affiliations.family import FamilyAffiliation
from src.monkey_brain.kernel.affiliations.employment import EmploymentAffiliation
from src.monkey_brain.kernel.affiliations.education import EducationAffiliation
from src.monkey_brain.kernel.ontology.entity import Actor
from src.monkey_brain.kernel.cognitive_os.cognitive_os import CognitiveOS


# ═══════════════════════════════════════════════════════════════════════════════
# TrustEngine Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrustEngine:
    """Core trust engine functionality"""

    def test_default_trust(self):
        engine = TrustEngine()
        assert engine.get_trust("alice", "bob") == 0.5

    def test_set_trust(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.8)
        assert engine.get_trust("alice", "bob") == 0.8

    def test_trust_clamping_high(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 1.5)
        assert engine.get_trust("alice", "bob") == 1.0

    def test_trust_clamping_low(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", -0.5)
        assert engine.get_trust("alice", "bob") == 0.0

    def test_update_goal_achieved(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", goal_achieved=True)
        assert engine.get_trust("alice", "bob") > 0.5

    def test_update_goal_failed(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", goal_achieved=False)
        assert engine.get_trust("alice", "bob") < 0.5

    def test_update_recommendation_valid(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", recommendation_valid=True)
        assert engine.get_trust("alice", "bob") > 0.5

    def test_update_recommendation_invalid(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", recommendation_valid=False)
        assert engine.get_trust("alice", "bob") < 0.5

    def test_update_obligation_met(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", obligation_met=True)
        assert engine.get_trust("alice", "bob") > 0.5

    def test_update_obligation_broken(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        engine.update_from_outcome("alice", "bob", obligation_met=False)
        assert engine.get_trust("alice", "bob") < 0.5

    def test_query_trusted(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.8)
        engine.set_trust("alice", "charlie", 0.3)
        trusted = engine.query_trusted("alice", min_trust=0.5)
        assert "bob" in trusted
        assert "charlie" not in trusted

    def test_all_trust(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.8)
        engine.set_trust("alice", "charlie", 0.3)
        all_trust = engine.all_trust("alice")
        assert all_trust == {"bob": 0.8, "charlie": 0.3}

    def test_asymmetric_decay(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        # Multiple failures should decay faster than successes grow
        for _ in range(5):
            engine.update_from_outcome("alice", "bob", goal_achieved=False)
        trust_after_failures = engine.get_trust("alice", "bob")
        
        engine.set_trust("alice", "bob", 0.5)
        for _ in range(5):
            engine.update_from_outcome("alice", "bob", goal_achieved=True)
        trust_after_successes = engine.get_trust("alice", "bob")
        
        # Decay should be stronger than growth
        assert (0.5 - trust_after_failures) > (trust_after_successes - 0.5)


# ═══════════════════════════════════════════════════════════════════════════════
# AffiliationManager Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAffiliationManagerCRUD:
    """AffiliationManager CRUD operations"""

    def test_add_affiliation(self):
        mgr = AffiliationManager()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.7,
        )
        mgr.add(aff)
        assert mgr.count() == 1

    def test_get_affiliation(self):
        mgr = AffiliationManager()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
        )
        mgr.add(aff)
        retrieved = mgr.get("aff_001")
        assert retrieved is not None
        assert retrieved.target_id == "bob"

    def test_update_affiliation(self):
        mgr = AffiliationManager()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.5,
        )
        mgr.add(aff)
        updated = mgr.update("aff_001", trust_level=0.9)
        assert updated.trust_level == 0.9

    def test_remove_affiliation(self):
        mgr = AffiliationManager()
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
        )
        mgr.add(aff)
        assert mgr.remove("aff_001") is True
        assert mgr.count() == 0

    def test_remove_nonexistent(self):
        mgr = AffiliationManager()
        assert mgr.remove("nonexistent") is False

    def test_all_affiliations(self):
        mgr = AffiliationManager()
        for i in range(5):
            mgr.add(Affiliation(
                affiliation_id=f"aff_{i}",
                affiliation_type="friendship",
                target_id=f"person_{i}",
                target_name=f"Person {i}",
            ))
        assert len(mgr.all()) == 5


class TestAffiliationManagerFiltering:
    """AffiliationManager filtering operations"""

    def _setup_manager(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="fam_001", affiliation_type="family",
            target_id="mom", target_name="Mom", trust_level=0.9,
        ))
        mgr.add(Affiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp", trust_level=0.6,
        ))
        mgr.add(Affiliation(
            affiliation_id="edu_001", affiliation_type="student",
            target_id="university", target_name="MIT", trust_level=0.7,
        ))
        return mgr

    def test_by_type(self):
        mgr = self._setup_manager()
        family = mgr.by_type("family")
        assert len(family) == 1
        assert family[0].target_id == "mom"

    def test_by_target(self):
        mgr = self._setup_manager()
        results = mgr.by_target("employer")
        assert len(results) == 1

    def test_by_category(self):
        mgr = self._setup_manager()
        personal = mgr.by_category("personal")
        assert len(personal) == 1

    def test_by_subtype(self):
        mgr = self._setup_manager()
        employment = mgr.by_subtype("employment")
        assert len(employment) == 1


class TestAffiliationManagerTrust:
    """AffiliationManager trust operations"""

    def test_get_trust(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        assert mgr.get_trust("bob") == 0.8

    def test_set_trust(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.5,
        ))
        mgr.set_trust("bob", 0.9)
        assert mgr.get_trust("bob") == 0.9

    def test_update_trust_from_outcome(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.5,
        ))
        mgr.update_trust_from_outcome("bob", goal_achieved=True)
        assert mgr.get_trust("bob") > 0.5

    def test_trusted_participants(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        mgr.add(Affiliation(
            affiliation_id="aff_002", affiliation_type="friendship",
            target_id="charlie", target_name="Charlie", trust_level=0.3,
        ))
        trusted = mgr.trusted_participants(min_trust=0.5)
        assert len(trusted) == 1
        assert trusted[0].target_id == "bob"


class TestAffiliationManagerPermissions:
    """AffiliationManager permission operations"""

    def test_by_permission(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp",
            permissions=("read", "write", "execute"),
        ))
        results = mgr.by_permission("write")
        assert len(results) == 1

    def test_has_permission(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp",
            permissions=("read", "write"),
        ))
        assert mgr.has_permission("employer", "read") is True
        assert mgr.has_permission("employer", "admin") is False

    def test_has_permission_wrong_target(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp",
            permissions=("read", "write"),
        ))
        assert mgr.has_permission("other", "read") is False


class TestAffiliationManagerDiscovery:
    """AffiliationManager discovery operations"""

    def test_discover_by_goal(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp", trust_level=0.7,
        ))
        mgr.add(Affiliation(
            affiliation_id="fam_001", affiliation_type="family",
            target_id="mom", target_name="Mom", trust_level=0.9,
        ))
        # "job" should match employment
        participants = mgr.discover_participants("accept_job_offer")
        assert any(p.target_id == "employer" for p in participants)

    def test_discover_by_keyword(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="edu_001", affiliation_type="student",
            target_id="university", target_name="MIT", trust_level=0.7,
        ))
        participants = mgr.discover_participants("enroll_in_course")
        assert any(p.target_id == "university" for p in participants)

    def test_discover_sorted_by_trust(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme", trust_level=0.6,
        ))
        mgr.add(Affiliation(
            affiliation_id="emp_002", affiliation_type="employment",
            target_id="employer2", target_name="TechCo", trust_level=0.9,
        ))
        participants = mgr.discover_participants("apply_for_job")
        if len(participants) >= 2:
            assert participants[0].trust_level >= participants[1].trust_level

    def test_participants_alias(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp", trust_level=0.7,
        ))
        result1 = mgr.discover_participants("get_hired")
        result2 = mgr.participants("get_hired")
        assert len(result1) == len(result2)


# ═══════════════════════════════════════════════════════════════════════════════
# Affiliation Types Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAffiliationTypes:
    """Affiliation type definitions"""

    def test_all_types_populated(self):
        assert len(ALL_TYPES) > 0

    def test_family_type(self):
        assert FAMILY.id == "family"
        assert FAMILY.category == "personal"
        assert FAMILY.bidirectional is True

    def test_employment_type(self):
        assert EMPLOYMENT.id == "employment"
        assert EMPLOYMENT.category == "organizational"

    def test_ai_agent_type(self):
        assert AI_AGENT.id == "ai_agent"
        assert AI_AGENT.category == "digital"

    def test_trust_model(self):
        model = TrustModel(initial_trust=0.6, growth_rate=0.1, decay_rate=-0.15)
        assert model.initial_trust == 0.6
        assert model.growth_rate == 0.1
        assert model.decay_rate == -0.15

    def test_lifecycle_rules(self):
        rules = LifecycleRules(requires_mutual_consent=True, auto_expire=False)
        assert rules.requires_mutual_consent is True
        assert rules.auto_expire is False

    def test_cardinality(self):
        assert Cardinality.ONE_TO_ONE.value == "one_to_one"
        assert Cardinality.ONE_TO_MANY.value == "one_to_many"
        assert Cardinality.MANY_TO_MANY.value == "many_to_many"


# ═══════════════════════════════════════════════════════════════════════════════
# Subclass Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestFamilyAffiliation:
    """FamilyAffiliation subclass"""

    def test_creation(self):
        aff = FamilyAffiliation(
            affiliation_id="fam_001",
            affiliation_type="family",
            target_id="mom",
            target_name="Mom",
            trust_level=0.9,
            branch="maternal",
            relation="mother",
        )
        assert aff.branch == "maternal"
        assert aff.relation == "mother"

    def test_inherits_base(self):
        aff = FamilyAffiliation(
            affiliation_id="fam_001",
            affiliation_type="family",
            target_id="mom",
            target_name="Mom",
        )
        assert hasattr(aff, 'permissions')
        assert hasattr(aff, 'trust_level')


class TestEmploymentAffiliation:
    """EmploymentAffiliation subclass"""

    def test_creation(self):
        aff = EmploymentAffiliation(
            affiliation_id="emp_001",
            affiliation_type="employment",
            target_id="employer",
            target_name="Acme Corp",
            role="Engineer",
            start_date="2024-01-01",
            status="active",
        )
        assert aff.role == "Engineer"
        assert aff.start_date == "2024-01-01"
        assert aff.status == "active"


class TestEducationAffiliation:
    """EducationAffiliation subclass"""

    def test_creation(self):
        aff = EducationAffiliation(
            affiliation_id="edu_001",
            affiliation_type="student",
            target_id="university",
            target_name="MIT",
            institution="MIT",
            program="Computer Science",
            degree="PhD",
            status="enrolled",
        )
        assert aff.institution == "MIT"
        assert aff.program == "Computer Science"
        assert aff.degree == "PhD"


# ═══════════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSerialization:
    """Serialization roundtrip tests"""

    def test_to_dict(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        data = mgr.to_dict()
        assert "affiliations" in data
        assert "trust" in data
        assert len(data["affiliations"]) == 1

    def test_from_dict(self):
        data = {
            "affiliations": [
                {
                    "affiliation_id": "aff_001",
                    "affiliation_type": "friendship",
                    "target_id": "bob",
                    "target_name": "Bob",
                    "trust_level": 0.8,
                    "permissions": ["chat"],
                    "policies": [],
                    "priority": 0,
                    "valid_from": "",
                    "valid_until": "",
                    "metadata": {},
                }
            ],
            "trust": {"bob": 0.8},
        }
        mgr = AffiliationManager.from_dict(data)
        assert mgr.count() == 1
        assert mgr.get_trust("bob") == 0.8

    def test_roundtrip(self):
        mgr = AffiliationManager()
        mgr.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        mgr.add(FamilyAffiliation(
            affiliation_id="fam_001", affiliation_type="family",
            target_id="mom", target_name="Mom", trust_level=0.9,
            branch="maternal", relation="mother",
        ))
        data = mgr.to_dict()
        mgr2 = AffiliationManager.from_dict(data)
        assert mgr2.count() == 2

    def test_family_serialization(self):
        mgr = AffiliationManager()
        mgr.add(FamilyAffiliation(
            affiliation_id="fam_001", affiliation_type="family",
            target_id="mom", target_name="Mom", trust_level=0.9,
            branch="maternal", relation="mother",
        ))
        data = mgr.to_dict()
        assert data["affiliations"][0]["branch"] == "maternal"
        assert data["affiliations"][0]["relation"] == "mother"

    def test_employment_serialization(self):
        mgr = AffiliationManager()
        mgr.add(EmploymentAffiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme Corp",
            role="Engineer", start_date="2024-01-01", status="active",
        ))
        data = mgr.to_dict()
        assert data["affiliations"][0]["role"] == "Engineer"
        assert data["affiliations"][0]["status"] == "active"


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_affiliations(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'affiliations')
        assert isinstance(a.affiliations, AffiliationManager)

    def test_actor_add_affiliation(self):
        a = Actor(entity_id="alice")
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.7,
        ))
        assert a.affiliations.count() == 1

    def test_actor_trust(self):
        a = Actor(entity_id="alice")
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.7,
        ))
        assert a.affiliations.get_trust("bob") == 0.7


class TestCognitiveOSIntegration:
    """Integration with CognitiveOS"""

    def test_os_trust_check(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        assert os._check_trust("bob") is True

    def test_os_trust_check_low(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="enemy", target_name="Enemy", trust_level=0.1,
        ))
        assert os._check_trust("enemy") is False

    def test_os_send_message_allowed(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="bob", target_name="Bob", trust_level=0.8,
        ))
        assert os.send_message("bob", "test") is True

    def test_os_send_message_blocked(self):
        os = CognitiveOS()
        a = Actor(entity_id="alice")
        os.set_actor(a)
        a.affiliations.add(Affiliation(
            affiliation_id="aff_001", affiliation_type="friendship",
            target_id="enemy", target_name="Enemy", trust_level=0.1,
        ))
        assert os.send_message("enemy", "test") is False


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAffiliationStress:
    """Stress tests for affiliations system"""

    def test_hundred_affiliations(self):
        mgr = AffiliationManager()
        for i in range(100):
            mgr.add(Affiliation(
                affiliation_id=f"aff_{i}",
                affiliation_type="friendship",
                target_id=f"person_{i}",
                target_name=f"Person {i}",
                trust_level=0.5,
            ))
        assert mgr.count() == 100

    def test_trust_evolution_stability(self):
        engine = TrustEngine()
        engine.set_trust("alice", "bob", 0.5)
        for _ in range(100):
            engine.update_from_outcome("alice", "bob", goal_achieved=True)
        trust = engine.get_trust("alice", "bob")
        assert 0.0 <= trust <= 1.0

    def test_concurrent_trust_updates(self):
        engine = TrustEngine()
        targets = [f"target_{i}" for i in range(50)]
        for t in targets:
            engine.set_trust("self", t, 0.5)
        for t in targets:
            engine.update_from_outcome("self", t, goal_achieved=True)
        for t in targets:
            assert 0.0 <= engine.get_trust("self", t) <= 1.0
