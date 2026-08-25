"""
Actor Location and Relationships Metadata Test Suite

Tests the Location and RelationshipMeta systems including:
- Location creation and updates
- Coordinates validation
- Organization memberships
- Team memberships
- Roles and permissions
- Social connections
- Actor integration
"""
import pytest
import time
from src.monkey_brain.kernel.location import Location, Coordinates
from src.monkey_brain.kernel.relationships_meta import (
    RelationshipMeta, Organization, Team, Role, SocialConnection,
    RoleType, MembershipStatus, SocialPlatform,
)
from src.monkey_brain.kernel.ontology.entity import Actor


# ═══════════════════════════════════════════════════════════════════════════════
# Location Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestLocationCreation:
    """Location creation and defaults"""

    def test_empty_location(self):
        location = Location()
        assert location.country == ""
        assert location.city == ""
        assert location.timezone == "UTC"

    def test_basic_location(self):
        location = Location(
            country="United States",
            city="New York",
            timezone="America/New_York",
        )
        assert location.country == "United States"
        assert location.city == "New York"

    def test_full_location(self):
        location = Location(
            country="United States",
            country_code="US",
            state="New York",
            city="New York",
            district="Manhattan",
            address="123 Main St",
            postal_code="10001",
            timezone="America/New_York",
        )
        assert location.country == "United States"
        assert location.state == "New York"
        assert location.district == "Manhattan"

    def test_location_with_coordinates(self):
        coords = Coordinates(latitude=40.7128, longitude=-74.0060)
        location = Location(
            country="United States",
            city="New York",
            coordinates=coords,
            location_enabled=True,
        )
        assert location.has_coordinates is True
        assert location.coordinates.latitude == 40.7128


class TestCoordinates:
    """Coordinates validation"""

    def test_valid_coordinates(self):
        coords = Coordinates(latitude=40.7128, longitude=-74.0060)
        assert coords.is_valid is True

    def test_invalid_latitude(self):
        coords = Coordinates(latitude=100.0, longitude=0.0)
        assert coords.is_valid is False

    def test_invalid_longitude(self):
        coords = Coordinates(latitude=0.0, longitude=200.0)
        assert coords.is_valid is False

    def test_equator(self):
        coords = Coordinates(latitude=0.0, longitude=0.0)
        assert coords.is_valid is True


class TestLocationProperties:
    """Location computed properties"""

    def test_display_location(self):
        location = Location(country="United States", city="New York")
        assert location.display_location == "New York, United States"

    def test_display_location_full(self):
        location = Location(country="US", state="NY", city="NYC")
        assert location.display_location == "NYC, NY, US"

    def test_display_location_empty(self):
        location = Location()
        assert location.display_location == "Unknown"

    def test_has_coordinates_disabled(self):
        location = Location(location_enabled=False)
        assert location.has_coordinates is False

    def test_has_coordinates_invalid(self):
        location = Location(
            location_enabled=True,
            coordinates=Coordinates(latitude=100.0, longitude=0.0),
        )
        assert location.has_coordinates is False


class TestLocationUpdate:
    """Location update operations"""

    def test_update_city(self):
        location = Location(city="New York")
        location.update(city="Boston")
        assert location.city == "Boston"

    def test_update_timestamp(self):
        location = Location(city="New York")
        old_updated = location.last_updated
        time.sleep(0.01)
        location.update(city="Boston")
        assert location.last_updated > old_updated


class TestLocationSerialization:
    """Location serialization roundtrip"""

    def test_to_dict(self):
        location = Location(
            country="United States",
            city="New York",
            timezone="America/New_York",
        )
        data = location.to_dict()
        assert data["country"] == "United States"
        assert data["city"] == "New York"

    def test_from_dict(self):
        data = {
            "country": "Mexico",
            "city": "Mexico City",
            "timezone": "America/Mexico_City",
        }
        location = Location.from_dict(data)
        assert location.country == "Mexico"
        assert location.city == "Mexico City"

    def test_roundtrip(self):
        location = Location(
            country="France",
            city="Paris",
            timezone="Europe/Paris",
            coordinates=Coordinates(latitude=48.8566, longitude=2.3522),
            location_enabled=True,
        )
        data = location.to_dict()
        location2 = Location.from_dict(data)
        assert location2.country == "France"
        assert location2.coordinates.latitude == 48.8566
        assert location2.location_enabled is True


