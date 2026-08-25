"""Intent helpers."""

from typing import Any


def clean_user_answer_for_question(answer: str, question: str) -> str:
    return answer


def semantic_hit_citation(hit: Any) -> str:
    return f"{hit.get('collection', '')}:{hit.get('document_id', '')}" if isinstance(hit, dict) else ""
