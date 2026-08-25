"""Workload factory — build Workload objects from workflow candidates and goals.

Two distinct concepts:
  create_default_workflow_candidate — used during planning (policy.select phase);
      returns a WorkflowCandidate that the policy can rank against LLM-generated ones.
  create_default_workload — ultimate fallback; returns a Workload directly,
      bypassing the policy, when all candidate generation has failed.
"""

from __future__ import annotations

import copy
import logging
import uuid
from typing import Any

logger = logging.getLogger("agentos.executor")

_DEFAULT_ESTIMATED_COST = 0.5
_DEFAULT_ESTIMATED_LATENCY_MS = 100

# Templates are copied on every call (see _steps_for_goal) so callers cannot
# mutate the module-level originals.
_STEP_TEMPLATES: dict[str, list[dict]] = {
    "batch": [
        {"capability": "entity_resolver", "inputs": ["question"]},
        {"capability": "batch_retriever", "inputs": ["entities"]},
        {"capability": "answer_generator", "inputs": ["batch_data"]},
    ],
    "work_order": [
        {"capability": "entity_resolver", "inputs": ["question"]},
        {"capability": "work_order_retriever", "inputs": ["entities"]},
        {"capability": "answer_generator", "inputs": ["work_order_data"]},
    ],
}
_DEFAULT_STEPS: list[dict] = [
    {"capability": "entity_resolver", "inputs": ["question"]},
    {"capability": "knowledge_retriever", "inputs": ["entities"]},
    {"capability": "answer_generator", "inputs": ["knowledge_graph"]},
]


def _steps_for_goal(goal_name: str) -> list[dict]:
    """Return a fresh copy of the step list for this goal name."""
    goal_lower = goal_name.lower()
    template = next(
        (v for k, v in _STEP_TEMPLATES.items() if k in goal_lower),
        _DEFAULT_STEPS,
    )
    return copy.deepcopy(template)


def create_default_workflow_candidate(goal: Any) -> Any:
    """WorkflowCandidate for the planning phase — used as simulation fallback."""
    from src.monkey_brain.kernel.execute.provider.llm_explorer import WorkflowCandidate

    return WorkflowCandidate(
        name=f"default_{goal.name}",
        description=f"Default workflow for {goal.name}",
        steps=_steps_for_goal(goal.name),
        estimated_cost=_DEFAULT_ESTIMATED_COST,
        estimated_latency_ms=_DEFAULT_ESTIMATED_LATENCY_MS,
    )


def create_workload_from_workflow_candidate(candidate: Any, goal: Any) -> Any:
    """Convert a WorkflowCandidate into an executable Workload."""
    from src.monkey_brain.kernel.plan.workload.workload import Workload, WorkloadStep

    steps = [
        WorkloadStep(
            capability_name=s["capability"],
            inputs=s.get("inputs", []),
            outputs=[],
            metadata={"workflow": candidate.name, "intent": goal.name},
        )
        for s in candidate.steps
    ]
    return Workload(
        workload_id=f"{candidate.name}_{uuid.uuid4().hex[:8]}",
        steps=steps,
        metadata={
            "goal_id": goal.goal_id,
            "goal_type": goal.goal_type,
            "intent": goal.name,
            "workflow_source": candidate.source,
            "estimated_cost": candidate.estimated_cost,
            "estimated_latency_ms": candidate.estimated_latency_ms,
        },
    )


def create_default_workload(goal: Any) -> Any:
    """Direct Workload fallback — used when policy/candidate selection has failed entirely."""
    from src.monkey_brain.kernel.plan.workload.workload import Workload, WorkloadStep

    steps = [
        WorkloadStep(
            capability_name=s["capability"],
            inputs=s.get("inputs", []),
            outputs=[],
            metadata={"intent": goal.name},
        )
        for s in _steps_for_goal(goal.name)
    ]
    return Workload(
        workload_id=f"default_{goal.name}_{uuid.uuid4().hex[:8]}",
        steps=steps,
        metadata={"goal_id": goal.goal_id, "intent": goal.name, "source": "fallback"},
    )
