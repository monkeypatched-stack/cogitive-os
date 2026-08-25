"""Domain Packages — DDD as Executable Cognitive Abstractions.

Every DDD construct is an active cognitive agent with
Perceive → Reason → Act → Learn capabilities.

Exports:
- CognitiveAgent (base class)
- DomainAgent, BoundedContextAgent, AggregateAgent, EntityAgent
- ValueObjectAgent, PolicyAgent, RepositoryAgent, FactoryAgent, EventAgent
- DomainServiceAgent
- DomainPackage, DomainRegistry, DomainEvidenceAdapter
- PromptCompiler
"""

from domains.package import (
    CognitiveAgent,
    DomainAgent,
    BoundedContextAgent,
    AggregateAgent,
    EntityAgent,
    ValueObjectAgent,
    PolicyAgent,
    RepositoryAgent,
    FactoryAgent,
    EventAgent,
    DomainServiceAgent,
    DomainPackage,
    DomainRegistry,
    DomainEvidenceAdapter,
)

from domains.compiler import PromptCompiler, CompiledPrompt

__all__ = [
    "CognitiveAgent",
    "DomainAgent",
    "BoundedContextAgent",
    "AggregateAgent",
    "EntityAgent",
    "ValueObjectAgent",
    "PolicyAgent",
    "RepositoryAgent",
    "FactoryAgent",
    "EventAgent",
    "DomainServiceAgent",
    "DomainPackage",
    "DomainRegistry",
    "DomainEvidenceAdapter",
    "PromptCompiler",
    "CompiledPrompt",
]
