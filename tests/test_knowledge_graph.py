"""
Knowledge Graph Test Suite

Tests the comprehensive knowledge graph system including:
- Entity operations
- Relationship operations
- Temporal snapshots
- Domain-specific queries
- Graph traversal
- Actor integration
"""
import pytest
import time
from src.monkey_brain.kernel.knowledge_graph import (
    KnowledgeGraph, Entity, Relationship, TemporalSnapshot,
    EntityType, RelationshipType,
    PersonEntity, AddressEntity, OrganizationEntity,
    AssetEntity, InvestmentEntity, IncomeEntity, ExpenseEntity,
    LiabilityEntity, InsuranceEntity, RetirementEntity,
    TrustEntity, EducationEntity, HealthEntity, BusinessEntity,
)
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Entity Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEntityOperations:
    """Entity CRUD operations"""

    def test_add_entity(self):
        kg = KnowledgeGraph(person_id="alice")
        entity = kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        assert kg.entity_count == 1
        assert entity.name == "Acme Corp"

    def test_get_entity(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        entity = kg.get_entity("emp_001")
        assert entity is not None
        assert entity.name == "Acme Corp"

    def test_update_entity(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        kg.update_entity("emp_001", name="Acme Corporation")
        entity = kg.get_entity("emp_001")
        assert entity.name == "Acme Corporation"

    def test_remove_entity(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        assert kg.remove_entity("emp_001") is True
        assert kg.entity_count == 0

    def test_entities_by_type(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_entity("emp_002", EntityType.ORGANIZATION, "TechCo")
        kg.add_entity("home_001", EntityType.PROPERTY, "Home")
        orgs = kg.entities_by_type(EntityType.ORGANIZATION)
        assert len(orgs) == 2

    def test_entities_by_name(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        kg.add_entity("emp_002", EntityType.ORGANIZATION, "TechCo")
        results = kg.entities_by_name("Acme Corp")
        assert len(results) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Relationship Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipOperations:
    """Relationship CRUD operations"""

    def test_add_relationship(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        rel = kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        assert kg.relationship_count == 1

    def test_get_relationship(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        rel = kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        retrieved = kg.get_relationship(rel.relationship_id)
        assert retrieved is not None

    def test_remove_relationship(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        rel = kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        assert kg.remove_relationship(rel.relationship_id) is True
        assert kg.relationship_count == 0

    def test_relationships_for(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_entity("home_001", EntityType.PROPERTY, "Home")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        kg.add_relationship("alice", "home_001", RelationshipType.OWNS)
        rels = kg.relationships_for("alice")
        assert len(rels) == 2

    def test_relationships_by_type(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_entity("emp_002", EntityType.ORGANIZATION, "TechCo")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        kg.add_relationship("alice", "emp_002", RelationshipType.CONTRACTS_WITH)
        works_for = kg.relationships_by_type(RelationshipType.WORKS_FOR)
        assert len(works_for) == 1

    def test_relationships_between(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        rels = kg.relationships_between("alice", "emp_001")
        assert len(rels) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Domain-Specific Entity Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDomainEntities:
    """Domain-specific entity types"""

    def test_person_entity(self):
        p = PersonEntity(entity_id="alice", name="Alice Smith", ssn="123-45-6789", dob="1990-01-15")
        assert p.entity_type == EntityType.PERSON
        assert p.ssn == "123-45-6789"

    def test_address_entity(self):
        a = AddressEntity(entity_id="addr_001", street="123 Main St", city="New York", state="NY")
        assert a.entity_type == EntityType.ADDRESS
        assert a.city == "New York"

    def test_organization_entity(self):
        o = OrganizationEntity(entity_id="org_001", name="Acme Corp", ein="12-3456789", industry="Technology")
        assert o.entity_type == EntityType.ORGANIZATION
        assert o.ein == "12-3456789"

    def test_asset_entity(self):
        a = AssetEntity(entity_id="asset_001", name="Home", purchase_price=500000, current_value=600000)
        assert a.entity_type == EntityType.ASSET
        assert a.current_value == 600000

    def test_investment_entity(self):
        i = InvestmentEntity(entity_id="inv_001", ticker="AAPL", shares=100, cost_basis=15000)
        assert i.entity_type == EntityType.INVESTMENT
        assert i.shares == 100

    def test_income_entity(self):
        i = IncomeEntity(entity_id="inc_001", income_type="salary", amount=100000, year=2024)
        assert i.entity_type == EntityType.INCOME
        assert i.amount == 100000

    def test_expense_entity(self):
        e = ExpenseEntity(entity_id="exp_001", expense_type="mortgage", amount=2000, is_deductible=True)
        assert e.entity_type == EntityType.EXPENSE
        assert e.is_deductible is True

    def test_liability_entity(self):
        l = LiabilityEntity(entity_id="liab_001", liability_type="mortgage", current_balance=250000)
        assert l.entity_type == EntityType.LIABILITY
        assert l.current_balance == 250000

    def test_insurance_entity(self):
        i = InsuranceEntity(entity_id="ins_001", insurance_type="health", provider="BlueCross", premium=500)
        assert i.entity_type == EntityType.INSURANCE
        assert i.premium == 500

    def test_retirement_entity(self):
        r = RetirementEntity(entity_id="ret_001", account_type="401k", balance=150000)
        assert r.entity_type == EntityType.RETIREMENT
        assert r.balance == 150000

    def test_trust_entity(self):
        t = TrustEntity(entity_id="trust_001", trust_type="revocable", assets=500000)
        assert t.entity_type == EntityType.TRUST
        assert t.assets == 500000

    def test_education_entity(self):
        e = EducationEntity(entity_id="edu_001", institution="MIT", degree="PhD", tuition=50000)
        assert e.entity_type == EntityType.EDUCATION
        assert e.tuition == 50000

    def test_health_entity(self):
        h = HealthEntity(entity_id="health_001", health_type="hsa", amount=3500)
        assert h.entity_type == EntityType.HEALTH
        assert h.amount == 3500

    def test_business_entity(self):
        b = BusinessEntity(entity_id="biz_001", business_type="llc", ein="98-7654321", annual_revenue=250000)
        assert b.entity_type == EntityType.BUSINESS
        assert b.annual_revenue == 250000


# ═══════════════════════════════════════════════════════════════════════════════
# Temporal Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTemporalOperations:
    """Temporal snapshot operations"""

    def test_create_snapshot(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        snapshot = kg.create_snapshot(2024)
        assert snapshot.year == 2024

    def test_get_snapshots(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.create_snapshot(2022)
        kg.create_snapshot(2023)
        kg.create_snapshot(2024)
        snapshots = kg.get_snapshots()
        assert len(snapshots) == 3

    def test_get_snapshot_by_year(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.create_snapshot(2022)
        kg.create_snapshot(2024)
        snapshots = kg.get_snapshots(year=2024)
        assert len(snapshots) == 1

    def test_snapshot_diff(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.create_snapshot(2023)
        kg.update_entity("emp_001", name="Acme Corporation")
        kg.create_snapshot(2024)
        diff = kg.get_snapshot_diff(2023, 2024)
        assert "attributes_changed" in diff


# ═══════════════════════════════════════════════════════════════════════════════
# Graph Traversal Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestGraphTraversal:
    """Graph traversal operations"""

    def test_find_path(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_entity("dept_001", EntityType.ORGANIZATION, "Engineering")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        kg.add_relationship("emp_001", "dept_001", RelationshipType.HAS_MEMBER)
        path = kg.find_path("alice", "dept_001")
        assert len(path) == 2

    def test_connected_entities(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_entity("home_001", EntityType.PROPERTY, "Home")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        kg.add_relationship("alice", "home_001", RelationshipType.OWNS)
        connected = kg.connected_entities("alice")
        assert "emp_001" in connected
        assert "home_001" in connected


# ═══════════════════════════════════════════════════════════════════════════════
# Domain Query Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDomainQueries:
    """Domain-specific queries"""

    def test_get_family(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("spouse_001", EntityType.PERSON, "Bob")
        kg.add_entity("child_001", EntityType.PERSON, "Charlie")
        kg.add_relationship("alice", "spouse_001", RelationshipType.MARRIED_TO)
        kg.add_relationship("alice", "child_001", RelationshipType.PARENT_OF)
        family = kg.get_family()
        assert len(family) == 2

    def test_get_employers(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        employers = kg.get_employers()
        assert len(employers) == 1
        assert employers[0].name == "Acme Corp"

    def test_get_assets(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("home_001", EntityType.PROPERTY, "Home")
        kg.add_entity("car_001", EntityType.VEHICLE, "Car")
        kg.add_relationship("alice", "home_001", RelationshipType.OWNS)
        kg.add_relationship("alice", "car_001", RelationshipType.OWNS)
        assets = kg.get_assets()
        assert len(assets) == 2

    def test_get_investments(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("inv_001", EntityType.INVESTMENT, "AAPL")
        kg.add_entity("inv_002", EntityType.INVESTMENT, "GOOGL")
        kg.add_relationship("alice", "inv_001", RelationshipType.HOLDINGS)
        kg.add_relationship("alice", "inv_002", RelationshipType.HOLDINGS)
        investments = kg.get_investments()
        assert len(investments) == 2

    def test_get_businesses(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("biz_001", EntityType.BUSINESS, "My LLC")
        kg.add_relationship("alice", "biz_001", RelationshipType.OWNS_BUSINESS)
        businesses = kg.get_businesses()
        assert len(businesses) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestKnowledgeGraphSerialization:
    """Knowledge graph serialization roundtrip"""

    def test_to_dict(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        data = kg.to_dict()
        assert data["person_id"] == "alice"
        assert len(data["entities"]) == 1

    def test_from_dict(self):
        data = {
            "person_id": "bob",
            "entities": {
                "emp_001": {"entity_id": "emp_001", "entity_type": "organization", "name": "TechCo"}
            },
            "relationships": {},
            "snapshots": [],
        }
        kg = KnowledgeGraph.from_dict(data)
        assert kg.person_id == "bob"
        assert kg.entity_count == 1

    def test_roundtrip(self):
        kg = KnowledgeGraph(person_id="alice")
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        kg.add_entity("home_001", EntityType.PROPERTY, "Home")
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        kg.add_relationship("alice", "home_001", RelationshipType.OWNS)

        data = kg.to_dict()
        kg2 = KnowledgeGraph.from_dict(data)
        assert kg2.entity_count == 2
        assert kg2.relationship_count == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_knowledge_graph(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'knowledge_graph')
        assert isinstance(a.knowledge_graph, KnowledgeGraph)

    def test_actor_default_knowledge_graph(self):
        a = Actor(entity_id="alice")
        assert a.knowledge_graph.person_id == "alice"
        assert a.knowledge_graph.entity_count == 0

    def test_actor_add_entity(self):
        a = Actor(entity_id="alice")
        a.knowledge_graph.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        assert a.knowledge_graph.entity_count == 1

    def test_actor_add_relationship(self):
        a = Actor(entity_id="alice")
        a.knowledge_graph.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp")
        a.knowledge_graph.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)
        assert a.knowledge_graph.relationship_count == 1

    def test_actor_knowledge_graph_setter(self):
        a = Actor(entity_id="alice")
        new_kg = KnowledgeGraph(person_id="bob")
        a.knowledge_graph = new_kg
        assert a.knowledge_graph.person_id == "bob"

    def test_actor_independence(self):
        a1 = Actor(entity_id="alice")
        a2 = Actor(entity_id="bob")
        a1.knowledge_graph.add_entity("emp_001", EntityType.ORGANIZATION, "Acme")
        assert a2.knowledge_graph.entity_count == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Tax Scenario Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTaxScenario:
    """Full tax scenario test"""

    def test_complete_tax_graph(self):
        kg = KnowledgeGraph(person_id="alice")

        # Person
        kg.add_entity("alice", EntityType.PERSON, "Alice Smith")

        # Address
        kg.add_entity("addr_001", EntityType.ADDRESS, "Home", {
            "street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"
        })
        kg.add_relationship("alice", "addr_001", RelationshipType.LIVES_AT)

        # Family
        kg.add_entity("spouse_001", EntityType.PERSON, "Bob Smith")
        kg.add_entity("child_001", EntityType.PERSON, "Charlie Smith")
        kg.add_relationship("alice", "spouse_001", RelationshipType.MARRIED_TO)
        kg.add_relationship("alice", "child_001", RelationshipType.PARENT_OF)

        # Employment
        kg.add_entity("emp_001", EntityType.ORGANIZATION, "Acme Corp", {
            "ein": "12-3456789", "industry": "Technology"
        })
        kg.add_relationship("alice", "emp_001", RelationshipType.WORKS_FOR)

        # Income
        kg.add_entity("inc_001", EntityType.INCOME, "Salary", {
            "amount": 150000, "type": "salary", "year": 2024
        })
        kg.add_relationship("alice", "inc_001", RelationshipType.RECEIVES_INCOME)

        # Assets
        kg.add_entity("home_001", EntityType.PROPERTY, "Primary Residence", {
            "purchase_price": 500000, "current_value": 650000
        })
        kg.add_relationship("alice", "home_001", RelationshipType.OWNS)

        # Investments
        kg.add_entity("inv_001", EntityType.INVESTMENT, "AAPL", {
            "shares": 100, "cost_basis": 15000, "current_value": 20000
        })
        kg.add_relationship("alice", "inv_001", RelationshipType.HOLDINGS)

        # Retirement
        kg.add_entity("ret_001", EntityType.RETIREMENT, "401k", {
            "balance": 150000, "annual_contribution": 19500
        })
        kg.add_relationship("alice", "ret_001", RelationshipType.CONTRIBUTES_TO)

        # Insurance
        kg.add_entity("ins_001", EntityType.INSURANCE, "Health Insurance", {
            "provider": "BlueCross", "premium": 6000, "deductible": 1500
        })
        kg.add_relationship("alice", "ins_001", RelationshipType.INSURED_BY)

        # Liabilities
        kg.add_entity("mort_001", EntityType.LIABILITY, "Mortgage", {
            "original_amount": 400000, "current_balance": 350000, "interest_rate": 3.5
        })
        kg.add_relationship("alice", "mort_001", RelationshipType.PAYS_EXPENSE)

        # Verify
        assert kg.entity_count == 11  # alice + 10 other entities
        assert kg.relationship_count == 10
        assert len(kg.get_family()) == 2
        assert len(kg.get_employers()) == 1
        assert len(kg.get_assets()) == 1
        assert len(kg.get_investments()) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestKnowledgeGraphStress:
    """Stress tests"""

    def test_many_entities(self):
        kg = KnowledgeGraph(person_id="alice")
        for i in range(100):
            kg.add_entity(f"entity_{i}", EntityType.OTHER, f"Entity {i}")
        assert kg.entity_count == 100

    def test_many_relationships(self):
        kg = KnowledgeGraph(person_id="alice")
        for i in range(50):
            kg.add_entity(f"entity_{i}", EntityType.OTHER, f"Entity {i}")
            kg.add_relationship("alice", f"entity_{i}", RelationshipType.RELATED_TO)
        assert kg.relationship_count == 50

    def test_many_snapshots(self):
        kg = KnowledgeGraph(person_id="alice")
        for year in range(2000, 2025):
            kg.create_snapshot(year)
        snapshots = kg.get_snapshots()
        assert len(snapshots) == 25
