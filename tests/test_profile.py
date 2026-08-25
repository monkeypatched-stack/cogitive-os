"""
Actor Profile Test Suite

Tests the Profile system including:
- Profile creation and defaults
- Profile serialization
- Actor integration
- Profile queries
"""
import pytest
import time
from src.monkey_brain.kernel.profile import Profile
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Profile Creation Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileCreation:
    """Profile creation and defaults"""

    def test_empty_profile(self):
        profile = Profile()
        assert profile.name == ""
        assert profile.username == ""
        assert profile.preferred_language == "en"
        assert profile.timezone == "UTC"

    def test_basic_profile(self):
        profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
        )
        assert profile.name == "Alice Smith"
        assert profile.username == "alice"
        assert profile.email == "alice@example.com"

    def test_full_profile(self):
        profile = Profile(
            name="Bob Johnson",
            username="bob",
            email="bob@example.com",
            profile_photo="https://example.com/photo.jpg",
            date_of_birth="1985-06-20",
            preferred_language="es",
            timezone="America/Mexico_City",
            bio="Software engineer and coffee enthusiast",
            location="Mexico City, Mexico",
            website="https://bob.dev",
            phone="+52-55-1234-5678",
            organization="TechCorp",
            job_title="Senior Engineer",
        )
        assert profile.name == "Bob Johnson"
        assert profile.preferred_language == "es"
        assert profile.timezone == "America/Mexico_City"
        assert profile.organization == "TechCorp"

    def test_profile_with_metadata(self):
        profile = Profile(
            name="Charlie",
            username="charlie",
            metadata={"theme": "dark", "notifications": True},
        )
        assert profile.metadata["theme"] == "dark"
        assert profile.metadata["notifications"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Profile Update Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileUpdate:
    """Profile update operations"""

    def test_update_name(self):
        profile = Profile(name="Alice", username="alice")
        profile.update(name="Alice Smith")
        assert profile.name == "Alice Smith"

    def test_update_multiple_fields(self):
        profile = Profile(name="Alice", username="alice")
        profile.update(name="Alice Smith", email="alice@example.com")
        assert profile.name == "Alice Smith"
        assert profile.email == "alice@example.com"

    def test_update_timestamp(self):
        profile = Profile(name="Alice", username="alice")
        old_updated = profile.updated_at
        time.sleep(0.01)
        profile.update(bio="New bio")
        assert profile.updated_at > old_updated

    def test_update_nonexistent_field(self):
        profile = Profile(name="Alice", username="alice")
        profile.update(nonexistent_field="value")
        assert not hasattr(profile, "nonexistent_field")


# ═══════════════════════════════════════════════════════════════════════════════
# Profile Properties Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileProperties:
    """Profile computed properties"""

    def test_display_name_with_name(self):
        profile = Profile(name="Alice Smith", username="alice")
        assert profile.display_name == "Alice Smith"

    def test_display_name_without_name(self):
        profile = Profile(username="alice")
        assert profile.display_name == "alice"

    def test_display_name_anonymous(self):
        profile = Profile()
        assert profile.display_name == "Anonymous"

    def test_age_calculation(self):
        profile = Profile(date_of_birth="1990-01-15")
        age = profile.age
        assert age is not None
        assert 30 <= age <= 40  # Approximate age in 2026

    def test_age_no_dob(self):
        profile = Profile()
        assert profile.age is None

    def test_age_invalid_dob(self):
        profile = Profile(date_of_birth="invalid-date")
        assert profile.age is None

    def test_is_complete(self):
        profile = Profile(name="Alice", username="alice")
        assert profile.is_complete is True

    def test_is_incomplete_no_name(self):
        profile = Profile(username="alice")
        assert profile.is_complete is False

    def test_is_incomplete_no_username(self):
        profile = Profile(name="Alice")
        assert profile.is_complete is False


# ═══════════════════════════════════════════════════════════════════════════════
# Profile Serialization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileSerialization:
    """Profile serialization roundtrip"""

    def test_to_dict(self):
        profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
            preferred_language="en",
            timezone="America/New_York",
        )
        data = profile.to_dict()
        assert data["name"] == "Alice Smith"
        assert data["username"] == "alice"
        assert data["email"] == "alice@example.com"
        assert data["preferred_language"] == "en"
        assert data["timezone"] == "America/New_York"

    def test_from_dict(self):
        data = {
            "name": "Bob Johnson",
            "username": "bob",
            "email": "bob@example.com",
            "preferred_language": "es",
            "timezone": "America/Mexico_City",
            "bio": "Software engineer",
            "location": "Mexico City",
        }
        profile = Profile.from_dict(data)
        assert profile.name == "Bob Johnson"
        assert profile.preferred_language == "es"
        assert profile.timezone == "America/Mexico_City"
        assert profile.bio == "Software engineer"

    def test_roundtrip(self):
        profile = Profile(
            name="Charlie Brown",
            username="charlie",
            email="charlie@example.com",
            date_of_birth="1985-03-15",
            preferred_language="fr",
            timezone="Europe/Paris",
            bio="Bonjour!",
            location="Paris, France",
            metadata={"theme": "light"},
        )
        data = profile.to_dict()
        profile2 = Profile.from_dict(data)
        assert profile2.name == "Charlie Brown"
        assert profile2.preferred_language == "fr"
        assert profile2.metadata["theme"] == "light"


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_profile(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'profile')
        assert isinstance(a.profile, Profile)

    def test_actor_default_profile(self):
        a = Actor(entity_id="alice")
        assert a.profile.name == "alice"
        assert a.profile.username == "alice"

    def test_actor_with_profile(self):
        profile = Profile(
            name="Alice Smith",
            username="alice",
            email="alice@example.com",
            preferred_language="en",
            timezone="America/New_York",
        )
        a = Actor(entity_id="alice", profile=profile)
        assert a.profile.name == "Alice Smith"
        assert a.profile.email == "alice@example.com"

    def test_actor_profile_update(self):
        a = Actor(entity_id="alice")
        a.profile.update(email="alice@example.com", bio="Hello!")
        assert a.profile.email == "alice@example.com"
        assert a.profile.bio == "Hello!"

    def test_actor_profile_setter(self):
        a = Actor(entity_id="alice")
        new_profile = Profile(name="Bob", username="bob")
        a.profile = new_profile
        assert a.profile.name == "Bob"

    def test_actor_profile_independence(self):
        a1 = Actor(entity_id="alice")
        a2 = Actor(entity_id="bob")
        a1.profile.update(email="alice@example.com")
        assert a2.profile.email == ""


