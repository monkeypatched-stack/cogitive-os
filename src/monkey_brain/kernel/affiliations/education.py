from __future__ import annotations
from dataclasses import dataclass
from .affiliation import Affiliation


@dataclass(frozen=True)
class EducationAffiliation(Affiliation):
    institution: str = ""
    program: str = ""
    degree: str = ""
    status: str = "enrolled"  # "enrolled" | "completed" | "dropped"
