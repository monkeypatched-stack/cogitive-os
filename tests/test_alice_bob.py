"""
Alice & Bob — Married couple scenario

Demonstrates:
- Two actors (Alice and Bob) married to each other
- Same household
- No kids
- Belong to a "created family" grouping
"""
import pytest
from src.monkey_brain.kernel.ontology.entity import Actor
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.account import Account, SubscriptionPlan
from src.monkey_brain.kernel.location import Location
from src.monkey_brain.kernel.login_info import LoginInfo
from src.monkey_brain.kernel.relationships_meta import (
    RelationshipMeta, Organization, Team, Role, SocialConnection,
    RoleType, MembershipStatus, SocialPlatform,
)
from src.monkey_brain.kernel.knowledge_graph import (
    KnowledgeGraph, EntityType, RelationshipType,
)
from src.monkey_brain.kernel.affiliations.extended import ExtendedAffiliationManager


# ═══════════════════════════════════════════════════════════════════════════════
# Create Alice and Bob
# ═══════════════════════════════════════════════════════════════════════════════

def create_alice() -> Actor:
    """Create Alice Smith."""
    alice = Actor(
        entity_id="alice",
        name="Alice Smith",
        actor_type_id="human",
    )

    # Profile
    alice.profile = Profile(
        name="Alice Smith",
        username="alice",
        email="alice@example.com",
        date_of_birth="1990-03-15",
        preferred_language="en",
        timezone="America/New_York",
        bio="Software engineer and cat lover",
        location="New York, NY",
    )

    # Optimization Preference: COST
    alice.profile.metadata = {
        "optimization_preference": "cost",
        "shopping_style": "budget_conscious",
        "preferred_stores": ["Key Food", "Gristedes"],
        "coupon_user": True,
        "price_comparison": True,
    }

    # Account
    alice.account = Account(
        username="alice",
        email="alice@example.com",
        subscription=SubscriptionPlan.PRO,
    )

    # Location
    alice.location = Location(
        country="United States",
        country_code="US",
        state="New York",
        city="New York",
        timezone="America/New_York",
    )

    # Login Info
    alice.login_info = LoginInfo(
        email="alice@example.com",
        mobile="+1-555-123-4567",
    )
    alice.login_info.set_password("SecurePass123!")

    # Knowledge Graph
    alice.knowledge_graph = KnowledgeGraph(person_id="alice")

    # Add Alice to her own knowledge graph
    alice.knowledge_graph.add_entity("alice", EntityType.PERSON, "Alice Smith", {
        "ssn": "123-45-6789",
        "dob": "1990-03-15",
        "gender": "female",
    })

    return alice


def create_bob() -> Actor:
    """Create Bob Smith."""
    bob = Actor(
        entity_id="bob",
        name="Bob Smith",
        actor_type_id="human",
    )

    # Profile
    bob.profile = Profile(
        name="Bob Smith",
        username="bob",
        email="bob@example.com",
        date_of_birth="1988-07-22",
        preferred_language="en",
        timezone="America/New_York",
        bio="Data scientist and coffee enthusiast",
        location="New York, NY",
    )

    # Optimization Preference: SPEED
    bob.profile.metadata = {
        "optimization_preference": "speed",
        "shopping_style": "convenience_first",
        "preferred_stores": ["Gristedes", "Whole Foods"],
        "coupon_user": False,
        "price_comparison": False,
    }

    # Account
    bob.account = Account(
        username="bob",
        email="bob@example.com",
        subscription=SubscriptionPlan.PRO,
    )

    # Location
    bob.location = Location(
        country="United States",
        country_code="US",
        state="New York",
        city="New York",
        timezone="America/New_York",
    )

    # Login Info
    bob.login_info = LoginInfo(
        email="bob@example.com",
        mobile="+1-555-987-6543",
    )
    bob.login_info.set_password("SecurePass123!")

    # Knowledge Graph
    bob.knowledge_graph = KnowledgeGraph(person_id="bob")

    # Add Bob to his own knowledge graph
    bob.knowledge_graph.add_entity("bob", EntityType.PERSON, "Bob Smith", {
        "ssn": "987-65-4321",
        "dob": "1988-07-22",
        "gender": "male",
    })

    return bob


# ═══════════════════════════════════════════════════════════════════════════════
# Create Marriage and Household Relationships
# ═══════════════════════════════════════════════════════════════════════════════

