from __future__ import annotations

import re

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion
from src.monkey_brain.kernel.plan.parser.rules import PROJECTION_ALIASES


def _clean_token(token: str) -> str:
    return re.sub(r"[^\w-]+", "", token).lower()


def extract_projections(tokenized: TokenizedQuestion) -> list[str]:
    seen: set[str] = set()
    projections: list[str] = []

    for token in tokenized.tokens:
        canonical = PROJECTION_ALIASES.get(_clean_token(token))
        if canonical is not None and canonical not in seen:
            seen.add(canonical)
            projections.append(canonical)

    for lemma in tokenized.lemmas:
        canonical = PROJECTION_ALIASES.get(_clean_token(lemma))
        if canonical is not None and canonical not in seen:
            seen.add(canonical)
            projections.append(canonical)

    for alias, canonical in PROJECTION_ALIASES.items():
        if len(alias) <= 3:
            continue
        if re.search(rf"\b{re.escape(alias)}\b", tokenized.normalized) and canonical not in seen:
            seen.add(canonical)
            projections.append(canonical)

    return projections
