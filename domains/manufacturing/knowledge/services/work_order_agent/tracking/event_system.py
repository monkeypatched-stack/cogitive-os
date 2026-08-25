"""
Work Order Event System

Publishes events when work order status changes.
Enables event-driven architecture for monitoring and adaptation.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class WorkOrderEventType(Enum):
    """Types of work order events."""

    CREATED = "created"
    ASSIGNED = "assigned"
    STARTED = "started"
    QC_CHECK_COMPLETED = "qc_check_completed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"
    RESUMED = "resumed"
    OVERDUE = "overdue"
    TIME_VARIANCE_DETECTED = "time_variance_detected"


class WorkOrderEvent:
    """Represents a work order event."""

    def __init__(
        self,
        event_type: WorkOrderEventType,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        data: Optional[Dict[str, Any]] = None,
    ):
        self.event_id = f"EVT-{uuid4().hex[:12]}"
        self.event_type = event_type
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.timestamp = datetime.now(timezone.utc)
        self.data = data or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
        }


class WorkOrderEventHandler:
    """Handles work order events."""

    def __init__(self, handler_id: str, handler_func: Callable[[WorkOrderEvent], None]):
        self.handler_id = handler_id
        self.handler_func = handler_func
        self.events_processed = 0

    async def handle(self, event: WorkOrderEvent):
        """Handle an event."""
        try:
            self.handler_func(event)
            self.events_processed += 1
            logger.info(f"Handler {self.handler_id} processed event {event.event_id}")
        except Exception as e:
            logger.error(
                f"Handler {self.handler_id} failed to process event {event.event_id}: {e}"
            )


class WorkOrderEventBus:
    """Event bus for work order events."""

    def __init__(self):
        self.handlers: Dict[WorkOrderEventType, List[WorkOrderEventHandler]] = {}
        self.event_history: List[WorkOrderEvent] = []
        self.subscribers: Dict[str, List[Callable]] = {}

    def subscribe(
        self,
        event_type: WorkOrderEventType,
        handler: Callable[[WorkOrderEvent], None],
    ) -> str:
        """Subscribe to an event type."""
        handler_id = f"HANDLER-{uuid4().hex[:8]}"

        if event_type not in self.handlers:
            self.handlers[event_type] = []

        event_handler = WorkOrderEventHandler(handler_id, handler)
        self.handlers[event_type].append(event_handler)

        logger.info(f"Handler {handler_id} subscribed to {event_type.value}")
        return handler_id

    def unsubscribe(self, event_type: WorkOrderEventType, handler_id: str):
        """Unsubscribe from an event type."""
        if event_type in self.handlers:
            self.handlers[event_type] = [
                h for h in self.handlers[event_type] if h.handler_id != handler_id
            ]
            logger.info(f"Handler {handler_id} unsubscribed from {event_type.value}")

    async def publish(self, event: WorkOrderEvent):
        """Publish an event."""
        self.event_history.append(event)

        logger.info(
            f"Event {event.event_id} published: {event.event_type.value} "
            f"for work order {event.work_order_id}"
        )

        # Call handlers for this event type
        if event.event_type in self.handlers:
            for handler in self.handlers[event.event_type]:
                await handler.handle(event)

        # Call any subscribers for this event type
        event_type_str = event.event_type.value
        if event_type_str in self.subscribers:
            for callback in self.subscribers[event_type_str]:
                try:
                    callback(event)
                except Exception as e:
                    logger.error(f"Subscriber callback failed: {e}")

    def get_events_for_work_order(self, work_order_id: str) -> List[WorkOrderEvent]:
        """Get all events for a work order."""
        return [e for e in self.event_history if e.work_order_id == work_order_id]

    def get_events_for_batch(self, batch_id: str) -> List[WorkOrderEvent]:
        """Get all events for a batch."""
        return [e for e in self.event_history if e.batch_id == batch_id]

    def get_events_by_type(
        self, event_type: WorkOrderEventType
    ) -> List[WorkOrderEvent]:
        """Get all events of a specific type."""
        return [e for e in self.event_history if e.event_type == event_type]

    def get_summary(self) -> Dict[str, Any]:
        """Get event bus summary."""
        event_counts = {}
        for event in self.event_history:
            event_type = event.event_type.value
            event_counts[event_type] = event_counts.get(event_type, 0) + 1

        return {
            "total_events": len(self.event_history),
            "event_types": len(set(e.event_type for e in self.event_history)),
            "event_counts": event_counts,
            "total_handlers": sum(len(h) for h in self.handlers.values()),
            "handler_events_processed": sum(
                h.events_processed
                for handlers in self.handlers.values()
                for h in handlers
            ),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "event_history": [e.to_dict() for e in self.event_history],
            "summary": self.get_summary(),
        }
