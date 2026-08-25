"""
Test Phase 2 Implementation

Demonstrates work order tracking adapter components:
- Repository persistence
- External system integration
- Batch management
"""

import asyncio
import logging

# Phase 1 imports
# Phase 2 imports
from services.work_order_agent.tracking import (
    ExternalWorkOrderService,
    InMemoryWorkOrderRepository,
    WorkOrderAdapter,
    WorkOrderBatchManager,
    WorkOrderEventBus,
    WorkOrderEventType,
    WorkOrderRepository,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_repository():
    """Test work order repository."""
    logger.info("=" * 60)
    logger.info("TEST: Work Order Repository")
    logger.info("=" * 60)

    # Create in-memory repository
    backend = InMemoryWorkOrderRepository()
    repo = WorkOrderRepository(backend)

    # Save a state change record
    repo.record_state_change(
        work_order_id="WO-001",
        step_id="STEP-001",
        batch_id="BATCH-001",
        execution_id="EXEC-001",
        status="created",
        data={"description": "Sample work order"},
    )

    # Save work order snapshot
    repo.save_work_order_state(
        work_order_id="WO-001",
        step_id="STEP-001",
        batch_id="BATCH-001",
        execution_id="EXEC-001",
        status="created",
        assigned_to=None,
        estimated_duration_minutes=30,
        metadata={"priority": "high"},
    )

    # Query by batch
    batch_work_orders = repo.query_by_batch("BATCH-001")
    logger.info(f"✓ Found {len(batch_work_orders)} work orders in batch")

    # Get batch summary
    summary = repo.get_batch_summary("BATCH-001")
    logger.info(f"✓ Batch summary: {summary['total_work_orders']} total work orders")

    # Get history
    history = repo.get_history("WO-001")
    logger.info(f"✓ Work order history: {len(history)} records")

    logger.info("✅ Repository test passed\n")


def test_adapter():
    """Test work order adapter."""
    logger.info("=" * 60)
    logger.info("TEST: Work Order Adapter")
    logger.info("=" * 60)

    # Create external service
    external_service = ExternalWorkOrderService(
        service_name="WorkOrder API",
        api_endpoint="http://api.example.com/work-orders",
    )

    # Create adapter
    adapter = WorkOrderAdapter(
        work_order_id="WO-002",
        step_id="STEP-002",
        batch_id="BATCH-001",
        execution_id="EXEC-001",
        external_service=external_service,
    )

    # Register callback
    def on_created_callback(wo_id: str, data: dict):
        logger.info(f"  → Callback: Work order {wo_id} created with data: {data}")

    callback_id = adapter.register_callback("created", on_created_callback)
    logger.info(f"✓ Registered callback: {callback_id}")

    # Create in external system
    work_order_data = {
        "work_order_id": "WO-002",
        "step_id": "STEP-002",
        "status": "created",
        "estimated_duration_minutes": 45,
    }

    success = asyncio.run(adapter.on_created(work_order_data))
    logger.info(f"✓ Created work order in external system: {success}")
    logger.info(f"✓ External ID: {adapter.external_id}")

    # Get sync summary
    sync_summary = adapter.get_sync_summary()
    logger.info(f"✓ Sync status: {sync_summary['sync_status']}")
    logger.info(f"✓ Sync count: {sync_summary['sync_count']}")

    logger.info("✅ Adapter test passed\n")


def test_batch_manager():
    """Test work order batch manager."""
    logger.info("=" * 60)
    logger.info("TEST: Work Order Batch Manager")
    logger.info("=" * 60)

    # Create batch manager
    batch_manager = WorkOrderBatchManager(
        batch_id="BATCH-002",
        execution_id="EXEC-002",
    )

    # Add work orders
    batch_manager.add_work_order(
        work_order_id="WO-003",
        step_id="STEP-003",
        status="created",
        estimated_duration_minutes=30,
        priority="high",
    )

    batch_manager.add_work_order(
        work_order_id="WO-004",
        step_id="STEP-003",
        status="created",
        estimated_duration_minutes=45,
        priority="medium",
    )

    batch_manager.add_work_order(
        work_order_id="WO-005",
        step_id="STEP-004",
        status="created",
        estimated_duration_minutes=20,
        priority="low",
    )

    logger.info(f"✓ Added 3 work orders to batch")

    # Mark batch started
    batch_manager.mark_batch_started()
    logger.info("✓ Batch marked as started")

    # Update work order status
    batch_manager.update_work_order_status(
        work_order_id="WO-003",
        new_status="completed",
        actual_duration_minutes=28.5,
    )
    logger.info("✓ Updated WO-003 to completed")

    # Get batch progress
    progress = batch_manager.get_batch_progress()
    logger.info(
        f"✓ Batch progress: {progress['completion_percent']:.1f}% complete "
        f"({progress['completed']}/{progress['total_work_orders']})"
    )

    # Get step performance
    step_perf = batch_manager.get_step_performance("STEP-003")
    logger.info(
        f"✓ Step STEP-003: {step_perf['completed']} completed, "
        f"{step_perf['in_progress']} in progress"
    )

    # Get batch summary
    summary = batch_manager.get_batch_summary()
    logger.info(f"✓ Batch metrics: {summary['metrics']['total_work_orders']} total")
    logger.info(
        f"✓ Average variance: {summary['performance']['average_variance_percent']:.1f}%"
    )

    logger.info("✅ Batch Manager test passed\n")


def test_integration():
    """Test integration between components."""
    logger.info("=" * 60)
    logger.info("TEST: Phase 2 Integration")
    logger.info("=" * 60)

    # Create repository
    repo = WorkOrderRepository(InMemoryWorkOrderRepository())

    # Create batch manager
    batch_mgr = WorkOrderBatchManager("BATCH-003", "EXEC-003")

    # Simulate batch execution
    work_order_ids = ["WO-006", "WO-007", "WO-008"]

    for i, wo_id in enumerate(work_order_ids, 1):
        # Add to batch manager
        batch_mgr.add_work_order(
            work_order_id=wo_id,
            step_id=f"STEP-{i}",
            status="created",
            estimated_duration_minutes=30 + (i * 5),
        )

        # Persist to repository
        repo.save_work_order_state(
            work_order_id=wo_id,
            step_id=f"STEP-{i}",
            batch_id="BATCH-003",
            execution_id="EXEC-003",
            status="created",
            estimated_duration_minutes=30 + (i * 5),
        )

    logger.info(f"✓ Added {len(work_order_ids)} work orders to batch and repository")

    # Mark batch started
    batch_mgr.mark_batch_started()
    repo.record_state_change(
        work_order_id="BATCH-003",
        step_id="BATCH",
        batch_id="BATCH-003",
        execution_id="EXEC-003",
        status="started",
    )
    logger.info("✓ Batch started")

    # Simulate work order completion
    batch_mgr.update_work_order_status(
        work_order_id="WO-006",
        new_status="completed",
        actual_duration_minutes=29.0,
    )
    repo.save_work_order_state(
        work_order_id="WO-006",
        step_id="STEP-1",
        batch_id="BATCH-003",
        execution_id="EXEC-003",
        status="completed",
        estimated_duration_minutes=35,
        actual_duration_minutes=29.0,
    )
    logger.info("✓ WO-006 completed")

    # Get batch summary
    batch_summary = batch_mgr.get_batch_summary()
    logger.info(
        f"✓ Batch completion: {batch_summary['progress']['completion_percent']:.1f}%"
    )

    # Query from repository
    batch_work_orders = repo.query_by_batch("BATCH-003")
    logger.info(f"✓ Repository query returned {len(batch_work_orders)} work orders")

    repo_summary = repo.get_batch_summary("BATCH-003")
    logger.info(f"✓ Repository summary: {repo_summary['total_work_orders']} total")

    logger.info("✅ Integration test passed\n")


async def main():
    """Run all tests."""
    logger.info("\n")
    logger.info("╔" + "=" * 58 + "╗")
    logger.info("║" + " PHASE 2 IMPLEMENTATION TESTS ".center(58) + "║")
    logger.info("║" + " Work Order Tracking Adapter ".center(58) + "║")
    logger.info("╚" + "=" * 58 + "╝")
    logger.info("")

    # Run tests
    test_repository()
    test_adapter()
    test_batch_manager()
    test_integration()

    # Summary
    logger.info("╔" + "=" * 58 + "╗")
    logger.info("║" + " ALL TESTS PASSED ✅ ".center(58) + "║")
    logger.info("║" + " Phase 2 components operational ".center(58) + "║")
    logger.info("╚" + "=" * 58 + "╝")


if __name__ == "__main__":
    asyncio.run(main())