def setup_marriage(alice: Actor, bob: Actor) -> None:
    """Set up marriage and household relationships."""

    # ── Alice's Knowledge Graph ─────────────────────────────────
    alice.knowledge_graph.add_entity("bob", EntityType.PERSON, "Bob Smith", {
        "ssn": "987-65-4321",
        "dob": "1988-07-22",
        "gender": "male",
    })

    alice.knowledge_graph.add_entity("household_001", EntityType.ADDRESS, "Smith Household", {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001",
        "type": "primary_residence",
    })

    alice.knowledge_graph.add_entity("family_001", EntityType.OTHER, "Created Family", {
        "type": "created_family",
        "description": "Family created through marriage",
        "members": ["alice", "bob"],
        "kids": [],
    })

    # Alice → Bob: Married
    alice.knowledge_graph.add_relationship(
        "alice", "bob", RelationshipType.MARRIED_TO,
        {"married_date": "2015-06-20", "anniversary": "June 20"},
    )

    # Alice → Household: Lives At
    alice.knowledge_graph.add_relationship(
        "alice", "household_001", RelationshipType.LIVES_AT,
        {"since": "2015-06-20", "is_primary": True},
    )

    # Alice → Family: Member Of
    alice.knowledge_graph.add_relationship(
        "alice", "family_001", RelationshipType.RELATED_TO,
        {"role": "spouse", "since": "2015-06-20"},
    )

    # ── Bob's Knowledge Graph ───────────────────────────────────
    bob.knowledge_graph.add_entity("alice", EntityType.PERSON, "Alice Smith", {
        "ssn": "123-45-6789",
        "dob": "1990-03-15",
        "gender": "female",
    })

    bob.knowledge_graph.add_entity("household_001", EntityType.ADDRESS, "Smith Household", {
        "street": "123 Main St",
        "city": "New York",
        "state": "NY",
        "zip": "10001",
        "type": "primary_residence",
    })

    bob.knowledge_graph.add_entity("family_001", EntityType.OTHER, "Created Family", {
        "type": "created_family",
        "description": "Family created through marriage",
        "members": ["alice", "bob"],
        "kids": [],
    })

    # Bob → Alice: Married
    bob.knowledge_graph.add_relationship(
        "bob", "alice", RelationshipType.MARRIED_TO,
        {"married_date": "2015-06-20", "anniversary": "June 20"},
    )

    # Bob → Household: Lives At
    bob.knowledge_graph.add_relationship(
        "bob", "household_001", RelationshipType.LIVES_AT,
        {"since": "2015-06-20", "is_primary": True},
    )

    # Bob → Family: Member Of
    bob.knowledge_graph.add_relationship(
        "bob", "family_001", RelationshipType.RELATED_TO,
        {"role": "spouse", "since": "2015-06-20"},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAliceAndBob:
    """Test Alice and Bob as a married couple."""

    def test_alice_created(self):
        alice = create_alice()
        assert alice.entity_id == "alice"
        assert alice.profile.name == "Alice Smith"

    def test_bob_created(self):
        bob = create_bob()
        assert bob.entity_id == "bob"
        assert bob.profile.name == "Bob Smith"

    def test_marriage_setup(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Check Alice's relationships
        alice_marriages = alice.knowledge_graph.relationships_by_type(RelationshipType.MARRIED_TO)
        assert len(alice_marriages) == 1
        assert alice_marriages[0].target_id == "bob"

        # Check Bob's relationships
        bob_marriages = bob.knowledge_graph.relationships_by_type(RelationshipType.MARRIED_TO)
        assert len(bob_marriages) == 1
        assert bob_marriages[0].target_id == "alice"

    def test_same_household(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Both live at the same household
        alice_households = alice.knowledge_graph.relationships_by_type(RelationshipType.LIVES_AT)
        bob_households = bob.knowledge_graph.relationships_by_type(RelationshipType.LIVES_AT)

        assert len(alice_households) == 1
        assert len(bob_households) == 1
        assert alice_households[0].target_id == bob_households[0].target_id == "household_001"

    def test_no_kids(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # No parent-child relationships
        alice_parent = alice.knowledge_graph.relationships_by_type(RelationshipType.PARENT_OF)
        bob_parent = bob.knowledge_graph.relationships_by_type(RelationshipType.PARENT_OF)

        assert len(alice_parent) == 0
        assert len(bob_parent) == 0

    def test_created_family(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Check Alice's family entity
        alice_family = alice.knowledge_graph.get_entity("family_001")
        assert alice_family is not None
        assert alice_family.name == "Created Family"
        assert alice_family.attributes["type"] == "created_family"
        assert "alice" in alice_family.attributes["members"]
        assert "bob" in alice_family.attributes["members"]
        assert alice_family.attributes["kids"] == []

        # Check Bob's family entity
        bob_family = bob.knowledge_graph.get_entity("family_001")
        assert bob_family is not None
        assert bob_family.name == "Created Family"

    def test_household_entity(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Check household entity
        alice_household = alice.knowledge_graph.get_entity("household_001")
        assert alice_household is not None
        assert alice_household.name == "Smith Household"
        assert alice_household.attributes["street"] == "123 Main St"
        assert alice_household.attributes["city"] == "New York"

    def test_graph_statistics(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        alice_stats = alice.knowledge_graph.stats()
        assert alice_stats["entity_count"] == 4  # alice, bob, household, family
        assert alice_stats["relationship_count"] == 3  # married, lives_at, member_of

        bob_stats = bob.knowledge_graph.stats()
        assert bob_stats["entity_count"] == 4
        assert bob_stats["relationship_count"] == 3

    def test_find_path_to_spouse(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Alice can find path to Bob
        path = alice.knowledge_graph.find_path("alice", "bob")
        assert len(path) == 1
        assert path[0].relationship_type == RelationshipType.MARRIED_TO

    def test_connected_entities(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        alice_connected = alice.knowledge_graph.connected_entities("alice")
        assert "bob" in alice_connected
        assert "household_001" in alice_connected
        assert "family_001" in alice_connected

    def test_serialization_roundtrip(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)

        # Serialize Alice
        alice_data = alice.knowledge_graph.to_dict()
        assert alice_data["person_id"] == "alice"

        # Deserialize
        from src.monkey_brain.kernel.knowledge_graph import KnowledgeGraph
        alice_restored = KnowledgeGraph.from_dict(alice_data)
        assert alice_restored.entity_count == 4
        assert alice_restored.relationship_count == 3


# ═══════════════════════════════════════════════════════════════════════════════
# Create 5 Grocery Stores Around the Smith Household
# ═══════════════════════════════════════════════════════════════════════════════

def setup_grocery_stores(alice: Actor, bob: Actor) -> None:
    """Create 5 grocery stores around the Smith household, all belonging to Grocery Store Society."""

    # ── Create Grocery Store Society ────────────────────────────
    society = {
        "id": "society_001",
        "name": "Grocery Store Society",
        "type": "industry_society",
        "description": "A society of grocery stores in the New York area",
        "founded": "2020-01-01",
        "member_count": 5,
        "industry": "grocery_retail",
        "location": "New York, NY",
    }

    stores = [
        {
            "id": "store_001",
            "name": "Whole Foods Market",
            "type": "organic",
            "distance": 0.3,
            "address": "100 7th Ave, New York, NY",
            "hours": "8am-10pm",
            "rating": 4.5,
            "membership_tier": "premium",
        },
        {
            "id": "store_002",
            "name": "Trader Joe's",
            "type": "specialty",
            "distance": 0.5,
            "address": "142 E 14th St, New York, NY",
            "hours": "8am-9pm",
            "rating": 4.7,
            "membership_tier": "standard",
        },
        {
            "id": "store_003",
            "name": "Key Food",
            "type": "budget",
            "distance": 0.2,
            "address": "200 W 23rd St, New York, NY",
            "hours": "7am-11pm",
            "rating": 3.8,
            "membership_tier": "standard",
        },
        {
            "id": "store_004",
            "name": "Fairway Market",
            "type": "premium",
            "distance": 0.7,
            "address": "550 2nd Ave, New York, NY",
            "hours": "7am-10pm",
            "rating": 4.3,
            "membership_tier": "premium",
        },
        {
            "id": "store_005",
            "name": "Gristedes",
            "type": "convenience",
            "distance": 0.1,
            "address": "150 W 26th St, New York, NY",
            "hours": "6am-12am",
            "rating": 3.5,
            "membership_tier": "basic",
        },
    ]

    # ── Add to Alice's Knowledge Graph ──────────────────────────
    alice.knowledge_graph.add_entity(
        society["id"], EntityType.ORGANIZATION, society["name"], {
            "type": society["type"],
            "description": society["description"],
            "founded": society["founded"],
            "member_count": society["member_count"],
            "industry": society["industry"],
            "location": society["location"],
        }
    )

    for store in stores:
        alice.knowledge_graph.add_entity(
            store["id"], EntityType.ORGANIZATION, store["name"], {
                "type": "grocery_store",
                "store_type": store["type"],
                "distance_miles": store["distance"],
                "address": store["address"],
                "hours": store["hours"],
                "rating": store["rating"],
                "membership_tier": store["membership_tier"],
            }
        )
        # Store → Household: Nearby
        alice.knowledge_graph.add_relationship(
            "household_001", store["id"], RelationshipType.RELATED_TO,
            {"relationship": "nearby_store", "distance": store["distance"]},
        )
        # Store → Society: Member Of
        alice.knowledge_graph.add_relationship(
            store["id"], society["id"], RelationshipType.RELATED_TO,
            {"relationship": "member_of", "tier": store["membership_tier"]},
        )

    # ── Add to Bob's Knowledge Graph ────────────────────────────
    bob.knowledge_graph.add_entity(
        society["id"], EntityType.ORGANIZATION, society["name"], {
            "type": society["type"],
            "description": society["description"],
            "founded": society["founded"],
            "member_count": society["member_count"],
            "industry": society["industry"],
            "location": society["location"],
        }
    )

    for store in stores:
        bob.knowledge_graph.add_entity(
            store["id"], EntityType.ORGANIZATION, store["name"], {
                "type": "grocery_store",
                "store_type": store["type"],
                "distance_miles": store["distance"],
                "address": store["address"],
                "hours": store["hours"],
                "rating": store["rating"],
                "membership_tier": store["membership_tier"],
            }
        )
        # Store → Household: Nearby
        bob.knowledge_graph.add_relationship(
            "household_001", store["id"], RelationshipType.RELATED_TO,
            {"relationship": "nearby_store", "distance": store["distance"]},
        )
        # Store → Society: Member Of
        bob.knowledge_graph.add_relationship(
            store["id"], society["id"], RelationshipType.RELATED_TO,
            {"relationship": "member_of", "tier": store["membership_tier"]},
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Whole Milk Inventory Across All Stores
# ═══════════════════════════════════════════════════════════════════════════════

def setup_milk_inventory(alice: Actor, bob: Actor) -> None:
    """Add whole milk inventory with different brands, quantities, and pricing."""

    milk_brands = [
        {"brand": "Organic Valley", "type": "organic", "size": "1 gallon", "base_price": 6.99},
        {"brand": "Horizon", "type": "organic", "size": "1 gallon", "base_price": 6.49},
        {"brand": "Whole Foods 365", "type": "store_brand", "size": "1 gallon", "base_price": 4.99},
        {"brand": "Store Brand", "type": "generic", "size": "1 gallon", "base_price": 3.99},
        {"brand": "Fairlife", "type": "ultra_filtered", "size": "1 gallon", "base_price": 5.99},
    ]

    # Store-specific inventory (brand, quantity, price)
    store_inventory = {
        "store_001": [  # Whole Foods
            {"brand_idx": 0, "quantity": 24, "price": 6.99},  # Organic Valley
            {"brand_idx": 2, "quantity": 36, "price": 4.99},  # WF 365
            {"brand_idx": 4, "quantity": 18, "price": 5.99},  # Fairlife
        ],
        "store_002": [  # Trader Joe's
            {"brand_idx": 1, "quantity": 30, "price": 5.99},  # Horizon
            {"brand_idx": 4, "quantity": 20, "price": 5.49},  # Fairlife
        ],
        "store_003": [  # Key Food
            {"brand_idx": 3, "quantity": 48, "price": 3.99},  # Store Brand
            {"brand_idx": 1, "quantity": 12, "price": 6.29},  # Horizon
        ],
        "store_004": [  # Fairway
            {"brand_idx": 0, "quantity": 20, "price": 6.49},  # Organic Valley
            {"brand_idx": 1, "quantity": 15, "price": 5.99},  # Horizon
            {"brand_idx": 4, "quantity": 25, "price": 5.79},  # Fairlife
        ],
        "store_005": [  # Gristedes
            {"brand_idx": 3, "quantity": 36, "price": 4.29},  # Store Brand
            {"brand_idx": 1, "quantity": 10, "price": 6.49},  # Horizon
        ],
    }

    # ── Add milk inventory to Alice's Knowledge Graph ───────────
    for store_id, inventory in store_inventory.items():
        for idx, item in enumerate(inventory):
            brand_info = milk_brands[item["brand_idx"]]
            product_id = f"milk_{store_id}_{idx}"

            alice.knowledge_graph.add_entity(
                product_id, EntityType.ASSET, f"Whole Milk - {brand_info['brand']}", {
                    "type": "product",
                    "category": "dairy",
                    "product": "whole_milk",
                    "brand": brand_info["brand"],
                    "milk_type": brand_info["type"],
                    "size": brand_info["size"],
                    "quantity": item["quantity"],
                    "price": item["price"],
                    "store_id": store_id,
                    "in_stock": item["quantity"] > 0,
                }
            )
            # Product → Store: Stocks
            alice.knowledge_graph.add_relationship(
                store_id, product_id, RelationshipType.OWNS,
                {"relationship": "stocks", "quantity": item["quantity"]},
            )

    # ── Add milk inventory to Bob's Knowledge Graph ─────────────
    for store_id, inventory in store_inventory.items():
        for idx, item in enumerate(inventory):
            brand_info = milk_brands[item["brand_idx"]]
            product_id = f"milk_{store_id}_{idx}"

            bob.knowledge_graph.add_entity(
                product_id, EntityType.ASSET, f"Whole Milk - {brand_info['brand']}", {
                    "type": "product",
                    "category": "dairy",
                    "product": "whole_milk",
                    "brand": brand_info["brand"],
                    "milk_type": brand_info["type"],
                    "size": brand_info["size"],
                    "quantity": item["quantity"],
                    "price": item["price"],
                    "store_id": store_id,
                    "in_stock": item["quantity"] > 0,
                }
            )
            # Product → Store: Stocks
            bob.knowledge_graph.add_relationship(
                store_id, product_id, RelationshipType.OWNS,
                {"relationship": "stocks", "quantity": item["quantity"]},
            )


class TestMilkInventory:
    """Test whole milk inventory across all stores."""

    def test_milk_products_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Count milk products
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]
        assert len(milk_products) == 12  # 3+2+2+3+2 products across stores

    def test_milk_brands_available(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        brands = {e.attributes["brand"] for e in milk_products}
        assert "Organic Valley" in brands
        assert "Horizon" in brands
        assert "Whole Foods 365" in brands
        assert "Store Brand" in brands
        assert "Fairlife" in brands

    def test_milk_pricing_varies(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        prices = {e.attributes["brand"]: e.attributes["price"] for e in milk_products}
        # Different brands have different prices
        assert len(set(prices.values())) > 1

    def test_store_whole_foods_inventory(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Whole Foods should have Organic Valley, WF 365, Fairlife
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        wf_products = [r for r in store_rels if r.source_id == "store_001"]

        assert len(wf_products) == 3

    def test_store_trader_joes_inventory(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Trader Joe's should have Horizon, Fairlife
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        tj_products = [r for r in store_rels if r.source_id == "store_002"]

        assert len(tj_products) == 2

    def test_store_key_food_inventory(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Key Food should have Store Brand, Horizon
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        kf_products = [r for r in store_rels if r.source_id == "store_003"]

        assert len(kf_products) == 2

    def test_cheapest_milk(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        cheapest = min(milk_products, key=lambda e: e.attributes["price"])
        assert cheapest.attributes["brand"] == "Store Brand"
        assert cheapest.attributes["price"] == 3.99

    def test_most_expensive_milk(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        most_expensive = max(milk_products, key=lambda e: e.attributes["price"])
        assert most_expensive.attributes["brand"] == "Organic Valley"
        assert most_expensive.attributes["price"] == 6.99

    def test_highest_stock(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        highest_stock = max(milk_products, key=lambda e: e.attributes["quantity"])
        assert highest_stock.attributes["brand"] == "Store Brand"
        assert highest_stock.attributes["quantity"] == 48

    def test_total_inventory_value(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        total_value = sum(e.attributes["price"] * e.attributes["quantity"] for e in milk_products)
        assert total_value > 0

    def test_both_have_same_inventory(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        alice_milk = {e.name for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                     if e.attributes.get("product") == "whole_milk"}
        bob_milk = {e.name for e in bob.knowledge_graph.entities_by_type(EntityType.ASSET)
                   if e.attributes.get("product") == "whole_milk"}

        assert alice_milk == bob_milk

    def test_milk_store_relationships(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Count store-to-product relationships
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        milk_rels = [r for r in store_rels if "milk" in r.target_id]

        assert len(milk_rels) == 12


# ═══════════════════════════════════════════════════════════════════════════════
# Wallets for Alice, Bob, and Shared Household
# ═══════════════════════════════════════════════════════════════════════════════

def setup_wallets(alice: Actor, bob: Actor) -> None:
    """Create separate wallets for Alice and Bob, plus a shared household wallet."""

    # ── Alice's Personal Wallet ─────────────────────────────────
    alice.knowledge_graph.add_entity("wallet_alice", EntityType.ACCOUNT, "Alice's Wallet", {
        "type": "wallet",
        "owner": "alice",
        "balance": 2450.75,
        "currency": "USD",
        "bank": "Chase",
        "account_type": "checking",
        "account_number": "****1234",
        "monthly_income": 5200.00,
        "monthly_expenses": 3800.00,
    })

    # Alice → Her Wallet: Owns
    alice.knowledge_graph.add_relationship(
        "alice", "wallet_alice", RelationshipType.OWNS,
        {"relationship": "personal_wallet", "since": "2015-01-01"},
    )

    # ── Bob's Personal Wallet ───────────────────────────────────
    bob.knowledge_graph.add_entity("wallet_bob", EntityType.ACCOUNT, "Bob's Wallet", {
        "type": "wallet",
        "owner": "bob",
        "balance": 3125.50,
        "currency": "USD",
        "bank": "Bank of America",
        "account_type": "checking",
        "account_number": "****5678",
        "monthly_income": 6100.00,
        "monthly_expenses": 4200.00,
    })

    # Bob → His Wallet: Owns
    bob.knowledge_graph.add_relationship(
        "bob", "wallet_bob", RelationshipType.OWNS,
        {"relationship": "personal_wallet", "since": "2014-06-01"},
    )

    # ── Shared Household Wallet ─────────────────────────────────
    alice.knowledge_graph.add_entity("wallet_household", EntityType.ACCOUNT, "Smith Household Wallet", {
        "type": "shared_wallet",
        "owners": ["alice", "bob"],
        "balance": 8750.25,
        "currency": "USD",
        "bank": "Joint Account - Chase",
        "account_type": "joint_checking",
        "account_number": "****9012",
        "monthly_contributions": {
            "alice": 1500.00,
            "bob": 1800.00,
        },
        "total_monthly_contribution": 3300.00,
        "用途": "mortgage, utilities, groceries, insurance",
    })

    # Alice → Shared Wallet: Contributes
    alice.knowledge_graph.add_relationship(
        "alice", "wallet_household", RelationshipType.RELATED_TO,
        {"relationship": "contributes", "amount": 1500.00, "frequency": "monthly"},
    )

    # Bob → Shared Wallet: Contributes
    bob.knowledge_graph.add_entity("wallet_household", EntityType.ACCOUNT, "Smith Household Wallet", {
        "type": "shared_wallet",
        "owners": ["alice", "bob"],
        "balance": 8750.25,
        "currency": "USD",
        "bank": "Joint Account - Chase",
        "account_type": "joint_checking",
        "account_number": "****9012",
        "monthly_contributions": {
            "alice": 1500.00,
            "bob": 1800.00,
        },
        "total_monthly_contribution": 3300.00,
        "用途": "mortgage, utilities, groceries, insurance",
    })

    bob.knowledge_graph.add_relationship(
        "bob", "wallet_household", RelationshipType.RELATED_TO,
        {"relationship": "contributes", "amount": 1800.00, "frequency": "monthly"},
    )

    # ── Shared Wallet → Household: Pays For ─────────────────────
    alice.knowledge_graph.add_relationship(
        "wallet_household", "household_001", RelationshipType.PAYS_EXPENSE,
        {"relationship": "household_expenses", "categories": ["mortgage", "utilities", "groceries"]},
    )

    bob.knowledge_graph.add_relationship(
        "wallet_household", "household_001", RelationshipType.PAYS_EXPENSE,
        {"relationship": "household_expenses", "categories": ["mortgage", "utilities", "groceries"]},
    )


class TestWallets:
    """Test wallets for Alice, Bob, and shared household."""

    def test_alice_wallet_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        assert alice_wallet is not None
        assert alice_wallet.name == "Alice's Wallet"
        assert alice_wallet.attributes["balance"] == 2450.75
        assert alice_wallet.attributes["owner"] == "alice"

    def test_bob_wallet_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")
        assert bob_wallet is not None
        assert bob_wallet.name == "Bob's Wallet"
        assert bob_wallet.attributes["balance"] == 3125.50
        assert bob_wallet.attributes["owner"] == "bob"

    def test_shared_wallet_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
        assert shared_wallet is not None
        assert shared_wallet.name == "Smith Household Wallet"
        assert shared_wallet.attributes["balance"] == 8750.25
        assert "alice" in shared_wallet.attributes["owners"]
        assert "bob" in shared_wallet.attributes["owners"]

    def test_alice_owns_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        owns_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        alice_wallet_rels = [r for r in owns_rels if r.target_id == "wallet_alice"]
        assert len(alice_wallet_rels) == 1

    def test_bob_owns_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        owns_rels = bob.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        bob_wallet_rels = [r for r in owns_rels if r.target_id == "wallet_bob"]
        assert len(bob_wallet_rels) == 1

    def test_alice_contributes_to_shared(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        contribute_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        alice_contribute = [r for r in contribute_rels
                           if r.target_id == "wallet_household" and r.attributes.get("relationship") == "contributes"]
        assert len(alice_contribute) == 1
        assert alice_contribute[0].attributes["amount"] == 1500.00

    def test_bob_contributes_to_shared(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        contribute_rels = bob.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        bob_contribute = [r for r in contribute_rels
                         if r.target_id == "wallet_household" and r.attributes.get("relationship") == "contributes"]
        assert len(bob_contribute) == 1
        assert bob_contribute[0].attributes["amount"] == 1800.00

    def test_total_monthly_contribution(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
        total = shared_wallet.attributes["total_monthly_contribution"]
        assert total == 3300.00  # 1500 + 1800

    def test_shared_wallet_pays_household(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        household_pay = [r for r in pay_rels if r.target_id == "household_001"]
        assert len(household_pay) >= 1

    def test_wallet_balances(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")
        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")

        total = alice_wallet.attributes["balance"] + bob_wallet.attributes["balance"] + shared_wallet.attributes["balance"]
        assert total == 14326.50  # 2450.75 + 3125.50 + 8750.25

    def test_wallet_banks(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")
        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")

        assert alice_wallet.attributes["bank"] == "Chase"
        assert bob_wallet.attributes["bank"] == "Bank of America"
        assert shared_wallet.attributes["bank"] == "Joint Account - Chase"

    def test_wallet_account_numbers(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")
        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")

        assert alice_wallet.attributes["account_number"] == "****1234"
        assert bob_wallet.attributes["account_number"] == "****5678"
        assert shared_wallet.attributes["account_number"] == "****9012"

    def test_monthly_income_vs_expenses(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")

        # Alice's surplus
        alice_surplus = alice_wallet.attributes["monthly_income"] - alice_wallet.attributes["monthly_expenses"]
        assert alice_surplus == 1400.00  # 5200 - 3800

        # Bob's surplus
        bob_surplus = bob_wallet.attributes["monthly_income"] - bob_wallet.attributes["monthly_expenses"]
        assert bob_surplus == 1900.00  # 6100 - 4200

    def test_contribution_ratio(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)

        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
        contributions = shared_wallet.attributes["monthly_contributions"]

        # Bob contributes more
        assert contributions["bob"] > contributions["alice"]
        # Ratio
        ratio = contributions["bob"] / contributions["alice"]
        assert 1.0 < ratio < 1.5  # Bob contributes 20% more


# ═══════════════════════════════════════════════════════════════════════════════
# Banks and Payment Processor
# ═══════════════════════════════════════════════════════════════════════════════

def setup_banks_and_processor(alice: Actor, bob: Actor) -> None:
    """Create banks as actors and a payment processing company."""

    # ── Chase Bank ──────────────────────────────────────────────
    alice.knowledge_graph.add_entity("bank_chase", EntityType.ORGANIZATION, "Chase Bank", {
        "type": "bank",
        "industry": "financial_services",
        "hq": "New York, NY",
        "founded": "1799",
        "assets": "3.7 trillion",
        "employees": "293,000",
        "routing_number": "021000021",
        "swift_code": "CHASUS33",
        "services": ["checking", "savings", "credit_cards", "loans", "investments"],
    })

    # ── Bank of America ─────────────────────────────────────────
    alice.knowledge_graph.add_entity("bank_boa", EntityType.ORGANIZATION, "Bank of America", {
        "type": "bank",
        "industry": "financial_services",
        "hq": "Charlotte, NC",
        "founded": "1904",
        "assets": "3.2 trillion",
        "employees": "213,000",
        "routing_number": "026009593",
        "swift_code": "BOFAUS3N",
        "services": ["checking", "savings", "credit_cards", "loans", "investments"],
    })

    # ── Payment Processor (Stripe) ──────────────────────────────
    alice.knowledge_graph.add_entity("processor_stripe", EntityType.ORGANIZATION, "Stripe", {
        "type": "payment_processor",
        "industry": "fintech",
        "hq": "San Francisco, CA",
        "founded": "2010",
        "valuation": "50 billion",
        "employees": "8,000",
        "services": ["payment_processing", "billing", "connect", "terminal"],
        "api_version": "2024-01-01",
    })

    # ── Payment Processor (Square) ──────────────────────────────
    alice.knowledge_graph.add_entity("processor_square", EntityType.ORGANIZATION, "Square", {
        "type": "payment_processor",
        "industry": "fintech",
        "hq": "San Francisco, CA",
        "founded": "2009",
        "market_cap": "40 billion",
        "employees": "12,000",
        "services": ["payment_processing", "pos", "cash_app", "terminal"],
        "parent_company": "Block, Inc.",
    })

    # ── Relationships: Banks ────────────────────────────────────
    # Alice → Chase: Customer
    alice.knowledge_graph.add_relationship(
        "alice", "bank_chase", RelationshipType.RELATED_TO,
        {"relationship": "customer", "account_type": "checking", "since": "2015-01-01"},
    )

    # Bob → Bank of America: Customer
    bob.knowledge_graph.add_entity("bank_chase", EntityType.ORGANIZATION, "Chase Bank", {
        "type": "bank", "hq": "New York, NY",
    })
    bob.knowledge_graph.add_entity("bank_boa", EntityType.ORGANIZATION, "Bank of America", {
        "type": "bank", "hq": "Charlotte, NC",
    })
    bob.knowledge_graph.add_entity("processor_stripe", EntityType.ORGANIZATION, "Stripe", {
        "type": "payment_processor", "hq": "San Francisco, CA",
    })
    bob.knowledge_graph.add_entity("processor_square", EntityType.ORGANIZATION, "Square", {
        "type": "payment_processor", "hq": "San Francisco, CA",
    })

    bob.knowledge_graph.add_relationship(
        "bob", "bank_boa", RelationshipType.RELATED_TO,
        {"relationship": "customer", "account_type": "checking", "since": "2014-06-01"},
    )

    # Household Wallet → Chase: Account Held By
    alice.knowledge_graph.add_relationship(
        "wallet_household", "bank_chase", RelationshipType.RELATED_TO,
        {"relationship": "account_held_by", "account_type": "joint_checking"},
    )
    bob.knowledge_graph.add_relationship(
        "wallet_household", "bank_chase", RelationshipType.RELATED_TO,
        {"relationship": "account_held_by", "account_type": "joint_checking"},
    )

    # ── Relationships: Payment Processors ───────────────────────
    # Chase → Stripe: Uses
    alice.knowledge_graph.add_relationship(
        "bank_chase", "processor_stripe", RelationshipType.RELATED_TO,
        {"relationship": "uses_for", "purpose": "online_payments", "since": "2018-01-01"},
    )

    # Chase → Square: Uses
    alice.knowledge_graph.add_relationship(
        "bank_chase", "processor_square", RelationshipType.RELATED_TO,
        {"relationship": "uses_for", "purpose": "pos_processing", "since": "2019-06-01"},
    )

    # Bank of America → Stripe: Uses
    bob.knowledge_graph.add_relationship(
        "bank_boa", "processor_stripe", RelationshipType.RELATED_TO,
        {"relationship": "uses_for", "purpose": "online_payments", "since": "2017-03-01"},
    )

    # Bank of America → Square: Uses
    bob.knowledge_graph.add_relationship(
        "bank_boa", "processor_square", RelationshipType.RELATED_TO,
        {"relationship": "uses_for", "purpose": "pos_processing", "since": "2018-09-01"},
    )

    # ── Grocery Stores → Payment Processors ─────────────────────
    store_processor_map = {
        "store_001": "processor_stripe",   # Whole Foods → Stripe
        "store_002": "processor_square",   # Trader Joe's → Square
        "store_003": "processor_square",   # Key Food → Square
        "store_004": "processor_stripe",   # Fairway → Stripe
        "store_005": "processor_square",   # Gristedes → Square
    }

    for store_id, processor_id in store_processor_map.items():
        alice.knowledge_graph.add_relationship(
            store_id, processor_id, RelationshipType.RELATED_TO,
            {"relationship": "uses_for", "purpose": "payment_processing"},
        )
        bob.knowledge_graph.add_relationship(
            store_id, processor_id, RelationshipType.RELATED_TO,
            {"relationship": "uses_for", "purpose": "payment_processing"},
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Grocery Payment Flow (Household Wallet)
# ═══════════════════════════════════════════════════════════════════════════════

def setup_grocery_payments(alice: Actor, bob: Actor) -> None:
    """Set up payment flow: Groceries paid from household wallet, not individual."""

    # ── Payment Records ─────────────────────────────────────────
    payments = [
        {"store": "store_001", "amount": 67.42, "items": ["Whole Milk x2", "Bread", "Eggs"], "date": "2024-01-15"},
        {"store": "store_002", "amount": 45.99, "items": ["Organic Milk", "Cheese", "Yogurt"], "date": "2024-01-18"},
        {"store": "store_003", "amount": 32.15, "items": ["Store Brand Milk", "Rice", "Beans"], "date": "2024-01-20"},
        {"store": "store_005", "amount": 18.75, "items": ["Milk", "Snacks"], "date": "2024-01-22"},
    ]

    # ── Add to Alice's Knowledge Graph ──────────────────────────
    for idx, payment in enumerate(payments):
        payment_id = f"payment_{idx + 1}"
        alice.knowledge_graph.add_entity(payment_id, EntityType.EXPENSE, f"Grocery Payment #{idx + 1}", {
            "type": "grocery_payment",
            "store_id": payment["store"],
            "amount": payment["amount"],
            "items": payment["items"],
            "date": payment["date"],
            "payment_method": "household_wallet",
            "paid_by": "household",
        })

        # Payment → Store: Paid To
        alice.knowledge_graph.add_relationship(
            payment_id, payment["store"], RelationshipType.PAYS_EXPENSE,
            {"relationship": "paid_to", "amount": payment["amount"]},
        )

        # Household Wallet → Payment: Paid From
        alice.knowledge_graph.add_relationship(
            "wallet_household", payment_id, RelationshipType.PAYS_EXPENSE,
            {"relationship": "paid_from", "amount": payment["amount"]},
        )

    # ── Add to Bob's Knowledge Graph ────────────────────────────
    for idx, payment in enumerate(payments):
        payment_id = f"payment_{idx + 1}"
        bob.knowledge_graph.add_entity(payment_id, EntityType.EXPENSE, f"Grocery Payment #{idx + 1}", {
            "type": "grocery_payment",
            "store_id": payment["store"],
            "amount": payment["amount"],
            "items": payment["items"],
            "date": payment["date"],
            "payment_method": "household_wallet",
            "paid_by": "household",
        })

        bob.knowledge_graph.add_relationship(
            payment_id, payment["store"], RelationshipType.PAYS_EXPENSE,
            {"relationship": "paid_to", "amount": payment["amount"]},
        )

        bob.knowledge_graph.add_relationship(
            "wallet_household", payment_id, RelationshipType.PAYS_EXPENSE,
            {"relationship": "paid_from", "amount": payment["amount"]},
        )

    # ── Store Balance Updates ───────────────────────────────────
    # Deduct from household wallet
    shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
    total_spent = sum(p["amount"] for p in payments)
    shared_wallet.attributes["balance"] -= total_spent
    shared_wallet.attributes["last_grocery_payment"] = payments[-1]["date"]
    shared_wallet.attributes["monthly_grocery_spend"] = total_spent


class TestGroceryPayments:
    """Test grocery payment flow from household wallet."""

    def test_payments_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]
        assert len(payments) == 4

    def test_payments_from_household_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        for payment in payments:
            assert payment.attributes["payment_method"] == "household_wallet"
            assert payment.attributes["paid_by"] == "household"

    def test_payments_not_from_individual_wallets(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        for payment in payments:
            assert payment.attributes["paid_by"] != "alice"
            assert payment.attributes["paid_by"] != "bob"

    def test_household_wallet_balance_decreased(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
        # Original 8750.25 - total spent
        assert shared_wallet.attributes["balance"] < 8750.25

    def test_total_grocery_spend(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        total = sum(p.attributes["amount"] for p in payments)
        assert total == 164.31  # 67.42 + 45.99 + 32.15 + 18.75

    def test_payment_to_stores(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        payment_to_store = [r for r in pay_rels if "payment" in r.source_id and "store" in r.target_id]

        assert len(payment_to_store) == 4

    def test_wallet_to_payment_flow(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        wallet_to_payment = [r for r in pay_rels
                            if r.source_id == "wallet_household" and "payment" in r.target_id]

        assert len(wallet_to_payment) == 4

    def test_individual_wallets_unchanged(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")

        # Individual wallets should not be affected
        assert alice_wallet.attributes["balance"] == 2450.75
        assert bob_wallet.attributes["balance"] == 3125.50

    def test_payment_items_tracked(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        # First payment should have items
        first_payment = payments[0]
        assert "Whole Milk x2" in first_payment.attributes["items"]
        assert "Bread" in first_payment.attributes["items"]
        assert "Eggs" in first_payment.attributes["items"]

    def test_payment_dates_tracked(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        dates = [p.attributes["date"] for p in payments]
        assert "2024-01-15" in dates
        assert "2024-01-22" in dates

    def test_payment_store_mapping(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        payments = [e for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                   if e.attributes.get("type") == "grocery_payment"]

        store_ids = {p.attributes["store_id"] for p in payments}
        assert "store_001" in store_ids  # Whole Foods
        assert "store_002" in store_ids  # Trader Joe's
        assert "store_003" in store_ids  # Key Food
        assert "store_005" in store_ids  # Gristedes

    def test_both_have_same_payments(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_wallets(alice, bob)
        setup_grocery_payments(alice, bob)

        alice_payments = {e.name for e in alice.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                         if e.attributes.get("type") == "grocery_payment"}
        bob_payments = {e.name for e in bob.knowledge_graph.entities_by_type(EntityType.EXPENSE)
                       if e.attributes.get("type") == "grocery_payment"}

        assert alice_payments == bob_payments


class TestBanksAndProcessor:
    """Test banks and payment processor relationships."""

    def test_chase_bank_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        chase = alice.knowledge_graph.get_entity("bank_chase")
        assert chase is not None
        assert chase.name == "Chase Bank"
        assert chase.attributes["type"] == "bank"
        assert chase.attributes["assets"] == "3.7 trillion"

    def test_bank_of_america_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        boa = alice.knowledge_graph.get_entity("bank_boa")
        assert boa is not None
        assert boa.name == "Bank of America"
        assert boa.attributes["type"] == "bank"
        assert boa.attributes["hq"] == "Charlotte, NC"

    def test_stripe_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        stripe = alice.knowledge_graph.get_entity("processor_stripe")
        assert stripe is not None
        assert stripe.name == "Stripe"
        assert stripe.attributes["type"] == "payment_processor"
        assert stripe.attributes["industry"] == "fintech"

    def test_square_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        square = alice.knowledge_graph.get_entity("processor_square")
        assert square is not None
        assert square.name == "Square"
        assert square.attributes["type"] == "payment_processor"
        assert square.attributes["parent_company"] == "Block, Inc."

    def test_alice_uses_chase(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        customer_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        alice_chase = [r for r in customer_rels
                      if r.target_id == "bank_chase" and r.attributes.get("relationship") == "customer"]
        assert len(alice_chase) == 1

    def test_bob_uses_bank_of_america(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        customer_rels = bob.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        bob_boa = [r for r in customer_rels
                  if r.target_id == "bank_boa" and r.attributes.get("relationship") == "customer"]
        assert len(bob_boa) == 1

    def test_household_account_at_chase(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        account_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        household_chase = [r for r in account_rels
                          if r.source_id == "wallet_household" and r.target_id == "bank_chase"]
        assert len(household_chase) == 1
        assert household_chase[0].attributes["account_type"] == "joint_checking"

    def test_chase_uses_stripe(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        uses_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        chase_stripe = [r for r in uses_rels
                       if r.source_id == "bank_chase" and r.target_id == "processor_stripe"]
        assert len(chase_stripe) == 1
        assert chase_stripe[0].attributes["purpose"] == "online_payments"

    def test_chase_uses_square(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        uses_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        chase_square = [r for r in uses_rels
                       if r.source_id == "bank_chase" and r.target_id == "processor_square"]
        assert len(chase_square) == 1
        assert chase_square[0].attributes["purpose"] == "pos_processing"

    def test_boa_uses_stripe(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        uses_rels = bob.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        boa_stripe = [r for r in uses_rels
                     if r.source_id == "bank_boa" and r.target_id == "processor_stripe"]
        assert len(boa_stripe) == 1

    def test_boa_uses_square(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        uses_rels = bob.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        boa_square = [r for r in uses_rels
                     if r.source_id == "bank_boa" and r.target_id == "processor_square"]
        assert len(boa_square) == 1

    def test_stores_use_processors(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        uses_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        store_processor = [r for r in uses_rels
                          if r.attributes.get("relationship") == "uses_for"
                          and r.attributes.get("purpose") == "payment_processing"
                          and "store" in r.source_id]

        assert len(store_processor) == 5

    def test_graph_statistics_with_banks(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_banks_and_processor(alice, bob)

        stats = alice.knowledge_graph.stats()
        # alice, bob, household, family, 4 banks/processors = 8
        assert stats["entity_count"] == 8
        assert stats["relationship_count"] >= 10


class TestGroceryStores:
    """Test 5 grocery stores around the Smith household."""

    def test_five_stores_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Check Alice's knowledge graph
        alice_stores = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                       if e.attributes.get("type") == "grocery_store"]
        assert len(alice_stores) == 5

        # Check Bob's knowledge graph
        bob_stores = [e for e in bob.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                     if e.attributes.get("type") == "grocery_store"]
        assert len(bob_stores) == 5

    def test_grocery_store_society_exists(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Check Alice's knowledge graph has the society
        alice_society = alice.knowledge_graph.get_entity("society_001")
        assert alice_society is not None
        assert alice_society.name == "Grocery Store Society"
        assert alice_society.attributes["type"] == "industry_society"
        assert alice_society.attributes["industry"] == "grocery_retail"

        # Check Bob's knowledge graph has the society
        bob_society = bob.knowledge_graph.get_entity("society_001")
        assert bob_society is not None
        assert bob_society.name == "Grocery Store Society"

    def test_all_stores_belong_to_society(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Find all stores that are members of the society
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        member_rels = [r for r in store_rels if r.attributes.get("relationship") == "member_of"]

        # All 5 stores should be members
        assert len(member_rels) == 5

        # Check that all point to the society
        for rel in member_rels:
            assert rel.target_id == "society_001"

    def test_store_membership_tiers(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Get all membership relationships
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        member_rels = [r for r in store_rels if r.attributes.get("relationship") == "member_of"]

        # Check tiers
        tiers = {r.source_id: r.attributes.get("tier") for r in member_rels}
        assert tiers["store_001"] == "premium"  # Whole Foods
        assert tiers["store_002"] == "standard"  # Trader Joe's
        assert tiers["store_003"] == "standard"  # Key Food
        assert tiers["store_004"] == "premium"  # Fairway
        assert tiers["store_005"] == "basic"  # Gristedes

    def test_society_member_count(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        society = alice.knowledge_graph.get_entity("society_001")
        assert society.attributes["member_count"] == 5

    def test_society_statistics(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Count organizations
        orgs = alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
        assert len(orgs) == 6  # 5 stores + 1 society

        # Count store-to-society relationships
        store_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        member_rels = [r for r in store_rels if r.attributes.get("relationship") == "member_of"]
        assert len(member_rels) == 5

    def test_store_names(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        store_names = [e.name for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                      if e.attributes.get("type") == "grocery_store"]

        assert "Whole Foods Market" in store_names
        assert "Trader Joe's" in store_names
        assert "Key Food" in store_names
        assert "Fairway Market" in store_names
        assert "Gristedes" in store_names

    def test_store_distances(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        stores = alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
        grocery_stores = [s for s in stores if s.attributes.get("type") == "grocery_store"]

        distances = {s.name: s.attributes["distance_miles"] for s in grocery_stores}
        assert distances["Gristedes"] == 0.1  # Closest
        assert distances["Key Food"] == 0.2
        assert distances["Whole Foods Market"] == 0.3
        assert distances["Trader Joe's"] == 0.5
        assert distances["Fairway Market"] == 0.7  # Farthest

    def test_store_types(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        stores = alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
        grocery_stores = [s for s in stores if s.attributes.get("type") == "grocery_store"]

        store_types = {s.name: s.attributes["store_type"] for s in grocery_stores}
        assert store_types["Whole Foods Market"] == "organic"
        assert store_types["Trader Joe's"] == "specialty"
        assert store_types["Key Food"] == "budget"
        assert store_types["Fairway Market"] == "premium"
        assert store_types["Gristedes"] == "convenience"

    def test_store_ratings(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        stores = alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
        grocery_stores = [s for s in stores if s.attributes.get("type") == "grocery_store"]

        ratings = {s.name: s.attributes["rating"] for s in grocery_stores}
        assert ratings["Trader Joe's"] == 4.7  # Highest
        assert ratings["Gristedes"] == 3.5  # Lowest

    def test_household_to_stores_relationships(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Find all relationships from household to stores
        household_rels = alice.knowledge_graph.relationships_for("household_001")
        store_rels = [r for r in household_rels if "store" in (alice.knowledge_graph.get_entity(r.target_id).attributes.get("type") if alice.knowledge_graph.get_entity(r.target_id) else "")]

        assert len(store_rels) == 5

    def test_both_have_same_stores(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        alice_stores = {e.name for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                       if e.attributes.get("type") == "grocery_store"}
        bob_stores = {e.name for e in bob.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                     if e.attributes.get("type") == "grocery_store"}

        assert alice_stores == bob_stores

    def test_graph_statistics_with_stores(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        stats = alice.knowledge_graph.stats()
        assert stats["entity_count"] == 10  # alice, bob, household, family, 5 stores, 1 society
        assert stats["relationship_count"] == 13  # 3 original + 5 nearby + 5 member_of

    def test_find_nearest_store(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        # Find nearest store to household
        household_rels = alice.knowledge_graph.relationships_for("household_001")
        store_rels = [r for r in household_rels
                     if alice.knowledge_graph.get_entity(r.target_id) and
                     alice.knowledge_graph.get_entity(r.target_id).attributes.get("type") == "grocery_store"]

        nearest = min(store_rels, key=lambda r: r.attributes.get("distance", 999))
        nearest_store = alice.knowledge_graph.get_entity(nearest.target_id)

        assert nearest_store.name == "Gristedes"
        assert nearest_store.attributes["distance_miles"] == 0.1


# ═══════════════════════════════════════════════════════════════════════════════
# Optimization Preferences
# ═══════════════════════════════════════════════════════════════════════════════

class TestOptimizationPreferences:
    """Test Alice optimizes for cost, Bob optimizes for speed."""

    def test_alice_optimizes_for_cost(self):
        alice = create_alice()
        assert alice.profile.metadata["optimization_preference"] == "cost"

    def test_bob_optimizes_for_speed(self):
        bob = create_bob()
        assert bob.profile.metadata["optimization_preference"] == "speed"

    def test_alice_shopping_style(self):
        alice = create_alice()
        assert alice.profile.metadata["shopping_style"] == "budget_conscious"

    def test_bob_shopping_style(self):
        bob = create_bob()
        assert bob.profile.metadata["shopping_style"] == "convenience_first"

    def test_alice_prefers_cheaper_stores(self):
        alice = create_alice()
        assert "Key Food" in alice.profile.metadata["preferred_stores"]
        assert "Gristedes" in alice.profile.metadata["preferred_stores"]

    def test_bob_prefers_convenient_stores(self):
        bob = create_bob()
        assert "Gristedes" in bob.profile.metadata["preferred_stores"]
        assert "Whole Foods" in bob.profile.metadata["preferred_stores"]

    def test_alice_uses_coupons(self):
        alice = create_alice()
        assert alice.profile.metadata["coupon_user"] is True

    def test_bob_does_not_use_coupons(self):
        bob = create_bob()
        assert bob.profile.metadata["coupon_user"] is False

    def test_alice_compares_prices(self):
        alice = create_alice()
        assert alice.profile.metadata["price_comparison"] is True

    def test_bob_does_not_compare_prices(self):
        bob = create_bob()
        assert bob.profile.metadata["price_comparison"] is False

    def test_alice_chooses_cheapest_milk(self):
        """Alice should prefer Store Brand at Key Food ($3.99) over Organic Valley at Whole Foods ($6.99)."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Find all milk products
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        # Alice's optimization: find cheapest
        cheapest = min(milk_products, key=lambda e: e.attributes["price"])
        assert cheapest.attributes["brand"] == "Store Brand"
        assert cheapest.attributes["price"] == 3.99
        assert cheapest.attributes["store_id"] == "store_003"  # Key Food

    def test_bob_chooses_nearest_milk(self):
        """Bob should prefer Gristedes (0.1 mi) over farther stores."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        # Find all milk products with their store distances
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        # Get store distances
        stores = {e.entity_id: e.attributes["distance_miles"]
                 for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                 if e.attributes.get("type") == "grocery_store"}

        # Bob's optimization: find nearest store with milk
        nearest_milk = min(milk_products,
                          key=lambda e: stores.get(e.attributes["store_id"], 999))

        # Gristedes is closest (0.1 mi)
        assert nearest_milk.attributes["store_id"] == "store_005"

    def test_alice_vs_bob_different_choices(self):
        """Alice and Bob would choose different stores for the same product."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        stores = {e.entity_id: e.attributes["distance_miles"]
                 for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                 if e.attributes.get("type") == "grocery_store"}

        # Alice: cheapest (Key Food)
        alice_choice = min(milk_products, key=lambda e: e.attributes["price"])
        assert alice_choice.attributes["store_id"] == "store_003"

        # Bob: nearest (Gristedes)
        bob_choice = min(milk_products, key=lambda e: stores.get(e.attributes["store_id"], 999))
        assert bob_choice.attributes["store_id"] == "store_005"

        # They choose different stores
        assert alice_choice.attributes["store_id"] != bob_choice.attributes["store_id"]

    def test_cost_savings_analysis(self):
        """Show how much Alice saves by optimizing for cost."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)

        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        # Alice's choice (cheapest)
        alice_choice = min(milk_products, key=lambda e: e.attributes["price"])

        # Bob's choice (nearest - Gristedes)
        stores = {e.entity_id: e.attributes["distance_miles"]
                 for e in alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
                 if e.attributes.get("type") == "grocery_store"}
        bob_choice = min(milk_products, key=lambda e: stores.get(e.attributes["store_id"], 999))

        # Savings per gallon
        savings = bob_choice.attributes["price"] - alice_choice.attributes["price"]
        assert savings > 0  # Alice saves money

        # Alice pays $3.99, Bob pays $4.29 (Store Brand at Gristedes)
        assert alice_choice.attributes["price"] == 3.99
        assert bob_choice.attributes["price"] == 4.29

    def test_speed_vs_cost_tradeoff(self):
        """Demonstrate the speed vs cost tradeoff."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)

        stores = alice.knowledge_graph.entities_by_type(EntityType.ORGANIZATION)
        grocery_stores = [s for s in stores if s.attributes.get("type") == "grocery_store"]

        # Alice's preference: cheapest (Key Food at $3.99 milk)
        alice_pref = next(s for s in grocery_stores if s.entity_id == "store_003")
        assert alice_pref.attributes["distance_miles"] == 0.2
        assert alice_pref.name == "Key Food"

        # Bob's preference: nearest (Gristedes at 0.1 mi)
        bob_pref = next(s for s in grocery_stores if s.entity_id == "store_005")
        assert bob_pref.attributes["distance_miles"] == 0.1
        assert bob_pref.name == "Gristedes"

        # Tradeoff: Alice travels farther (0.2 mi vs 0.1 mi) but pays less
        assert alice_pref.attributes["distance_miles"] > bob_pref.attributes["distance_miles"]


# ═══════════════════════════════════════════════════════════════════════════════
# Alice Joins Grocery Society & Declares Goal
# ═══════════════════════════════════════════════════════════════════════════════

def setup_alice_joins_society(alice: Actor, bob: Actor) -> None:
    """Alice joins the Grocery Store Society as a customer member."""

    # ── Alice Joins Grocery Store Society ───────────────────────
    alice.knowledge_graph.add_entity("membership_alice", EntityType.OTHER, "Alice's Grocery Membership", {
        "type": "society_membership",
        "society_id": "society_001",
        "society_name": "Grocery Store Society",
        "member_type": "customer",
        "membership_tier": "standard",
        "joined_date": "2024-01-01",
        "member_id": "GSS-ALICE-001",
        "benefits": ["loyalty_points", "weekly_deals", "digital_coupons"],
    })

    # Alice → Society: Member Of
    alice.knowledge_graph.add_relationship(
        "alice", "society_001", RelationshipType.RELATED_TO,
        {"relationship": "member_of", "tier": "standard", "member_id": "GSS-ALICE-001"},
    )

    # Society → Alice: Has Member
    alice.knowledge_graph.add_relationship(
        "society_001", "alice", RelationshipType.RELATED_TO,
        {"relationship": "has_member", "member_type": "customer"},
    )

    # ── Alice's Goal Declaration ────────────────────────────────
    alice.knowledge_graph.add_entity("goal_milk", EntityType.OTHER, "Buy 1L Whole Milk", {
        "type": "shopping_goal",
        "goal": "1L of whole milk",
        "product_category": "dairy",
        "product": "whole_milk",
        "quantity": 1,
        "unit": "liter",
        "declared_by": "alice",
        "declared_at": "2024-01-25T10:30:00",
        "status": "pending",
        "optimization": "cost",
    })

    # Alice → Goal: Has Goal
    alice.knowledge_graph.add_relationship(
        "alice", "goal_milk", RelationshipType.RELATED_TO,
        {"relationship": "has_goal", "priority": "high"},
    )

    # ── Society Processes Goal ───────────────────────────────────
    # Society finds matching products across member stores
    alice.knowledge_graph.add_entity("society_response", EntityType.OTHER, "Society Response", {
        "type": "society_response",
        "goal_id": "goal_milk",
        "processed_by": "Grocery Store Society",
        "processed_at": "2024-01-25T10:30:05",
        "matching_products": [
            {"store_id": "store_003", "store_name": "Key Food", "brand": "Store Brand", "price": 3.99, "distance": 0.2, "match_score": 0.95},
            {"store_id": "store_005", "store_name": "Gristedes", "brand": "Store Brand", "price": 4.29, "distance": 0.1, "match_score": 0.90},
            {"store_id": "store_001", "store_name": "Whole Foods", "brand": "Whole Foods 365", "price": 4.99, "distance": 0.3, "match_score": 0.85},
        ],
        "recommended_store": "store_003",
        "recommended_reason": "Lowest price for 1L whole milk",
        "estimated_savings": 0.30,
    })

    # Society → Goal: Processed
    alice.knowledge_graph.add_relationship(
        "society_001", "goal_milk", RelationshipType.RELATED_TO,
        {"relationship": "processed", "status": "completed"},
    )

    # ── Alice Selects & Commits ─────────────────────────────────
    alice.knowledge_graph.add_entity("commitment_milk", EntityType.OTHER, "Milk Purchase Commitment", {
        "type": "purchase_commitment",
        "goal_id": "goal_milk",
        "store_id": "store_003",
        "store_name": "Key Food",
        "product": "Store Brand Whole Milk",
        "quantity": 1,
        "unit": "liter",
        "price": 3.99,
        "payment_method": "wallet_household",
        "status": "committed",
        "committed_at": "2024-01-25T10:31:00",
    })

    # Alice → Commitment: Commits
    alice.knowledge_graph.add_relationship(
        "alice", "commitment_milk", RelationshipType.RELATED_TO,
        {"relationship": "commits_to", "status": "active"},
    )

    # Commitment → Store: Will Purchase From
    alice.knowledge_graph.add_relationship(
        "commitment_milk", "store_003", RelationshipType.RELATED_TO,
        {"relationship": "will_purchase_from"},
    )

    # Commitment → Wallet: Will Pay From
    alice.knowledge_graph.add_relationship(
        "commitment_milk", "wallet_household", RelationshipType.PAYS_EXPENSE,
        {"relationship": "will_pay_from", "amount": 3.99},
    )


class TestAliceJoinsSociety:
    """Test Alice joining Grocery Store Society and declaring goal."""

    def test_alice_joins_society(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        membership = alice.knowledge_graph.get_entity("membership_alice")
        assert membership is not None
        assert membership.attributes["society_name"] == "Grocery Store Society"
        assert membership.attributes["member_type"] == "customer"
        assert membership.attributes["member_id"] == "GSS-ALICE-001"

    def test_alice_membership_relationship(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        member_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        # Filter for Alice specifically
        alice_membership = [r for r in member_rels
                           if r.source_id == "alice" and r.target_id == "society_001"
                           and r.attributes.get("relationship") == "member_of"]
        assert len(alice_membership) == 1
        assert alice_membership[0].attributes["tier"] == "standard"

    def test_society_has_alice(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        member_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        has_member = [r for r in member_rels
                     if r.source_id == "society_001" and r.attributes.get("relationship") == "has_member"]
        assert len(has_member) == 1

    def test_alice_declares_goal(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        goal = alice.knowledge_graph.get_entity("goal_milk")
        assert goal is not None
        assert goal.attributes["goal"] == "1L of whole milk"
        assert goal.attributes["product"] == "whole_milk"
        assert goal.attributes["quantity"] == 1
        assert goal.attributes["unit"] == "liter"
        assert goal.attributes["optimization"] == "cost"

    def test_goal_declared_by_alice(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        goal = alice.knowledge_graph.get_entity("goal_milk")
        assert goal.attributes["declared_by"] == "alice"

    def test_society_processes_goal(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        response = alice.knowledge_graph.get_entity("society_response")
        assert response is not None
        assert response.attributes["processed_by"] == "Grocery Store Society"
        assert response.attributes["goal_id"] == "goal_milk"

    def test_society_finds_matching_products(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        response = alice.knowledge_graph.get_entity("society_response")
        matching = response.attributes["matching_products"]
        assert len(matching) == 3

    def test_society_recommends_cheapest(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        response = alice.knowledge_graph.get_entity("society_response")
        assert response.attributes["recommended_store"] == "store_003"
        assert response.attributes["recommended_reason"] == "Lowest price for 1L whole milk"

    def test_alice_commits_to_purchase(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        commitment = alice.knowledge_graph.get_entity("commitment_milk")
        assert commitment is not None
        assert commitment.attributes["store_name"] == "Key Food"
        assert commitment.attributes["price"] == 3.99
        assert commitment.attributes["payment_method"] == "wallet_household"
        assert commitment.attributes["status"] == "committed"

    def test_commitment_to_store(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        commit_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        purchase_from = [r for r in commit_rels
                        if r.source_id == "commitment_milk" and r.attributes.get("relationship") == "will_purchase_from"]
        assert len(purchase_from) == 1
        assert purchase_from[0].target_id == "store_003"

    def test_commitment_to_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        wallet_pay = [r for r in pay_rels
                     if r.source_id == "commitment_milk" and r.target_id == "wallet_household"]
        assert len(wallet_pay) == 1
        assert wallet_pay[0].attributes["amount"] == 3.99

    def test_full_flow_statistics(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_alice_joins_society(alice, bob)

        stats = alice.knowledge_graph.stats()
        # Entities: alice, bob, household, family, 5 stores, society, membership, goal, response, commitment
        assert stats["entity_count"] >= 10


# ═══════════════════════════════════════════════════════════════════════════════
# Add Item to Cart at Recommended Store
# ═══════════════════════════════════════════════════════════════════════════════

def setup_add_to_cart(alice: Actor, bob: Actor) -> None:
    """Add the committed milk item to cart at Key Food."""

    # ── Shopping Cart ───────────────────────────────────────────
    alice.knowledge_graph.add_entity("cart_alice", EntityType.ACCOUNT, "Alice's Shopping Cart", {
        "type": "shopping_cart",
        "store_id": "store_003",
        "store_name": "Key Food",
        "cart_id": "CART-KF-2024-01-25-001",
        "status": "active",
        "created_at": "2024-01-25T10:31:30",
        "items": [
            {
                "item_id": "item_001",
                "product_id": "milk_store_003_0",
                "product_name": "Whole Milk - Store Brand",
                "brand": "Store Brand",
                "category": "dairy",
                "quantity": 1,
                "unit": "1 gallon",
                "price": 3.99,
                "subtotal": 3.99,
            }
        ],
        "subtotal": 3.99,
        "tax": 0.32,
        "total": 4.31,
    })

    # Alice → Cart: Has Cart
    alice.knowledge_graph.add_relationship(
        "alice", "cart_alice", RelationshipType.RELATED_TO,
        {"relationship": "has_cart", "store_id": "store_003"},
    )

    # Cart → Store: At Store
    alice.knowledge_graph.add_relationship(
        "cart_alice", "store_003", RelationshipType.RELATED_TO,
        {"relationship": "at_store", "store_name": "Key Food"},
    )

    # Cart → Product: Contains
    alice.knowledge_graph.add_relationship(
        "cart_alice", "milk_store_003_0", RelationshipType.OWNS,
        {"relationship": "contains", "quantity": 1, "subtotal": 3.99},
    )

    # Cart → Wallet: Will Pay From
    alice.knowledge_graph.add_relationship(
        "cart_alice", "wallet_household", RelationshipType.PAYS_EXPENSE,
        {"relationship": "will_pay_from", "amount": 4.31},
    )

    # ── Inventory Update ────────────────────────────────────────
    # Deduct 1 unit from store inventory (only if inventory exists)
    milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                    if e.attributes.get("product") == "whole_milk"
                    and e.attributes.get("store_id") == "store_003"
                    and e.attributes.get("brand") == "Store Brand"]
    if milk_products:
        milk_product = milk_products[0]
        milk_product.attributes["quantity"] -= 1
        milk_product.attributes["in_cart"] = True

    # ── Bob's Knowledge Graph (synced) ──────────────────────────
    bob.knowledge_graph.add_entity("cart_alice", EntityType.ACCOUNT, "Alice's Shopping Cart", {
        "type": "shopping_cart",
        "store_id": "store_003",
        "store_name": "Key Food",
        "cart_id": "CART-KF-2024-01-25-001",
        "status": "active",
        "created_at": "2024-01-25T10:31:30",
        "items": [
            {
                "item_id": "item_001",
                "product_id": "milk_store_003_0",
                "product_name": "Whole Milk - Store Brand",
                "brand": "Store Brand",
                "quantity": 1,
                "unit": "1 gallon",
                "price": 3.99,
                "subtotal": 3.99,
            }
        ],
        "subtotal": 3.99,
        "tax": 0.32,
        "total": 4.31,
    })


class TestAddToCart:
    """Test adding item to cart at recommended store."""

    def test_cart_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart is not None
        assert cart.attributes["store_name"] == "Key Food"
        assert cart.attributes["status"] == "active"

    def test_cart_has_item(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        items = cart.attributes["items"]
        assert len(items) == 1
        assert items[0]["product_name"] == "Whole Milk - Store Brand"
        assert items[0]["quantity"] == 1
        assert items[0]["price"] == 3.99

    def test_cart_subtotal(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["subtotal"] == 3.99

    def test_cart_tax(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["tax"] == 0.32

    def test_cart_total(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["total"] == 4.31  # 3.99 + 0.32

    def test_cart_at_correct_store(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.RELATED_TO)
        cart_at_store = [r for r in cart_rels
                        if r.source_id == "cart_alice" and r.attributes.get("relationship") == "at_store"]
        assert len(cart_at_store) == 1
        assert cart_at_store[0].target_id == "store_003"

    def test_cart_linked_to_product(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        owns_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.OWNS)
        cart_product = [r for r in owns_rels
                       if r.source_id == "cart_alice" and r.target_id == "milk_store_003_0"]
        assert len(cart_product) == 1
        assert cart_product[0].attributes["quantity"] == 1

    def test_cart_linked_to_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        cart_wallet = [r for r in pay_rels
                      if r.source_id == "cart_alice" and r.target_id == "wallet_household"]
        assert len(cart_wallet) == 1
        assert cart_wallet[0].attributes["amount"] == 4.31

    def test_inventory_decremented(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        # Find milk product at Key Food
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"
                        and e.attributes.get("store_id") == "store_003"
                        and e.attributes.get("brand") == "Store Brand"]
        assert len(milk_products) == 1
        milk = milk_products[0]
        # Was 48, now 47
        assert milk.attributes["quantity"] == 47
        assert milk.attributes["in_cart"] is True

    def test_cart_has_store_id(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["store_id"] == "store_003"

    def test_cart_has_cart_id(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert "CART-KF" in cart.attributes["cart_id"]

    def test_bob_has_same_cart(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        alice_cart = alice.knowledge_graph.get_entity("cart_alice")
        bob_cart = bob.knowledge_graph.get_entity("cart_alice")

        assert alice_cart.attributes["total"] == bob_cart.attributes["total"]
        assert alice_cart.attributes["store_name"] == bob_cart.attributes["store_name"]

    def test_cart_status_active(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["status"] == "active"

    def test_product_marked_in_cart(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)

        # Find milk product at Key Food
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"
                        and e.attributes.get("store_id") == "store_003"
                        and e.attributes.get("brand") == "Store Brand"]
        assert len(milk_products) == 1
        assert milk_products[0].attributes.get("in_cart") is True


# ═══════════════════════════════════════════════════════════════════════════════
# Checkout and Pay for Cart
# ═══════════════════════════════════════════════════════════════════════════════

def setup_checkout(alice: Actor, bob: Actor) -> None:
    """Checkout and pay for the cart from household wallet."""

    # ── Checkout Transaction ────────────────────────────────────
    alice.knowledge_graph.add_entity("checkout_001", EntityType.EVENT, "Checkout Transaction", {
        "type": "checkout",
        "cart_id": "CART-KF-2024-01-25-001",
        "store_id": "store_003",
        "store_name": "Key Food",
        "status": "completed",
        "started_at": "2024-01-25T10:32:00",
        "completed_at": "2024-01-25T10:32:45",
        "duration_seconds": 45,
    })

    # Checkout → Cart: Processed
    alice.knowledge_graph.add_relationship(
        "checkout_001", "cart_alice", RelationshipType.RELATED_TO,
        {"relationship": "processed_cart"},
    )

    # Checkout → Store: At Store
    alice.knowledge_graph.add_relationship(
        "checkout_001", "store_003", RelationshipType.RELATED_TO,
        {"relationship": "at_store"},
    )

    # ── Payment Transaction ─────────────────────────────────────
    alice.knowledge_graph.add_entity("payment_005", EntityType.EXPENSE, "Grocery Payment - Checkout", {
        "type": "payment",
        "payment_id": "PAY-2024-01-25-001",
        "checkout_id": "checkout_001",
        "store_id": "store_003",
        "store_name": "Key Food",
        "amount": 4.31,
        "subtotal": 3.99,
        "tax": 0.32,
        "payment_method": "wallet_household",
        "wallet_id": "wallet_household",
        "bank_id": "bank_chase",
        "processor_id": "processor_square",
        "status": "completed",
        "processed_at": "2024-01-25T10:32:45",
        "authorization_code": "AUTH-KF-789012",
        "transaction_id": "TXN-2024-01-25-001",
    })

    # Payment → Checkout: For Checkout
    alice.knowledge_graph.add_relationship(
        "payment_005", "checkout_001", RelationshipType.RELATED_TO,
        {"relationship": "for_checkout"},
    )

    # Payment → Wallet: Paid From
    alice.knowledge_graph.add_relationship(
        "payment_005", "wallet_household", RelationshipType.PAYS_EXPENSE,
        {"relationship": "paid_from", "amount": 4.31},
    )

    # Payment → Store: Paid To
    alice.knowledge_graph.add_relationship(
        "payment_005", "store_003", RelationshipType.PAYS_EXPENSE,
        {"relationship": "paid_to", "amount": 4.31},
    )

    # Payment → Bank: Via Bank
    alice.knowledge_graph.add_relationship(
        "payment_005", "bank_chase", RelationshipType.RELATED_TO,
        {"relationship": "via_bank", "account": "****9012"},
    )

    # Payment → Processor: Processed By
    alice.knowledge_graph.add_relationship(
        "payment_005", "processor_square", RelationshipType.RELATED_TO,
        {"relationship": "processed_by"},
    )

    # ── Update Wallet Balance ───────────────────────────────────
    shared_wallet = alice.knowledge_graph.get_entity("wallet_household")
    shared_wallet.attributes["balance"] -= 4.31
    shared_wallet.attributes["last_transaction"] = "2024-01-25T10:32:45"
    shared_wallet.attributes["last_transaction_amount"] = -4.31

    # ── Mark Cart as Completed ──────────────────────────────────
    cart = alice.knowledge_graph.get_entity("cart_alice")
    cart.attributes["status"] = "completed"
    cart.attributes["completed_at"] = "2024-01-25T10:32:45"

    # ── Receipt ─────────────────────────────────────────────────
    alice.knowledge_graph.add_entity("receipt_001", EntityType.DOCUMENT, "Receipt - Key Food", {
        "type": "receipt",
        "receipt_number": "KF-2024-01-25-001",
        "store_id": "store_003",
        "store_name": "Key Food",
        "date": "2024-01-25",
        "items": [
            {"name": "Whole Milk - Store Brand", "qty": 1, "price": 3.99}
        ],
        "subtotal": 3.99,
        "tax": 0.32,
        "total": 4.31,
        "payment_method": "Household Wallet (****9012)",
        "cashier": "Self-Checkout",
    })

    # Receipt → Checkout: For Checkout
    alice.knowledge_graph.add_relationship(
        "receipt_001", "checkout_001", RelationshipType.RELATED_TO,
        {"relationship": "for_checkout"},
    )

    # Receipt → Store: From Store
    alice.knowledge_graph.add_relationship(
        "receipt_001", "store_003", RelationshipType.RELATED_TO,
        {"relationship": "from_store"},
    )

    # ── Bob's Knowledge Graph (synced) ──────────────────────────
    bob.knowledge_graph.add_entity("checkout_001", EntityType.EVENT, "Checkout Transaction", {
        "type": "checkout",
        "cart_id": "CART-KF-2024-01-25-001",
        "store_id": "store_003",
        "status": "completed",
        "completed_at": "2024-01-25T10:32:45",
    })

    bob.knowledge_graph.add_entity("payment_005", EntityType.EXPENSE, "Grocery Payment - Checkout", {
        "type": "payment",
        "amount": 4.31,
        "payment_method": "wallet_household",
        "status": "completed",
    })

    bob.knowledge_graph.add_entity("receipt_001", EntityType.DOCUMENT, "Receipt - Key Food", {
        "type": "receipt",
        "total": 4.31,
    })


class TestCheckout:
    """Test checkout and payment for cart."""

    def test_checkout_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        checkout = alice.knowledge_graph.get_entity("checkout_001")
        assert checkout is not None
        assert checkout.attributes["status"] == "completed"
        assert checkout.attributes["store_name"] == "Key Food"

    def test_payment_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        payment = alice.knowledge_graph.get_entity("payment_005")
        assert payment is not None
        assert payment.attributes["amount"] == 4.31
        assert payment.attributes["status"] == "completed"

    def test_payment_from_household_wallet(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        payment = alice.knowledge_graph.get_entity("payment_005")
        assert payment.attributes["payment_method"] == "wallet_household"
        assert payment.attributes["wallet_id"] == "wallet_household"

    def test_payment_via_chase(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        payment = alice.knowledge_graph.get_entity("payment_005")
        assert payment.attributes["bank_id"] == "bank_chase"

    def test_payment_processed_by_square(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        payment = alice.knowledge_graph.get_entity("payment_005")
        assert payment.attributes["processor_id"] == "processor_square"

    def test_household_wallet_balance_updated(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        wallet = alice.knowledge_graph.get_entity("wallet_household")
        # Original 8750.25 - 4.31 = 8745.94
        assert wallet.attributes["balance"] == 8745.94

    def test_individual_wallets_unchanged(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        alice_wallet = alice.knowledge_graph.get_entity("wallet_alice")
        bob_wallet = bob.knowledge_graph.get_entity("wallet_bob")

        assert alice_wallet.attributes["balance"] == 2450.75
        assert bob_wallet.attributes["balance"] == 3125.50

    def test_cart_completed(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart.attributes["status"] == "completed"

    def test_receipt_created(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        receipt = alice.knowledge_graph.get_entity("receipt_001")
        assert receipt is not None
        assert receipt.attributes["total"] == 4.31
        assert receipt.attributes["store_name"] == "Key Food"

    def test_receipt_items(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        receipt = alice.knowledge_graph.get_entity("receipt_001")
        items = receipt.attributes["items"]
        assert len(items) == 1
        assert items[0]["name"] == "Whole Milk - Store Brand"
        assert items[0]["qty"] == 1
        assert items[0]["price"] == 3.99

    def test_payment_has_authorization(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        payment = alice.knowledge_graph.get_entity("payment_005")
        assert "authorization_code" in payment.attributes
        assert "transaction_id" in payment.attributes

    def test_payment_to_store_relationship(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        payment_to_store = [r for r in pay_rels
                           if r.source_id == "payment_005" and r.target_id == "store_003"]
        assert len(payment_to_store) == 1

    def test_payment_from_wallet_relationship(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        pay_rels = alice.knowledge_graph.relationships_by_type(RelationshipType.PAYS_EXPENSE)
        payment_from_wallet = [r for r in pay_rels
                              if r.source_id == "payment_005" and r.target_id == "wallet_household"]
        assert len(payment_from_wallet) == 1

    def test_bob_has_same_receipt(self):
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        alice_receipt = alice.knowledge_graph.get_entity("receipt_001")
        bob_receipt = bob.knowledge_graph.get_entity("receipt_001")

        assert alice_receipt.attributes["total"] == bob_receipt.attributes["total"]

    def test_full_shopping_flow_complete(self):
        """Verify the complete shopping flow from goal to receipt."""
        alice = create_alice()
        bob = create_bob()
        setup_marriage(alice, bob)
        setup_grocery_stores(alice, bob)
        setup_milk_inventory(alice, bob)
        setup_wallets(alice, bob)
        setup_alice_joins_society(alice, bob)
        setup_add_to_cart(alice, bob)
        setup_checkout(alice, bob)

        # Goal declared
        goal = alice.knowledge_graph.get_entity("goal_milk")
        assert goal is not None
        assert goal.attributes["status"] == "pending"

        # Society recommended
        response = alice.knowledge_graph.get_entity("society_response")
        assert response is not None
        assert response.attributes["recommended_store"] == "store_003"

        # Cart created
        cart = alice.knowledge_graph.get_entity("cart_alice")
        assert cart is not None
        assert cart.attributes["status"] == "completed"

        # Payment completed
        payment = alice.knowledge_graph.get_entity("payment_005")
        assert payment is not None
        assert payment.attributes["status"] == "completed"

        # Receipt generated
        receipt = alice.knowledge_graph.get_entity("receipt_001")
        assert receipt is not None
        assert receipt.attributes["total"] == 4.31


class TestExtendedAffiliationManagerAliceBob:
    """Test Alice and Bob using ExtendedAffiliationManager."""

    def test_extended_manager_marriage(self):
        # Create Alice's extended manager
        alice_mgr = ExtendedAffiliationManager(person_id="alice")
        alice_mgr.add_entity("alice", EntityType.PERSON, "Alice Smith")
        alice_mgr.add_entity("bob", EntityType.PERSON, "Bob Smith")
        alice_mgr.add_entity("household_001", EntityType.ADDRESS, "Smith Household")
        alice_mgr.add_entity("family_001", EntityType.OTHER, "Created Family")

        # Add relationships
        alice_mgr.add_knowledge_relationship("alice", "bob", RelationshipType.MARRIED_TO)
        alice_mgr.add_knowledge_relationship("alice", "household_001", RelationshipType.LIVES_AT)
        alice_mgr.add_knowledge_relationship("alice", "family_001", RelationshipType.RELATED_TO)

        # Verify
        assert alice_mgr.entity_count == 4
        assert alice_mgr.knowledge_relationship_count == 3

        # Domain queries
        family = alice_mgr.get_family()
        assert len(family) == 1  # Bob is family
        assert family[0].name == "Bob Smith"

    def test_backward_compatibility(self):
        alice_mgr = ExtendedAffiliationManager(person_id="alice")
        alice_mgr.add_entity("bob", EntityType.PERSON, "Bob Smith")
        alice_mgr.add_knowledge_relationship("alice", "bob", RelationshipType.MARRIED_TO)

        # Should also create affiliations
        assert alice_mgr.count() >= 2  # entity + relationship affiliations

        # Can still use base AffiliationManager methods
        all_affs = alice_mgr.all()
        assert len(all_affs) >= 2
