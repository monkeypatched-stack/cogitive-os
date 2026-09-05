"""Human approval / pause / resume — the generic execution state machine's
real API surface (Qualification Gap Closure, Phase 3).

GET  /executions/{execution_id}/pending-approval — inspect
POST /executions/{execution_id}/approve          — approve/reject and
                                                    resume the SAME
                                                    execution
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.monkey_brain.api.dependencies import require_permission
from src.monkey_brain.api.idempotency import idempotent
from src.monkey_brain.kernel.models.prompt import PromptRequest
from src.monkey_brain.kernel.pipeline.approval_store import (
    load_pending_approval, resolve_pending_approval,
)

logger = logging.getLogger("agentos.gateway.approval")
router = APIRouter()


def _get_planetary_runtime(request: Request) -> Any:
    selector = getattr(getattr(request.app.state, "kernel", None), "runtime_selector", None)
    if selector is not None:
        try:
            return selector.select("planetary")
        except LookupError:
            logger.debug("_get_planetary_runtime: suppressed exception", exc_info=True)
    return getattr(request.app.state, "planetary_runtime", None)


class ApprovalDecisionRequest(BaseModel):
    approved: bool


@router.get("/executions/{execution_id}/pending-approval", tags=["Approval"])
async def get_pending_approval(
    execution_id: str,
    user_id: str = Depends(require_permission("perm-view-learn")),
) -> dict[str, Any]:
    """Real, read-only inspection of a paused execution — what capability
    proposed what, and why, so a real approval decision can be made with
    full context rather than a bare yes/no."""
    pending = load_pending_approval(execution_id)
    if pending is None:
        raise HTTPException(status_code=404, detail=f"no pending approval for execution {execution_id!r}")
    return pending.to_dict()


@router.post("/executions/{execution_id}/approve", tags=["Approval"])
@idempotent("approval.approve_pending_execution")
async def approve_pending_execution(
    execution_id: str,
    body: ApprovalDecisionRequest,
    request: Request,
    user_id: str = Depends(require_permission("perm-execute-prompt")),
) -> dict[str, Any]:
    """Records the real human decision, then resumes the exact same
    execution via the real, already-proven meta.resume_execution_id
    mechanism (kernel/compile/cognitive_actor.py, Phase 3's checkpoint/
    restart infrastructure) — never a new, unrelated task. The resumed
    tick's own real result (completed, with the approved substitution or
    an honest rejection failure) is returned directly, not a synthetic
    "ok" acknowledgement."""
    pending = load_pending_approval(execution_id)
    if pending is None:
        raise HTTPException(status_code=404, detail=f"no pending approval for execution {execution_id!r}")
    if not pending.actor_id:
        raise HTTPException(status_code=500, detail=f"pending approval for {execution_id!r} has no actor_id on record")

    resolve_pending_approval(execution_id, body.approved)

    pr = _get_planetary_runtime(request)
    if pr is None:
        raise HTTPException(status_code=503, detail="PlanetaryRuntime not available")

    # Qualification Gap Closure, Phase 9 fix: reuse the REAL original
    # prompt text, not a generic placeholder -- belief_runtime.py::
    # _generate_plan only reuses the checkpointed plan when the request's
    # own question parses to a real goal (has_goal); a placeholder like
    # "resume this" doesn't, which silently produced an empty, goal-less
    # plan that PlanValidator then rejected outright
    # ("plan_has_no_goal") before the checkpoint was ever reached — found
    # by live-testing this exact resume path end-to-end, not by any of
    # this session's own executor-level unit tests (which bypass
    # belief_runtime.py's planning stage entirely).
    prompt_request = PromptRequest(
        question=pending.original_question or "Resume after a real human approval decision.",
        meta={"resume_execution_id": execution_id},
    )
    pr.restore_actor_belief(pending.actor_id)
    result = await pr.execute_actor_request(pending.actor_id, prompt_request)
    pr.checkpoint_actor_belief(pending.actor_id)

    # Reuse api/routes/prompt.py's own real result-adaptation (the exact
    # same shape a normal /prompt response uses) rather than returning
    # PlanetaryRuntime's internal result object directly.
    from src.monkey_brain.api.routes.prompt import _actor_query_result
    query_result, business_flow = _actor_query_result(prompt_request.question, pending.actor_id, result)

    return {
        "execution_id": execution_id, "approved": body.approved,
        "actor_id": pending.actor_id,
        "query_result": query_result, "business_flow": business_flow,
    }
