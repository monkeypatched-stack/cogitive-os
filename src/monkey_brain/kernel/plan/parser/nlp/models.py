from dataclasses import dataclass


@dataclass(slots=True)
class TokenizedQuestion:
    raw: str
    normalized: str
    tokens: list[str]
    lemmas: list[str]
    entities: list[str]
