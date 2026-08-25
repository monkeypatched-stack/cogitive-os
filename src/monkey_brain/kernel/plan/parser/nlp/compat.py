from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion

F = TypeVar("F", bound=Callable[[str], bool])


def question_text(question: str | TokenizedQuestion) -> str:
    if isinstance(question, TokenizedQuestion):
        return question.normalized
    return question


def adapt_predicate(predicate: F) -> Callable[[str | TokenizedQuestion], bool]:
    """Wrap a str-only predicate so it also accepts TokenizedQuestion."""

    def adapted(question: str | TokenizedQuestion) -> bool:
        return predicate(question_text(question))

    return adapted
