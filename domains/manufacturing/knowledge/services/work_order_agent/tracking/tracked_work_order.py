"""
Tracked Work Order Integration

Integrates GeneratedWorkOrder with event publishing, state machine, and time analysis.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services.work_order_agent.agent import (
    GeneratedWorkOrder,
)
from services.work_order_agent.tracking.event_system import (
    WorkOrderEvent,
    WorkOrderEventBus,
    WorkOrderEventType,
)
from services.work_order_agent.tracking.state_machine import (
    WorkOrderState,
    WorkOrderStateMachine,
)
from services.work_order_agent.tracking.time_analysis import (
    WorkOrderTimeAnalysis,
)

logger = logging.getLogger(__name__)


class TrackedWorkOrder:
    """
    Work order with full tracking: events, state machine, and time analysis.

    Wraps GeneratedWorkOrder to add event publishing and state management.
    """

    def __init__(
        self,
        work_order: GeneratedWorkOrder,
        event_bus: WorkOrderEventBus,
        time_analysis: WorkOrderTimeAnalysis,
    ):
        self.work_order = work_order
        self.event_bus = event_bus
        self.time_analysis = time_analysis
        self.state_machine = WorkOrderStateMachine(work_order.work_order_id)

    async def assign_to_user(self, user_id: str, user_name: str):
        """Assign work order to user with event publishing."""
        self.work_order.assign_to_user(user_id, user_name)

        # Transition state
        self.state_machine.transition(
            WorkOrderState.ASSIGNED,
            data={"user_id": user_id, "user_name": user_name},
        )

        # Publish event
        await self.event_bus.publish(
            WorkOrderEvent(
                event_type=WorkOrderEventType.ASSIGNED,
                work_order_id=self.work_order.work_order_id,
                step_id=self.work_order.step_id,
                batch_id=self.work_order.batch_id,
                execution_id=self.work_order.execution_id,
                data={
                    "user_id": user_id,
                    "user_name": user_name,
                    "assigned_to": self.work_order.assigned_to,
                },
            )
        )

        logger.info(
            f"Work order {self.work_order.work_order_id} assigned to {user_name}"
        )

    async def assign_to_team(self, team_id: str, team_name: str):
        """Assign work order to team with event publishing."""
        self.work_order.assign_to_team(team_id, team_name)

        # Transition state
        self.state_machine.transition(
            WorkOrderState.ASSIGNED,
            data={"team_id": team_id, "team_name": team_name},
        )

        # Publish event
        await self.event_bus.publish(
            WorkOrderEvent(
                event_type=WorkOrderEventType.ASSIGNED,
                work_order_id=self.work_order.work_order_id,
                step_id=self.work_order.step_id,
                batch_id=self.work_order.batch_id,
                execution_id=self.work_order.execution_id,
                data={
                    "team_id": team_id,
                    "team_name": team_name,
                    "assigned_to": self.work_order.assigned_to,
                },
            )
        )

        logger.info(
            f"Work order {self.work_order.work_order_id} assigned to team {team_name}"
        )

    async def mark_in_progress(self):
        """Mark as in progress with event and timestamp."""
        self.work_order.mark_in_progress()

        # Transition state
        self.state_machine.transition(
            WorkOrderState.IN_PROGRESS,
            data={"started_at": self.work_order.started_at.isoformat()},
        )

        # Publish event
        await self.event_bus.publish(
            WorkOrderEvent(
                event_type=WorkOrderEventType.STARTED,
                work_order_id=self.work_order.work_order_id,
                step_id=self.work_order.step_id,
                batch_id=self.work_order.batch_id,
                execution_id=self.work_order.execution_id,
                data={
                    "started_at": self.work_order.started_at.isoformat(),
                    "estimated_duration_minutes": self.work_order.estimated_duration_minutes,
                },
            )
        )

        logger.info(f"Work order {self.work_order.work_order_id} marked in progress")

    async def complete(self, remarks: Optional[str] = None):
        """Complete work order with time analysis."""
        self.work_order.complete(remarks=remarks)

        # Transition state
        self.state_machine.transition(
            WorkOrderState.COMPLETED,
            data={"completed_at": self.work_order.completed_at.isoformat()},
        )

        # Calculate actual duration
        if self.work_order.started_at and self.work_order.completed_at:
            actual_minutes = (
                self.work_order.completed_at - self.work_order.started_at
            ).total_seconds() / 60

            # Record variance
            variance = self.time_analysis.record_variance(
                work_order_id=self.work_order.work_order_id,
                step_id=self.work_order.step_id,
                estimated_minutes=self.work_order.estimated_duration_minutes,
                actual_minutes=actual_minutes,
            )

            # Publish completion event
            await self.event_bus.publish(
                WorkOrderEvent(
                    event_type=WorkOrderEventType.COMPLETED,
                    work_order_id=self.work_order.work_order_id,
                    step_id=self.work_order.step_id,
                    batch_id=self.work_order.batch_id,
                    execution_id=self.work_order.execution_id,
                    data={
                        "completed_at": self.work_order.completed_at.isoformat(),
                        "actual_minutes": actual_minutes,
                        "estimated_minutes": self.work_order.estimated_duration_minutes,
                        "variance_percent": variance.variance_percent,
                        "variance_type": variance.variance_type.value,
                    },
                )
            )

            # If variance detected, publish variance event
            if variance.variance_percent != 0:
                await self.event_bus.publish(
                    WorkOrderEvent(
                        event_type=WorkOrderEventType.TIME_VARIANCE_DETECTED,
                        work_order_id=self.work_order.work_order_id,
                        step_id=self.work_order.step_id,
                        batch_id=self.work_order.batch_id,
                        execution_id=self.work_order.execution_id,
                        data={
                            "variance_id": variance.variance_id,
                            "variance_percent": variance.variance_percent,
                            "variance_type": variance.variance_type.value,
                            "corrective_actions": len(self.time_analysis.actions),
                        },
                    )
                )

        logger.info(f"Work order {self.work_order.work_order_id} completed")

    async def reject(self, remarks: str):
        """Reject work order with event."""
        self.work_order.reject(remarks=remarks)

        # Transition state
        self.state_machine.transition(
            WorkOrderState.REJECTED,
            data={"remarks": remarks},
        )

        # Publish event
        await self.event_bus.publish(
            WorkOrderEvent(
                event_type=WorkOrderEventType.REJECTED,
                work_order_id=self.work_order.work_order_id,
                step_id=self.work_order.step_id,
                batch_id=self.work_order.batch_id,
                execution_id=self.work_order.execution_id,
                data={"remarks": remarks},
            )
        )

        logger.info(f"Work order {self.work_order.work_order_id} rejected: {remarks}")

    def get_tracking_summary(self) -> Dict[str, Any]:
        """Get complete tracking summary."""
        state_summary = self.state_machine.get_summary()

        return {
            "work_order_id": self.work_order.work_order_id,
            "step_id": self.work_order.step_id,
            "batch_id": self.work_order.batch_id,
            "state_machine": state_summary,
            "work_order_status": self.work_order.status.value,
            "assigned_to": self.work_order.assigned_to,
            "estimated_duration_minutes": self.work_order.estimated_duration_minutes,
            "actual_duration_minutes": (
                (
                    self.work_order.completed_at - self.work_order.started_at
                ).total_seconds()
                / 60
                if self.work_order.started_at and self.work_order.completed_at
                else None
            ),
            "qc_checkpoints_completed": len(self.work_order.qc_checks_completed),
            "total_qc_checkpoints": len(self.work_order.quality_checkpoints),
            "events_published": len(
                self.event_bus.get_events_for_work_order(self.work_order.work_order_id)
            ),
            "should_retrigger_pipeline": self.time_analysis.should_retrigger_pipeline(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "work_order": self.work_order.to_dict(),
            "state_machine": self.state_machine.to_dict(),
            "tracking_summary": self.get_tracking_summary(),
        }
