"""Prompt API routes.

Prompt execution is deliberately a thin adapter over ``PlanetaryRuntime``.
The planetary runtime owns actor/society/geography resolution, recursive
traversal, context/world updates, and actor coordination.  Keeping that
boundary here prevents HTTP requests from creating a second execution path.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import asdict, is_dataclass
from typing import Any

from fastapi import APIRouter, Depends, Request

from src.monkey_brain.api.dependencies import require_permission
from src.monkey_brain.api.idempotency import idempotent
from src.monkey_brain.api.helpers.healing_helpers import reset_cooldown, run_post_workload
from src.monkey_brain.api.helpers.prompt_helpers import resolve_run_type, validate_propagation_scope
from src.monkey_brain.api.helpers.stability_helpers import check_stability
from src.monkey_brain.kernel.plan.intents.predicates.self_healing_workload import is_self_healing_question
from src.monkey_brain.kernel.plan.intents.predicates.sittingface_workload import is_sittingface_workload_question
from src.monkey_brain.runtime.routers import get_mongo_client
from src.monkey_brain.kernel.models import PromptRequest, PromptResponse, _RequestErrorCapture

logger = logging.getLogger("agentos.prompt")
router = APIRouter()
_background_tasks: set[asyncio.Task] = set()


def _on_task_done(task: asyncio.Task) -> None:
    _background_tasks.discard(task)
    if not task.cancelled() and task.exception() is not None:
        logger.error("[prompt] background workload failed: %s", task.exception())


def _result_value(result: Any) -> Any:
    if is_dataclass(result):
        return asdict(result)
    if isinstance(result, dict):
        return result
    return getattr(result, "__dict__", result)


def _actor_query_result(question: str, actor_id: str, result: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Adapt the scheduler's actor result to the existing prompt response shape."""
    value = _result_value(result)
    actions = value.get("actions", []) if isinstance(value, dict) else []
    outcome = value.get("actual_outcome", {}) if isinstance(value, dict) else {}
    achieved = bool(outcome.get("goal_achieved", False)) if isinstance(outcome, dict) else False
    answer = f"{question} executed through the planetary cycle"
    if achieved:
        answer += " successfully"

    # Real gap this closes: RespondToInquiryCapability (kernel/domains/
    # grocery.py) is Autonomous Dialogue's termination signal — its own
    # docstring says "An orchestrator watches for this action name to know
    # the conversation is over" and parameters["answer"] is the real,
    # planner-written natural-language answer to whoever asked the original
    # question. But this — the actual HTTP-facing orchestrator a caller's
    # answer comes back through — never watched for it at all: `answer`
    # above was always this generic "executed through the planetary cycle"
    # string, silently discarding the real answer every time (confirmed
    # live, repeatedly, across this session's own /prompt calls). plan.steps
    # and actions are parallel, same-order lists (one action per step) —
    # cross-reference by index to find which action, if any, was a
    # successful RespondToInquiry step, and surface ITS real answer instead.
    plan_steps = value.get("plan", {}).get("steps", []) if isinstance(value, dict) else []
    for index, action in enumerate(actions):
        if not isinstance(action, dict) or index >= len(plan_steps):
            continue
        step = plan_steps[index]
        step_action = step.get("action") if isinstance(step, dict) else None
        if step_action == "RespondToInquiry" and action.get("success"):
            respond_answer = (action.get("result") or {}).get("answer")
            if respond_answer:
                answer = respond_answer

    query_result = {
        "question": question,
        "answer": answer,
        "semantic_hits": [],
        "graph_paths": [],
        "citations": [],
        "llm_answered": True,
        "actor_id": actor_id,
        "actor_execution": value,
    }
    business_flow = {
        "question": question,
        "actor": actor_id,
        "flow": [
            {
                "step": index + 1,
                "action": action.get("action_id", f"action-{index + 1}") if isinstance(action, dict) else str(action),
                "result": action.get("result") if isinstance(action, dict) else None,
                "success": action.get("success") if isinstance(action, dict) else None,
            }
            for index, action in enumerate(actions)
        ],
        "result": {
            "actions_taken": len(actions),
            "goal_achieved": achieved,
        },
    }
    return query_result, business_flow


