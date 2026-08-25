"""Core Ontology — Cognition

What actors know and want. Goals, beliefs, reasoning.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ..base import OntologyType


# ── Goals ────────────────────────────────────────────────────

@dataclass(frozen=True)
class GoalConstraints:
    max_cost: float = 0.0
    max_duration_days: int | None = None
    requires_collaboration: bool = False
    requires_authorization: bool = False
    ethical_bounds: tuple[str, ...] = ()


@dataclass(frozen=True)
class GoalConcept(OntologyType):
    default_priority: int = 50
    constraints: GoalConstraints = field(default_factory=GoalConstraints)
    requires_world_change: bool = True
    measurable: bool = True
    composable: bool = True
    cancellation_safe: bool = True


GOAL_SELF_PRESERVATION = GoalConcept(id="self_preservation", category="survival", default_priority=0, constraints=GoalConstraints(ethical_bounds=("no_harm",)), cancellation_safe=False, description="Maintaining own existence")
GOAL_HEALTH = GoalConcept(id="health", category="survival", default_priority=10, description="Maintaining health")
GOAL_SAFETY = GoalConcept(id="safety", category="survival", default_priority=5, description="Ensuring safety")
GOAL_BELONGING = GoalConcept(id="belonging", category="social", default_priority=30, constraints=GoalConstraints(requires_collaboration=True), description="Being part of a group")
GOAL_RELATIONSHIP = GoalConcept(id="relationship", category="social", default_priority=25, constraints=GoalConstraints(requires_collaboration=True), description="Building relationships")
GOAL_STATUS = GoalConcept(id="status", category="social", default_priority=40, description="Social standing")
GOAL_MASTERY = GoalConcept(id="mastery", category="achievement", default_priority=35, description="Achieving expertise")
GOAL_ACCOMPLISHMENT = GoalConcept(id="accomplishment", category="achievement", default_priority=40, description="Completing tasks")
GOAL_RECOGNITION = GoalConcept(id="recognition", category="achievement", default_priority=45, description="Gaining acknowledgment")
GOAL_WEALTH = GoalConcept(id="wealth", category="economic", default_priority=35, description="Accumulating resources")
GOAL_EFFICIENCY = GoalConcept(id="efficiency", category="economic", default_priority=30, description="Minimizing waste")
GOAL_RESOURCE_ACQUISITION = GoalConcept(id="resource_acquisition", category="economic", default_priority=30, description="Obtaining resources")
GOAL_EXPRESSION = GoalConcept(id="expression", category="creative", default_priority=40, description="Expressing ideas")
GOAL_INNOVATION_G = GoalConcept(id="innovation", category="creative", default_priority=35, description="Creating novel solutions")
GOAL_BEAUTY = GoalConcept(id="beauty", category="creative", default_priority=45, description="Aesthetic quality")
GOAL_UNDERSTANDING = GoalConcept(id="understanding", category="knowledge", default_priority=30, description="Comprehending how things work")
GOAL_LEARNING = GoalConcept(id="learning", category="knowledge", default_priority=25, description="Acquiring knowledge")
GOAL_DISCOVERY = GoalConcept(id="discovery", category="knowledge", default_priority=30, description="Finding new information")
GOAL_AUTHORITY = GoalConcept(id="authority", category="governance", default_priority=35, constraints=GoalConstraints(requires_authorization=True), description="Exercising power")
GOAL_ORDER = GoalConcept(id="order", category="governance", default_priority=30, constraints=GoalConstraints(requires_collaboration=True), description="Maintaining order")
GOAL_JUSTICE = GoalConcept(id="justice", category="governance", default_priority=25, constraints=GoalConstraints(ethical_bounds=("fairness", "no_harm")), description="Ensuring fairness")
GOAL_PURPOSE = GoalConcept(id="purpose", category="existential", default_priority=20, requires_world_change=False, description="Fulfilling purpose")
GOAL_MEANING = GoalConcept(id="meaning", category="existential", default_priority=20, requires_world_change=False, description="Finding meaning")
GOAL_LEGACY = GoalConcept(id="legacy", category="existential", default_priority=40, description="Creating lasting impact")

ALL_GOALS: dict[str, GoalConcept] = {t.id: t for t in [
    GOAL_SELF_PRESERVATION, GOAL_HEALTH, GOAL_SAFETY,
    GOAL_BELONGING, GOAL_RELATIONSHIP, GOAL_STATUS,
    GOAL_MASTERY, GOAL_ACCOMPLISHMENT, GOAL_RECOGNITION,
    GOAL_WEALTH, GOAL_EFFICIENCY, GOAL_RESOURCE_ACQUISITION,
    GOAL_EXPRESSION, GOAL_INNOVATION_G, GOAL_BEAUTY,
    GOAL_UNDERSTANDING, GOAL_LEARNING, GOAL_DISCOVERY,
    GOAL_AUTHORITY, GOAL_ORDER, GOAL_JUSTICE,
    GOAL_PURPOSE, GOAL_MEANING, GOAL_LEGACY,
]}


# ── Beliefs ──────────────────────────────────────────────────

@dataclass(frozen=True)
class ConfidenceModel:
    initial_confidence: float = 0.5
    decay_rate: float = 0.05
    reinforcement_boost: float = 0.1
    contradiction_penalty: float = -0.2
    min_confidence: float = 0.0
    max_confidence: float = 1.0


@dataclass(frozen=True)
class BeliefConcept(OntologyType):
    confidence_model: ConfidenceModel = field(default_factory=ConfidenceModel)
    requires_evidence: bool = True
    evidence_types: tuple[str, ...] = ()
    propagable: bool = True
    falsifiable: bool = True
    persistence_days: int | None = None


BELIEF_OBSERVATION = BeliefConcept(id="observation", category="factual", confidence_model=ConfidenceModel(initial_confidence=0.8, decay_rate=0.03), evidence_types=("direct_observation",), persistence_days=30, description="Direct observation")
BELIEF_MEASUREMENT = BeliefConcept(id="measurement", category="factual", confidence_model=ConfidenceModel(initial_confidence=0.9, decay_rate=0.01), evidence_types=("instrument",), persistence_days=90, description="Instrument measurement")
BELIEF_TESTIMONY = BeliefConcept(id="testimony", category="factual", confidence_model=ConfidenceModel(initial_confidence=0.5), evidence_types=("testimony",), description="Information from another actor")
BELIEF_RECORD = BeliefConcept(id="record", category="factual", confidence_model=ConfidenceModel(initial_confidence=0.85, decay_rate=0.005), evidence_types=("document", "database"), persistence_days=3650, description="Stored record")
BELIEF_DEDUCTION = BeliefConcept(id="deduction", category="inferential", confidence_model=ConfidenceModel(initial_confidence=0.7, reinforcement_boost=0.15), evidence_types=("logic", "premises"), description="Logical conclusion")
BELIEF_INDUCTION = BeliefConcept(id="induction", category="inferential", confidence_model=ConfidenceModel(initial_confidence=0.5, decay_rate=0.08), evidence_types=("pattern", "sample"), description="Generalization from observations")
BELIEF_ABDUCTION = BeliefConcept(id="abduction", category="inferential", confidence_model=ConfidenceModel(initial_confidence=0.4, decay_rate=0.10), evidence_types=("observation", "hypothesis"), description="Inference to best explanation")
BELIEF_FORECAST = BeliefConcept(id="forecast", category="predictive", confidence_model=ConfidenceModel(initial_confidence=0.4, decay_rate=0.15), evidence_types=("trend", "model"), persistence_days=7, description="Trend-based prediction")
BELIEF_SCENARIO = BeliefConcept(id="scenario", category="predictive", confidence_model=ConfidenceModel(initial_confidence=0.3, decay_rate=0.10), evidence_types=("assumption", "simulation"), persistence_days=30, description="Hypothetical future state")
BELIEF_TRUST_BELIEF = BeliefConcept(id="trust_belief", category="social", confidence_model=ConfidenceModel(initial_confidence=0.5, reinforcement_boost=0.05, contradiction_penalty=-0.12), evidence_types=("interaction", "recommendation"), description="Belief about trustworthiness")
BELIEF_REPUTATION = BeliefConcept(id="reputation", category="social", confidence_model=ConfidenceModel(initial_confidence=0.5, decay_rate=0.03), evidence_types=("testimony", "observation"), description="Belief about reputation")
BELIEF_CAUSATION = BeliefConcept(id="causation", category="causal", confidence_model=ConfidenceModel(initial_confidence=0.4, reinforcement_boost=0.15, contradiction_penalty=-0.20), evidence_types=("experiment", "correlation", "theory"), description="A causes B")
BELIEF_QUALITY = BeliefConcept(id="quality", category="evaluative", confidence_model=ConfidenceModel(initial_confidence=0.5, decay_rate=0.08), evidence_types=("assessment", "testimony"), description="Quality judgment")
BELIEF_PREFERENCE = BeliefConcept(id="preference", category="evaluative", confidence_model=ConfidenceModel(initial_confidence=0.6, decay_rate=0.03), evidence_types=("choice", "expression"), description="Personal preference")

ALL_BELIEFS: dict[str, BeliefConcept] = {t.id: t for t in [
    BELIEF_OBSERVATION, BELIEF_MEASUREMENT, BELIEF_TESTIMONY, BELIEF_RECORD,
    BELIEF_DEDUCTION, BELIEF_INDUCTION, BELIEF_ABDUCTION,
    BELIEF_FORECAST, BELIEF_SCENARIO,
    BELIEF_TRUST_BELIEF, BELIEF_REPUTATION,
    BELIEF_CAUSATION, BELIEF_QUALITY, BELIEF_PREFERENCE,
]}
