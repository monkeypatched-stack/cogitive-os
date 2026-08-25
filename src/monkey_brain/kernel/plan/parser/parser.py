from __future__ import annotations

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion
from src.monkey_brain.kernel.plan.parser.ast import EntityRef, IntentAST
from src.monkey_brain.kernel.plan.parser.extractors import (
    extract_entities,
    extract_projections,
    extract_time_filters,
    extract_verb,
)

ASSET_ENTITY_TYPES = frozenset({"line", "pump", "motor", "machine"})
DOCUMENT_ENTITY_TYPES = frozenset({"document"})


def infer_target(
    *,
    entities: list[EntityRef],
    projections: list[str],
) -> str | None:
    if projections:
        return "metric"

    entity_types = {entity.type for entity in entities}
    if "work_order" in entity_types:
        return "work_order"
    if "purchase_order" in entity_types:
        return "purchase_order"
    if "batch" in entity_types:
        return "batch"
    if entity_types & DOCUMENT_ENTITY_TYPES:
        return "document"
    if entity_types & ASSET_ENTITY_TYPES:
        return "asset"

    return None


def parse_question(tokenized: TokenizedQuestion) -> IntentAST:
    entities = extract_entities(tokenized)
    projections = extract_projections(tokenized)
    filters = extract_time_filters(tokenized)
    verb = extract_verb(tokenized)
    target = infer_target(entities=entities, projections=projections)

    return IntentAST(
        raw_query=tokenized.raw,
        verb=verb,
        target=target,
        entities=entities,
        filters=filters,
        projections=projections,
        metadata={
            "normalized": tokenized.normalized,
            "token_count": len(tokenized.tokens),
        },
    )
