from __future__ import annotations

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion
from src.monkey_brain.kernel.plan.parser.ast import Filter
from src.monkey_brain.kernel.plan.parser.rules import TIME_FILTER_PHRASES


def extract_time_filters(tokenized: TokenizedQuestion) -> list[Filter]:
    filters: list[Filter] = []
    normalized = tokenized.normalized

    for phrase, value in TIME_FILTER_PHRASES:
        if phrase in normalized:
            filters.append(Filter(field="time", operator="=", value=value))

    return filters
