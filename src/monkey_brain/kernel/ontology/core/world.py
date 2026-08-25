"""Core Ontology — World

What exists in the world. The foundational layer that all actors observe.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from ..base import OntologyType


@dataclass(frozen=True)
class ScarcityModel:
    is_renewable: bool = True
    is_depletable: bool = True
    replenishment_rate: float = 1.0
    max_capacity: float = float('inf')
    min_reserve: float = 0.0


@dataclass(frozen=True)
class WorldConcept(OntologyType):
    scarcity: ScarcityModel = field(default_factory=ScarcityModel)
    transferable: bool = True
    divisible: bool = True
    perishable: bool = False
    perishability_days: int | None = None
    storable: bool = True
    ownable: bool = True
    tradable: bool = True


# Physical
MATERIAL = WorldConcept(id="material", category="physical", scarcity=ScarcityModel(is_renewable=False), description="Raw materials")
PRODUCT = WorldConcept(id="product", category="physical", scarcity=ScarcityModel(replenishment_rate=10), description="Manufactured goods")
FOOD = WorldConcept(id="food", category="physical", scarcity=ScarcityModel(replenishment_rate=100), perishable=True, perishability_days=7, description="Food and beverages")
ENERGY = WorldConcept(id="energy", category="physical", scarcity=ScarcityModel(replenishment_rate=1000), description="Power")
INFRASTRUCTURE = WorldConcept(id="infrastructure", category="physical", scarcity=ScarcityModel(is_renewable=False, replenishment_rate=0.01), transferable=False, divisible=False, description="Physical infrastructure")
VEHICLE = WorldConcept(id="vehicle", category="physical", scarcity=ScarcityModel(replenishment_rate=0.1), divisible=False, description="Transportation")
EQUIPMENT = WorldConcept(id="equipment", category="physical", scarcity=ScarcityModel(replenishment_rate=0.5), description="Tools and machinery")

# Digital
DATA = WorldConcept(id="data", category="digital", scarcity=ScarcityModel(is_depletable=False), perishable=False, description="Information")
SOFTWARE = WorldConcept(id="software", category="digital", scarcity=ScarcityModel(is_depletable=False), description="Software")
NETWORK = WorldConcept(id="network", category="digital", scarcity=ScarcityModel(replenishment_rate=1000), divisible=False, description="Network connectivity")
COMPUTE = WorldConcept(id="compute", category="digital", scarcity=ScarcityModel(replenishment_rate=1000), description="Computational resources")
API_ACCESS = WorldConcept(id="api_access", category="digital", scarcity=ScarcityModel(replenishment_rate=100), description="API access")

# Social
REPUTATION_R = WorldConcept(id="reputation", category="social", scarcity=ScarcityModel(replenishment_rate=0.5), transferable=False, divisible=False, description="Social standing")
TRUST_R = WorldConcept(id="trust", category="social", scarcity=ScarcityModel(replenishment_rate=0.3), transferable=False, divisible=False, description="Willingness to rely on another")
RELATIONSHIP_R = WorldConcept(id="relationship", category="social", scarcity=ScarcityModel(replenishment_rate=0.1), transferable=False, divisible=False, description="Social connection")

ALL_WORLD: dict[str, WorldConcept] = {t.id: t for t in [
    MATERIAL, PRODUCT, FOOD, ENERGY, INFRASTRUCTURE, VEHICLE, EQUIPMENT,
    DATA, SOFTWARE, NETWORK, COMPUTE, API_ACCESS,
    REPUTATION_R, TRUST_R, RELATIONSHIP_R,
]}