@router.post("/prompt")
@idempotent("prompt.execute")
async def unified_prompt(
    request: Request,
    payload: PromptRequest,
    mongo_client: Any = Depends(get_mongo_client),
    user_id: str = Depends(require_permission("perm-execute-prompt")),
) -> PromptResponse:
    """Execute one prompt as the requesting actor's next planetary tick."""

    started = time.monotonic()

    # Determine the run type and max healing level for this prompt execution.
    run_type, max_healing = resolve_run_type(payload)

    # get the propagation scope
    validate_propagation_scope(payload)

    # Set up a logging capture to collect any errors that occur during execution.
    capture = _RequestErrorCapture()
    root_logger = logging.getLogger()
    root_logger.addHandler(capture)
    query_result: dict[str, Any] | None = None
    business_flow: dict[str, Any] | None = None

    try:
        # get the planetary runtime to run the cycle this is inti on app boot and is used to run the planetary cycle 
        # for the actor. this is the world level runtime
        # the planetary runtime takes care of
            # 1. actor/society/geography resolution,
            # 2. recursive traversal,
            # 3. context/world updates,
            # 4. and actor coordination
        # the planetary runtime acts as a controller for actor scheduling and execution
        planetary_runtime = getattr(request.app.state, "planetary_runtime", None)
        if planetary_runtime is None:
            raise RuntimeError("PlanetaryRuntime is not booted")

        # validate the world state before executing the promptok fix the
        import os
        if os.getenv("WORLD_VALIDATION_GATE_EXECUTE", "true").strip().lower() != "false":
            from src.monkey_brain.kernel.validation.world_validator import validate_world

            # validate the world before execution
            _report = validate_world(planetary_runtime, actor_id=user_id)
            if not _report["ok"]:
                raise RuntimeError(
                    f"world validation failed ({_report['violation_count']} violations across "
                    f"categories {_report['categories']}) — refusing to execute"
                )

        # on getting the  world validation result we have to create a local copy of the worlds state as the belief state of the actor and then we have to run the
        # prompt on that local copy of the world state and then we have to update the world state with the result of the prompt execution.
        # This is to ensure that the world state is not modified by the prompt execution and that the world state is consistent across all actors.
        planetary_runtime.restore_actor_belief(user_id)

        # execute the actor requests recieved from the planetary runtime
        actor_result = await planetary_runtime.execute_actor_request(user_id, payload)
        
        # checkpont the local belief for the actor after the execution of the actor request
        planetary_runtime.checkpoint_actor_belief(user_id)

        # Adapt the scheduler's actor result to the existing prompt response shape.
        query_result, business_flow = _actor_query_result(payload.question, user_id, actor_result)

    except Exception as exc:
        logger.error("[prompt] planetary execution failed: %s", exc)
        query_result = {
            "question": payload.question,
            "answer": f"Error: {exc}",
            "semantic_hits": [],
            "graph_paths": [],
            "citations": [],
            "llm_answered": False,
        }
    finally:
        root_logger.removeHandler(capture)

    elapsed_ms = (time.monotonic() - started) * 1000

    # SittingFace workload questions get their post-execution healing/answer pass
    # kicked off in the background, after the actor request has actually run.
    if (is_sittingface_workload_question(payload.question)
            and not is_self_healing_question(payload.question)
            and run_type not in {"healing", "stability"}):
        task = asyncio.create_task(run_post_workload(
            question=payload.question,
            error_lines=list(capture.lines),
            mongo_client=mongo_client,
            run_type=run_type,
            max_healing=max_healing,
        ))
        _background_tasks.add(task)
        task.add_done_callback(_on_task_done)

    return PromptResponse(
        question=payload.question,
        query_result=query_result,
        business_flow=business_flow,
        execution_summary={
            "total_execution_time_ms": f"{elapsed_ms:.2f}",
            "endpoints_called": ["planetary_runtime.execute_actor_request"],
            "error_count": len(capture.lines),
            "run_type": run_type,
        },
        error_lines=capture.lines,
    )


@router.get("/prompt/health")
async def prompt_health() -> dict[str, Any]:
    return {"status": "healthy", "service": "unified-prompt"}


@router.get("/prompt/stability")
async def get_stability_status(user_id: str = Depends(require_permission("perm-view-stability"))) -> dict[str, Any]:
    return check_stability()


@router.post("/prompt/reset")
@idempotent("prompt.reset_workload")
async def reset_workload(user_id: str = Depends(require_permission("perm-reset-workload"))) -> dict[str, Any]:
    reset_cooldown()
    return {"status": "reset"}


@router.post("/prompt/cicd")
@idempotent("prompt.cicd_prompt")
async def cicd_prompt(
    request: Request,
    payload: PromptRequest,
    mongo_client: Any = Depends(get_mongo_client),
    user_id: str = Depends(require_permission("perm-execute-prompt")),
) -> dict[str, Any]:
    response = await unified_prompt(request, payload, mongo_client, user_id)
    return {
        **response.model_dump(),
        "cicd_metadata": {
            "workload_stage": "prompt_execution",
            "run_type": resolve_run_type(payload)[0],
            "orchestration": {"planetary_runtime": True},
        },
    }
