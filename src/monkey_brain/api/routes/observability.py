"""Observability router — unified metrics, dashboards, and analytical triggers.

All endpoints require authentication via require_permission.

/observability           — full observability snapshot (metrics + dashboard + health)
/observability/triggers  — analytical trigger findings
/observability/{panel}   — layer-specific dashboard
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from src.monkey_brain.api.dependencies import require_permission

logger = logging.getLogger("agentos.observability")

router = APIRouter()


def _get_lemon(request: Request):
    lemon = getattr(request.app.state, "lemon", None)
    if not lemon:
        return None
    return lemon


@router.get("/observability", tags=["Observability"])
async def get_observability(
    request: Request,
    user_id: str = Depends(require_permission("perm-view-observability")),
):
    """Full observability snapshot: metrics + dashboard + health + alerts.

    Single entry point for all observability data. Replaces the former
    separate /metrics and /observability endpoints.
    """
    lemon = _get_lemon(request)
    if not lemon:
        return JSONResponse(status_code=503, content={"error": "Lemon not initialized"})
    try:
        return lemon.export()
    except Exception as e:
        logger.error("Observability export failed: %s", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/observability/triggers", tags=["Observability"])
async def trigger_dashboard(
    request: Request,
    n: int = 20,
    user_id: str = Depends(require_permission("perm-view-observability")),
):
    """Analytical trigger findings: shadow_capability, convergence_delay, context_drift.

    Query params:
      n — how many recent findings to return (default 20)
    """
    lemon = _get_lemon(request)
    if not lemon:
        return JSONResponse(status_code=503, content={"error": "Lemon not initialized"})
    return {
        "summary": lemon.triggers.summary(),
        "recent_findings": lemon.triggers.history(n),
    }


@router.get("/observability/{panel}", tags=["Observability"])
async def cognitive_dashboard(
    request: Request,
    panel: str,
    user_id: str = Depends(require_permission("perm-view-observability")),
):
    """Cognitive observability dashboard for a specific layer.

    panel: intent | agent | workload | world_model | governance | learning | all
    """
    lemon = _get_lemon(request)
    if not lemon:
        return JSONResponse(status_code=503, content={"error": "Lemon not initialized"})
    return lemon.dashboard(panel)
