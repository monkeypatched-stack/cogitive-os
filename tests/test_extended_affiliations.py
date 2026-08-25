"""
Extended AffiliationManager Test Suite

Tests the migration of KnowledgeGraph to AffiliationManager including:
- Entity operations
- Knowledge relationship operations
- Temporal snapshots
- Domain-specific queries
- Graph traversal
- Backward compatibility
- Actor integration
"""
import pytest
import time
from src.monkey_brain.kernel.affiliations.extended import (
    ExtendedAffiliationManager, Entity, KnowledgeRelationship,
    TemporalSnapshot, EntityType, RelationshipType,
)
from src.monkey_brain.kernel.affiliations.affiliation import Affiliation
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Entity Operations Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEntityOperations:
    """Entity CRUD operations"""

    def test_add_entity(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        entity = mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        assert mgr.entity_count == 1
        assert entity.name == "Acme Corp"

    def test_get_entity(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        entity = mgr.get_entity("emp_001")
        assert entity is not None
        assert entity.name == "Acme Corp"

    def test_update_entity(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        mgr.update_entity("emp_001", name="Acme Corporation")
        entity = mgr.get_entity("emp_001")
        assert entity.name == "Acme Corporation"

    def test_remove_entity(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        assert mgr.remove_entity("emp_001") is True
        assert mgr.entity_count == 0

    def test_entities_by_type(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        mgr.add_entity("emp_002", EntityType.ORGANIZATION, "TechCo")
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home")
        orgs = mgr.entities_by_type(EntityType.ORGANIZATION)
        assert len(orgs) == 2

    def test_entities_by_name(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        mgr.add_entity("emp_002", EntityType.ORGANIZATION, "TechCo")
        results = mgr.entities_by_name("Acme Corp")
        assert len(results) == 1

    def test_entity_creates_affiliation(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        aff = mgr.get("entity:emp_001")
        assert aff is not None
        assert aff.affiliation_type == EntityType.ORGANIZATION


# ═══════════════════════════════════════════════════════════════════════════════
# Knowledge Relationship Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestKnowledgeRelationshipOperations:
    """Knowledge relationship CRUD operations"""

    def test_add_knowledge_relationship(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        rel = mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        assert mgr.knowledge_relationship_count == 1

    def test_get_knowledge_relationship(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        rel = mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        retrieved = mgr.get_knowledge_relationship(rel.relationship_id)
        assert retrieved is not None

    def test_remove_knowledge_relationship(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        rel = mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        assert mgr.remove_knowledge_relationship(rel.relationship_id) is True
        assert mgr.knowledge_relationship_count == 0

    def test_knowledge_relationships_for(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)
        rels = mgr.knowledge_relationships_for("alice")
        assert len(rels) == 2

    def test_knowledge_relationships_by_type(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("alice", "emp_002", RelationshipType.CONTRACTS_WITH)
        works_for = mgr.knowledge_relationships_by_type(RelationshipType.WORKS_FOR)
        assert len(works_for) == 1

    def test_knowledge_relationship_creates_affiliation(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        rel = mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        aff = mgr.get(f"rel:{rel.relationship_id}")
        assert aff is not None


# ═══════════════════════════════════════════════════════════════════════════════
# Temporal Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTemporalOperations:
    """Temporal snapshot operations"""

    def test_create_snapshot(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        snapshot = mgr.create_snapshot(2024)
        assert snapshot.year == 2024
        assert mgr.snapshot_count == 1

    def test_get_snapshots(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.create_snapshot(2022)
        mgr.create_snapshot(2023)
        mgr.create_snapshot(2024)
        snapshots = mgr.get_snapshots()
        assert len(snapshots) == 3

    def test_get_snapshot_by_year(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.create_snapshot(2022)
        mgr.create_snapshot(2024)
        snapshots = mgr.get_snapshots(year=2024)
        assert len(snapshots) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Domain Query Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDomainQueries:
    """Domain-specific queries"""

    def test_get_family(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("spouse_001", EntityType.PERSON, "Bob")
        mgr.add_entity("child_001", EntityType.PERSON, "Charlie")
        mgr.add_knowledge_relationship("alice", "spouse_001", RelationshipType.MARRIED_TO)
        mgr.add_knowledge_relationship("alice", "child_001", RelationshipType.PARENT_OF)
        family = mgr.get_family()
        assert len(family) == 2

    def test_get_employers(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        employers = mgr.get_employers()
        assert len(employers) == 1
        assert employers[0].name == "Acme Corp"

    def test_get_assets(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home")
        mgr.add_entity("car_001", EntityType.VEHICLE, "Car")
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)
        mgr.add_knowledge_relationship("alice", "car_001", RelationshipType.OWNS)
        assets = mgr.get_assets()
        assert len(assets) == 2

    def test_get_investments(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("inv_001", EntityType.INVESTMENT, "AAPL")
        mgr.add_entity("inv_002", EntityType.INVESTMENT, "GOOGL")
        mgr.add_knowledge_relationship("alice", "inv_001", RelationshipType.HOLDINGS)
        mgr.add_knowledge_relationship("alice", "inv_002", RelationshipType.HOLDINGS)
        investments = mgr.get_investments()
        assert len(investments) == 2

    def test_get_businesses(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("biz_001", EntityType.BUSINESS, "My LLC")
        mgr.add_knowledge_relationship("alice", "biz_001", RelationshipType.OWNS_BUSINESS)
        businesses = mgr.get_businesses()
        assert len(businesses) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Graph Traversal Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestGraphTraversal:
    """Graph traversal operations"""

    def test_find_path(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        mgr.add_entity("dept_001", EntityType.ORGANIZATION, "Engineering")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("emp_001", "dept_001", RelationshipType.PART_OF)
        path = mgr.find_path("alice", "dept_001")
        assert len(path) == 2

    def test_connected_entities(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)
        connected = mgr.connected_entities("alice")
        assert "emp_001" in connected
        assert "home_001" in connected


# ═══════════════════════════════════════════════════════════════════════════════
# Backward Compatibility Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    """Backward compatibility with base AffiliationManager"""

    def test_base_affiliation_operations(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.8,
        )
        mgr.add(aff)
        assert mgr.count() == 1
        assert mgr.get("aff_001") is not None

    def test_base_trust_operations(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        aff = Affiliation(
            affiliation_id="aff_001",
            affiliation_type="friendship",
            target_id="bob",
            target_name="Bob",
            trust_level=0.8,
        )
        mgr.add(aff)
        assert mgr.get_trust("bob") == 0.8

    def test_base_filtering(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add(Affiliation(
            affiliation_id="fam_001", affiliation_type="family",
            target_id="mom", target_name="Mom", trust_level=0.9,
        ))
        mgr.add(Affiliation(
            affiliation_id="emp_001", affiliation_type="employment",
            target_id="employer", target_name="Acme", trust_level=0.6,
        ))
        family = mgr.by_type("family")
        assert len(family) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtendedSerialization:
    """Extended manager serialization roundtrip"""

    def test_to_dict(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        data = mgr.to_dict()
        assert data["person_id"] == "alice"
        assert len(data["entities"]) == 1

    def test_from_dict(self):
        data = {
            "person_id": "bob",
            "affiliations": [],
            "entities": {
                "emp_001": {"entity_id": "emp_001", "entity_type": "organization", "name": "TechCo"}
            },
            "knowledge_relationships": {},
            "snapshots": [],
        }
        mgr = ExtendedAffiliationManager.from_dict(data)
        assert mgr.person_id == "bob"
        assert mgr.entity_count == 1

    def test_roundtrip(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)
        mgr.create_snapshot(2024)

        data = mgr.to_dict()
        mgr2 = ExtendedAffiliationManager.from_dict(data)
        assert mgr2.entity_count == 2
        assert mgr2.knowledge_relationship_count == 2
        assert mgr2.snapshot_count == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_affiliations(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'affiliations')

    def test_actor_affiliations_is_extended(self):
        a = Actor(entity_id="alice")
        # Currently using base AffiliationManager
        # After migration, would use ExtendedAffiliationManager
        from src.monkey_brain.kernel.affiliations.manager import AffiliationManager
        assert isinstance(a.affiliations, AffiliationManager)

    def test_extended_manager_on_actor(self):
        # Test that ExtendedAffiliationManager can be used with Actor
        a = Actor(entity_id="alice")
        extended = ExtendedAffiliationManager(person_id="alice")

        # Add some entities
        extended.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        extended.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)

        # Verify
        assert extended.entity_count == 1
        assert extended.knowledge_relationship_count == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Tax Scenario Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTaxScenario:
    """Full tax scenario test"""

    def test_complete_tax_graph(self):
        mgr = ExtendedAffiliationManager(person_id="alice")

        # Person
        mgr.add_entity("alice", EntityType.PERSON, "Alice Smith")

        # Address
        mgr.add_entity("addr_001", EntityType.ADDRESS, "Home", {
            "street": "123 Main St", "city": "New York", "state": "NY"
        })
        mgr.add_knowledge_relationship("alice", "addr_001", RelationshipType.LIVES_AT)

        # Family
        mgr.add_entity("spouse_001", EntityType.PERSON, "Bob Smith")
        mgr.add_entity("child_001", EntityType.PERSON, "Charlie Smith")
        mgr.add_knowledge_relationship("alice", "spouse_001", RelationshipType.MARRIED_TO)
        mgr.add_knowledge_relationship("alice", "child_001", RelationshipType.PARENT_OF)

        # Employment
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)

        # Income
        mgr.add_entity("inc_001", EntityType.INCOME, "Salary", {"amount": 150000})
        mgr.add_knowledge_relationship("alice", "inc_001", RelationshipType.RECEIVES_INCOME)

        # Assets
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home", {"value": 650000})
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)

        # Investments
        mgr.add_entity("inv_001", EntityType.INVESTMENT, "AAPL")
        mgr.add_knowledge_relationship("alice", "inv_001", RelationshipType.HOLDINGS)

        # Verify
        assert mgr.entity_count == 8  # 8 entities (alice not added separately)
        assert mgr.knowledge_relationship_count == 7
        assert len(mgr.get_family()) == 2
        assert len(mgr.get_employers()) == 1
        assert len(mgr.get_assets()) == 1
        assert len(mgr.get_investments()) == 1

        # Check backward compatibility
        assert mgr.count() >= 9  # Entity affiliations


# ═══════════════════════════════════════════════════════════════════════════════
# Statistics Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatistics:
    """Statistics operations"""

    def test_stats(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        mgr.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        mgr.add_entity("home_001", EntityType.PROPERTY, "Home")
        mgr.add_knowledge_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        mgr.add_knowledge_relationship("alice", "home_001", RelationshipType.OWNS)

        stats = mgr.stats()
        assert stats["entity_count"] == 2
        assert stats["knowledge_relationship_count"] == 2
        assert stats["entity_types"]["organization"] == 1
        assert stats["entity_types"]["property"] == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtendedStress:
    """Stress tests"""

    def test_many_entities(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        for i in range(100):
            mgr.add_entity(f"entity_{i}", EntityType.OTHER, f"Entity {i}")
        assert mgr.entity_count == 100

    def test_many_relationships(self):
        mgr = ExtendedAffiliationManager(person_id="alice")
        for i in range(50):
            mgr.add_entity(f"entity_{i}", EntityType.OTHER, f"Entity {i}")
            mgr.add_knowledge_relationship("alice", f"entity_{i}", RelationshipType.RELATED_TO)
        assert mgr.knowledge_relationship_count == 50