# ═══════════════════════════════════════════════════════════════════════════════
# Role Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRole:
    """Role operations"""

    def test_default_role(self):
        role = Role()
        assert role.role_type == RoleType.MEMBER

    def test_admin_role(self):
        role = Role(role_type=RoleType.ADMIN, name="Admin")
        assert role.role_type == RoleType.ADMIN
        assert role.name == "Admin"

    def test_role_with_permissions(self):
        role = Role(
            role_type=RoleType.MODERATOR,
            permissions=["delete", "ban", "edit"],
        )
        assert len(role.permissions) == 3

    def test_role_types(self):
        assert RoleType.OWNER.value == "owner"
        assert RoleType.ADMIN.value == "admin"
        assert RoleType.MEMBER.value == "member"
        assert RoleType.GUEST.value == "guest"


# ═══════════════════════════════════════════════════════════════════════════════
# Organization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestOrganization:
    """Organization membership operations"""

    def test_create_organization(self):
        org = Organization(
            org_id="org_001",
            name="Acme Corp",
            domain="acme.com",
            industry="Technology",
            size="large",
        )
        assert org.name == "Acme Corp"
        assert org.is_active is True

    def test_organization_with_role(self):
        org = Organization(
            org_id="org_001",
            name="Acme Corp",
            role=Role(role_type=RoleType.ADMIN),
        )
        assert org.role.role_type == RoleType.ADMIN

    def test_organization_inactive(self):
        org = Organization(
            org_id="org_001",
            name="Acme Corp",
            status=MembershipStatus.INACTIVE,
        )
        assert org.is_active is False

    def test_organization_left(self):
        org = Organization(
            org_id="org_001",
            name="Acme Corp",
            left_at=time.time(),
        )
        assert org.is_active is False


# ═══════════════════════════════════════════════════════════════════════════════
# Team Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTeam:
    """Team membership operations"""

    def test_create_team(self):
        team = Team(
            team_id="team_001",
            name="Engineering",
            description="Software engineering team",
            organization_id="org_001",
        )
        assert team.name == "Engineering"
        assert team.is_active is True

    def test_team_with_role(self):
        team = Team(
            team_id="team_001",
            name="Engineering",
            role=Role(role_type=RoleType.MAINTAINER),
        )
        assert team.role.role_type == RoleType.MAINTAINER

    def test_team_inactive(self):
        team = Team(
            team_id="team_001",
            name="Engineering",
            status=MembershipStatus.SUSPENDED,
        )
        assert team.is_active is False


# ═══════════════════════════════════════════════════════════════════════════════
# Social Connection Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSocialConnection:
    """Social connection operations"""

    def test_create_connection(self):
        conn = SocialConnection(
            platform=SocialPlatform.LINKEDIN,
            handle="alice",
            url="https://linkedin.com/in/alice",
            display_name="Alice Smith",
        )
        assert conn.platform == SocialPlatform.LINKEDIN
        assert conn.handle == "alice"

    def test_verified_connection(self):
        conn = SocialConnection(
            platform=SocialPlatform.TWITTER,
            handle="alice",
            verified=True,
        )
        assert conn.verified is True

    def test_primary_connection(self):
        conn = SocialConnection(
            platform=SocialPlatform.EMAIL,
            handle="alice@example.com",
            primary=True,
        )
        assert conn.primary is True

    def test_social_platforms(self):
        assert SocialPlatform.TWITTER.value == "twitter"
        assert SocialPlatform.LINKEDIN.value == "linkedin"
        assert SocialPlatform.GITHUB.value == "github"
        assert SocialPlatform.DISCORD.value == "discord"


