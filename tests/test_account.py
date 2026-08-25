"""
Actor Account Test Suite

Tests the Account system including:
- Account creation and defaults
- Login history tracking
- Preferences management
- Accessibility settings
- Behavioral metadata
- Actor integration
"""
import pytest
import time
from src.monkey_brain.kernel.account import (
    Account, AccountStatus, SubscriptionPlan, DeviceType,
    LoginEvent, Preferences, NotificationSettings,
    AccessibilitySettings, Behavior, Theme, CommunicationStyle,
)
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Account Creation Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountCreation:
    """Account creation and defaults"""

    def test_empty_account(self):
        account = Account()
        assert account.username == ""
        assert account.status == AccountStatus.ACTIVE
        assert account.subscription == SubscriptionPlan.FREE

    def test_basic_account(self):
        account = Account(
            username="alice",
            email="alice@example.com",
        )
        assert account.username == "alice"
        assert account.email == "alice@example.com"

    def test_full_account(self):
        account = Account(
            username="bob",
            email="bob@example.com",
            status=AccountStatus.ACTIVE,
            subscription=SubscriptionPlan.PRO,
        )
        assert account.username == "bob"
        assert account.subscription == SubscriptionPlan.PRO

    def test_account_timestamps(self):
        account = Account(username="alice")
        assert account.created_at > 0
        assert account.updated_at > 0


# ═══════════════════════════════════════════════════════════════════════════════
# Account Status Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountStatus:
    """Account status operations"""

    def test_active_status(self):
        account = Account(status=AccountStatus.ACTIVE)
        assert account.is_active is True

    def test_inactive_status(self):
        account = Account(status=AccountStatus.INACTIVE)
        assert account.is_active is False

    def test_suspended_status(self):
        account = Account(status=AccountStatus.SUSPENDED)
        assert account.is_active is False

    def test_update_status(self):
        account = Account(status=AccountStatus.ACTIVE)
        account.update(status=AccountStatus.SUSPENDED)
        assert account.status == AccountStatus.SUSPENDED


# ═══════════════════════════════════════════════════════════════════════════════
# Subscription Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubscription:
    """Subscription plan operations"""

    def test_free_plan(self):
        account = Account(subscription=SubscriptionPlan.FREE)
        assert account.is_premium is False

    def test_pro_plan(self):
        account = Account(subscription=SubscriptionPlan.PRO)
        assert account.is_premium is True

    def test_enterprise_plan(self):
        account = Account(subscription=SubscriptionPlan.ENTERPRISE)
        assert account.is_premium is True

    def test_update_subscription(self):
        account = Account(subscription=SubscriptionPlan.FREE)
        account.update(subscription=SubscriptionPlan.PRO)
        assert account.subscription == SubscriptionPlan.PRO


