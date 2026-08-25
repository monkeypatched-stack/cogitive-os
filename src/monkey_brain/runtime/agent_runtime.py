"""Canonical Agent Runtime name for the existing orchestration middleware.

AgentMiddleware already owns discovery, routing, policy, retries, and
provider orchestration. This adapter preserves its implementation and public
behavior while exposing the architecture-facing name.
"""

from src.monkey_brain.runtime.agent_middleware import AgentMiddleware

AgentRuntime = AgentMiddleware

__all__ = ["AgentMiddleware", "AgentRuntime"]
