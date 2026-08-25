"""Core Ontology — Social

Relationships, trust, and social structure.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ..base import OntologyType


@dataclass(frozen=True)
class SocialTrustModel:
    initial_trust: float = 0.5
    growth_rate: float = 0.05
    decay_rate: float = -0.08
    decay_on_breach: float = -0.15
    asymmetric: bool = True


@dataclass(frozen=True)
class SocialLifecycle:
    requires_mutual_consent: bool = False
    auto_expire: bool = False
    duration_limit_days: int | None = None
    dissolution_requires_action: bool = True


@dataclass(frozen=True)
class AffiliationConcept(OntologyType):
    cardinality: str = "many_to_one"
    bidirectional: bool = True
    default_permissions: tuple[str, ...] = ()
    trust_model: SocialTrustModel = field(default_factory=SocialTrustModel)
    lifecycle: SocialLifecycle = field(default_factory=SocialLifecycle)


AFF_FAMILY = AffiliationConcept(id="family", category="personal", cardinality="one_to_many", default_permissions=("emotional_support", "financial_dependents", "caregiving"), trust_model=SocialTrustModel(initial_trust=0.9, decay_rate=-0.10, decay_on_breach=-0.20), description="Family bond")
AFF_FRIENDSHIP = AffiliationConcept(id="friendship", category="personal", cardinality="many_to_many", default_permissions=("social", "emotional_support", "recommendation"), lifecycle=SocialLifecycle(requires_mutual_consent=True), description="Social bond")
AFF_MARRIAGE = AffiliationConcept(id="marriage", category="personal", cardinality="one_to_one", default_permissions=("financial", "legal", "medical", "emotional_support"), trust_model=SocialTrustModel(initial_trust=1.0, decay_rate=-0.15, decay_on_breach=-0.30), lifecycle=SocialLifecycle(requires_mutual_consent=True), description="Legal partnership")
AFF_GUARDIANSHIP = AffiliationConcept(id="guardianship", category="personal", cardinality="one_to_one", bidirectional=False, default_permissions=("caregiving", "legal", "financial_dependents", "education"), trust_model=SocialTrustModel(initial_trust=0.95, decay_on_breach=-0.25), lifecycle=SocialLifecycle(duration_limit_days=6570), description="Legal responsibility")
AFF_EMPLOYMENT = AffiliationConcept(id="employment", category="organizational", default_permissions=("career_planning", "calendar", "work_scheduling", "compensation"), trust_model=SocialTrustModel(initial_trust=0.7, decay_on_breach=-0.15), description="Employment relationship")
AFF_CONTRACTOR = AffiliationConcept(id="contractor", category="organizational", default_permissions=("project_access", "compensation", "work_scheduling"), lifecycle=SocialLifecycle(auto_expire=True, duration_limit_days=365), description="Contract work")
AFF_VOLUNTEER = AffiliationConcept(id="volunteer", category="organizational", default_permissions=("project_access", "community"), lifecycle=SocialLifecycle(requires_mutual_consent=True), description="Voluntary service")
AFF_BOARD_MEMBER = AffiliationConcept(id="board_member", category="organizational", default_permissions=("governance", "strategy", "financial_oversight"), trust_model=SocialTrustModel(initial_trust=0.8, decay_on_breach=-0.20), lifecycle=SocialLifecycle(duration_limit_days=1825), description="Board membership")
AFF_SHAREHOLDER = AffiliationConcept(id="shareholder", category="organizational", bidirectional=False, default_permissions=("financial_oversight", "voting"), description="Ownership stake")
AFF_CUSTOMER = AffiliationConcept(id="customer", category="commercial", default_permissions=("purchasing", "support"), description="Purchaser of goods/services")
AFF_SUPPLIER = AffiliationConcept(id="supplier", category="commercial", default_permissions=("procurement", "quality", "delivery"), trust_model=SocialTrustModel(initial_trust=0.6, decay_on_breach=-0.18), description="Provider of goods/services")
AFF_PARTNER = AffiliationConcept(id="partner", category="commercial", cardinality="many_to_many", default_permissions=("strategic", "joint_venture"), trust_model=SocialTrustModel(initial_trust=0.7), description="Strategic partnership")
AFF_CITIZEN = AffiliationConcept(id="citizen", category="government", default_permissions=("legal", "protection", "voting"), description="Nation-state membership")
AFF_RESIDENT = AffiliationConcept(id="resident", category="government", default_permissions=("local_services", "legal"), description="Jurisdiction residence")
AFF_STUDENT = AffiliationConcept(id="student", category="education", default_permissions=("learning", "facilities", "library"), lifecycle=SocialLifecycle(duration_limit_days=1825), description="Enrolled learner")
AFF_TEACHER = AffiliationConcept(id="teacher", category="education", cardinality="one_to_many", default_permissions=("teaching", "mentoring", "grading"), description="Educator")
AFF_PATIENT = AffiliationConcept(id="patient", category="healthcare", default_permissions=("medical", "emergency"), trust_model=SocialTrustModel(initial_trust=0.7, decay_on_breach=-0.25), description="Healthcare recipient")
AFF_DOCTOR = AffiliationConcept(id="doctor", category="healthcare", cardinality="one_to_many", default_permissions=("medical", "prescriptions", "diagnosis"), trust_model=SocialTrustModel(initial_trust=0.8, decay_on_breach=-0.20), description="Healthcare provider")
AFF_AI_AGENT = AffiliationConcept(id="ai_agent", category="digital", default_permissions=("task_execution", "data_access", "messaging"), description="AI agent relationship")
AFF_DEVICE = AffiliationConcept(id="device", category="digital", bidirectional=False, default_permissions=("telemetry", "control"), description="Device relationship")
AFF_SERVICE_ACCOUNT = AffiliationConcept(id="service_account", category="digital", bidirectional=False, default_permissions=("api_access", "data_read", "data_write"), description="Service account relationship")

ALL_AFFILIATIONS: dict[str, AffiliationConcept] = {t.id: t for t in [
    AFF_FAMILY, AFF_FRIENDSHIP, AFF_MARRIAGE, AFF_GUARDIANSHIP,
    AFF_EMPLOYMENT, AFF_CONTRACTOR, AFF_VOLUNTEER, AFF_BOARD_MEMBER, AFF_SHAREHOLDER,
    AFF_CUSTOMER, AFF_SUPPLIER, AFF_PARTNER,
    AFF_CITIZEN, AFF_RESIDENT,
    AFF_STUDENT, AFF_TEACHER,
    AFF_PATIENT, AFF_DOCTOR,
    AFF_AI_AGENT, AFF_DEVICE, AFF_SERVICE_ACCOUNT,
]}
