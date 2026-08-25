"""Work order tracking with event publishing, time analysis, and persistence.

Phase 1: State Machine Integration
- Event system and state machine for work order lifecycle
- Time analysis and variance detection

Phase 2: Work Order Tracking Adapter
- Persistence layer for storing work order state changes
- External system integration and sync management
- Batch management and progress tracking
"""

# Phase 1: Event System
# Phase 1: State Machine Integration
from services.work_order_agent.tracking.state_machine_integrator import (
    InvalidStateTransitionError,
    StateMachineIntegrator,
)

from services.work_order_agent.tracking.event_system import (
    WorkOrderEvent,
    WorkOrderEventBus,
    WorkOrderEventHandler,
    WorkOrderEventType,
)

# Phase 1: State Machine
from services.work_order_agent.tracking.state_machine import (
    StateTransition,
    WorkOrderState,
    WorkOrderStateMachine,
)

# Phase 1: Time Analysis
from services.work_order_agent.tracking.time_analysis import (
    CorrectiveAction,
    TimeVariance,
    VarianceType,
    WorkOrderTimeAnalysis,
)

# Phase 2: External System Integration
from services.work_order_agent.tracking.work_order_adapter import (
    ExternalWorkOrderService,
    SyncConflict,
    SyncStatus,
    WorkOrderAdapter,
    WorkOrderLifecycleCallback,
)

# Phase 2: Batch Management
from services.work_order_agent.tracking.work_order_batch_manager import (
    BatchMetrics,
    WorkOrderBatchGroup,
    WorkOrderBatchManager,
)

# Phase 2: Persistence
from services.work_order_agent.tracking.work_order_repository import (
    InMemoryWorkOrderRepository,
    WorkOrderRecord,
    WorkOrderRepository,
    WorkOrderRepositoryInterface,
    WorkOrderSnapshot,
)

__all__ = [
    # Phase 1: Event System
    "WorkOrderEvent",
    "WorkOrderEventBus",
    "WorkOrderEventHandler",
    "WorkOrderEventType",
    # Phase 1: State Machine
    "WorkOrderState",
    "WorkOrderStateMachine",
    "StateTransition",
    # Phase 1: State Machine Integration
    "StateMachineIntegrator",
    "InvalidStateTransitionError",
    # Phase 1: Time Analysis
    "TimeVariance",
    "VarianceType",
    "CorrectiveAction",
    "WorkOrderTimeAnalysis",
    # Phase 2: Persistence
    "WorkOrderRepository",
    "WorkOrderRepositoryInterface",
    "InMemoryWorkOrderRepository",
    "WorkOrderRecord",
    "WorkOrderSnapshot",
    # Phase 2: External System Integration
    "WorkOrderAdapter",
    "ExternalWorkOrderService",
    "WorkOrderLifecycleCallback",
    "SyncConflict",
    "SyncStatus",
    # Phase 2: Batch Management
    "WorkOrderBatchManager",
    "WorkOrderBatchGroup",
    "BatchMetrics",
]
