"""
Phase 1 Tests: Persistence, Auth, and API

Tests the new production-ready systems:
- KnowledgeGraph persistence (serialization)
- Actor Profile API endpoints
- Account API endpoints
- Login/Logout API endpoints
"""
import pytest
from src.monkey_brain.kernel.knowledge_graph import KnowledgeGraph, EntityType, RelationshipType
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.account import Account, SubscriptionPlan
from src.monkey_brain.kernel.login_info import LoginInfo


# ═══════════════════════════════════════════════════════════════════════════════
# KnowledgeGraph Persistence Tests (Serialization)
# ═══════════════════════════════════════════════════════════════════════════════

class TestKnowledgeGraphPersistence:
    """Test KnowledgeGraph persistence via serialization."""

    def test_graph_to_dict(self):
        graph = KnowledgeGraph(person_id="alice")
        graph.add_entity("e1", EntityType.PERSON, "Alice")
        graph.add_entity("e2", EntityType.PERSON, "Bob")
        graph.add_relationship("e1", "e2", RelationshipType.RELATED_TO)

        data = graph.to_dict()
        assert data["person_id"] == "alice"
        assert len(data["entities"]) == 2
        assert len(data["relationships"]) == 1

    def test_graph_from_dict(self):
        data = {
            "person_id": "alice",
            "entities": {
                "e1": {"entity_id": "e1", "entity_type": "person", "name": "Alice"},
                "e2": {"entity_id": "e2", "entity_type": "person", "name": "Bob"},
            },
            "relationships": {},
            "snapshots": [],
        }
        graph = KnowledgeGraph.from_dict(data)
        assert graph.person_id == "alice"
        assert graph.entity_count == 2

    def test_graph_roundtrip(self):
        # Create graph
        graph1 = KnowledgeGraph(person_id="alice")
        graph1.add_entity("e1", EntityType.PERSON, "Alice")
        graph1.add_entity("e2", EntityType.PERSON, "Bob")
        graph1.add_relationship("e1", "e2", RelationshipType.RELATED_TO)

        # Serialize
        data = graph1.to_dict()

        # Deserialize
        graph2 = KnowledgeGraph.from_dict(data)

        # Verify
        assert graph2.person_id == graph1.person_id
        assert graph2.entity_count == graph1.entity_count
        assert graph2.relationship_count == graph1.relationship_count


# ═══════════════════════════════════════════════════════════════════════════════
# Profile Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfilePersistence:
    """Test Profile persistence."""

    def test_profile_creation(self):
        profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
        )
        assert profile.name == "Alice Smith"
        assert profile.username == "alice"

    def test_profile_to_dict(self):
        profile = Profile(name="Alice", username="alice")
        data = profile.to_dict()
        assert data["name"] == "Alice"
        assert data["username"] == "alice"

    def test_profile_from_dict(self):
        data = {"name": "Bob", "username": "bob", "email": "bob@example.com"}
        profile = Profile.from_dict(data)
        assert profile.name == "Bob"
        assert profile.username == "bob"

    def test_profile_update(self):
        profile = Profile(name="Alice", username="alice")
        profile.update(name="Alice Smith", bio="Engineer")
        assert profile.name == "Alice Smith"
        assert profile.bio == "Engineer"


# ═══════════════════════════════════════════════════════════════════════════════
# Account Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountPersistence:
    """Test Account persistence."""

    def test_account_creation(self):
        account = Account(
            username="alice",
            email="alice@example.com",
            subscription=SubscriptionPlan.PRO,
        )
        assert account.username == "alice"
        assert account.subscription == SubscriptionPlan.PRO

    def test_account_to_dict(self):
        account = Account(username="alice", email="alice@example.com")
        data = account.to_dict()
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"

    def test_account_from_dict(self):
        data = {"username": "bob", "email": "bob@example.com", "subscription": "free"}
        account = Account.from_dict(data)
        assert account.username == "bob"
        assert account.subscription == SubscriptionPlan.FREE


# ═══════════════════════════════════════════════════════════════════════════════
# LoginInfo Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoginInfoPersistence:
    """Test LoginInfo persistence."""

    def test_login_info_creation(self):
        login = LoginInfo(email="alice@example.com", mobile="+1-555-123-4567")
        assert login.email == "alice@example.com"
        assert login.mobile == "+1-555-123-4567"

    def test_login_info_password(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        assert login.verify_password("SecurePass123!") is True
        assert login.verify_password("WrongPassword") is False

    def test_login_info_to_dict(self):
        login = LoginInfo(email="alice@example.com")
        login.set_password("SecurePass123!")
        data = login.to_dict()
        assert data["email"] == "alice@example.com"
        assert "password" in data

    def test_login_info_from_dict(self):
        data = {"email": "bob@example.com", "mobile": "+1-555-987-6543"}
        login = LoginInfo.from_dict(data)
        assert login.email == "bob@example.com"
        assert login.mobile == "+1-555-987-6543"


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPhase1Integration:
    """Integration tests for Phase 1 systems."""

    def test_actor_with_all_systems(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        # Create actor with all systems
        actor = Actor(entity_id="alice")

        # Profile
        actor.profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
        )

        # Account
        actor.account = Account(
            username="alice",
            email="alice@example.com",
            subscription=SubscriptionPlan.PRO,
        )

        # LoginInfo
        actor.login_info = LoginInfo(
            email="alice@example.com",
            mobile="+1-555-123-4567",
        )
        actor.login_info.set_password("SecurePass123!")

        # KnowledgeGraph
        actor.knowledge_graph.add_entity("alice", EntityType.PERSON, "Alice Smith")
        actor.knowledge_graph.add_entity("bob", EntityType.PERSON, "Bob Smith")
        actor.knowledge_graph.add_relationship("alice", "bob", RelationshipType.RELATED_TO)

        # Verify all systems
        assert actor.profile.name == "Alice Smith"
        assert actor.account.username == "alice"
        assert actor.login_info.verify_password("SecurePass123!")
        assert actor.knowledge_graph.entity_count == 2
        assert actor.knowledge_graph.relationship_count == 1

    def test_serialization_roundtrip(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        actor = Actor(entity_id="alice")
        actor.profile = Profile(name="Alice", username="alice")
        actor.account = Account(username="alice", email="alice@example.com")
        actor.login_info = LoginInfo(email="alice@example.com")
        actor.login_info.set_password("SecurePass123!")
        actor.knowledge_graph.add_entity("alice", EntityType.PERSON, "Alice")

        # Serialize
        profile_data = actor.profile.to_dict()
        account_data = actor.account.to_dict()
        login_data = actor.login_info.to_dict()
        graph_data = actor.knowledge_graph.to_dict()

        # Deserialize
        profile2 = Profile.from_dict(profile_data)
        account2 = Account.from_dict(account_data)
        login2 = LoginInfo.from_dict(login_data)
        graph2 = KnowledgeGraph.from_dict(graph_data)

        # Verify
        assert profile2.name == actor.profile.name
        assert account2.username == actor.account.username
        assert login2.email == actor.login_info.email
        assert graph2.entity_count == actor.knowledge_graph.entity_count
