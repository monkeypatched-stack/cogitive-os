from __future__ import annotations

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion
from src.monkey_brain.kernel.plan.parser.ast import EntityRef
from src.monkey_brain.kernel.plan.parser.rules import ENTITY_PATTERNS


def extract_entities(tokenized: TokenizedQuestion) -> list[EntityRef]:
    seen: set[tuple[str, str]] = set()
    entities: list[EntityRef] = []

    for entity_type, pattern in ENTITY_PATTERNS:
        for match in pattern.finditer(tokenized.raw):
            value = match.group(0)
            key = (entity_type, value.lower())
            if key in seen:
                continue
            seen.add(key)
            entities.append(EntityRef(type=entity_type, value=value))

    return entities