# ═══════════════════════════════════════════════════════════════════════════════
# Login History Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLoginHistory:
    """Login history tracking"""

    def test_record_login(self):
        account = Account(username="alice")
        event = account.record_login(
            device_type=DeviceType.LAPTOP,
            ip_address="192.168.1.1",
            location="New York",
        )
        assert len(account.login_history) == 1
        assert event.device_type == DeviceType.LAPTOP

    def test_multiple_logins(self):
        account = Account(username="alice")
        account.record_login(device_type=DeviceType.LAPTOP)
        account.record_login(device_type=DeviceType.MOBILE)
        account.record_login(device_type=DeviceType.TABLET)
        assert len(account.login_history) == 3

    def test_login_count(self):
        account = Account(username="alice")
        account.record_login(success=True)
        account.record_login(success=True)
        account.record_login(success=False)
        assert account.login_count == 2
        assert account.failed_login_count == 1

    def test_last_login(self):
        account = Account(username="alice")
        account.record_login(success=False)
        account.record_login(device_type=DeviceType.MOBILE, success=True)
        last = account.last_login
        assert last is not None
        assert last.device_type == DeviceType.MOBILE

    def test_devices_used(self):
        account = Account(username="alice")
        account.record_login(device_type=DeviceType.LAPTOP)
        account.record_login(device_type=DeviceType.MOBILE)
        account.record_login(device_type=DeviceType.LAPTOP)
        assert DeviceType.LAPTOP in account.devices_used
        assert DeviceType.MOBILE in account.devices_used

    def test_session_count(self):
        account = Account(username="alice")
        account.record_login()
        account.record_login()
        assert account.behavior.session_count == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Preferences Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPreferences:
    """User preferences"""

    def test_default_preferences(self):
        prefs = Preferences()
        assert prefs.theme == Theme.SYSTEM
        assert prefs.language == "en"
        assert prefs.timezone == "UTC"

    def test_custom_preferences(self):
        prefs = Preferences(
            theme=Theme.DARK,
            language="es",
            timezone="America/Mexico_City",
            communication_style=CommunicationStyle.CASUAL,
        )
        assert prefs.theme == Theme.DARK
        assert prefs.language == "es"
        assert prefs.communication_style == CommunicationStyle.CASUAL

    def test_theme_options(self):
        assert Theme.LIGHT.value == "light"
        assert Theme.DARK.value == "dark"
        assert Theme.SYSTEM.value == "system"
        assert Theme.HIGH_CONTRAST.value == "high_contrast"

    def test_communication_styles(self):
        assert CommunicationStyle.FORMAL.value == "formal"
        assert CommunicationStyle.INFORMAL.value == "informal"
        assert CommunicationStyle.TECHNICAL.value == "technical"
        assert CommunicationStyle.CASUAL.value == "casual"

    def test_saved_interests(self):
        prefs = Preferences(saved_interests=["AI", "music", "cooking"])
        assert len(prefs.saved_interests) == 3
        assert "AI" in prefs.saved_interests

    def test_update_preferences(self):
        prefs = Preferences(theme=Theme.LIGHT)
        prefs.theme = Theme.DARK
        assert prefs.theme == Theme.DARK


