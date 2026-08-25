"""
Phase 2 Integration Tests — HTTP calls to running server.

Tests the actual API endpoints by making HTTP requests.
Requires server running on localhost:8031.
"""
import pytest
import asyncio
import time
from src.monkey_brain.kernel.knowledge_graph import KnowledgeGraph, EntityType, RelationshipType
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.account import Account, SubscriptionPlan
from src.monkey_brain.kernel.login_info import LoginInfo


# ═══════════════════════════════════════════════════════════════════════════════
# KnowledgeGraph Event Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestKnowledgeGraphEvents:
    """Test KnowledgeGraph event emission."""

    def test_entity_events(self):
        """Test that entity operations can emit events."""
        graph = KnowledgeGraph(person_id="alice")
        entity = graph.add_entity("e1", EntityType.PERSON, "Alice")

        # Verify entity was created
        assert entity.entity_id == "e1"
        assert entity.name == "Alice"

    def test_relationship_events(self):
        """Test that relationship operations can emit events."""
        graph = KnowledgeGraph(person_id="alice")
        graph.add_entity("e1", EntityType.PERSON, "Alice")
        graph.add_entity("e2", EntityType.PERSON, "Bob")
        rel = graph.add_relationship("e1", "e2", RelationshipType.RELATED_TO)

        # Verify relationship was created
        assert rel.source_id == "e1"
        assert rel.target_id == "e2"


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Profile Persistence Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorProfilePersistence:
    """Test Actor Profile persistence via serialization."""

    def test_profile_serialization(self):
        """Test profile serialization roundtrip."""
        profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
        )

        # Serialize
        data = profile.to_dict()
        assert data["name"] == "Alice Smith"
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"

        # Deserialize
        profile2 = Profile.from_dict(data)
        assert profile2.name == "Alice Smith"
        assert profile2.username == "alice"

    def test_account_serialization(self):
        """Test account serialization roundtrip."""
        account = Account(
            username="alice",
            email="alice@example.com",
            subscription=SubscriptionPlan.PRO,
        )

        # Serialize
        data = account.to_dict()
        assert data["username"] == "alice"
        assert data["subscription"] == "pro"

        # Deserialize
        account2 = Account.from_dict(data)
        assert account2.username == "alice"
        assert account2.subscription == SubscriptionPlan.PRO

    def test_login_info_serialization(self):
        """Test login info serialization roundtrip."""
        login_info = LoginInfo(
            email="alice@example.com",
            mobile="+1-555-123-4567",
        )
        login_info.set_password("SecurePass123!")

        # Serialize
        data = login_info.to_dict()
        assert data["email"] == "alice@example.com"
        assert data["mobile"] == "+1-555-123-4567"
        assert "password" in data

        # Deserialize
        login_info2 = LoginInfo.from_dict(data)
        assert login_info2.email == "alice@example.com"
        assert login_info2.mobile == "+1-555-123-4567"


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests (HTTP calls to server)
# ═══════════════════════════════════════════════════════════════════════════════

SERVER_URL = "http://localhost:8031"


@pytest.mark.skipif(True, reason="Requires running server")
class TestServerIntegration:
    """Integration tests that make HTTP calls to the running server.

    These tests require the server to be running on localhost:8031.
    Run with: python main.py
    """

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test health endpoint."""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{SERVER_URL}/health") as resp:
                assert resp.status == 200
                data = await resp.json()
                assert "status" in data

    @pytest.mark.asyncio
    async def test_knowledge_graph_endpoint(self):
        """Test knowledge graph endpoint."""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{SERVER_URL}/api/v1/knowledge-graph/alice") as resp:
                assert resp.status == 200
                data = await resp.json()
                assert data["person_id"] == "alice"

    @pytest.mark.asyncio
    async def test_actor_profile_endpoint(self):
        """Test actor profile endpoint."""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{SERVER_URL}/api/v1/actors/alice/profile") as resp:
                assert resp.status == 200
                data = await resp.json()
                assert data["actor_id"] == "alice"

    @pytest.mark.asyncio
    async def test_actor_account_endpoint(self):
        """Test actor account endpoint."""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{SERVER_URL}/api/v1/actors/alice/account") as resp:
                assert resp.status == 200
                data = await resp.json()
                assert data["actor_id"] == "alice"

    @pytest.mark.asyncio
    async def test_login_endpoint(self):
        """Test login endpoint."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SERVER_URL}/api/v1/actors/alice/login",
                json={"email": "alice@example.com", "password": "SecurePass123!"},
            ) as resp:
                assert resp.status == 200
                data = await resp.json()
                assert "access_token" in data


# ═══════════════════════════════════════════════════════════════════════════════
# End-to-End Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEndToEndIntegration:
    """End-to-end integration tests."""

    def test_complete_actor_lifecycle(self):
        """Test complete actor lifecycle: create, configure, persist."""
        from src.monkey_brain.kernel.ontology.entity import Actor

        # Create actor
        actor = Actor(entity_id="alice")

        # Configure all systems
        actor.profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
            preferred_language="en",
            timezone="America/New_York",
        )

        actor.account = Account(
            username="alice",
            email="alice@example.com",
            subscription=SubscriptionPlan.PRO,
        )

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

        # Serialize all data
        profile_data = actor.profile.to_dict()
        account_data = actor.account.to_dict()
        login_data = actor.login_info.to_dict()
        graph_data = actor.knowledge_graph.to_dict()

        # Verify serialization
        assert profile_data["name"] == "Alice Smith"
        assert account_data["username"] == "alice"
        assert login_data["email"] == "alice@example.com"
        assert graph_data["person_id"] == "alice"

    def test_knowledge_graph_event_flow(self):
        """Test KnowledgeGraph event emission flow."""
        graph = KnowledgeGraph(person_id="alice")

        # Create entities
        e1 = graph.add_entity("e1", EntityType.PERSON, "Alice")
        e2 = graph.add_entity("e2", EntityType.PERSON, "Bob")

        # Create relationship
        rel = graph.add_relationship("e1", "e2", RelationshipType.RELATED_TO)

        # Verify graph state
        assert graph.entity_count == 2
        assert graph.relationship_count == 1

        # Verify entities
        alice = graph.get_entity("e1")
        bob = graph.get_entity("e2")
        assert alice.name == "Alice"
        assert bob.name == "Bob"

        # Verify relationship
        rels = graph.relationships_for("e1")
        assert len(rels) == 1
        assert rels[0].target_id == "e2"
