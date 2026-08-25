"""
Pipeline Trigger Engine

Listens to work order events and manages workflow re-evaluation:
- Event listener for WorkOrderEventBus
- Determines when to retrigger pipeline
- Executes re-evaluation with adjusted parameters
- Prevents cascading triggers (throttling/deduplication)
- Tracks trigger history
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from services.batch_execution.pipeline_triggers.pipeline_parameter_adjuster import (
    PipelineParameterAdjuster,
)
from services.batch_execution.pipeline_triggers.re_evaluation_queue import (
    ReEvaluationPriority,
    ReEvaluationQueue,
    ReEvaluationReason,
    ReEvaluationRequest,
)
from services.work_order_agent.tracking.event_system import (
    WorkOrderEvent,
    WorkOrderEventBus,
    WorkOrderEventType,
)
from services.work_order_agent.tracking.time_analysis import (
    TimeVariance,
    VarianceType,
    WorkOrderTimeAnalysis,
)

logger = logging.getLogger(__name__)


class TriggerThrottlePolicy:
    """Throttling policy to prevent cascading retriggers."""

    def __init__(
        self,
        min_time_between_triggers_seconds: int = 300,  # 5 minutes
        max_triggers_per_work_order: int = 3,
        max_triggers_per_batch: int = 10,
    ):
        self.min_time_between_triggers_seconds = min_time_between_triggers_seconds
        self.max_triggers_per_work_order = max_triggers_per_work_order
        self.max_triggers_per_batch = max_triggers_per_batch
        self.last_trigger_times: Dict[str, datetime] = {}
        self.trigger_counts: Dict[str, int] = {}

    def can_trigger(
        self, work_order_id: str, batch_id: str
    ) -> tuple[bool, Optional[str]]:
        """Check if trigger is allowed based on policy."""
        now = datetime.now(timezone.utc)

        # Check time-based throttling
        if work_order_id in self.last_trigger_times:
            last_trigger = self.last_trigger_times[work_order_id]
            time_since_last = (now - last_trigger).total_seconds()
            if time_since_last < self.min_time_between_triggers_seconds:
                remaining = self.min_time_between_triggers_seconds - time_since_last
                return False, f"Throttled: {remaining:.0f}s until next trigger allowed"

        # Check max triggers per work order
        wo_trigger_count = self.trigger_counts.get(f"wo:{work_order_id}", 0)
        if wo_trigger_count >= self.max_triggers_per_work_order:
            return (
                False,
                f"Max triggers ({self.max_triggers_per_work_order}) reached for work order",
            )

        # Check max triggers per batch
        batch_trigger_count = self.trigger_counts.get(f"batch:{batch_id}", 0)
        if batch_trigger_count >= self.max_triggers_per_batch:
            return (
                False,
                f"Max triggers ({self.max_triggers_per_batch}) reached for batch",
            )

        return True, None

    def record_trigger(self, work_order_id: str, batch_id: str):
        """Record that a trigger was executed."""
        self.last_trigger_times[work_order_id] = datetime.now(timezone.utc)
        self.trigger_counts[f"wo:{work_order_id}"] = (
            self.trigger_counts.get(f"wo:{work_order_id}", 0) + 1
        )
        self.trigger_counts[f"batch:{batch_id}"] = (
            self.trigger_counts.get(f"batch:{batch_id}", 0) + 1
        )

    def reset_work_order(self, work_order_id: str):
        """Reset throttle state for a work order."""
        self.last_trigger_times.pop(work_order_id, None)
        self.trigger_counts.pop(f"wo:{work_order_id}", None)


class PipelineTriggerRecord:
    """Record of a pipeline trigger execution."""

    def __init__(
        self,
        trigger_id: str,
        work_order_id: str,
        batch_id: str,
        execution_id: str,
        trigger_reason: ReEvaluationReason,
        variance_data: Dict[str, Any],
    ):
        self.trigger_id = trigger_id
        self.work_order_id = work_order_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.trigger_reason = trigger_reason
        self.variance_data = variance_data
        self.triggered_at = datetime.now(timezone.utc)
        self.execution_started_at: Optional[datetime] = None
        self.execution_completed_at: Optional[datetime] = None
        self.success = False
        self.error: Optional[str] = None
        self.adjustments_applied: Dict[str, Any] = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "trigger_id": self.trigger_id,
            "work_order_id": self.work_order_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "trigger_reason": self.trigger_reason.value,
            "triggered_at": self.triggered_at.isoformat(),
            "execution_started_at": (
                self.execution_started_at.isoformat()
                if self.execution_started_at
                else None
            ),
            "execution_completed_at": (
                self.execution_completed_at.isoformat()
                if self.execution_completed_at
                else None
            ),
            "success": self.success,
            "error": self.error,
            "adjustments_applied": self.adjustments_applied,
        }


class PipelineTriggerEngine:
    """
    Listens to work order events and manages pipeline re-evaluation triggers.

    Provides:
    - Event-driven trigger mechanism
    - Variance detection and analysis
    - Throttling and deduplication
    - Comprehensive trigger history
    """

    def __init__(
        self,
        event_bus: WorkOrderEventBus,
        time_analysis: WorkOrderTimeAnalysis,
        parameter_adjuster: PipelineParameterAdjuster,
        re_evaluation_queue: ReEvaluationQueue,
    ):
        self.event_bus = event_bus
        self.time_analysis = time_analysis
        self.parameter_adjuster = parameter_adjuster
        self.re_evaluation_queue = re_evaluation_queue

        self.throttle_policy = TriggerThrottlePolicy()
        self.trigger_history: Dict[str, PipelineTriggerRecord] = {}
        self.trigger_callbacks: List[Callable[[ReEvaluationRequest], None]] = []

        # Subscribe to relevant events
        self._subscribe_to_events()

    def _subscribe_to_events(self):
        """Subscribe to relevant work order events."""
        self.event_bus.subscribe(
            WorkOrderEventType.TIME_VARIANCE_DETECTED,
            self._handle_time_variance_event,
        )
        self.event_bus.subscribe(
            WorkOrderEventType.COMPLETED,
            self._handle_completion_event,
        )
        logger.info("Pipeline trigger engine subscribed to work order events")

    def _handle_time_variance_event(self, event: WorkOrderEvent):
        """Handle TIME_VARIANCE_DETECTED event."""
        logger.info(
            f"Processing TIME_VARIANCE_DETECTED event for {event.work_order_id}"
        )

        variance_data = event.data
        variance_type = variance_data.get("variance_type", "over_time")

        # Map variance type to re-evaluation reason
        if variance_type == "critical_over_time":
            reason = ReEvaluationReason.TIME_VARIANCE_CRITICAL
            priority = ReEvaluationPriority.CRITICAL
        elif variance_type == "over_time":
            reason = ReEvaluationReason.TIME_VARIANCE_OVER
            priority = ReEvaluationPriority.HIGH
        elif variance_type == "under_time":
            reason = ReEvaluationReason.TIME_VARIANCE_UNDER
            priority = ReEvaluationPriority.MEDIUM
        else:
            reason = ReEvaluationReason.TIME_VARIANCE_OVER
            priority = ReEvaluationPriority.MEDIUM

        # Attempt to trigger re-evaluation
        self.trigger_re_evaluation(
            work_order_id=event.work_order_id,
            batch_id=event.batch_id,
            execution_id=event.execution_id,
            reason=reason,
            priority=priority,
            variance_data=variance_data,
        )

    def _handle_completion_event(self, event: WorkOrderEvent):
        """Handle COMPLETED event - check if retrigger needed."""
        variance_data = event.data
        variance_percent = variance_data.get("variance_percent", 0)

        # Only consider re-evaluation for significant variances
        if abs(variance_percent) > 20:
            logger.info(
                f"Considering re-evaluation for {event.work_order_id} "
                f"(variance: {variance_percent}%)"
            )

    def trigger_re_evaluation(
        self,
        work_order_id: str,
        batch_id: str,
        execution_id: str,
        reason: ReEvaluationReason,
        priority: ReEvaluationPriority,
        variance_data: Dict[str, Any],
    ) -> bool:
        """
        Trigger a re-evaluation request.

        Returns True if queued, False if throttled or deduplicated.
        """
        # Check throttle policy
        can_trigger, throttle_reason = self.throttle_policy.can_trigger(
            work_order_id=work_order_id,
            batch_id=batch_id,
        )

        if not can_trigger:
            logger.warning(
                f"Re-evaluation trigger throttled for {work_order_id}: {throttle_reason}"
            )
            return False

        # Create re-evaluation request
        request = ReEvaluationRequest(
            work_order_id=work_order_id,
            batch_id=batch_id,
            execution_id=execution_id,
            reason=reason,
            priority=priority,
            variance_data=variance_data,
        )

        # Enqueue request
        enqueued = self.re_evaluation_queue.enqueue(request)

        if enqueued:
            # Record trigger
            self.throttle_policy.record_trigger(work_order_id, batch_id)

            # Create trigger record
            trigger_record = PipelineTriggerRecord(
                trigger_id=f"TRIG-{uuid4().hex[:12]}",
                work_order_id=work_order_id,
                batch_id=batch_id,
                execution_id=execution_id,
                trigger_reason=reason,
                variance_data=variance_data,
            )
            self.trigger_history[trigger_record.trigger_id] = trigger_record

            logger.info(
                f"Re-evaluation trigger {trigger_record.trigger_id} enqueued "
                f"for {work_order_id} (reason: {reason.value}, priority: {priority.value})"
            )

            # Notify callbacks
            for callback in self.trigger_callbacks:
                try:
                    callback(request)
                except Exception as e:
                    logger.error(f"Trigger callback failed: {e}")

        return enqueued

    def execute_trigger(
        self,
        trigger_record: PipelineTriggerRecord,
        re_evaluation_request: ReEvaluationRequest,
    ) -> Dict[str, Any]:
        """
        Execute a pipeline re-evaluation trigger.

        Returns result dictionary with execution details.
        """
        trigger_record.execution_started_at = datetime.now(timezone.utc)

        try:
            # Analyze variance from the request
            variance_data = re_evaluation_request.variance_data
            step_id = variance_data.get("step_id", "unknown")
            variance_percent = variance_data.get("variance_percent", 0)

            logger.info(
                f"Executing re-evaluation trigger {trigger_record.trigger_id} "
                f"for {trigger_record.work_order_id}"
            )

            # Get variance details from time analysis
            variance_id = variance_data.get("variance_id")
            variance: Optional[TimeVariance] = None
            if variance_id and variance_id in self.time_analysis.variances:
                variance = self.time_analysis.variances[variance_id]

            # Analyze and adjust parameters
            if variance:
                adjustment = self.parameter_adjuster.analyze_variance(
                    step_id=variance.step_id,
                    estimated_duration=variance.estimated_minutes,
                    actual_duration=variance.actual_minutes,
                )

                trigger_record.adjustments_applied = adjustment.to_dict()
                logger.info(
                    f"Parameter adjustment applied: "
                    f"{adjustment.original_value:.1f}m -> {adjustment.adjusted_value:.1f}m"
                )
            else:
                logger.warning(f"Could not find variance data for {variance_id}")

            trigger_record.success = True
            trigger_record.execution_completed_at = datetime.now(timezone.utc)

            return {
                "success": True,
                "trigger_id": trigger_record.trigger_id,
                "adjustments": trigger_record.adjustments_applied,
                "execution_time_ms": (
                    (
                        trigger_record.execution_completed_at
                        - trigger_record.execution_started_at
                    ).total_seconds()
                    * 1000
                ),
            }

        except Exception as e:
            logger.error(f"Failed to execute trigger {trigger_record.trigger_id}: {e}")
            trigger_record.success = False
            trigger_record.error = str(e)
            trigger_record.execution_completed_at = datetime.now(timezone.utc)

            return {
                "success": False,
                "trigger_id": trigger_record.trigger_id,
                "error": str(e),
            }

    def register_trigger_callback(
        self, callback: Callable[[ReEvaluationRequest], None]
    ):
        """Register a callback to be invoked when a trigger is enqueued."""
        self.trigger_callbacks.append(callback)
        logger.info(f"Registered trigger callback: {callback.__name__}")

    def get_trigger_history(
        self,
        work_order_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[PipelineTriggerRecord]:
        """Get trigger history, optionally filtered."""
        records = list(self.trigger_history.values())

        if work_order_id:
            records = [r for r in records if r.work_order_id == work_order_id]

        return sorted(records, key=lambda r: r.triggered_at, reverse=True)[:limit]

    def get_success_rate(self, work_order_id: Optional[str] = None) -> float:
        """Get success rate of triggers."""
        records = self.get_trigger_history(work_order_id=work_order_id, limit=1000)

        if not records:
            return 0.0

        successful = sum(1 for r in records if r.success)
        return (successful / len(records)) * 100

    def get_metrics(self) -> Dict[str, Any]:
        """Get engine metrics."""
        all_records = list(self.trigger_history.values())
        successful_triggers = sum(1 for r in all_records if r.success)
        failed_triggers = sum(1 for r in all_records if not r.success and r.error)
        pending_triggers = sum(
            1 for r in all_records if r.execution_completed_at is None
        )

        return {
            "total_triggers": len(all_records),
            "successful_triggers": successful_triggers,
            "failed_triggers": failed_triggers,
            "pending_triggers": pending_triggers,
            "success_rate": f"{self.get_success_rate():.1f}%",
            "throttle_policy": {
                "min_time_between_triggers_seconds": (
                    self.throttle_policy.min_time_between_triggers_seconds
                ),
                "max_triggers_per_work_order": (
                    self.throttle_policy.max_triggers_per_work_order
                ),
                "max_triggers_per_batch": self.throttle_policy.max_triggers_per_batch,
            },
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "trigger_history": [
                r.to_dict() for r in self.get_trigger_history(limit=50)
            ],
            "metrics": self.get_metrics(),
            "queue_status": self.re_evaluation_queue.get_metrics(),
        }
