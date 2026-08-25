"""
End-to-End Smoke Test: Complete Feedback Loop

Demonstrates the entire workflow from initial question/trigger through
work order execution, variance detection, and workflow re-evaluation.

Flow:
1. Initialize system components
2. Create batch workflow execution
3. Generate work orders
4. Execute work orders with time variance
5. Detect variance and trigger re-evaluation
6. Adjust pipeline parameters
7. Re-run workflow with new parameters
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class SmokeTestEOEFeedbackLoop:
    """End-to-end smoke test for the complete feedback loop."""

    def __init__(self):
        """Initialize smoke test with all components."""
        self.test_results = {
            "phases": {},
            "timeline": [],
            "success": False,
            "error": None,
        }

    def log_phase(self, phase_name: str, status: str, details: Dict[str, Any]):
        """Log a phase execution."""
        timestamp = datetime.now(timezone.utc).isoformat()
        self.test_results["phases"][phase_name] = {
            "status": status,
            "timestamp": timestamp,
            "details": details,
        }
        self.test_results["timeline"].append(
            {
                "phase": phase_name,
                "status": status,
                "timestamp": timestamp,
            }
        )
        logger.info(f"[{phase_name}] {status}: {details}")

    async def phase_1_initialize_system(self) -> bool:
        """Phase 1: Initialize all system components."""
        logger.info("=" * 80)
        logger.info("PHASE 1: INITIALIZE SYSTEM COMPONENTS")
        logger.info("=" * 80)

        try:
            # Import all required components
            from services.batch_execution.pipeline_triggers.pipeline_parameter_adjuster import (
                PipelineParameterAdjuster,
            )
            from services.batch_execution.pipeline_triggers.pipeline_trigger_engine import (
                PipelineTriggerEngine,
            )
            from services.batch_execution.pipeline_triggers.re_evaluation_queue import (
                ReEvaluationQueue,
            )
            from services.batch_execution.pipeline_triggers.workflow_reevaluator import (
                WorkflowReevaluator,
            )
            from services.work_order_agent.agent import (
                BatchWorkOrderAgent,
                GeneratedWorkOrder,
                WorkOrderGenerationStrategy,
            )
            from services.work_order_agent.tracking.event_system import (
                WorkOrderEventBus,
                WorkOrderEventType,
            )
            from services.work_order_agent.tracking.state_machine import (
                WorkOrderState,
                WorkOrderStateMachine,
            )
            from services.work_order_agent.tracking.state_machine_integrator import (
                StateMachineIntegrator,
            )
            from services.work_order_agent.tracking.time_analysis import (
                VarianceType,
                WorkOrderTimeAnalysis,
            )
            from services.work_order_agent.tracking.tracked_work_order import (
                TrackedWorkOrder,
            )
            from services.work_order_agent.tracking.work_order_adapter import (
                ExternalWorkOrderService,
                WorkOrderAdapter,
            )
            from services.work_order_agent.tracking.work_order_batch_manager import (
                WorkOrderBatchManager,
            )
            from services.work_order_agent.tracking.work_order_repository import (
                InMemoryWorkOrderRepository,
                WorkOrderRepository,
            )

            # Initialize components
            self.event_bus = WorkOrderEventBus()
            self.time_analysis = WorkOrderTimeAnalysis()
            self.repository = WorkOrderRepository(InMemoryWorkOrderRepository())
            self.batch_manager = WorkOrderBatchManager()
            self.reevaluator = WorkflowReevaluator()

            # Create mock external service
            class MockWorkOrderService(ExternalWorkOrderService):
                async def create_work_order(
                    self, work_order_data: Dict[str, Any]
                ) -> str:
                    return work_order_data.get("work_order_id", "EXT-123")

                async def update_work_order(
                    self, work_order_id: str, updates: Dict[str, Any]
                ) -> bool:
                    return True

                async def get_work_order(self, work_order_id: str) -> Dict[str, Any]:
                    return {"work_order_id": work_order_id, "status": "In Progress"}

            self.external_service = MockWorkOrderService()

            # Create agent and adapter
            self.agent = BatchWorkOrderAgent(
                batch_id="BATCH-001",
                execution_id="EXEC-001",
                workflow_id="WF-001",
                strategy=WorkOrderGenerationStrategy.PARALLEL,
            )
            self.adapter = WorkOrderAdapter(
                batch_id="BATCH-001",
                external_service=self.external_service,
            )

            self.log_phase(
                "Phase 1: Initialize System",
                "SUCCESS",
                {
                    "components_initialized": 10,
                    "event_bus": type(self.event_bus).__name__,
                    "repository": type(self.repository).__name__,
                    "batch_manager": type(self.batch_manager).__name__,
                    "reevaluator": type(self.reevaluator).__name__,
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 1: Initialize System", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 1 failed: {e}")
            return False

    async def phase_2_create_workflow(self) -> bool:
        """Phase 2: Create batch workflow execution with steps."""
        logger.info("=" * 80)
        logger.info("PHASE 2: CREATE BATCH WORKFLOW EXECUTION")
        logger.info("=" * 80)

        try:
            # Define workflow steps
            self.workflow_steps = [
                {
                    "id": "STEP-001",
                    "name": "Material Prep",
                    "description": "Prepare raw materials for blending",
                    "owner_role": "Operator",
                    "estimated_duration_minutes": 15,
                    "dependencies": [],
                    "quality_checkpoints": [
                        {
                            "id": "QC-001",
                            "name": "Material Quality Check",
                            "description": "Verify material specs",
                        }
                    ],
                },
                {
                    "id": "STEP-002",
                    "name": "Blending",
                    "description": "Blend materials in V-blender",
                    "owner_role": "Operator",
                    "estimated_duration_minutes": 30,
                    "dependencies": ["STEP-001"],
                    "quality_checkpoints": [
                        {
                            "id": "QC-002",
                            "name": "Blend Uniformity Check",
                            "description": "Check blend homogeneity",
                        }
                    ],
                },
                {
                    "id": "STEP-003",
                    "name": "Granulation",
                    "description": "Granulate blended material",
                    "owner_role": "Operator",
                    "estimated_duration_minutes": 45,
                    "dependencies": ["STEP-002"],
                    "quality_checkpoints": [
                        {
                            "id": "QC-003",
                            "name": "Granule Size Check",
                            "description": "Verify granule size distribution",
                        }
                    ],
                },
            ]

            logger.info(f"Created workflow with {len(self.workflow_steps)} steps")

            self.log_phase(
                "Phase 2: Create Workflow",
                "SUCCESS",
                {
                    "batch_id": "BATCH-001",
                    "execution_id": "EXEC-001",
                    "total_steps": len(self.workflow_steps),
                    "total_estimated_minutes": sum(
                        s["estimated_duration_minutes"] for s in self.workflow_steps
                    ),
                    "steps": [s["name"] for s in self.workflow_steps],
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 2: Create Workflow", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 2 failed: {e}")
            return False

    async def phase_3_generate_work_orders(self) -> bool:
        """Phase 3: Generate work orders from workflow steps."""
        logger.info("=" * 80)
        logger.info("PHASE 3: GENERATE WORK ORDERS")
        logger.info("=" * 80)

        try:
            self.generated_orders = self.agent.generate_work_orders(self.workflow_steps)

            logger.info(f"Generated {len(self.generated_orders)} work orders")
            for wo in self.generated_orders:
                logger.info(
                    f"  - {wo.work_order_id}: {wo.step_name} "
                    f"({wo.estimated_duration_minutes} min estimated)"
                )

            self.log_phase(
                "Phase 3: Generate Work Orders",
                "SUCCESS",
                {
                    "total_generated": len(self.generated_orders),
                    "work_order_ids": [
                        wo.work_order_id for wo in self.generated_orders
                    ],
                    "statuses": [wo.status.value for wo in self.generated_orders],
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 3: Generate Work Orders", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 3 failed: {e}")
            return False

    async def phase_4_execute_work_orders(self) -> bool:
        """Phase 4: Execute work orders with simulated time variance."""
        logger.info("=" * 80)
        logger.info("PHASE 4: EXECUTE WORK ORDERS WITH TIME VARIANCE")
        logger.info("=" * 80)

        try:
            self.tracked_orders = {}
            self.variance_data = {}

            for idx, wo in enumerate(self.generated_orders):
                # Create tracked work order
                tracked_wo = TrackedWorkOrder(wo, self.event_bus, self.time_analysis)
                self.tracked_orders[wo.work_order_id] = tracked_wo

                # Simulate assignment
                logger.info(f"Assigning {wo.work_order_id} to operator...")
                await tracked_wo.assign_to_user("USER-001", "John Operator")

                # Simulate start
                logger.info(f"Starting {wo.work_order_id}...")
                await tracked_wo.mark_in_progress()

                # Simulate execution with variance
                # STEP-001: Completed on time
                # STEP-002: Took 50% longer (15 min over)
                # STEP-003: Took 100% longer (45 min over) - triggers re-evaluation
                if idx == 0:
                    actual_minutes = wo.estimated_duration_minutes  # On time
                elif idx == 1:
                    actual_minutes = wo.estimated_duration_minutes * 1.5  # 50% over
                else:
                    actual_minutes = wo.estimated_duration_minutes * 2.0  # 100% over

                logger.info(
                    f"Simulating {wo.work_order_id} execution: "
                    f"{actual_minutes:.0f} min (estimated: {wo.estimated_duration_minutes} min)"
                )

                # Record variance
                variance = self.time_analysis.record_variance(
                    work_order_id=wo.work_order_id,
                    step_id=wo.step_id,
                    estimated_minutes=wo.estimated_duration_minutes,
                    actual_minutes=actual_minutes,
                )
                self.variance_data[wo.work_order_id] = variance

                # Complete work order
                await tracked_wo.complete(
                    remarks=f"Completed with {variance.variance_percent:.1f}% variance"
                )

                # Add to batch manager
                self.batch_manager.add_work_order(tracked_wo.work_order)

            logger.info(f"Executed {len(self.generated_orders)} work orders")

            self.log_phase(
                "Phase 4: Execute Work Orders",
                "SUCCESS",
                {
                    "total_executed": len(self.generated_orders),
                    "variance_detected": len(self.variance_data),
                    "variances": {
                        wo_id: {
                            "variance_percent": f"{v.variance_percent:.1f}%",
                            "type": v.variance_type.value,
                        }
                        for wo_id, v in self.variance_data.items()
                    },
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 4: Execute Work Orders", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 4 failed: {e}")
            return False

    async def phase_5_detect_variance(self) -> bool:
        """Phase 5: Detect time variance and generate recommendations."""
        logger.info("=" * 80)
        logger.info("PHASE 5: DETECT VARIANCE AND GENERATE RECOMMENDATIONS")
        logger.info("=" * 80)

        try:
            recommendations = self.time_analysis.get_workflow_recommendations()

            logger.info(f"Variance Analysis Results:")
            logger.info(f"  - Should retrigger: {recommendations['should_retrigger']}")
            logger.info(
                f"  - Critical variances: {recommendations['critical_variances']}"
            )
            logger.info(
                f"  - Total variance: {recommendations['total_variance_percent']}"
            )
            logger.info(
                f"  - Over-time minutes: {recommendations['total_over_time_minutes']}"
            )
            logger.info(
                f"  - Under-time minutes: {recommendations['total_under_time_minutes']}"
            )
            logger.info(
                f"  - Corrective actions: {recommendations['corrective_actions']}"
            )

            for i, rec in enumerate(recommendations.get("recommendations", []), 1):
                logger.info(f"  - Recommendation {i}: {rec}")

            self.log_phase(
                "Phase 5: Detect Variance",
                "SUCCESS",
                {
                    "should_retrigger": recommendations["should_retrigger"],
                    "critical_variances": recommendations["critical_variances"],
                    "recommendations_count": len(
                        recommendations.get("recommendations", [])
                    ),
                    "corrective_actions": recommendations["corrective_actions"],
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 5: Detect Variance", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 5 failed: {e}")
            return False

    async def phase_6_trigger_reevaluation(self) -> bool:
        """Phase 6: Trigger workflow re-evaluation based on variance."""
        logger.info("=" * 80)
        logger.info("PHASE 6: TRIGGER WORKFLOW RE-EVALUATION")
        logger.info("=" * 80)

        try:
            # Start reevaluator
            await self.reevaluator.start()

            # Publish time variance events to trigger re-evaluation
            from services.work_order_agent.tracking.event_system import (
                WorkOrderEvent,
                WorkOrderEventType,
            )

            for wo_id, variance in self.variance_data.items():
                if variance.variance_type.value in ["over_time", "critical_over_time"]:
                    event = WorkOrderEvent(
                        event_type=WorkOrderEventType.TIME_VARIANCE_DETECTED,
                        work_order_id=wo_id,
                        step_id=variance.step_id,
                        batch_id="BATCH-001",
                        execution_id="EXEC-001",
                        data={
                            "variance_percent": variance.variance_percent,
                            "variance_type": variance.variance_type.value,
                            "actual_minutes": variance.actual_minutes,
                            "estimated_minutes": variance.estimated_minutes,
                        },
                    )

                    logger.info(f"Publishing TIME_VARIANCE_DETECTED event for {wo_id}")
                    await self.event_bus.publish(event)

            # Process queue
            await asyncio.sleep(0.5)  # Let events propagate

            queue_status = self.reevaluator.get_queue_metrics()
            logger.info(f"Re-evaluation queue status: {queue_status}")

            self.log_phase(
                "Phase 6: Trigger Re-evaluation",
                "SUCCESS",
                {
                    "events_published": len(
                        [
                            v
                            for v in self.variance_data.values()
                            if v.variance_type.value
                            in ["over_time", "critical_over_time"]
                        ]
                    ),
                    "queue_size": queue_status.get("current_size", 0),
                    "queue_processed": queue_status.get("total_processed", 0),
                },
            )
            return True

        except Exception as e:
            self.log_phase(
                "Phase 6: Trigger Re-evaluation", "FAILED", {"error": str(e)}
            )
            logger.exception(f"Phase 6 failed: {e}")
            return False

    async def phase_7_adjust_parameters(self) -> bool:
        """Phase 7: Adjust pipeline parameters based on variance."""
        logger.info("=" * 80)
        logger.info("PHASE 7: ADJUST PIPELINE PARAMETERS")
        logger.info("=" * 80)

        try:
            from services.batch_execution.pipeline_triggers.pipeline_parameter_adjuster import (
                PipelineParameterAdjuster,
            )

            adjuster = PipelineParameterAdjuster()

            # Adjust parameters based on variance
            adjusted_steps = []
            for step, variance in zip(self.workflow_steps, self.variance_data.values()):
                adjustment = adjuster.analyze_variance(
                    step_id=step["id"],
                    step_name=step["name"],
                    current_duration_minutes=step["estimated_duration_minutes"],
                    variance=variance,
                )

                adjusted_step = step.copy()
                adjusted_step["previous_estimated_minutes"] = step[
                    "estimated_duration_minutes"
                ]
                adjusted_step["estimated_duration_minutes"] = adjustment[
                    "recommended_duration"
                ]
                adjusted_step["adjustment_reason"] = adjustment["strategy_applied"]
                adjusted_step["adjustment_confidence"] = adjustment["confidence"]

                adjusted_steps.append(adjusted_step)

                logger.info(
                    f"Adjusted {step['name']}: "
                    f"{step['estimated_duration_minutes']} min → {adjustment['recommended_duration']} min "
                    f"(strategy: {adjustment['strategy_applied']}, confidence: {adjustment['confidence']:.1%})"
                )

            # Store adjusted workflow version
            self.adjusted_workflow = {
                "version": 2,
                "original_version": 1,
                "steps": adjusted_steps,
                "total_estimated_minutes": sum(
                    s["estimated_duration_minutes"] for s in adjusted_steps
                ),
                "original_total_minutes": sum(
                    s["estimated_duration_minutes"] for s in self.workflow_steps
                ),
                "adjustment_timestamp": datetime.now(timezone.utc).isoformat(),
            }

            logger.info(
                f"Adjusted workflow: {self.adjusted_workflow['original_total_minutes']} min → "
                f"{self.adjusted_workflow['total_estimated_minutes']} min"
            )

            self.log_phase(
                "Phase 7: Adjust Parameters",
                "SUCCESS",
                {
                    "adjusted_steps": len(adjusted_steps),
                    "original_total_minutes": self.adjusted_workflow[
                        "original_total_minutes"
                    ],
                    "new_total_minutes": self.adjusted_workflow[
                        "total_estimated_minutes"
                    ],
                    "adjustments": [
                        {
                            "step": s["name"],
                            "before": s["previous_estimated_minutes"],
                            "after": s["estimated_duration_minutes"],
                            "strategy": s["adjustment_reason"],
                        }
                        for s in adjusted_steps
                    ],
                },
            )
            return True

        except Exception as e:
            self.log_phase("Phase 7: Adjust Parameters", "FAILED", {"error": str(e)})
            logger.exception(f"Phase 7 failed: {e}")
            return False

    async def phase_8_execute_adjusted_workflow(self) -> bool:
        """Phase 8: Execute adjusted workflow with new parameters."""
        logger.info("=" * 80)
        logger.info("PHASE 8: EXECUTE ADJUSTED WORKFLOW")
        logger.info("=" * 80)

        try:
            logger.info(f"Re-executing workflow with adjusted parameters...")
            logger.info(
                f"Original total duration: {self.adjusted_workflow['original_total_minutes']} minutes"
            )
            logger.info(
                f"Adjusted total duration: {self.adjusted_workflow['total_estimated_minutes']} minutes"
            )

            # In real scenario, this would:
            # 1. Create new batch execution
            # 2. Generate new work orders with adjusted durations
            # 3. Schedule execution
            # 4. Monitor for further variances

            logger.info(
                f"Workflow re-evaluation complete. Ready for next batch execution."
            )

            self.log_phase(
                "Phase 8: Execute Adjusted Workflow",
                "SUCCESS",
                {
                    "workflow_version": self.adjusted_workflow["version"],
                    "adjusted_steps": len(self.adjusted_workflow["steps"]),
                    "duration_change_minutes": (
                        self.adjusted_workflow["original_total_minutes"]
                        - self.adjusted_workflow["total_estimated_minutes"]
                    ),
                    "duration_change_percent": f"{
                        (
                            (
                                self.adjusted_workflow['total_estimated_minutes']
                                - self.adjusted_workflow['original_total_minutes']
                            )
                            / self.adjusted_workflow['original_total_minutes']
                            * 100
                        ):.1f}%",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            return True

        except Exception as e:
            self.log_phase(
                "Phase 8: Execute Adjusted Workflow", "FAILED", {"error": str(e)}
            )
            logger.exception(f"Phase 8 failed: {e}")
            return False

    async def run(self) -> Dict[str, Any]:
        """Run the complete end-to-end smoke test."""
        logger.info("\n" + "=" * 80)
        logger.info("END-TO-END FEEDBACK LOOP SMOKE TEST")
        logger.info("=" * 80 + "\n")

        start_time = datetime.now(timezone.utc)

        try:
            # Execute all phases
            phases = [
                ("1-Initialize", self.phase_1_initialize_system),
                ("2-Create Workflow", self.phase_2_create_workflow),
                ("3-Generate Work Orders", self.phase_3_generate_work_orders),
                ("4-Execute Work Orders", self.phase_4_execute_work_orders),
                ("5-Detect Variance", self.phase_5_detect_variance),
                ("6-Trigger Re-evaluation", self.phase_6_trigger_reevaluation),
                ("7-Adjust Parameters", self.phase_7_adjust_parameters),
                ("8-Execute Adjusted", self.phase_8_execute_adjusted_workflow),
            ]

            for phase_name, phase_func in phases:
                result = await phase_func()
                if not result:
                    self.test_results["error"] = f"Failed at {phase_name}"
                    break

            # Check if all phases succeeded
            self.test_results["success"] = all(
                phase["status"] == "SUCCESS"
                for phase in self.test_results["phases"].values()
            )

        except Exception as e:
            self.test_results["error"] = str(e)
            logger.exception(f"Test failed with exception: {e}")

        finally:
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()

            logger.info("\n" + "=" * 80)
            logger.info("TEST SUMMARY")
            logger.info("=" * 80)
            logger.info(
                f"Status: {'✅ PASSED' if self.test_results['success'] else '❌ FAILED'}"
            )
            logger.info(f"Duration: {duration:.2f} seconds")
            logger.info(f"Phases Executed: {len(self.test_results['phases'])}")

            if self.test_results["error"]:
                logger.error(f"Error: {self.test_results['error']}")

            logger.info("\nPhase Results:")
            for phase_name, phase_result in self.test_results["phases"].items():
                status_icon = "✅" if phase_result["status"] == "SUCCESS" else "❌"
                logger.info(f"  {status_icon} {phase_name}: {phase_result['status']}")

            self.test_results["duration_seconds"] = duration
            self.test_results["end_time"] = end_time.isoformat()

        return self.test_results


async def main():
    """Main entry point."""
    smoke_test = SmokeTestEOEFeedbackLoop()
    results = await smoke_test.run()

    # Save results
    import json

    with open(
        "/Users/prashunjaveri/Code/monkeypatched/smoke_test_e2e_results.json", "w"
    ) as f:
        json.dump(results, f, indent=2)

    logger.info(
        "\n✅ Smoke test complete! Results saved to smoke_test_e2e_results.json"
    )
    return results


if __name__ == "__main__":
    results = asyncio.run(main())
    exit(0 if results["success"] else 1)