# ═══════════════════════════════════════════════════════════════════════════════
# Notification Settings Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestNotificationSettings:
    """Notification preferences"""

    def test_default_notifications(self):
        settings = NotificationSettings()
        assert settings.email_enabled is True
        assert settings.push_enabled is True
        assert settings.sms_enabled is False

    def test_custom_notifications(self):
        settings = NotificationSettings(
            email_enabled=False,
            push_enabled=True,
            frequency="daily",
        )
        assert settings.email_enabled is False
        assert settings.frequency == "daily"

    def test_quiet_hours(self):
        settings = NotificationSettings(
            quiet_hours_start="22:00",
            quiet_hours_end="08:00",
        )
        assert settings.quiet_hours_start == "22:00"
        assert settings.quiet_hours_end == "08:00"

    def test_notification_categories(self):
        settings = NotificationSettings(
            categories={"marketing": False, "security": True, "updates": True}
        )
        assert settings.categories["marketing"] is False
        assert settings.categories["security"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Accessibility Settings Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccessibilitySettings:
    """Accessibility preferences"""

    def test_default_accessibility(self):
        settings = AccessibilitySettings()
        assert settings.screen_reader is False
        assert settings.high_contrast is False
        assert settings.keyboard_navigation is True

    def test_screen_reader(self):
        settings = AccessibilitySettings(screen_reader=True)
        assert settings.screen_reader is True

    def test_high_contrast(self):
        settings = AccessibilitySettings(high_contrast=True, large_text=True)
        assert settings.high_contrast is True
        assert settings.large_text is True

    def test_reduced_motion(self):
        settings = AccessibilitySettings(reduced_motion=True)
        assert settings.reduced_motion is True

    def test_color_blind_modes(self):
        for mode in ["protanopia", "deuteranopia", "tritanopia"]:
            settings = AccessibilitySettings(color_blind_mode=mode)
            assert settings.color_blind_mode == mode

    def test_font_sizes(self):
        for size in ["small", "medium", "large", "xlarge"]:
            settings = AccessibilitySettings(font_size=size)
            assert settings.font_size == size


# ═══════════════════════════════════════════════════════════════════════════════
# Behavior Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBehavior:
    """Behavioral metadata"""

    def test_default_behavior(self):
        behavior = Behavior()
        assert behavior.session_count == 0
        assert behavior.engagement_score == 0.5

    def test_session_tracking(self):
        behavior = Behavior()
        behavior.session_count = 10
        behavior.total_time_spent = 3600.0
        behavior.average_session_length = 360.0
        assert behavior.session_count == 10
        assert behavior.total_time_spent == 3600.0

    def test_preferred_features(self):
        behavior = Behavior(preferred_features=["chat", "analytics", "reports"])
        assert len(behavior.preferred_features) == 3

    def test_interaction_patterns(self):
        behavior = Behavior(interaction_patterns={"click": 100, "scroll": 50})
        assert behavior.interaction_patterns["click"] == 100

    def test_learning_styles(self):
        for style in ["visual", "auditory", "kinesthetic", "reading"]:
            behavior = Behavior(learning_style=style)
            assert behavior.learning_style == style

    def test_peak_hours(self):
        behavior = Behavior(peak_activity_hours=[9, 10, 14, 15])
        assert 9 in behavior.peak_activity_hours


# ═══════════════════════════════════════════════════════════════════════════════
# Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountSerialization:
    """Account serialization roundtrip"""

    def test_to_dict(self):
        account = Account(
            username="alice",
            email="alice@example.com",
            subscription=SubscriptionPlan.PRO,
        )
        data = account.to_dict()
        assert data["username"] == "alice"
        assert data["subscription"] == "pro"

    def test_from_dict(self):
        data = {
            "username": "bob",
            "email": "bob@example.com",
            "status": "active",
            "subscription": "enterprise",
        }
        account = Account.from_dict(data)
        assert account.username == "bob"
        assert account.subscription == SubscriptionPlan.ENTERPRISE

    def test_roundtrip(self):
        account = Account(
            username="charlie",
            email="charlie@example.com",
            subscription=SubscriptionPlan.PRO,
            preferences=Preferences(theme=Theme.DARK, language="fr"),
        )
        data = account.to_dict()
        account2 = Account.from_dict(data)
        assert account2.username == "charlie"
        assert account2.preferences.theme == Theme.DARK
        assert account2.preferences.language == "fr"

    def test_login_history_serialization(self):
        account = Account(username="alice")
        account.record_login(device_type=DeviceType.LAPTOP, success=True)
        account.record_login(device_type=DeviceType.MOBILE, success=False)

        data = account.to_dict()
        assert len(data["login_history"]) == 2

        account2 = Account.from_dict(data)
        assert len(account2.login_history) == 2

    def test_preferences_serialization(self):
        prefs = Preferences(
            theme=Theme.DARK,
            notification_settings=NotificationSettings(email_enabled=False),
            accessibility=AccessibilitySettings(high_contrast=True),
        )
        data = prefs.to_dict()
        prefs2 = Preferences.from_dict(data)
        assert prefs2.theme == Theme.DARK
        assert prefs2.notification_settings.email_enabled is False
        assert prefs2.accessibility.high_contrast is True


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_account(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'account')
        assert isinstance(a.account, Account)

    def test_actor_default_account(self):
        a = Actor(entity_id="alice")
        assert a.account.username == "alice"
        assert a.account.status == AccountStatus.ACTIVE

    def test_actor_account_update(self):
        a = Actor(entity_id="alice")
        a.account.update(email="alice@example.com", subscription=SubscriptionPlan.PRO)
        assert a.account.email == "alice@example.com"
        assert a.account.subscription == SubscriptionPlan.PRO

    def test_actor_account_setter(self):
        a = Actor(entity_id="alice")
        new_account = Account(username="bob", email="bob@example.com")
        a.account = new_account
        assert a.account.username == "bob"

    def test_actor_login_recording(self):
        a = Actor(entity_id="alice")
        a.account.record_login(device_type=DeviceType.LAPTOP)
        assert a.account.login_count == 1

    def test_actor_account_independence(self):
        a1 = Actor(entity_id="alice")
        a2 = Actor(entity_id="bob")
        a1.account.update(email="alice@example.com")
        assert a2.account.email == ""


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestAccountStress:
    """Stress tests for accounts"""

    def test_many_accounts(self):
        accounts = []
        for i in range(100):
            a = Account(username=f"user_{i}", email=f"user_{i}@example.com")
            accounts.append(a)
        assert len(accounts) == 100

    def test_large_login_history(self):
        account = Account(username="alice")
        for i in range(1000):
            account.record_login(device_type=DeviceType.LAPTOP, success=i % 10 != 0)
        assert account.login_count == 900
        assert account.failed_login_count == 100

    def test_concurrent_updates(self):
        account = Account(username="test")
        for i in range(100):
            account.update(**{f"field_{i}": f"value_{i}"})
        assert account.updated_at > 0
