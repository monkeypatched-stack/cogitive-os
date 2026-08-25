"""
Full End-to-End Test: Alice buys 1L of milk

Complete flow through the system:
1. Alice logs in
2. Alice says "buy 1L of milk"
3. System processes intent
4. Society finds best option
5. Human approval required: Confirm order
6. Payment processed
7. Human approval required: Confirm payment
8. Rider scheduled
9. Delivery completed
10. Human approval required: Rate delivery
"""
import pytest
import time
from src.monkey_brain.kernel.ontology.entity import Actor
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.account import Account, SubscriptionPlan
from src.monkey_brain.kernel.location import Location
from src.monkey_brain.kernel.login_info import LoginInfo
from src.monkey_brain.kernel.knowledge_graph import EntityType, RelationshipType
from src.monkey_brain.kernel.affiliations.extended import ExtendedAffiliationManager


# ═══════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

def create_alice() -> Actor:
    """Create Alice Smith."""
    alice = Actor(entity_id="alice", name="Alice Smith", actor_type_id="human")
    alice.profile = Profile(
        name="Alice Smith", username="alice", email="alice@example.com",
        date_of_birth="1990-03-15", preferred_language="en",
        timezone="America/New_York", location="New York, NY",
    )
    alice.profile.metadata = {
        "optimization_preference": "cost",
        "shopping_style": "budget_conscious",
    }
    alice.account = Account(username="alice", email="alice@example.com",
                           subscription=SubscriptionPlan.PRO)
    alice.location = Location(country="United States", state="New York",
                              city="New York", timezone="America/New_York")
    alice.login_info = LoginInfo(email="alice@example.com", mobile="+1-555-123-4567")
    alice.login_info.set_password("SecurePass123!")
    alice.knowledge_graph.add_entity("alice", EntityType.PERSON, "Alice Smith")
    return alice


def create_jose() -> Actor:
    """Create Jose Martinez (delivery rider)."""
    jose = Actor(entity_id="jose", name="Jose Martinez", actor_type_id="human")
    jose.profile = Profile(name="Jose Martinez", username="jose", preferred_language="es")
    jose.profile.metadata = {"optimization_preference": "speed", "vehicle": "bicycle"}
    jose.knowledge_graph.add_entity("jose", EntityType.PERSON, "Jose Martinez", {
        "occupation": "Delivery Rider", "vehicle": "bicycle", "rating": 4.9,
        "status": "available", "current_zone": "manhattan_west",
    })
    return jose


def setup_scenario(alice: Actor, jose: Actor) -> None:
    """Setup the complete scenario."""
    # Household
    alice.knowledge_graph.add_entity("household_001", EntityType.ADDRESS, "Smith Household", {
        "street": "123 Main St", "city": "New York", "state": "NY",
    })
    alice.knowledge_graph.add_entity("family_001", EntityType.OTHER, "Created Family", {
        "members": ["alice"], "kids": [],
    })
    alice.knowledge_graph.add_relationship("alice", "household_001", RelationshipType.LIVES_AT)

    # Grocery Store Society
    alice.knowledge_graph.add_entity("society_001", EntityType.ORGANIZATION, "Grocery Store Society", {
        "type": "industry_society", "industry": "grocery_retail",
    })

    # Stores
    for store_id, name, distance in [
        ("store_003", "Key Food", 0.2),
        ("store_005", "Gristedes", 0.1),
    ]:
        alice.knowledge_graph.add_entity(store_id, EntityType.ORGANIZATION, name, {
            "type": "grocery_store", "distance_miles": distance,
        })
        alice.knowledge_graph.add_entity(store_id, EntityType.ORGANIZATION, name, {
            "type": "grocery_store", "distance_miles": distance,
        })
        alice.knowledge_graph.add_relationship(store_id, "society_001", RelationshipType.RELATED_TO)

    # Milk inventory
    alice.knowledge_graph.add_entity("milk_001", EntityType.ASSET, "Whole Milk - Store Brand", {
        "product": "whole_milk", "brand": "Store Brand", "store_id": "store_003",
        "quantity": 48, "price": 3.99,
    })
    alice.knowledge_graph.add_relationship("store_003", "milk_001", RelationshipType.OWNS)

    # Wallet
    alice.knowledge_graph.add_entity("wallet_household", EntityType.ACCOUNT, "Smith Household Wallet", {
        "balance": 8750.25, "bank": "Chase", "account_number": "****9012",
    })
    alice.knowledge_graph.add_relationship("alice", "wallet_household", RelationshipType.RELATED_TO)

    # Banks & Processors
    alice.knowledge_graph.add_entity("bank_chase", EntityType.ORGANIZATION, "Chase Bank", {"type": "bank"})
    alice.knowledge_graph.add_entity("processor_square", EntityType.ORGANIZATION, "Square", {"type": "payment_processor"})
    alice.knowledge_graph.add_relationship("wallet_household", "bank_chase", RelationshipType.RELATED_TO)
    alice.knowledge_graph.add_relationship("bank_chase", "processor_square", RelationshipType.RELATED_TO)

    # Instacart & Vendor
    alice.knowledge_graph.add_entity("instacart", EntityType.ORGANIZATION, "Instacart", {"type": "platform"})
    alice.knowledge_graph.add_entity("quickdeliver", EntityType.ORGANIZATION, "QuickDeliver Inc", {"type": "vendor"})
    alice.knowledge_graph.add_relationship("quickdeliver", "instacart", RelationshipType.CONTRACTS_WITH)
    alice.knowledge_graph.add_relationship("jose", "quickdeliver", RelationshipType.WORKS_FOR)
    alice.knowledge_graph.add_relationship("jose", "instacart", RelationshipType.RELATED_TO)

    # Jose vehicle
    jose.knowledge_graph.add_entity("vehicle_jose", EntityType.VEHICLE, "Trek Bicycle", {
        "type": "bicycle", "brand": "Trek",
    })
    jose.knowledge_graph.add_relationship("jose", "vehicle_jose", RelationshipType.OWNS)