# ═══════════════════════════════════════════════════════════════════════════════
# Localization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLocalization:
    """Language and timezone support"""

    def test_english(self):
        profile = Profile(preferred_language="en", timezone="America/New_York")
        assert profile.preferred_language == "en"
        assert profile.timezone == "America/New_York"

    def test_spanish(self):
        profile = Profile(preferred_language="es", timezone="America/Mexico_City")
        assert profile.preferred_language == "es"

    def test_french(self):
        profile = Profile(preferred_language="fr", timezone="Europe/Paris")
        assert profile.preferred_language == "fr"

    def test_japanese(self):
        profile = Profile(preferred_language="ja", timezone="Asia/Tokyo")
        assert profile.preferred_language == "ja"

    def test_chinese(self):
        profile = Profile(preferred_language="zh", timezone="Asia/Shanghai")
        assert profile.preferred_language == "zh"

    def test_arabic(self):
        profile = Profile(preferred_language="ar", timezone="Asia/Dubai")
        assert profile.preferred_language == "ar"

    def test_utc_default(self):
        profile = Profile()
        assert profile.timezone == "UTC"


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestProfileStress:
    """Stress tests for profiles"""

    def test_many_profiles(self):
        profiles = []
        for i in range(100):
            p = Profile(
                name=f"User {i}",
                username=f"user_{i}",
                email=f"user_{i}@example.com",
            )
            profiles.append(p)
        assert len(profiles) == 100

    def test_large_metadata(self):
        metadata = {f"key_{i}": f"value_{i}" for i in range(100)}
        profile = Profile(name="Test", username="test", metadata=metadata)
        assert len(profile.metadata) == 100

    def test_concurrent_updates(self):
        profile = Profile(name="Test", username="test")
        for i in range(100):
            profile.update(**{f"field_{i}": f"value_{i}"})
        assert profile.updated_at > 0
