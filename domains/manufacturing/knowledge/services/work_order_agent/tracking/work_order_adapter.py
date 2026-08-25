"""
Work Order Adapter

Adapts GeneratedWorkOrder and TrackedWorkOrder to external systems.
Syncs with external WorkOrder service API.
Handles lifecycle callbacks and conflict resolution.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class SyncStatus(Enum):
    """Sync status with external system."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SYNCED = "synced"
    CONFLICT = "conflict"
    FAILED = "failed"


class WorkOrderLifecycleCallback:
    """Callback for work order lifecycle events."""

    def __init__(
        self,
        callback_id: str,
        event_type: str,
        handler_func: Callable[[str, Dict[str, Any]], None],
    ):
        self.callback_id = callback_id
        self.event_type = event_type  # created, assigned, started, completed
        self.handler_func = handler_func
        self.executed_at: Optional[datetime] = None
        self.status = "pending"

    async def execute(self, work_order_id: str, data: Dict[str, Any]) -> bool:
        """Execute the callback."""
        try:
            self.handler_func(work_order_id, data)
            self.executed_at = datetime.now(timezone.utc)
            self.status = "completed"
            logger.info(f"Callback {self.callback_id} executed for {work_order_id}")
            return True
        except Exception as e:
            logger.error(f"Callback {self.callback_id} failed: {e}")
            self.status = "failed"
            return False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "callback_id": self.callback_id,
            "event_type": self.event_type,
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
            "status": self.status,
        }


