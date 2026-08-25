"""
Work Order State Machine

Manages work order status transitions with event publishing.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class WorkOrderState(Enum):
    """Work order states."""

    CREATED = "created"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    REJECTED = "rejected"


class StateTransition:
    """Represents a state transition."""

    def __init__(
        self,
        from_state: WorkOrderState,
        to_state: WorkOrderState,
        timestamp: datetime,
        data: Optional[Dict[str, Any]] = None,
    ):
        self.transition_id = f"TRN-{uuid4().hex[:8]}"
        self.from_state = from_state
        self.to_state = to_state
        self.timestamp = timestamp
        self.data = data or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "transition_id": self.transition_id,
            "from_state": self.from_state.value,
            "to_state": self.to_state.value,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
        }


class WorkOrderStateMachine:
    """State machine for work order lifecycle."""

    # Valid transitions
    VALID_TRANSITIONS = {
        WorkOrderState.CREATED: [WorkOrderState.ASSIGNED, WorkOrderState.REJECTED],
        WorkOrderState.ASSIGNED: [
            WorkOrderState.IN_PROGRESS,
            WorkOrderState.ON_HOLD,
            WorkOrderState.REJECTED,
        ],
        WorkOrderState.IN_PROGRESS: [
            WorkOrderState.COMPLETED,
            WorkOrderState.ON_HOLD,
            WorkOrderState.REJECTED,
        ],
        WorkOrderState.ON_HOLD: [WorkOrderState.IN_PROGRESS, WorkOrderState.REJECTED],
        WorkOrderState.COMPLETED: [],  # Terminal state
        WorkOrderState.REJECTED: [],  # Terminal state
    }

    def __init__(
        self, work_order_id: str, initial_state: WorkOrderState = WorkOrderState.CREATED
    ):
        self.work_order_id = work_order_id
        self.current_state = initial_state
        self.state_created_at = datetime.now(timezone.utc)
        self.transitions: List[StateTransition] = [
            StateTransition(initial_state, initial_state, self.state_created_at)
        ]
        self.state_times: Dict[str, float] = {}  # State duration in seconds

    def can_transition(self, target_state: WorkOrderState) -> bool:
        """Check if transition is valid."""
        if self.current_state not in self.VALID_TRANSITIONS:
            return False
        return target_state in self.VALID_TRANSITIONS[self.current_state]

    def transition(
        self,
        target_state: WorkOrderState,
        data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Attempt to transition to a new state."""
        if not self.can_transition(target_state):
            logger.warning(
                f"Invalid transition for {self.work_order_id}: "
                f"{self.current_state.value} → {target_state.value}"
            )
            return False

        # Record time in previous state
        now = datetime.now(timezone.utc)
        time_in_state = (now - self.state_created_at).total_seconds()
        state_key = f"{self.current_state.value}_time_seconds"
        self.state_times[state_key] = time_in_state

        # Create transition
        transition = StateTransition(
            from_state=self.current_state,
            to_state=target_state,
            timestamp=now,
            data=data or {},
        )
        self.transitions.append(transition)

        # Update state
        self.current_state = target_state
        self.state_created_at = now

        logger.info(
            f"Work order {self.work_order_id} transitioned: "
            f"{transition.from_state.value} → {transition.to_state.value}"
        )

        return True

    def get_total_time_seconds(self) -> float:
        """Get total time from created to final state."""
        if len(self.transitions) < 2:
            return 0
        start_time = self.transitions[0].timestamp
        end_time = self.transitions[-1].timestamp
        return (end_time - start_time).total_seconds()

    def is_terminal(self) -> bool:
        """Check if in terminal state."""
        return self.current_state in [WorkOrderState.COMPLETED, WorkOrderState.REJECTED]

    def get_summary(self) -> Dict[str, Any]:
        """Get state machine summary."""
        return {
            "work_order_id": self.work_order_id,
            "current_state": self.current_state.value,
            "total_transitions": len(self.transitions),
            "total_time_seconds": self.get_total_time_seconds(),
            "state_times": self.state_times,
            "is_terminal": self.is_terminal(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "work_order_id": self.work_order_id,
            "current_state": self.current_state.value,
            "state_created_at": self.state_created_at.isoformat(),
            "transitions": [t.to_dict() for t in self.transitions],
            "state_times": self.state_times,
            "summary": self.get_summary(),
        }
