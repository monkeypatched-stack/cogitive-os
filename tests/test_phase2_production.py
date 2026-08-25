"""
Phase 2 Tests: Security, Monitoring, Integration

Tests the new production-ready systems:
- Security middleware (rate limiting, input sanitization)
- Monitoring (metrics, health checks)
- Integration tests (HTTP calls to server)
"""
import pytest
import asyncio
import time
from src.monkey_brain.kernel.security import RateLimiter, sanitize_input
from src.monkey_brain.kernel.login_info import LoginInfo
from src.monkey_brain.api.monitoring_consolidated import (
    MonitoringService, LEMON_AVAILABLE
)
from src.monkey_brain.kernel.knowledge_graph import KnowledgeGraph, EntityType, RelationshipType
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.account import Account, SubscriptionPlan
from src.monkey_brain.kernel.login_info import LoginInfo


# ═══════════════════════════════════════════════════════════════════════════════
# Security Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRateLimiter:
    """Test rate limiting."""

    def test_rate_limiter_creation(self):
        limiter = RateLimiter(rate=100, burst=200)
        assert limiter is not None

    def test_rate_limiter_allows(self):
        limiter = RateLimiter(rate=100, burst=200)
        assert limiter.allow("client1") is True

    def test_rate_limiter_blocks(self):
        limiter = RateLimiter(rate=1, burst=5)
        # Make 5 requests
        for _ in range(5):
            limiter.allow("client1")
        # 6th should be blocked
        assert limiter.allow("client1") is False

    def test_rate_limiter_different_clients(self):
        limiter = RateLimiter(rate=1, burst=5)
        for _ in range(5):
            limiter.allow("client1")
        # Different client should be allowed
        assert limiter.allow("client2") is True


class TestInputSanitization:
    """Test input sanitization."""

    def test_sanitize_normal(self):
        result = sanitize_input("Hello World")
        assert result == "Hello World"

    def test_sanitize_xss(self):
        # Kernel's sanitize_input raises ValueError for blocked patterns
        with pytest.raises(ValueError):
            sanitize_input("<script>alert('xss')</script>")

    def test_sanitize_sql(self):
        # Kernel's sanitize_input raises ValueError for blocked patterns
        with pytest.raises(ValueError):
            sanitize_input("'; DROP TABLE users; --")


class TestPasswordValidation:
    """Test password validation via LoginInfo."""

    def test_valid_password(self):
        login = LoginInfo(email="test@example.com")
        result = login.set_password("SecurePass123!")
        assert result is True
        assert login.verify_password("SecurePass123!") is True

    def test_weak_password(self):
        login = LoginInfo(email="test@example.com")
        result = login.set_password("weak")
        assert result is False

    def test_password_verification(self):
        login = LoginInfo(email="test@example.com")
        login.set_password("SecurePass123!")
        assert login.verify_password("SecurePass123!") is True
        assert login.verify_password("WrongPassword") is False


# ═══════════════════════════════════════════════════════════════════════════════
# Monitoring Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMonitoringService:
    """Test monitoring service."""

    def test_creation(self):
        service = MonitoringService()
        assert service is not None

    def test_lemon_status(self):
        assert isinstance(LEMON_AVAILABLE, bool)

    def test_health_check(self):
        service = MonitoringService()
        result = asyncio.run(service.health_check())
        assert "status" in result

    def test_overall_health(self):
        service = MonitoringService()
        result = asyncio.run(service.overall_health())
        assert "status" in result

    def test_dashboard(self):
        service = MonitoringService()
        result = service.dashboard()
        assert "status" in result

    def test_summary(self):
        service = MonitoringService()
        result = service.summary()
        assert "status" in result


# ═══════════════════════════════════════════════════════════════════════════════
# Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntegrationSecurity:
    """Integration tests for security."""

    def test_actor_password_validation(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        actor = Actor(entity_id="alice")
        actor.login_info = LoginInfo(email="alice@example.com")

        # Test password setting
        result = actor.login_info.set_password("SecurePass123!")
        assert result is True

        # Test password verification
        assert actor.login_info.verify_password("SecurePass123!") is True
        assert actor.login_info.verify_password("WrongPassword") is False

    def test_actor_profile_email(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        actor = Actor(entity_id="alice")
        actor.profile = Profile(
            name="Alice",
            username="alice",
            email="alice@example.com",
        )

        assert actor.profile.email == "alice@example.com"


class TestIntegrationMonitoring:
    """Integration tests for monitoring."""

    def test_actor_monitoring(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        service = MonitoringService()

        # Simulate actor operations
        actor = Actor(entity_id="alice")
        service.increment("actors_created")
        service.set_gauge("active_actors", 1)

        # Verify service was created
        assert service is not None

    def test_actor_health(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        service = MonitoringService()
        result = asyncio.run(service.health_check())
        assert "status" in result


class TestIntegrationFullFlow:
    """Full integration test."""

    def test_complete_flow(self):
        from src.monkey_brain.kernel.ontology.entity import Actor

        # Create actor with all systems
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

        # Security validation
        assert actor.profile.email == "alice@example.com"
        assert actor.login_info.verify_password("SecurePass123!") is True

        # Monitoring
        service = MonitoringService()
        service.increment("actors_created")
        service.set_gauge("active_actors", 1)

        # Verify everything
        assert actor.profile.name == "Alice Smith"
        assert actor.account.username == "alice"
        assert actor.login_info.verify_password("SecurePass123!")
        assert actor.knowledge_graph.entity_count == 2
        assert actor.knowledge_graph.relationship_count == 1