# ═══════════════════════════════════════════════════════════════════════════════
# RelationshipMeta Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestRelationshipMeta:
    """Relationship metadata operations"""

    def test_empty_relationships(self):
        rel = RelationshipMeta()
        assert len(rel.organizations) == 0
        assert len(rel.teams) == 0

    def test_add_organization(self):
        rel = RelationshipMeta()
        org = Organization(org_id="org_001", name="Acme Corp")
        rel.add_organization(org)
        assert len(rel.organizations) == 1

    def test_add_team(self):
        rel = RelationshipMeta()
        team = Team(team_id="team_001", name="Engineering")
        rel.add_team(team)
        assert len(rel.teams) == 1

    def test_add_social_connection(self):
        rel = RelationshipMeta()
        conn = SocialConnection(platform=SocialPlatform.GITHUB, handle="alice")
        rel.add_social_connection(conn)
        assert len(rel.social_connections) == 1

    def test_remove_organization(self):
        rel = RelationshipMeta()
        org = Organization(org_id="org_001", name="Acme Corp")
        rel.add_organization(org)
        assert rel.remove_organization("org_001") is True
        assert len(rel.organizations) == 0

    def test_remove_team(self):
        rel = RelationshipMeta()
        team = Team(team_id="team_001", name="Engineering")
        rel.add_team(team)
        assert rel.remove_team("team_001") is True
        assert len(rel.teams) == 0

    def test_active_organizations(self):
        rel = RelationshipMeta()
        rel.add_organization(Organization(org_id="org_1", name="Active", status=MembershipStatus.ACTIVE))
        rel.add_organization(Organization(org_id="org_2", name="Inactive", status=MembershipStatus.INACTIVE))
        assert len(rel.active_organizations) == 1

    def test_active_teams(self):
        rel = RelationshipMeta()
        rel.add_team(Team(team_id="team_1", name="Active", status=MembershipStatus.ACTIVE))
        rel.add_team(Team(team_id="team_2", name="Inactive", status=MembershipStatus.INACTIVE))
        assert len(rel.active_teams) == 1

    def test_primary_social(self):
        rel = RelationshipMeta()
        rel.add_social_connection(SocialConnection(platform=SocialPlatform.GITHUB, handle="alice"))
        rel.add_social_connection(SocialConnection(platform=SocialPlatform.LINKEDIN, handle="alice", primary=True))
        assert rel.primary_social.platform == SocialPlatform.LINKEDIN

    def test_get_role_in_org(self):
        rel = RelationshipMeta()
        org = Organization(org_id="org_001", name="Acme", role=Role(role_type=RoleType.ADMIN))
        rel.add_organization(org)
        role = rel.get_role_in_org("org_001")
        assert role.role_type == RoleType.ADMIN

    def test_has_role(self):
        rel = RelationshipMeta()
        rel.add_organization(Organization(org_id="org_1", name="Acme", role=Role(role_type=RoleType.ADMIN)))
        assert rel.has_role(RoleType.ADMIN) is True
        assert rel.has_role(RoleType.OWNER) is False

    def test_reports_to(self):
        rel = RelationshipMeta(reports_to="boss_001")
        assert rel.reports_to == "boss_001"

    def test_direct_reports(self):
        rel = RelationshipMeta(direct_reports=["emp_001", "emp_002"])
        assert len(rel.direct_reports) == 2

    def test_mentors(self):
        rel = RelationshipMeta(mentors=["mentor_001"])
        assert len(rel.mentors) == 1

    def test_mentees(self):
        rel = RelationshipMeta(mentees=["mentee_001", "mentee_002"])
        assert len(rel.mentees) == 2


