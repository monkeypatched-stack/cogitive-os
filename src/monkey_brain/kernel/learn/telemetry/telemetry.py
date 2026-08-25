"""Per-request profiling primitives used by API route handlers.

profile_start() / profile_add() / profile_end() track named latency segments
inside a single request and return them as ProfileEntry objects for inclusion
in response metadata.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

_local = threading.local()


@dataclass
class ProfileEntry:
    name: str
    ms: int

    def to_dict(self) -> dict:
        return {"name": self.name, "ms": self.ms}


def profile_start() -> None:
    _local.entries = []


def profile_add(name: str, *, ms: int) -> None:
    if not hasattr(_local, "entries"):
        _local.entries = []
    _local.entries.append(ProfileEntry(name=name, ms=ms))


def profile_end() -> list[ProfileEntry]:
    entries = getattr(_local, "entries", [])
    _local.entries = []
    return entries
