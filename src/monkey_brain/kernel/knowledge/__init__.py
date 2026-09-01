"""External knowledge retrieval for CognitiveOS prompt/context construction."""

from .external_context import ExternalKnowledgeItem, KnowledgeRetrievalReport
from .sittingface_retrieval import (
    SittingFaceKnowledgeRetriever,
    get_external_knowledge_retriever,
    should_retrieve_external_knowledge,
)

__all__ = [
    "ExternalKnowledgeItem",
    "KnowledgeRetrievalReport",
    "SittingFaceKnowledgeRetriever",
    "get_external_knowledge_retriever",
    "should_retrieve_external_knowledge",
]
