"""
State Machine Integrator

Manages state transitions with validation and event publishing.
Coordinates between GeneratedWorkOrder status and WorkOrderStateMachine.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from services.work_order_agent.tracking.event_system import (
    WorkOrderEvent,
    WorkOrderEventBus,
    WorkOrderEventType,
)
from services.work_order_agent.tracking.state_machine import (
    WorkOrderState,
    WorkOrderStateMachine,
)

logger = logging.getLogger(__name__)


class InvalidStateTransitionError(Exception):
    """Raised when an invalid state transition is attempted."""

    pass


class StateMachineIntegrator:
    """
    Manages state transitions with full validation and event publishing.

    Responsibilities:
    - Validate transitions against state machine rules
    - Publish events for all valid transitions
    - Sync GeneratedWorkOrder status with state machine state
    - Handle hold/resume functionality
    """

    # Mapping from WorkOrderStatus to WorkOrderState
    STATUS_TO_STATE = {
        "created": WorkOrderState.CREATED,
        "assigned": WorkOrderState.ASSIGNED,
        "in_progress": WorkOrderState.IN_PROGRESS,
        "on_hold": WorkOrderState.ON_HOLD,
        "completed": WorkOrderState.COMPLETED,
        "rejected": WorkOrderState.REJECTED,
    }

    STATE_TO_EVENT = {
        WorkOrderState.CREATED: WorkOrderEventType.CREATED,
        WorkOrderState.ASSIGNED: WorkOrderEventType.ASSIGNED,
        WorkOrderState.IN_PROGRESS: WorkOrderEventType.STARTED,
        WorkOrderState.ON_HOLD: WorkOrderEventType.ON_HOLD,
        WorkOrderState.COMPLETED: WorkOrderEventType.COMPLETED,
        WorkOrderState.REJECTED: WorkOrderEventType.REJECTED,
    }

    def __init__(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        event_bus: Optional[WorkOrderEventBus] = None,
    ):
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.event_bus = event_bus
        self.state_machine = WorkOrderStateMachine(work_order_id)
        self.hold_reason = None
        self.held_at = None

    def transition(
        self,
        target_state: WorkOrderState,
        data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Attempt to transition to a new state with validation.

        Args:
            target_state: Target WorkOrderState
            data: Additional data for the transition

        Returns:
            True if transition succeeded, False otherwise

        Raises:
            InvalidStateTransitionError: If transition is invalid
        """
        if not self.state_machine.can_transition(target_state):
            msg = (
                f"Invalid transition for {self.work_order_id}: "
                f"{self.state_machine.current_state.value} → {target_state.value}"
            )
            logger.error(msg)
            raise InvalidStateTransitionError(msg)

        # Perform transition
        success = self.state_machine.transition(target_state, data=data)

        if success:
            # Publish event if bus is configured (sync version)
            if self.event_bus:
                event = self._create_event(target_state, data)
                # Add to event history synchronously
                self.event_bus.event_history.append(event)
                logger.info(
                    f"Event {event.event_id} published: {event.event_type.value} "
                    f"for work order {event.work_order_id}"
                )

            logger.info(
                f"State transition successful for {self.work_order_id}: "
                f"→ {target_state.value}"
            )

        return success

    def assign(
        self,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        team_id: Optional[str] = None,
        team_name: Optional[str] = None,
    ) -> bool:
        """Assign work order and transition to ASSIGNED state."""
        data = {}
        if user_id and user_name:
            data = {"user_id": user_id, "user_name": user_name}
        elif team_id and team_name:
            data = {"team_id": team_id, "team_name": team_name}

        try:
            return self.transition(WorkOrderState.ASSIGNED, data=data)
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to assign work order: {e}")
            return False

    def start(self) -> bool:
        """Start work order and transition to IN_PROGRESS state."""
        try:
            return self.transition(
                WorkOrderState.IN_PROGRESS,
                data={"started_at": datetime.now(timezone.utc).isoformat()},
            )
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to start work order: {e}")
            return False

    def hold(self, reason: str) -> bool:
        """Hold work order with reason."""
        self.hold_reason = reason
        self.held_at = datetime.now(timezone.utc)

        try:
            return self.transition(
                WorkOrderState.ON_HOLD,
                data={
                    "reason": reason,
                    "held_at": self.held_at.isoformat(),
                },
            )
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to hold work order: {e}")
            return False

    def resume(self) -> bool:
        """Resume work order from hold."""
        if self.state_machine.current_state != WorkOrderState.ON_HOLD:
            logger.error(
                f"Cannot resume work order {self.work_order_id}: not in ON_HOLD state"
            )
            return False

        try:
            success = self.transition(
                WorkOrderState.IN_PROGRESS,
                data={
                    "resumed_at": datetime.now(timezone.utc).isoformat(),
                    "hold_reason": self.hold_reason,
                },
            )

            if success:
                # Clear hold info
                self.hold_reason = None
                self.held_at = None

                # Publish resume event (sync version)
                if self.event_bus:
                    resume_event = WorkOrderEvent(
                        event_type=WorkOrderEventType.RESUMED,
                        work_order_id=self.work_order_id,
                        step_id=self.step_id,
                        batch_id=self.batch_id,
                        execution_id=self.execution_id,
                        data={"hold_reason": self.hold_reason},
                    )
                    # Add to event history synchronously
                    self.event_bus.event_history.append(resume_event)
                    logger.info(
                        f"Event {resume_event.event_id} published: {resume_event.event_type.value} "
                        f"for work order {resume_event.work_order_id}"
                    )

            return success
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to resume work order: {e}")
            return False

    def complete(self, remarks: Optional[str] = None) -> bool:
        """Complete work order."""
        try:
            return self.transition(
                WorkOrderState.COMPLETED,
                data={
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "remarks": remarks,
                },
            )
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to complete work order: {e}")
            return False

    def reject(self, remarks: str) -> bool:
        """Reject work order."""
        try:
            return self.transition(
                WorkOrderState.REJECTED,
                data={"remarks": remarks},
            )
        except InvalidStateTransitionError as e:
            logger.error(f"Failed to reject work order: {e}")
            return False

    def get_current_state(self) -> WorkOrderState:
        """Get current state."""
        return self.state_machine.current_state

    def is_on_hold(self) -> bool:
        """Check if work order is on hold."""
        return self.state_machine.current_state == WorkOrderState.ON_HOLD

    def is_terminal(self) -> bool:
        """Check if in terminal state (completed or rejected)."""
        return self.state_machine.is_terminal()

    def _create_event(
        self,
        target_state: WorkOrderState,
        data: Optional[Dict[str, Any]] = None,
    ) -> WorkOrderEvent:
        """Create a WorkOrderEvent for the given state transition."""
        event_type = self.STATE_TO_EVENT.get(target_state, WorkOrderEventType.CREATED)

        return WorkOrderEvent(
            event_type=event_type,
            work_order_id=self.work_order_id,
            step_id=self.step_id,
            batch_id=self.batch_id,
            execution_id=self.execution_id,
            data=data or {},
        )

    def get_summary(self) -> Dict[str, Any]:
        """Get state machine summary."""
        return {
            "work_order_id": self.work_order_id,
            "current_state": self.state_machine.current_state.value,
            "is_on_hold": self.is_on_hold(),
            "hold_reason": self.hold_reason,
            "held_at": self.held_at.isoformat() if self.held_at else None,
            "is_terminal": self.is_terminal(),
            "state_machine_summary": self.state_machine.get_summary(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "current_state": self.state_machine.current_state.value,
            "is_on_hold": self.is_on_hold(),
            "hold_reason": self.hold_reason,
            "held_at": self.held_at.isoformat() if self.held_at else None,
            "state_machine": self.state_machine.to_dict(),
        }
