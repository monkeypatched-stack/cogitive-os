"""Core Ontology — Capabilities

What actors can do.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ..base import OntologyType


@dataclass(frozen=True)
class PrerequisiteModel:
    min_trust: float = 0.0
    required_credentials: tuple[str, ...] = ()
    required_equipment: tuple[str, ...] = ()
    required_training_hours: int = 0


@dataclass(frozen=True)
class CapabilityConcept(OntologyType):
    prerequisites: PrerequisiteModel = field(default_factory=PrerequisiteModel)
    risk_level: float = 0.0
    requires_authorization: bool = False
    reversible: bool = True
    cost_model: str = "fixed"
    quality_metric: str = "completion"


CAP_MANUAL_LABOR = CapabilityConcept(id="manual_labor", category="physical", prerequisites=PrerequisiteModel(required_equipment=("tools",)), risk_level=0.3, reversible=False, description="Physical labor")
CAP_TRANSPORTATION = CapabilityConcept(id="transportation", category="physical", prerequisites=PrerequisiteModel(required_credentials=("license",)), risk_level=0.2, cost_model="usage", description="Transportation")
CAP_CONSTRUCTION = CapabilityConcept(id="construction", category="physical", prerequisites=PrerequisiteModel(required_credentials=("permit",), required_equipment=("heavy_machinery",)), risk_level=0.4, requires_authorization=True, reversible=False, description="Construction")
CAP_MAINTENANCE = CapabilityConcept(id="maintenance", category="physical", prerequisites=PrerequisiteModel(required_equipment=("tools",)), risk_level=0.2, cost_model="usage", description="Maintenance")
CAP_ANALYSIS = CapabilityConcept(id="analysis", category="cognitive", quality_metric="accuracy", description="Data analysis")
CAP_REASONING = CapabilityConcept(id="reasoning", category="cognitive", quality_metric="correctness", description="Logical reasoning")
CAP_DECISION_MAKING = CapabilityConcept(id="decision_making", category="cognitive", quality_metric="outcome", description="Decision making")
CAP_PLANNING = CapabilityConcept(id="planning", category="cognitive", quality_metric="efficiency", description="Planning")
CAP_CODING = CapabilityConcept(id="coding", category="digital", quality_metric="correctness", description="Software development")
CAP_DATA_PROCESSING = CapabilityConcept(id="data_processing", category="digital", quality_metric="throughput", cost_model="usage", description="Data processing")
CAP_AUTOMATION = CapabilityConcept(id="automation", category="digital", quality_metric="reliability", description="Task automation")
CAP_COMMUNICATION = CapabilityConcept(id="communication", category="social", quality_metric="clarity", description="Communication")
CAP_NEGOTIATION = CapabilityConcept(id="negotiation", category="social", prerequisites=PrerequisiteModel(min_trust=0.3), quality_metric="mutual_satisfaction", description="Negotiation")
CAP_LEADERSHIP = CapabilityConcept(id="leadership", category="social", prerequisites=PrerequisiteModel(min_trust=0.5), quality_metric="team_outcome", description="Leadership")
CAP_DESIGN = CapabilityConcept(id="design", category="creative", quality_metric="usability", description="Design")
CAP_WRITING = CapabilityConcept(id="writing", category="creative", quality_metric="clarity", description="Writing")
CAP_DIAGNOSIS = CapabilityConcept(id="diagnosis", category="medical", prerequisites=PrerequisiteModel(required_credentials=("medical_license",)), risk_level=0.3, requires_authorization=True, quality_metric="accuracy", description="Medical diagnosis")
CAP_TREATMENT = CapabilityConcept(id="treatment", category="medical", prerequisites=PrerequisiteModel(required_credentials=("medical_license",)), risk_level=0.4, requires_authorization=True, quality_metric="patient_outcome", description="Medical treatment")
CAP_TEACHING = CapabilityConcept(id="teaching", category="educational", prerequisites=PrerequisiteModel(min_trust=0.5), quality_metric="student_outcome", description="Teaching")
CAP_RESEARCH = CapabilityConcept(id="research", category="educational", prerequisites=PrerequisiteModel(min_trust=0.5), quality_metric="discovery", description="Research")
CAP_INVESTMENT = CapabilityConcept(id="investment", category="financial", prerequisites=PrerequisiteModel(required_credentials=("investment_license",), min_trust=0.6), risk_level=0.5, requires_authorization=True, quality_metric="return", description="Investment")

ALL_CAPABILITIES: dict[str, CapabilityConcept] = {t.id: t for t in [
    CAP_MANUAL_LABOR, CAP_TRANSPORTATION, CAP_CONSTRUCTION, CAP_MAINTENANCE,
    CAP_ANALYSIS, CAP_REASONING, CAP_DECISION_MAKING, CAP_PLANNING,
    CAP_CODING, CAP_DATA_PROCESSING, CAP_AUTOMATION,
    CAP_COMMUNICATION, CAP_NEGOTIATION, CAP_LEADERSHIP,
    CAP_DESIGN, CAP_WRITING,
    CAP_DIAGNOSIS, CAP_TREATMENT,
    CAP_TEACHING, CAP_RESEARCH,
    CAP_INVESTMENT,
]}
