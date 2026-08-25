"""Wave 2 actor ownership and authorization-boundary tests."""

from collections import deque

from src.monkey_brain.kernel.compile import (
    ActorRuntime,
    AuthorizationView,
    AuthorizedAgentView,
    AuthorizedCapabilityView,
    Context,
)


class _Registry:
    def __init__(self):
        self.items = {"visible": object(), "hidden": object()}

    def discover(self, name):
        return self.items.get(name)


def test_actor_runtime_owns_injected_actor_state_and_views():
    decision = lambda action, resource, context: resource != "hidden"
    auth = AuthorizationView(decision)
    queue = deque(["goal-1"])
    resources = {"memory": "actor-memory"}
    execution_context = object()
    identity = object()

    runtime = ActorRuntime(
        "actor-1",
        context=Context(tenant_id="tenant-1"),
        authorization_view=auth,
        capability_registry=_Registry(),
        agent_registry=_Registry(),
        goal_queue=queue,
        resources=resources,
        execution_context=execution_context,
        identity=identity,
    )

    assert runtime.identity is identity
    assert runtime.execution_context is execution_context
    assert runtime.goal_queue is queue
    assert runtime.resources is resources
    assert runtime.memory is runtime.belief
    assert runtime.capabilities.discover("visible") is not None
    assert runtime.capabilities.discover("hidden") is None
    assert runtime.agents.discover("visible") is not None
    assert not hasattr(runtime.capabilities, "_local")


def test_authorized_views_are_read_only_boundaries():
    registry = _Registry()
    view = AuthorizedCapabilityView(registry, AuthorizationView(lambda *_: False))
    assert view.discover("visible") is None
    assert not hasattr(view, "register")
    assert AuthorizedAgentView(registry).discover("visible") is not None