class SyncConflict:
    """Represents a sync conflict with external system."""

    def __init__(
        self,
        work_order_id: str,
        local_state: Dict[str, Any],
        remote_state: Dict[str, Any],
        conflict_field: str,
    ):
        self.conflict_id = f"CONFLICT-{uuid4().hex[:8]}"
        self.work_order_id = work_order_id
        self.local_state = local_state
        self.remote_state = remote_state
        self.conflict_field = conflict_field
        self.created_at = datetime.now(timezone.utc)
        self.resolution = None
        self.resolved_at: Optional[datetime] = None

    def resolve_with_local(self):
        """Resolve using local state."""
        self.resolution = "local"
        self.resolved_at = datetime.now(timezone.utc)

    def resolve_with_remote(self):
        """Resolve using remote state."""
        self.resolution = "remote"
        self.resolved_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "conflict_id": self.conflict_id,
            "work_order_id": self.work_order_id,
            "conflict_field": self.conflict_field,
            "local_value": str(self.local_state.get(self.conflict_field)),
            "remote_value": str(self.remote_state.get(self.conflict_field)),
            "resolution": self.resolution,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class ExternalWorkOrderService:
    """Interface to external WorkOrder service API."""

    def __init__(self, service_name: str, api_endpoint: str):
        self.service_name = service_name
        self.api_endpoint = api_endpoint

    async def create(self, work_order_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create work order in external system."""
        logger.info(f"Creating work order in {self.service_name}: {work_order_data}")
        # Implementation would call external API
        return {"external_id": f"EXT-{uuid4().hex[:12]}", "status": "created"}

    async def update(self, external_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update work order in external system."""
        logger.info(
            f"Updating work order {external_id} in {self.service_name}: {updates}"
        )
        # Implementation would call external API
        return {"status": "updated"}

    async def get(self, external_id: str) -> Optional[Dict[str, Any]]:
        """Fetch work order from external system."""
        logger.info(f"Fetching work order {external_id} from {self.service_name}")
        # Implementation would call external API
        return {"external_id": external_id, "status": "in_progress"}

    async def complete(self, external_id: str, remarks: str) -> Dict[str, Any]:
        """Mark work order as complete in external system."""
        logger.info(
            f"Completing work order {external_id} in {self.service_name}: {remarks}"
        )
        # Implementation would call external API
        return {"status": "completed"}


class WorkOrderAdapter:
    """
    Adapts local work orders to external system.

    Responsibilities:
    - Sync work order state with external service
    - Handle lifecycle callbacks
    - Detect and resolve conflicts
    - Track sync status
    """

    def __init__(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        external_service: Optional[ExternalWorkOrderService] = None,
    ):
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.external_service = external_service
        self.external_id: Optional[str] = None
        self.sync_status = SyncStatus.PENDING
        self.last_synced_at: Optional[datetime] = None
        self.last_sync_error: Optional[str] = None
        self.callbacks: Dict[str, WorkOrderLifecycleCallback] = {}
        self.conflicts: List[SyncConflict] = []
        self.sync_count = 0

    async def create_in_external_system(self, work_order_data: Dict[str, Any]) -> bool:
        """Create work order in external system."""
        if not self.external_service:
            logger.debug(f"No external service configured for {self.work_order_id}")
            return False

        try:
            self.sync_status = SyncStatus.IN_PROGRESS
            result = await self.external_service.create(work_order_data)
            self.external_id = result.get("external_id")
            self.sync_status = SyncStatus.SYNCED
            self.last_synced_at = datetime.now(timezone.utc)
            self.sync_count += 1
            logger.info(
                f"Created work order {self.work_order_id} in external system: {self.external_id}"
            )
            return True
        except Exception as e:
            self.sync_status = SyncStatus.FAILED
            self.last_sync_error = str(e)
            logger.error(f"Failed to create work order in external system: {e}")
            return False

    async def sync_state(self, state_data: Dict[str, Any]) -> bool:
        """Sync work order state to external system."""
        if not self.external_id or not self.external_service:
            return False

        try:
            self.sync_status = SyncStatus.IN_PROGRESS
            await self.external_service.update(self.external_id, state_data)
            self.sync_status = SyncStatus.SYNCED
            self.last_synced_at = datetime.now(timezone.utc)
            self.sync_count += 1
            logger.info(
                f"Synced work order {self.work_order_id} state to external system"
            )
            return True
        except Exception as e:
            self.sync_status = SyncStatus.FAILED
            self.last_sync_error = str(e)
            logger.error(f"Failed to sync work order state: {e}")
            return False

    async def fetch_remote_state(self) -> Optional[Dict[str, Any]]:
        """Fetch current state from external system."""
        if not self.external_id or not self.external_service:
            return None

        try:
            remote_state = await self.external_service.get(self.external_id)
            logger.info(
                f"Fetched remote state for {self.work_order_id}: {remote_state}"
            )
            return remote_state
        except Exception as e:
            logger.error(f"Failed to fetch remote state: {e}")
            return None

    def detect_conflict(
        self,
        local_state: Dict[str, Any],
        remote_state: Dict[str, Any],
    ) -> Optional[SyncConflict]:
        """Detect conflicts between local and remote state."""
        if not remote_state:
            return None

        # Check for status conflicts
        local_status = local_state.get("status")
        remote_status = remote_state.get("status")

        if local_status != remote_status:
            conflict = SyncConflict(
                work_order_id=self.work_order_id,
                local_state=local_state,
                remote_state=remote_state,
                conflict_field="status",
            )
            self.conflicts.append(conflict)
            logger.warning(
                f"Detected conflict for {self.work_order_id}: "
                f"local status {local_status} vs remote status {remote_status}"
            )
            return conflict

        return None

    def register_callback(
        self,
        event_type: str,
        handler_func: Callable[[str, Dict[str, Any]], None],
    ) -> str:
        """Register a lifecycle callback."""
        callback_id = f"CB-{uuid4().hex[:8]}"
        callback = WorkOrderLifecycleCallback(
            callback_id=callback_id,
            event_type=event_type,
            handler_func=handler_func,
        )
        self.callbacks[callback_id] = callback
        logger.info(f"Registered callback {callback_id} for event {event_type}")
        return callback_id

    async def execute_callbacks(
        self, event_type: str, work_order_data: Dict[str, Any]
    ) -> bool:
        """Execute all callbacks for an event type."""
        event_callbacks = [
            cb for cb in self.callbacks.values() if cb.event_type == event_type
        ]

        if not event_callbacks:
            logger.debug(f"No callbacks for event {event_type}")
            return True

        results = []
        for callback in event_callbacks:
            result = await callback.execute(self.work_order_id, work_order_data)
            results.append(result)

        logger.info(
            f"Executed {len(results)} callbacks for event {event_type}, "
            f"success rate: {sum(results) / len(results) * 100:.1f}%"
        )
        return all(results)

    async def on_created(self, work_order_data: Dict[str, Any]) -> bool:
        """Handle work order created lifecycle event."""
        logger.info(f"Work order {self.work_order_id} created")
        await self.execute_callbacks("created", work_order_data)
        return await self.create_in_external_system(work_order_data)

    async def on_assigned(self, work_order_data: Dict[str, Any]) -> bool:
        """Handle work order assigned lifecycle event."""
        logger.info(f"Work order {self.work_order_id} assigned")
        await self.execute_callbacks("assigned", work_order_data)
        return await self.sync_state(work_order_data)

    async def on_started(self, work_order_data: Dict[str, Any]) -> bool:
        """Handle work order started lifecycle event."""
        logger.info(f"Work order {self.work_order_id} started")
        await self.execute_callbacks("started", work_order_data)
        return await self.sync_state(work_order_data)

    async def on_completed(self, work_order_data: Dict[str, Any]) -> bool:
        """Handle work order completed lifecycle event."""
        logger.info(f"Work order {self.work_order_id} completed")
        await self.execute_callbacks("completed", work_order_data)
        remarks = work_order_data.get("remarks", "")
        if self.external_id and self.external_service:
            try:
                await self.external_service.complete(self.external_id, remarks)
                return True
            except Exception as e:
                logger.error(f"Failed to complete work order in external system: {e}")
                return False
        return True

    def get_sync_summary(self) -> Dict[str, Any]:
        """Get sync status summary."""
        return {
            "work_order_id": self.work_order_id,
            "external_id": self.external_id,
            "sync_status": self.sync_status.value,
            "sync_count": self.sync_count,
            "last_synced_at": (
                self.last_synced_at.isoformat() if self.last_synced_at else None
            ),
            "last_sync_error": self.last_sync_error,
            "registered_callbacks": len(self.callbacks),
            "conflicts_detected": len(self.conflicts),
            "unresolved_conflicts": sum(1 for c in self.conflicts if not c.resolution),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "external_id": self.external_id,
            "sync_status": self.sync_status.value,
            "sync_count": self.sync_count,
            "last_synced_at": (
                self.last_synced_at.isoformat() if self.last_synced_at else None
            ),
            "last_sync_error": self.last_sync_error,
            "callbacks": {cb_id: cb.to_dict() for cb_id, cb in self.callbacks.items()},
            "conflicts": [c.to_dict() for c in self.conflicts],
        }
