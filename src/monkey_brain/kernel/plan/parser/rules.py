from __future__ import annotations

import re
from re import Pattern

CANONICAL_VERBS = frozenset(
    {
        "query",
        "create",
        "update",
        "delete",
        "analyze",
        "schedule",
        "approve",
        "reject",
    }
)

VERB_ALIASES: dict[str, str] = {
    "show": "query",
    "list": "query",
    "find": "query",
    "get": "query",
    "fetch": "query",
    "display": "query",
    "tell": "query",
    "create": "create",
    "add": "create",
    "update": "update",
    "modify": "update",
    "change": "update",
    "delete": "delete",
    "remove": "delete",
    "analyze": "analyze",
    "compare": "analyze",
    "schedule": "schedule",
    "approve": "approve",
    "reject": "reject",
}

INTERROGATIVE_LEMMAS = frozenset({"what", "which", "how", "when", "where", "who"})

DEFAULT_VERB = "query"

PROJECTION_ALIASES: dict[str, str] = {
    "oee": "oee",
    "mtbf": "mtbf",
    "mttr": "mttr",
    "yield": "yield",
    "downtime": "downtime",
    "availability": "availability",
    "performance": "performance",
    "quality": "quality",
}

TIME_FILTER_PHRASES: tuple[tuple[str, str], ...] = (
    ("this week", "this week"),
    ("last week", "last week"),
    ("this month", "this month"),
    ("last month", "last month"),
    ("yesterday", "yesterday"),
    ("today", "today"),
)

ENTITY_PATTERNS: tuple[tuple[str, Pattern[str]], ...] = (
    ("work_order", re.compile(r"\bWO-\d+\b", re.IGNORECASE)),
    ("purchase_order", re.compile(r"\bPO-\d+\b", re.IGNORECASE)),
    ("batch", re.compile(r"\bBatch-\d+\b", re.IGNORECASE)),
    ("document", re.compile(r"\bSOP-\d+\b", re.IGNORECASE)),
    ("document", re.compile(r"\bBMR-\d+\b", re.IGNORECASE)),
    ("pump", re.compile(r"\bPump-\d+\b", re.IGNORECASE)),
    ("motor", re.compile(r"\bMotor-\d+\b", re.IGNORECASE)),
    ("line", re.compile(r"\bLine-\d+\b", re.IGNORECASE)),
    ("machine", re.compile(r"\bMachine-\d+\b", re.IGNORECASE)),
)