class TestRelationshipMetaSerialization:
    """RelationshipMeta serialization roundtrip"""

    def test_to_dict(self):
        rel = RelationshipMeta()
        rel.add_organization(Organization(org_id="org_001", name="Acme"))
        rel.add_team(Team(team_id="team_001", name="Engineering"))
        rel.add_social_connection(SocialConnection(platform=SocialPlatform.GITHUB, handle="alice"))

        data = rel.to_dict()
        assert len(data["organizations"]) == 1
        assert len(data["teams"]) == 1
        assert len(data["social_connections"]) == 1

    def test_from_dict(self):
        data = {
            "organizations": [{"org_id": "org_001", "name": "Acme"}],
            "teams": [{"team_id": "team_001", "name": "Engineering"}],
            "social_connections": [{"platform": "github", "handle": "alice"}],
            "reports_to": "boss_001",
            "direct_reports": ["emp_001"],
        }
        rel = RelationshipMeta.from_dict(data)
        assert len(rel.organizations) == 1
        assert rel.reports_to == "boss_001"

    def test_roundtrip(self):
        rel = RelationshipMeta()
        rel.add_organization(Organization(org_id="org_001", name="Acme", role=Role(role_type=RoleType.ADMIN)))
        rel.add_team(Team(team_id="team_001", name="Eng", role=Role(role_type=RoleType.MEMBER)))
        rel.add_social_connection(SocialConnection(platform=SocialPlatform.LINKEDIN, handle="alice", primary=True))
        rel.reports_to = "boss_001"
        rel.direct_reports = ["emp_001", "emp_002"]

        data = rel.to_dict()
        rel2 = RelationshipMeta.from_dict(data)
        assert len(rel2.organizations) == 1
        assert rel2.reports_to == "boss_001"
        assert len(rel2.direct_reports) == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Actor Integration Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestActorIntegration:
    """Integration with Actor class"""

    def test_actor_has_location(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'location')
        assert isinstance(a.location, Location)

    def test_actor_has_relationships_meta(self):
        a = Actor(entity_id="alice")
        assert hasattr(a, 'relationships_meta')
        assert isinstance(a.relationships_meta, RelationshipMeta)

    def test_actor_location_update(self):
        a = Actor(entity_id="alice")
        a.location.update(city="New York", country="United States")
        assert a.location.city == "New York"
        assert a.location.country == "United States"

    def test_actor_location_setter(self):
        a = Actor(entity_id="alice")
        new_location = Location(city="Boston", country="US")
        a.location = new_location
        assert a.location.city == "Boston"

    def test_actor_add_organization(self):
        a = Actor(entity_id="alice")
        org = Organization(org_id="org_001", name="Acme Corp")
        a.relationships_meta.add_organization(org)
        assert len(a.relationships_meta.organizations) == 1

    def test_actor_add_team(self):
        a = Actor(entity_id="alice")
        team = Team(team_id="team_001", name="Engineering")
        a.relationships_meta.add_team(team)
        assert len(a.relationships_meta.teams) == 1

    def test_actor_add_social(self):
        a = Actor(entity_id="alice")
        conn = SocialConnection(platform=SocialPlatform.GITHUB, handle="alice")
        a.relationships_meta.add_social_connection(conn)
        assert len(a.relationships_meta.social_connections) == 1

    def test_actor_independence(self):
        a1 = Actor(entity_id="alice")
        a2 = Actor(entity_id="bob")
        a1.location.update(city="New York")
        assert a2.location.city == ""


# ═══════════════════════════════════════════════════════════════════════════════
# Stress Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestStress:
    """Stress tests"""

    def test_many_locations(self):
        locations = []
        for i in range(100):
            loc = Location(city=f"City_{i}", country=f"Country_{i}")
            locations.append(loc)
        assert len(locations) == 100

    def test_many_organizations(self):
        rel = RelationshipMeta()
        for i in range(50):
            rel.add_organization(Organization(org_id=f"org_{i}", name=f"Org_{i}"))
        assert len(rel.organizations) == 50

    def test_many_social_connections(self):
        rel = RelationshipMeta()
        for i in range(30):
            rel.add_social_connection(SocialConnection(platform=SocialPlatform.OTHER, handle=f"user_{i}"))
        assert len(rel.social_connections) == 30