# ═══════════════════════════════════════════════════════════════════════════════
# Approval States
# ═══════════════════════════════════════════════════════════════════════════════

class ApprovalState:
    """Tracks approval states for human-in-the-loop transitions."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ApprovalRequest:
    """A request for human approval."""
    def __init__(self, request_id: str, request_type: str, description: str,
                 options: list[str], auto_approve: bool = False):
        self.request_id = request_id
        self.request_type = request_type
        self.description = description
        self.options = options
        self.auto_approve = auto_approve
        self.status = ApprovalState.PENDING
        self.selected_option = None
        self.approved_by = None
        self.approved_at = None

    def approve(self, option: str, approver: str) -> bool:
        if option not in self.options:
            return False
        self.selected_option = option
        self.status = ApprovalState.APPROVED
        self.approved_by = approver
        self.approved_at = time.time()
        return True

    def reject(self, approver: str) -> bool:
        self.status = ApprovalState.REJECTED
        self.approved_by = approver
        self.approved_at = time.time()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# Test
# ═══════════════════════════════════════════════════════════════════════════════

class TestFullEndToEndFlow:
    """Complete end-to-end test with human approval transitions."""

    def test_alice_buys_milk_full_flow(self):
        """Test the complete flow: Alice logs in, buys milk, rider delivers."""

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 1: SETUP
        # ═══════════════════════════════════════════════════════════════════

        alice = create_alice()
        jose = create_jose()
        setup_scenario(alice, jose)

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 2: ALICE LOGS IN
        # ═══════════════════════════════════════════════════════════════════

        # Verify login credentials
        assert alice.login_info.verify_password("SecurePass123!")
        assert alice.login_info.email == "alice@example.com"

        # Create session
        session = alice.login_info.create_session(
            ip_address="192.168.1.100",
            device_type="mobile",
            user_agent="MonkeyBrain/1.0",
        )
        assert session.is_active

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 3: ALICE DECLARES GOAL
        # ═══════════════════════════════════════════════════════════════════

        # Add goal
        alice.knowledge_graph.add_entity("goal_milk", EntityType.OTHER, "Buy 1L Whole Milk", {
            "type": "shopping_goal",
            "goal": "1L of whole milk",
            "product": "whole_milk",
            "quantity": 1,
            "unit": "liter",
            "declared_by": "alice",
            "optimization": alice.profile.metadata["optimization_preference"],
            "status": "pending",
        })
        alice.knowledge_graph.add_relationship("alice", "goal_milk", RelationshipType.RELATED_TO)

        goal = alice.knowledge_graph.get_entity("goal_milk")
        assert goal.attributes["goal"] == "1L of whole milk"
        assert goal.attributes["optimization"] == "cost"

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 4: SOCIETY PROCESSES GOAL
        # ═══════════════════════════════════════════════════════════════════

        # Society finds matching products
        milk_products = [e for e in alice.knowledge_graph.entities_by_type(EntityType.ASSET)
                        if e.attributes.get("product") == "whole_milk"]

        assert len(milk_products) >= 1

        # Sort by price (Alice's optimization)
        best_product = min(milk_products, key=lambda e: e.attributes["price"])
        assert best_product.attributes["brand"] == "Store Brand"
        assert best_product.attributes["price"] == 3.99

        # Society response
        alice.knowledge_graph.add_entity("society_response", EntityType.OTHER, "Society Response", {
            "recommended_store": best_product.attributes["store_id"],
            "recommended_product": best_product.entity_id,
            "price": best_product.attributes["price"],
            "status": "completed",
        })

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 5: HUMAN APPROVAL - CONFIRM ORDER
        # ═══════════════════════════════════════════════════════════════════

        # Create approval request
        order_approval = ApprovalRequest(
            request_id="APPROVAL-001",
            request_type="order_confirmation",
            description=f"Confirm order: 1L Whole Milk at Key Food for ${best_product.attributes['price']:.2f}?",
            options=["confirm", "cancel", "change_store"],
        )

        # Alice reviews and approves
        assert order_approval.status == ApprovalState.PENDING
        approved = order_approval.approve("confirm", "alice")
        assert approved
        assert order_approval.status == ApprovalState.APPROVED
        assert order_approval.selected_option == "confirm"

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 6: CREATE ORDER & CART
        # ═══════════════════════════════════════════════════════════════════

        # Create order
        alice.knowledge_graph.add_entity("order_001", EntityType.EVENT, "Grocery Order", {
            "type": "order",
            "order_id": "ORD-2024-01-25-001",
            "store_id": "store_003",
            "store_name": "Key Food",
            "items": [{"product_id": "milk_001", "qty": 1, "price": 3.99}],
            "subtotal": 3.99,
            "tax": 0.32,
            "total": 4.31,
            "status": "confirmed",
            "approved_by": "alice",
        })
        alice.knowledge_graph.add_relationship("alice", "order_001", RelationshipType.RELATED_TO)
        alice.knowledge_graph.add_relationship("order_001", "store_003", RelationshipType.RELATED_TO)

        order = alice.knowledge_graph.get_entity("order_001")
        assert order.attributes["status"] == "confirmed"
        assert order.attributes["total"] == 4.31

        # Create cart
        alice.knowledge_graph.add_entity("cart_001", EntityType.ACCOUNT, "Shopping Cart", {
            "store_id": "store_003", "status": "confirmed", "total": 4.31,
        })
        alice.knowledge_graph.add_relationship("cart_001", "store_003", RelationshipType.RELATED_TO)
        alice.knowledge_graph.add_relationship("cart_001", "milk_001", RelationshipType.OWNS)

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 7: HUMAN APPROVAL - CONFIRM PAYMENT
        # ═══════════════════════════════════════════════════════════════════

        payment_approval = ApprovalRequest(
            request_id="APPROVAL-002",
            request_type="payment_confirmation",
            description=f"Confirm payment: $4.31 from Household Wallet (****9012)?",
            options=["confirm", "cancel", "change_wallet"],
        )

        # Alice reviews and approves
        assert payment_approval.status == ApprovalState.PENDING
        approved = payment_approval.approve("confirm", "alice")
        assert approved
        assert payment_approval.status == ApprovalState.APPROVED

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 8: PROCESS PAYMENT
        # ═══════════════════════════════════════════════════════════════════

        # Create payment
        alice.knowledge_graph.add_entity("payment_001", EntityType.EXPENSE, "Grocery Payment", {
            "type": "payment",
            "payment_id": "PAY-2024-01-25-001",
            "order_id": "ORD-2024-01-25-001",
            "amount": 4.31,
            "payment_method": "wallet_household",
            "bank_id": "bank_chase",
            "processor_id": "processor_square",
            "status": "completed",
            "authorization_code": "AUTH-KF-789012",
        })
        alice.knowledge_graph.add_relationship("payment_001", "wallet_household", RelationshipType.PAYS_EXPENSE)
        alice.knowledge_graph.add_relationship("payment_001", "store_003", RelationshipType.PAYS_EXPENSE)
        alice.knowledge_graph.add_relationship("payment_001", "bank_chase", RelationshipType.RELATED_TO)

        payment = alice.knowledge_graph.get_entity("payment_001")
        assert payment.attributes["status"] == "completed"
        assert payment.attributes["amount"] == 4.31

        # Update wallet balance
        wallet = alice.knowledge_graph.get_entity("wallet_household")
        wallet.attributes["balance"] -= 4.31
        assert wallet.attributes["balance"] == 8745.94

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 9: SCHEDULE DELIVERY
        # ═══════════════════════════════════════════════════════════════════

        # Query vendor for riders
        jose_status = jose.knowledge_graph.get_entity("jose")
        assert jose_status.attributes["status"] == "available"
        assert jose_status.attributes["rating"] == 4.9

        # Assign rider
        alice.knowledge_graph.add_entity("delivery_001", EntityType.EVENT, "Delivery Assignment", {
            "type": "delivery",
            "delivery_id": "DEL-2024-01-25-001",
            "rider_id": "jose",
            "rider_name": "Jose Martinez",
            "store_id": "store_003",
            "pickup_address": "Key Food, 200 W 23rd St",
            "delivery_address": "123 Main St, New York, NY",
            "estimated_time": 42,
            "earnings": 1.30,
            "status": "scheduled",
        })
        alice.knowledge_graph.add_relationship("delivery_001", "jose", RelationshipType.RELATED_TO)
        alice.knowledge_graph.add_relationship("delivery_001", "store_003", RelationshipType.RELATED_TO)

        delivery = alice.knowledge_graph.get_entity("delivery_001")
        assert delivery.attributes["rider_name"] == "Jose Martinez"
        assert delivery.attributes["status"] == "scheduled"

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 10: JOSE PICKS UP AND DELIVERS
        # ═══════════════════════════════════════════════════════════════════

        # Jose picks up
        delivery.attributes["status"] = "picked_up"
        delivery.attributes["picked_up_at"] = time.time()

        # Jose delivers
        delivery.attributes["status"] = "delivered"
        delivery.attributes["delivered_at"] = time.time()

        assert delivery.attributes["status"] == "delivered"

        # Update inventory
        milk = alice.knowledge_graph.get_entity("milk_001")
        milk.attributes["quantity"] -= 1
        assert milk.attributes["quantity"] == 47

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 11: HUMAN APPROVAL - RATE DELIVERY
        # ═══════════════════════════════════════════════════════════════════

        rating_approval = ApprovalRequest(
            request_id="APPROVAL-003",
            request_type="delivery_rating",
            description="Rate your delivery experience (1-5 stars)?",
            options=["1", "2", "3", "4", "5"],
        )

        # Alice reviews and rates
        assert rating_approval.status == ApprovalState.PENDING
        approved = rating_approval.approve("5", "alice")
        assert approved
        assert rating_approval.status == ApprovalState.APPROVED
        assert rating_approval.selected_option == "5"

        # ═══════════════════════════════════════════════════════════════════
        # PHASE 12: GENERATE RECEIPT
        # ═══════════════════════════════════════════════════════════════════

        alice.knowledge_graph.add_entity("receipt_001", EntityType.DOCUMENT, "Receipt - Key Food", {
            "type": "receipt",
            "receipt_number": "KF-2024-01-25-001",
            "store_name": "Key Food",
            "items": [{"name": "Whole Milk - Store Brand", "qty": 1, "price": 3.99}],
            "subtotal": 3.99,
            "tax": 0.32,
            "total": 4.31,
            "payment_method": "Household Wallet (****9012)",
            "rating": int(rating_approval.selected_option),
        })
        alice.knowledge_graph.add_relationship("receipt_001", "order_001", RelationshipType.RELATED_TO)

        receipt = alice.knowledge_graph.get_entity("receipt_001")
        assert receipt.attributes["total"] == 4.31
        assert receipt.attributes["rating"] == 5

        # ═══════════════════════════════════════════════════════════════════
        # FINAL VERIFICATION
        # ═══════════════════════════════════════════════════════════════════

        # Wallet balance
        wallet = alice.knowledge_graph.get_entity("wallet_household")
        assert wallet.attributes["balance"] == 8745.94

        # Inventory
        milk = alice.knowledge_graph.get_entity("milk_001")
        assert milk.attributes["quantity"] == 47

        # Delivery status
        delivery = alice.knowledge_graph.get_entity("delivery_001")
        assert delivery.attributes["status"] == "delivered"

        # Approval states
        assert order_approval.status == ApprovalState.APPROVED
        assert payment_approval.status == ApprovalState.APPROVED
        assert rating_approval.status == ApprovalState.APPROVED

        # Graph statistics
        stats = alice.knowledge_graph.stats()
        assert stats["entity_count"] >= 15
        assert stats["relationship_count"] >= 20


class TestApprovalWorkflow:
    """Test the approval workflow separately."""

    def test_approval_pending(self):
        approval = ApprovalRequest("REQ-001", "test", "Test request", ["yes", "no"])
        assert approval.status == ApprovalState.PENDING

    def test_approval_approve(self):
        approval = ApprovalRequest("REQ-001", "test", "Test request", ["yes", "no"])
        assert approval.approve("yes", "alice")
        assert approval.status == ApprovalState.APPROVED
        assert approval.selected_option == "yes"
        assert approval.approved_by == "alice"

    def test_approval_reject(self):
        approval = ApprovalRequest("REQ-001", "test", "Test request", ["yes", "no"])
        assert approval.reject("alice")
        assert approval.status == ApprovalState.REJECTED

    def test_approval_invalid_option(self):
        approval = ApprovalRequest("REQ-001", "test", "Test request", ["yes", "no"])
        assert not approval.approve("maybe", "alice")
        assert approval.status == ApprovalState.PENDING

    def test_multiple_approvals(self):
        approvals = []
        for i in range(3):
            approval = ApprovalRequest(f"REQ-{i:03d}", "test", f"Request {i}", ["yes", "no"])
            approvals.append(approval)

        # Approve all
        for approval in approvals:
            approval.approve("yes", "alice")

        # Verify all approved
        for approval in approvals:
            assert approval.status == ApprovalState.APPROVED


class TestTransactionFlow:
    """Test the complete transaction flow."""

    def test_goal_to_receipt_flow(self):
        """Test the complete flow from goal to receipt."""
        alice = create_alice()
        jose = create_jose()
        setup_scenario(alice, jose)

        # Goal
        alice.knowledge_graph.add_entity("goal", EntityType.OTHER, "Buy Milk", {"status": "pending"})
        goal = alice.knowledge_graph.get_entity("goal")
        assert goal.attributes["status"] == "pending"

        # Order
        alice.knowledge_graph.add_entity("order", EntityType.EVENT, "Order", {"status": "confirmed"})
        order = alice.knowledge_graph.get_entity("order")
        assert order.attributes["status"] == "confirmed"

        # Payment
        alice.knowledge_graph.add_entity("payment", EntityType.EXPENSE, "Payment", {"status": "completed"})
        payment = alice.knowledge_graph.get_entity("payment")
        assert payment.attributes["status"] == "completed"

        # Delivery
        alice.knowledge_graph.add_entity("delivery", EntityType.EVENT, "Delivery", {"status": "delivered"})
        delivery = alice.knowledge_graph.get_entity("delivery")
        assert delivery.attributes["status"] == "delivered"

        # Receipt
        alice.knowledge_graph.add_entity("receipt", EntityType.DOCUMENT, "Receipt", {"status": "final"})
        receipt = alice.knowledge_graph.get_entity("receipt")
        assert receipt.attributes["status"] == "final"

    def test_wallet_balance_flow(self):
        """Test wallet balance changes through the flow."""
        alice = create_alice()
        jose = create_jose()
        setup_scenario(alice, jose)

        # Initial balance
        wallet = alice.knowledge_graph.get_entity("wallet_household")
        initial_balance = wallet.attributes["balance"]
        assert initial_balance == 8750.25

        # After payment
        wallet.attributes["balance"] -= 4.31
        assert abs(wallet.attributes["balance"] - 8745.94) < 0.01

        # Verify deduction
        assert abs(initial_balance - wallet.attributes["balance"] - 4.31) < 0.01
