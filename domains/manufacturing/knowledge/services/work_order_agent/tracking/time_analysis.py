"""
Work Order Time Analysis

Tracks actual execution time against estimated time.
Detects variances and suggests corrective actions.
Triggers workflow re-evaluation when needed.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class VarianceType(Enum):
    """Types of time variance."""

    UNDER_TIME = "under_time"  # Completed faster than expected
    OVER_TIME = "over_time"  # Took longer than expected
    CRITICAL_OVER_TIME = "critical_over_time"  # Significantly over time
    NO_VARIANCE = "no_variance"  # On time


class TimeVariance:
    """Represents a time variance."""

    def __init__(
        self,
        work_order_id: str,
        step_id: str,
        estimated_minutes: int,
        actual_minutes: float,
    ):
        self.variance_id = f"VAR-{uuid4().hex[:8]}"
        self.work_order_id = work_order_id
        self.step_id = step_id
        self.estimated_minutes = estimated_minutes
        self.actual_minutes = actual_minutes
        self.variance_minutes = actual_minutes - estimated_minutes
        self.variance_percent = (self.variance_minutes / estimated_minutes) * 100
        self.created_at = datetime.now(timezone.utc)

        # Determine variance type
        if self.variance_percent < -10:
            self.variance_type = VarianceType.UNDER_TIME
        elif self.variance_percent > 50:
            self.variance_type = VarianceType.CRITICAL_OVER_TIME
        elif self.variance_percent > 20:
            self.variance_type = VarianceType.OVER_TIME
        else:
            self.variance_type = VarianceType.NO_VARIANCE

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "variance_id": self.variance_id,
            "work_order_id": self.work_order_id,
            "step_id": self.step_id,
            "estimated_minutes": self.estimated_minutes,
            "actual_minutes": self.actual_minutes,
            "variance_minutes": self.variance_minutes,
            "variance_percent": f"{self.variance_percent:.1f}%",
            "variance_type": self.variance_type.value,
            "created_at": self.created_at.isoformat(),
        }


class CorrectiveAction:
    """Suggested corrective action for time variance."""

    def __init__(
        self,
        action_id: str,
        variance_id: str,
        action_type: str,
        description: str,
        priority: str,
        suggested_adjustment_minutes: int,
    ):
        self.action_id = action_id
        self.variance_id = variance_id
        self.action_type = (
            action_type  # "adjust_duration", "parallelize", "rethink_workflow"
        )
        self.description = description
        self.priority = priority  # "low", "medium", "high", "critical"
        self.suggested_adjustment_minutes = suggested_adjustment_minutes
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "action_id": self.action_id,
            "variance_id": self.variance_id,
            "action_type": self.action_type,
            "description": self.description,
            "priority": self.priority,
            "suggested_adjustment_minutes": self.suggested_adjustment_minutes,
            "created_at": self.created_at.isoformat(),
        }


class WorkOrderTimeAnalysis:
    """Analyzes work order execution time and suggests improvements."""

    def __init__(self):
        self.variances: Dict[str, TimeVariance] = {}
        self.actions: Dict[str, CorrectiveAction] = {}
        self.analysis_history: List[Dict[str, Any]] = []

    def record_variance(
        self,
        work_order_id: str,
        step_id: str,
        estimated_minutes: int,
        actual_minutes: float,
    ) -> TimeVariance:
        """Record a time variance."""
        variance = TimeVariance(
            work_order_id=work_order_id,
            step_id=step_id,
            estimated_minutes=estimated_minutes,
            actual_minutes=actual_minutes,
        )

        self.variances[variance.variance_id] = variance

        logger.info(
            f"Time variance recorded for {work_order_id}: "
            f"{actual_minutes:.1f} min vs {estimated_minutes} min "
            f"({variance.variance_percent:.1f}%)"
        )

        # Generate corrective actions
        actions = self._generate_corrective_actions(variance)
        for action in actions:
            self.actions[action.action_id] = action

        return variance

    def _generate_corrective_actions(
        self, variance: TimeVariance
    ) -> List[CorrectiveAction]:
        """Generate corrective actions based on variance."""
        actions = []

        if variance.variance_type == VarianceType.CRITICAL_OVER_TIME:
            # Significantly over time - needs rethinking
            action = CorrectiveAction(
                action_id=f"ACT-{uuid4().hex[:8]}",
                variance_id=variance.variance_id,
                action_type="rethink_workflow",
                description=f"Step {variance.step_id} took {variance.actual_minutes:.1f} minutes, "
                f"expected {variance.estimated_minutes} minutes. Consider breaking into smaller steps "
                f"or reassessing process flow.",
                priority="critical",
                suggested_adjustment_minutes=int(variance.variance_minutes + 15),
            )
            actions.append(action)

        elif variance.variance_type == VarianceType.OVER_TIME:
            # Moderately over time - adjust duration
            action = CorrectiveAction(
                action_id=f"ACT-{uuid4().hex[:8]}",
                variance_id=variance.variance_id,
                action_type="adjust_duration",
                description=f"Step {variance.step_id} took {variance.variance_percent:.1f}% longer than estimated. "
                f"Update estimate from {variance.estimated_minutes} to {int(variance.actual_minutes + 5)} minutes.",
                priority="high",
                suggested_adjustment_minutes=int(variance.variance_minutes + 5),
            )
            actions.append(action)

        elif variance.variance_type == VarianceType.UNDER_TIME:
            # Completed faster - can optimize
            action = CorrectiveAction(
                action_id=f"ACT-{uuid4().hex[:8]}",
                variance_id=variance.variance_id,
                action_type="parallelize",
                description=f"Step {variance.step_id} completed {abs(variance.variance_percent):.1f}% faster. "
                f"Consider parallelizing with other steps or reducing buffer time.",
                priority="low",
                suggested_adjustment_minutes=int(variance.variance_minutes),
            )
            actions.append(action)

        return actions

    def should_retrigger_pipeline(self) -> bool:
        """Determine if workflow should be re-evaluated."""
        critical_actions = [
            a for a in self.actions.values() if a.priority == "critical"
        ]
        return len(critical_actions) > 0

    def get_workflow_recommendations(self) -> Dict[str, Any]:
        """Get workflow recommendations based on analysis."""
        total_variance_percent = 0
        total_over_time = 0
        total_under_time = 0
        critical_count = 0

        for variance in self.variances.values():
            total_variance_percent += variance.variance_percent
            if variance.variance_type == VarianceType.OVER_TIME:
                total_over_time += variance.variance_minutes
            elif variance.variance_type == VarianceType.UNDER_TIME:
                total_under_time += abs(variance.variance_minutes)
            if variance.variance_type == VarianceType.CRITICAL_OVER_TIME:
                critical_count += 1

        avg_variance = (
            total_variance_percent / len(self.variances) if self.variances else 0
        )

        recommendations = {
            "should_retrigger": self.should_retrigger_pipeline(),
            "critical_variances": critical_count,
            "total_variance_percent": f"{avg_variance:.1f}%",
            "total_over_time_minutes": total_over_time,
            "total_under_time_minutes": total_under_time,
            "corrective_actions": len([a for a in self.actions.values()]),
            "critical_actions": len(
                [a for a in self.actions.values() if a.priority == "critical"]
            ),
            "recommendations": [],
        }

        if avg_variance > 30:
            recommendations["recommendations"].append(
                "Major workflow revision needed - average variance >30%"
            )
        if critical_count > 2:
            recommendations["recommendations"].append(
                f"Multiple critical variances detected ({critical_count}) - consider workflow redesign"
            )
        if total_over_time > 120:
            recommendations["recommendations"].append(
                f"Total overrun {total_over_time} minutes - consider parallelization opportunities"
            )

        return recommendations

    def get_summary(self) -> Dict[str, Any]:
        """Get time analysis summary."""
        return {
            "total_variances": len(self.variances),
            "total_actions": len(self.actions),
            "variance_types": {
                "under_time": len(
                    [
                        v
                        for v in self.variances.values()
                        if v.variance_type == VarianceType.UNDER_TIME
                    ]
                ),
                "on_time": len(
                    [
                        v
                        for v in self.variances.values()
                        if v.variance_type == VarianceType.NO_VARIANCE
                    ]
                ),
                "over_time": len(
                    [
                        v
                        for v in self.variances.values()
                        if v.variance_type == VarianceType.OVER_TIME
                    ]
                ),
                "critical_over_time": len(
                    [
                        v
                        for v in self.variances.values()
                        if v.variance_type == VarianceType.CRITICAL_OVER_TIME
                    ]
                ),
            },
            "action_priorities": {
                "low": len([a for a in self.actions.values() if a.priority == "low"]),
                "medium": len(
                    [a for a in self.actions.values() if a.priority == "medium"]
                ),
                "high": len([a for a in self.actions.values() if a.priority == "high"]),
                "critical": len(
                    [a for a in self.actions.values() if a.priority == "critical"]
                ),
            },
            "workflow_recommendations": self.get_workflow_recommendations(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "variances": [v.to_dict() for v in self.variances.values()],
            "corrective_actions": [a.to_dict() for a in self.actions.values()],
            "summary": self.get_summary(),
        }
