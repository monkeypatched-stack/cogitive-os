"""Agent — autonomous query handler with capability discovery."""

from broca.agent import Agent, AgentResponse
from broca.registry import BrocaAgentRegistry, get_registry

__version__ = "1.0.0"

__all__ = ["Agent", "AgentResponse", "BrocaAgentRegistry", "get_registry"]
