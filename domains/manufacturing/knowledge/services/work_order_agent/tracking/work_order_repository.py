"""
Work Order Repository

Persists work order state changes to storage backend.
Provides query interface for retrieval and filtering.
Tracks state transitions with timestamps for audit trail.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class WorkOrderRecord:
    """Immutable record of a work order state transition."""

    def __init__(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        status: str,
        data: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ):
        self.record_id = f"REC-{uuid4().hex[:12]}"
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.status = status
        self.data = data or {}
        self.timestamp = timestamp or datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "record_id": self.record_id,
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "status": self.status,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
        }


class WorkOrderSnapshot:
    """Complete snapshot of a work order at a point in time."""

    def __init__(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        status: str,
        assigned_to: Optional[str] = None,
        assigned_user_id: Optional[str] = None,
        assigned_user_name: Optional[str] = None,
        assigned_team_id: Optional[str] = None,
        assigned_team_name: Optional[str] = None,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        estimated_duration_minutes: Optional[int] = None,
        actual_duration_minutes: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ):
        self.snapshot_id = f"SNAP-{uuid4().hex[:12]}"
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.batch_id = batch_id
        self.execution_id = execution_id
        self.status = status
        self.assigned_to = assigned_to
        self.assigned_user_id = assigned_user_id
        self.assigned_user_name = assigned_user_name
        self.assigned_team_id = assigned_team_id
        self.assigned_team_name = assigned_team_name
        self.created_at = created_at
        self.started_at = started_at
        self.completed_at = completed_at
        self.estimated_duration_minutes = estimated_duration_minutes
        self.actual_duration_minutes = actual_duration_minutes
        self.metadata = metadata or {}
        self.timestamp = timestamp or datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "snapshot_id": self.snapshot_id,
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "batch_id": self.batch_id,
            "execution_id": self.execution_id,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "assigned_user_id": self.assigned_user_id,
            "assigned_user_name": self.assigned_user_name,
            "assigned_team_id": self.assigned_team_id,
            "assigned_team_name": self.assigned_team_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "estimated_duration_minutes": self.estimated_duration_minutes,
            "actual_duration_minutes": self.actual_duration_minutes,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
        }


class WorkOrderRepositoryInterface(ABC):
    """Abstract interface for work order persistence."""

    @abstractmethod
    def save_record(self, record: WorkOrderRecord) -> bool:
        """Save a state transition record."""
        pass

    @abstractmethod
    def save_snapshot(self, snapshot: WorkOrderSnapshot) -> bool:
        """Save a work order snapshot."""
        pass

    @abstractmethod
    def get_work_order(self, work_order_id: str) -> Optional[WorkOrderSnapshot]:
        """Get current state of work order."""
        pass

    @abstractmethod
    def get_history(self, work_order_id: str) -> List[WorkOrderRecord]:
        """Get all state transitions for a work order."""
        pass

    @abstractmethod
    def query_by_batch(self, batch_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a batch."""
        pass

    @abstractmethod
    def query_by_step(self, step_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a step."""
        pass

    @abstractmethod
    def query_by_status(self, status: str) -> List[WorkOrderSnapshot]:
        """Query work orders by status."""
        pass

    @abstractmethod
    def query_by_batch_and_status(
        self, batch_id: str, status: str
    ) -> List[WorkOrderSnapshot]:
        """Query work orders by batch and status."""
        pass

    @abstractmethod
    def get_batch_summary(self, batch_id: str) -> Dict[str, Any]:
        """Get aggregated stats for a batch."""
        pass


class InMemoryWorkOrderRepository(WorkOrderRepositoryInterface):
    """In-memory implementation for testing and development."""

    def __init__(self):
        self.records: Dict[str, List[WorkOrderRecord]] = {}
        self.snapshots: Dict[str, WorkOrderSnapshot] = {}
        self.batch_index: Dict[str, List[str]] = {}
        self.step_index: Dict[str, List[str]] = {}
        self.status_index: Dict[str, List[str]] = {}

    def save_record(self, record: WorkOrderRecord) -> bool:
        """Save a state transition record."""
        try:
            if record.work_order_id not in self.records:
                self.records[record.work_order_id] = []

            self.records[record.work_order_id].append(record)
            logger.debug(
                f"Saved record {record.record_id} for work order {record.work_order_id}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to save record: {e}")
            return False

    def save_snapshot(self, snapshot: WorkOrderSnapshot) -> bool:
        """Save a work order snapshot."""
        try:
            work_order_id = snapshot.work_order_id
            self.snapshots[work_order_id] = snapshot

            # Update indexes
            batch_id = snapshot.batch_id
            step_id = snapshot.step_id
            status = snapshot.status

            if batch_id not in self.batch_index:
                self.batch_index[batch_id] = []
            if work_order_id not in self.batch_index[batch_id]:
                self.batch_index[batch_id].append(work_order_id)

            if step_id not in self.step_index:
                self.step_index[step_id] = []
            if work_order_id not in self.step_index[step_id]:
                self.step_index[step_id].append(work_order_id)

            if status not in self.status_index:
                self.status_index[status] = []
            if work_order_id not in self.status_index[status]:
                self.status_index[status].append(work_order_id)

            logger.debug(
                f"Saved snapshot {snapshot.snapshot_id} for work order {work_order_id}"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
            return False

    def get_work_order(self, work_order_id: str) -> Optional[WorkOrderSnapshot]:
        """Get current state of work order."""
        return self.snapshots.get(work_order_id)

    def get_history(self, work_order_id: str) -> List[WorkOrderRecord]:
        """Get all state transitions for a work order."""
        return self.records.get(work_order_id, [])

    def query_by_batch(self, batch_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a batch."""
        work_order_ids = self.batch_index.get(batch_id, [])
        return [self.snapshots[wid] for wid in work_order_ids if wid in self.snapshots]

    def query_by_step(self, step_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a step."""
        work_order_ids = self.step_index.get(step_id, [])
        return [self.snapshots[wid] for wid in work_order_ids if wid in self.snapshots]

    def query_by_status(self, status: str) -> List[WorkOrderSnapshot]:
        """Query work orders by status."""
        work_order_ids = self.status_index.get(status, [])
        return [self.snapshots[wid] for wid in work_order_ids if wid in self.snapshots]

    def query_by_batch_and_status(
        self, batch_id: str, status: str
    ) -> List[WorkOrderSnapshot]:
        """Query work orders by batch and status."""
        batch_work_orders = self.query_by_batch(batch_id)
        return [wo for wo in batch_work_orders if wo.status == status]

    def get_batch_summary(self, batch_id: str) -> Dict[str, Any]:
        """Get aggregated stats for a batch."""
        work_orders = self.query_by_batch(batch_id)

        if not work_orders:
            return {
                "batch_id": batch_id,
                "total_work_orders": 0,
                "completed": 0,
                "in_progress": 0,
                "pending": 0,
                "rejected": 0,
                "completion_percent": 0.0,
                "average_actual_duration_minutes": 0.0,
                "average_variance_percent": 0.0,
            }

        status_counts = {}
        total_actual_duration = 0.0
        completed_count = 0
        variance_sum = 0.0

        for wo in work_orders:
            status_counts[wo.status] = status_counts.get(wo.status, 0) + 1

            if wo.actual_duration_minutes and wo.estimated_duration_minutes:
                total_actual_duration += wo.actual_duration_minutes
                variance = (
                    (wo.actual_duration_minutes - wo.estimated_duration_minutes)
                    / wo.estimated_duration_minutes
                ) * 100
                variance_sum += variance
                completed_count += 1

        return {
            "batch_id": batch_id,
            "total_work_orders": len(work_orders),
            "completed": status_counts.get("completed", 0),
            "in_progress": status_counts.get("in_progress", 0),
            "pending": status_counts.get("created", 0)
            + status_counts.get("assigned", 0),
            "rejected": status_counts.get("rejected", 0),
            "completion_percent": (
                (status_counts.get("completed", 0) / len(work_orders)) * 100
                if work_orders
                else 0.0
            ),
            "average_actual_duration_minutes": (
                total_actual_duration / completed_count if completed_count > 0 else 0.0
            ),
            "average_variance_percent": (
                variance_sum / completed_count if completed_count > 0 else 0.0
            ),
        }


class WorkOrderRepository(WorkOrderRepositoryInterface):
    """
    Unified work order repository with pluggable backend.

    Supports multiple persistence backends (in-memory, MongoDB, PostgreSQL, etc).
    Provides consistent query interface across backends.
    """

    def __init__(self, backend: WorkOrderRepositoryInterface):
        """
        Initialize with a backend implementation.

        Args:
            backend: Repository implementation (InMemoryWorkOrderRepository, MongoRepository, etc)
        """
        self.backend = backend

    def save_record(self, record: WorkOrderRecord) -> bool:
        """Save a state transition record."""
        return self.backend.save_record(record)

    def save_snapshot(self, snapshot: WorkOrderSnapshot) -> bool:
        """Save a work order snapshot."""
        return self.backend.save_snapshot(snapshot)

    def get_work_order(self, work_order_id: str) -> Optional[WorkOrderSnapshot]:
        """Get current state of work order."""
        return self.backend.get_work_order(work_order_id)

    def get_history(self, work_order_id: str) -> List[WorkOrderRecord]:
        """Get all state transitions for a work order."""
        return self.backend.get_history(work_order_id)

    def query_by_batch(self, batch_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a batch."""
        return self.backend.query_by_batch(batch_id)

    def query_by_step(self, step_id: str) -> List[WorkOrderSnapshot]:
        """Query all work orders for a step."""
        return self.backend.query_by_step(step_id)

    def query_by_status(self, status: str) -> List[WorkOrderSnapshot]:
        """Query work orders by status."""
        return self.backend.query_by_status(status)

    def query_by_batch_and_status(
        self, batch_id: str, status: str
    ) -> List[WorkOrderSnapshot]:
        """Query work orders by batch and status."""
        return self.backend.query_by_batch_and_status(batch_id, status)

    def get_batch_summary(self, batch_id: str) -> Dict[str, Any]:
        """Get aggregated stats for a batch."""
        return self.backend.get_batch_summary(batch_id)

    def record_state_change(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        status: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Record a work order state change."""
        record = WorkOrderRecord(
            work_order_id=work_order_id,
            step_id=step_id,
            batch_id=batch_id,
            execution_id=execution_id,
            status=status,
            data=data,
        )
        return self.save_record(record)

    def save_work_order_state(
        self,
        work_order_id: str,
        step_id: str,
        batch_id: str,
        execution_id: str,
        status: str,
        assigned_to: Optional[str] = None,
        assigned_user_id: Optional[str] = None,
        assigned_user_name: Optional[str] = None,
        assigned_team_id: Optional[str] = None,
        assigned_team_name: Optional[str] = None,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        estimated_duration_minutes: Optional[int] = None,
        actual_duration_minutes: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Save complete work order snapshot."""
        snapshot = WorkOrderSnapshot(
            work_order_id=work_order_id,
            step_id=step_id,
            batch_id=batch_id,
            execution_id=execution_id,
            status=status,
            assigned_to=assigned_to,
            assigned_user_id=assigned_user_id,
            assigned_user_name=assigned_user_name,
            assigned_team_id=assigned_team_id,
            assigned_team_name=assigned_team_name,
            created_at=created_at,
            started_at=started_at,
            completed_at=completed_at,
            estimated_duration_minutes=estimated_duration_minutes,
            actual_duration_minutes=actual_duration_minutes,
            metadata=metadata,
        )
        return self.save_snapshot(snapshot)
