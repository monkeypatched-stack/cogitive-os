"""Runtime dependencies."""

from fastapi import Request


def get_runtime(request: Request):
    """Get the Wolverine capability Runtime — now owned by CognitiveRuntime."""
    return request.app.state.cognitive_runtime.wolverine
