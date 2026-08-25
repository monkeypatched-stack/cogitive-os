from __future__ import annotations

from src.monkey_brain.kernel.plan.parser.nlp.models import TokenizedQuestion
from src.monkey_brain.kernel.plan.parser.rules import (
    CANONICAL_VERBS,
    DEFAULT_VERB,
    INTERROGATIVE_LEMMAS,
    VERB_ALIASES,
)


def extract_verb(tokenized: TokenizedQuestion) -> str:
    for token in tokenized.tokens:
        canonical = VERB_ALIASES.get(token.lower())
        if canonical is not None:
            return canonical

    for lemma in tokenized.lemmas:
        if lemma in CANONICAL_VERBS:
            return lemma
        canonical = VERB_ALIASES.get(lemma)
        if canonical is not None:
            return canonical

    if tokenized.lemmas and tokenized.lemmas[0] in INTERROGATIVE_LEMMAS:
        return DEFAULT_VERB

    if any(lemma in INTERROGATIVE_LEMMAS for lemma in tokenized.lemmas[:3]):
        return DEFAULT_VERB

    return DEFAULT_VERB
