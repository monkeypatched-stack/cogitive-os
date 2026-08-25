"""
Workflow Re-evaluator

High-level orchestrator for the workflow re-evaluation system:
- Coordinates trigger engine, parameter adjuster, queue
- Manages re-evaluation lifecycle
- Tracks success/failure metrics
- Provides monitoring dashboard data
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from services.batch_execution.pipeline_triggers.pipeline_parameter_adjuster import (
    PipelineParameterAdjuster,
)
from services.batch_execution.pipeline_triggers.pipeline_trigger_engine import (
    PipelineTriggerEngine,
    PipelineTriggerRecord,
)
from services.batch_execution.pipeline_triggers.re_evaluation_queue import (
    ReEvaluationQueue,
    ReEvaluationRequest,
)
from services.work_order_agent.tracking.event_system import (
    WorkOrderEventBus,
)
from services.work_order_agent.tracking.time_analysis import (
    WorkOrderTimeAnalysis,
)

logger = logging.getLogger(__name__)


class ReEvaluationMetrics:
    """Metrics for a single re-evaluation."""

    def __init__(self, re_evaluation_id: str):
        self.re_evaluation_id = re_evaluation_id
        self.started_at = datetime.now(timezone.utc)
        self.completed_at: Optional[datetime] = None
        self.success = False
        self.error: Optional[str] = None
        self.variance_analyzed: int = 0
        self.adjustments_applied: int = 0
        self.parameters_updated: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        duration_ms = None
        if self.completed_at:
            duration_ms = (self.completed_at - self.started_at).total_seconds() * 1000

        return {
            "re_evaluation_id": self.re_evaluation_id,
            "started_at": self.started_at.isoformat(),
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "success": self.success,
            "error": self.error,
            "duration_ms": duration_ms,
            "variance_analyzed": self.variance_analyzed,
            "adjustments_applied": self.adjustments_applied,
            "parameters_updated": self.parameters_updated,
        }


class WorkflowReevaluator:
    """
    Orchestrator for workflow re-evaluation system.

    Manages:
    - Event-driven trigger mechanism (via PipelineTriggerEngine)
    - Parameter adjustment and versioning (via PipelineParameterAdjuster)
    - Re-evaluation queue management (via ReEvaluationQueue)
    - Overall lifecycle and metrics
    """

    def __init__(
        self,
        event_bus: WorkOrderEventBus,
        time_analysis: WorkOrderTimeAnalysis,
    ):
        self.event_bus = event_bus
        self.time_analysis = time_analysis

        # Initialize components
        self.parameter_adjuster = PipelineParameterAdjuster()
        self.re_evaluation_queue = ReEvaluationQueue()
        self.trigger_engine = PipelineTriggerEngine(
            event_bus=event_bus,
            time_analysis=time_analysis,
            parameter_adjuster=self.parameter_adjuster,
            re_evaluation_queue=self.re_evaluation_queue,
        )

        # Metrics
        self.re_evaluations: Dict[str, ReEvaluationMetrics] = {}
        self.is_running = False
        self.processor_task: Optional[asyncio.Task] = None

        logger.info("WorkflowReevaluator initialized")

    async def start(self):
        """Start the re-evaluation processor."""
        if self.is_running:
            logger.warning("Workflow re-evaluator already running")
            return

        self.is_running = True
        self.processor_task = asyncio.create_task(self._process_queue_loop())
        logger.info("Workflow re-evaluator started")

    async def stop(self):
        """Stop the re-evaluation processor."""
        self.is_running = False

        if self.processor_task:
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass

        logger.info("Workflow re-evaluator stopped")

    async def _process_queue_loop(self):
        """Main loop for processing re-evaluation queue."""
        logger.info("Re-evaluation processor loop started")

        while self.is_running:
            try:
                # Dequeue up to 5 requests at a time
                requests = self.re_evaluation_queue.dequeue(batch_size=5)

                if not requests:
                    # No pending requests, sleep briefly
                    await asyncio.sleep(1)
                    continue

                # Process each request
                for request in requests:
                    await self._process_re_evaluation_request(request)

                # Sleep briefly between batches
                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                logger.info("Re-evaluation processor loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in re-evaluation processor loop: {e}")
                await asyncio.sleep(2)

    async def _process_re_evaluation_request(self, request: ReEvaluationRequest):
        """Process a single re-evaluation request."""
        re_evaluation_id = f"REEVAL-{uuid4().hex[:12]}"
        metrics = ReEvaluationMetrics(re_evaluation_id)

        try:
            logger.info(
                f"Processing re-evaluation request {request.request_id} "
                f"for {request.work_order_id}"
            )

            # Find corresponding trigger record
            trigger_record = None
            for trigger in self.trigger_engine.trigger_history.values():
                if (
                    trigger.work_order_id == request.work_order_id
                    and trigger.triggered_at
                    and (
                        datetime.now(timezone.utc) - trigger.triggered_at
                    ).total_seconds()
                    < 300  # Within last 5 minutes
                ):
                    trigger_record = trigger
                    break

            if not trigger_record:
                # Create new trigger record if not found
                trigger_record = PipelineTriggerRecord(
                    trigger_id=f"TRIG-{uuid4().hex[:12]}",
                    work_order_id=request.work_order_id,
                    batch_id=request.batch_id,
                    execution_id=request.execution_id,
                    trigger_reason=request.reason,
                    variance_data=request.variance_data,
                )

            # Execute trigger
            result = self.trigger_engine.execute_trigger(
                trigger_record=trigger_record,
                re_evaluation_request=request,
            )

            if result["success"]:
                metrics.success = True
                metrics.adjustments_applied = 1
                metrics.parameters_updated = 1

                # Mark request as processed
                self.re_evaluation_queue.mark_processed(request.request_id, result)

                logger.info(
                    f"Re-evaluation {re_evaluation_id} completed successfully "
                    f"for {request.work_order_id}"
                )
            else:
                metrics.error = result.get("error", "Unknown error")

                # Mark request as failed
                self.re_evaluation_queue.mark_failed(
                    request.request_id,
                    metrics.error,
                    retry=True,
                )

                logger.error(
                    f"Re-evaluation {re_evaluation_id} failed: {metrics.error}"
                )

        except Exception as e:
            logger.error(
                f"Error processing re-evaluation request {request.request_id}: {e}"
            )
            metrics.error = str(e)

            self.re_evaluation_queue.mark_failed(
                request.request_id,
                str(e),
                retry=True,
            )

        finally:
            metrics.completed_at = datetime.now(timezone.utc)
            self.re_evaluations[metrics.re_evaluation_id] = metrics

    async def trigger_manual_re_evaluation(
        self,
        work_order_id: str,
        batch_id: str,
        execution_id: str,
    ) -> str:
        """
        Manually trigger a re-evaluation (non-async wrapper).

        Returns the trigger ID.
        """
        from services.batch_execution.pipeline_triggers.re_evaluation_queue import (
            ReEvaluationPriority,
            ReEvaluationReason,
        )

        request_id = f"MANUAL-{uuid4().hex[:8]}"
        triggered = self.trigger_engine.trigger_re_evaluation(
            work_order_id=work_order_id,
            batch_id=batch_id,
            execution_id=execution_id,
            reason=ReEvaluationReason.MANUAL_TRIGGER,
            priority=ReEvaluationPriority.MEDIUM,
            variance_data={
                "manual": True,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        if triggered:
            logger.info(f"Manual re-evaluation triggered for {work_order_id}")
            return request_id
        else:
            logger.warning(f"Manual re-evaluation trigger failed for {work_order_id}")
            raise Exception("Failed to trigger re-evaluation (throttled or queue full)")

    def get_dashboard_data(self) -> Dict[str, Any]:
        """Get data for monitoring dashboard."""
        recent_re_evaluations = sorted(
            self.re_evaluations.values(),
            key=lambda m: m.started_at,
            reverse=True,
        )[:20]

        successful_re_evals = sum(1 for m in self.re_evaluations.values() if m.success)
        failed_re_evals = sum(
            1 for m in self.re_evaluations.values() if m.error is not None
        )

        return {
            "status": "running" if self.is_running else "stopped",
            "queue_status": self.re_evaluation_queue.get_metrics(),
            "trigger_engine_metrics": self.trigger_engine.get_metrics(),
            "parameter_adjuster_summary": self.parameter_adjuster.get_summary(),
            "re_evaluation_stats": {
                "total": len(self.re_evaluations),
                "successful": successful_re_evals,
                "failed": failed_re_evals,
                "success_rate": (
                    f"{(successful_re_evals / len(self.re_evaluations) * 100):.1f}%"
                    if self.re_evaluations
                    else "0%"
                ),
            },
            "recent_re_evaluations": [m.to_dict() for m in recent_re_evaluations],
        }

    def get_work_order_summary(self, work_order_id: str) -> Dict[str, Any]:
        """Get re-evaluation summary for a specific work order."""
        triggers = self.trigger_engine.get_trigger_history(
            work_order_id=work_order_id,
            limit=100,
        )

        re_evals = [
            m
            for m in self.re_evaluations.values()
            if any(t.work_order_id == work_order_id for t in triggers)
        ]

        return {
            "work_order_id": work_order_id,
            "total_triggers": len(triggers),
            "total_re_evaluations": len(re_evals),
            "success_rate": self.trigger_engine.get_success_rate(
                work_order_id=work_order_id
            ),
            "recent_triggers": [t.to_dict() for t in triggers[:10]],
            "recent_re_evaluations": [m.to_dict() for m in re_evals[-5:]],
        }

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get comprehensive metrics summary."""
        trigger_metrics = self.trigger_engine.get_metrics()
        queue_metrics = self.re_evaluation_queue.get_metrics()
        adjuster_summary = self.parameter_adjuster.get_summary()

        total_re_evals = len(self.re_evaluations)
        successful_re_evals = sum(1 for m in self.re_evaluations.values() if m.success)

        return {
            "system_status": "running" if self.is_running else "stopped",
            "trigger_engine": trigger_metrics,
            "re_evaluation_queue": queue_metrics,
            "parameter_adjuster": adjuster_summary,
            "re_evaluations": {
                "total": total_re_evals,
                "successful": successful_re_evals,
                "failed": total_re_evals - successful_re_evals,
                "success_rate": (
                    f"{(successful_re_evals / total_re_evals * 100):.1f}%"
                    if total_re_evals > 0
                    else "0%"
                ),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "status": "running" if self.is_running else "stopped",
            "dashboard_data": self.get_dashboard_data(),
            "metrics_summary": self.get_metrics_summary(),
        }
