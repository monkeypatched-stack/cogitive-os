"""Core Ontology — Actor

What actors are. The types that define entity identity.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ..base import OntologyType


@dataclass(frozen=True)
class ActorTrustModel:
    can_trust_others: bool = True
    can_be_trusted: bool = True
    initial_trust: float = 0.5
    decay_rate: float = -0.08
    recovery_rate: float = 0.05
    max_trust: float = 1.0
    requires_reputation: bool = False


@dataclass(frozen=True)
class ActorLifecycle:
    requires_birth: bool = True
    requires_death: bool = True
    can_suspend: bool = True
    can_retry: bool = True
    max_lifespan_days: int | None = None
    succession: bool = False


@dataclass(frozen=True)
class ActorConcept(OntologyType):
    trust_model: ActorTrustModel = field(default_factory=ActorTrustModel)
    lifecycle: ActorLifecycle = field(default_factory=ActorLifecycle)
    can_own_affiliations: bool = True
    can_own_goals: bool = True
    can_learn: bool = True
    can_communicate: bool = True
    requires_identity: bool = True


HUMAN = ActorConcept(id="human", category="biological", trust_model=ActorTrustModel(initial_trust=0.5, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=36500, succession=True), description="Human person")
ANIMAL = ActorConcept(id="animal", category="biological", trust_model=ActorTrustModel(can_trust_others=False, initial_trust=0.3), lifecycle=ActorLifecycle(max_lifespan_days=36500), can_own_affiliations=False, can_own_goals=False, can_communicate=False, description="Non-human organism")
ORGANISM = ActorConcept(id="organism", category="biological", trust_model=ActorTrustModel(can_trust_others=False, can_be_trusted=False), can_own_affiliations=False, can_own_goals=False, can_communicate=False, can_learn=False, description="Any biological organism")

AI_AGENT = ActorConcept(id="ai_agent", category="digital", trust_model=ActorTrustModel(initial_trust=0.3, requires_reputation=True), lifecycle=ActorLifecycle(succession=True), description="Autonomous AI agent")
ROBOT = ActorConcept(id="robot", category="digital", trust_model=ActorTrustModel(initial_trust=0.4, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=3650), description="Physical robotic agent")
DEVICE = ActorConcept(id="device", category="digital", trust_model=ActorTrustModel(can_trust_others=False, initial_trust=0.2), lifecycle=ActorLifecycle(max_lifespan_days=1825), can_own_goals=False, can_learn=False, description="IoT device")
SERVICE_ACCOUNT = ActorConcept(id="service_account", category="digital", trust_model=ActorTrustModel(can_trust_others=False, initial_trust=0.3), can_own_affiliations=False, description="Programmatic service account")
DIGITAL_TWIN = ActorConcept(id="digital_twin", category="digital", trust_model=ActorTrustModel(can_trust_others=False), can_own_goals=False, description="Digital replica of physical entity")

ENTERPRISE = ActorConcept(id="enterprise", category="institutional", trust_model=ActorTrustModel(initial_trust=0.5, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Business entity")
GOVERNMENT = ActorConcept(id="government", category="institutional", trust_model=ActorTrustModel(initial_trust=0.4, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Government entity")
COMMUNITY = ActorConcept(id="community", category="institutional", trust_model=ActorTrustModel(initial_trust=0.5), lifecycle=ActorLifecycle(max_lifespan_days=None), description="Community organization")
NONPROFIT = ActorConcept(id="nonprofit", category="institutional", trust_model=ActorTrustModel(initial_trust=0.5, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Non-profit organization")
UNIVERSITY = ActorConcept(id="university", category="institutional", trust_model=ActorTrustModel(initial_trust=0.6, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Educational institution")
HOSPITAL_INST = ActorConcept(id="hospital", category="institutional", trust_model=ActorTrustModel(initial_trust=0.7, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Healthcare institution")
FINANCIAL_INST = ActorConcept(id="financial_institution", category="institutional", trust_model=ActorTrustModel(initial_trust=0.5, requires_reputation=True), lifecycle=ActorLifecycle(max_lifespan_days=None, succession=True), description="Financial services provider")

CYBORG = ActorConcept(id="cyborg", category="hybrid", trust_model=ActorTrustModel(initial_trust=0.5), lifecycle=ActorLifecycle(max_lifespan_days=36500), description="Human with technological augmentation")
AUGMENTED_HUMAN = ActorConcept(id="augmented_human", category="hybrid", trust_model=ActorTrustModel(initial_trust=0.5), lifecycle=ActorLifecycle(max_lifespan_days=36500), description="Human with minor augmentation")

ALL_ACTOR: dict[str, ActorConcept] = {t.id: t for t in [
    HUMAN, ANIMAL, ORGANISM,
    AI_AGENT, ROBOT, DEVICE, SERVICE_ACCOUNT, DIGITAL_TWIN,
    ENTERPRISE, GOVERNMENT, COMMUNITY, NONPROFIT, UNIVERSITY, HOSPITAL_INST, FINANCIAL_INST,
    CYBORG, AUGMENTED_HUMAN,
]}
