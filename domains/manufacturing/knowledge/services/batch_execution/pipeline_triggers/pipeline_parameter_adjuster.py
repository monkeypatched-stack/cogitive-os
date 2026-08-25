"""
Pipeline Parameter Adjuster

Analyzes time variance data and generates adjusted workflow parameters:
- Calculates adjusted durations for steps
- Generates new DAG with updated timings
- Maintains parameter history for audit trail
- Provides rollback capability
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

logger = logging.getLogger(__name__)


class AdjustmentStrategy(str):
    """Strategies for adjusting parameters."""

    ADDITIVE = "additive"  # Add variance to base estimate
    MULTIPLICATIVE = "multiplicative"  # Multiply base estimate by factor
    PERCENTILE = "percentile"  # Use nth percentile of observations
    ADAPTIVE = "adaptive"  # Use weighted average of strategies


class ParameterAdjustment:
    """A single parameter adjustment."""

    def __init__(
        self,
        adjustment_id: str,
        step_id: str,
        original_value: float,
        adjusted_value: float,
        strategy: AdjustmentStrategy,
        confidence: float,
        rationale: str,
    ):
        self.adjustment_id = adjustment_id
        self.step_id = step_id
        self.original_value = original_value
        self.adjusted_value = adjusted_value
        self.delta = adjusted_value - original_value
        self.delta_percent = (
            (self.delta / original_value) * 100 if original_value != 0 else 0
        )
        self.strategy = strategy
        self.confidence = confidence  # 0.0 - 1.0
        self.rationale = rationale
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "adjustment_id": self.adjustment_id,
            "step_id": self.step_id,
            "original_value": self.original_value,
            "adjusted_value": self.adjusted_value,
            "delta": self.delta,
            "delta_percent": f"{self.delta_percent:.1f}%",
            "strategy": self.strategy,
            "confidence": f"{self.confidence:.2f}",
            "rationale": self.rationale,
            "created_at": self.created_at.isoformat(),
        }


class WorkflowParameterSet:
    """A complete set of workflow parameters."""

    def __init__(self, parameter_set_id: str, version: int):
        self.parameter_set_id = parameter_set_id
        self.version = version
        self.parameters: Dict[str, Any] = {}
        self.step_durations: Dict[str, float] = {}
        self.dependencies: Dict[str, List[str]] = {}
        self.created_at = datetime.now(timezone.utc)
        self.is_active = False

    def set_step_duration(self, step_id: str, duration: float):
        """Set duration for a step."""
        self.step_durations[step_id] = duration

    def set_dependency(self, step_id: str, depends_on: List[str]):
        """Set dependencies for a step."""
        self.dependencies[step_id] = depends_on

    def get_total_duration(self) -> float:
        """Estimate total workflow duration (critical path)."""
        # Simple implementation: sum of all durations
        # In production, would calculate critical path
        return sum(self.step_durations.values())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "parameter_set_id": self.parameter_set_id,
            "version": self.version,
            "step_durations": self.step_durations,
            "dependencies": self.dependencies,
            "total_duration": self.get_total_duration(),
            "created_at": self.created_at.isoformat(),
            "is_active": self.is_active,
        }


class PipelineParameterAdjuster:
    """
    Analyzes time variance and adjusts workflow parameters.

    Provides:
    - Variance analysis and adjustment calculation
    - Multiple adjustment strategies
    - Parameter set versioning
    - Audit trail and rollback capability
    """

    def __init__(self):
        self.adjustments: Dict[str, ParameterAdjustment] = {}
        self.parameter_sets: Dict[str, WorkflowParameterSet] = {}
        self.adjustment_history: List[Dict[str, Any]] = []
        self.current_parameter_set_id: Optional[str] = None

    def analyze_variance(
        self,
        step_id: str,
        estimated_duration: float,
        actual_duration: float,
        historical_durations: Optional[List[float]] = None,
    ) -> ParameterAdjustment:
        """
        Analyze variance for a step and generate adjustment.

        Args:
            step_id: ID of the step
            estimated_duration: Original estimated duration
            actual_duration: Actual observed duration
            historical_durations: Past observations for percentile calculation

        Returns:
            ParameterAdjustment with recommended changes
        """
        variance = actual_duration - estimated_duration
        variance_percent = (
            (variance / estimated_duration) * 100 if estimated_duration != 0 else 0
        )

        # Determine adjustment strategy and value
        adjusted_duration = self._calculate_adjusted_duration(
            step_id=step_id,
            estimated_duration=estimated_duration,
            actual_duration=actual_duration,
            historical_durations=historical_durations,
        )

        # Determine strategy used
        strategy = self._select_strategy(
            variance_percent=variance_percent,
            has_history=historical_durations is not None
            and len(historical_durations) > 2,
        )

        # Calculate confidence based on variance magnitude
        confidence = self._calculate_confidence(
            variance_percent=variance_percent,
            has_history=historical_durations is not None
            and len(historical_durations) > 0,
        )

        # Generate rationale
        rationale = self._generate_rationale(
            step_id=step_id,
            variance_percent=variance_percent,
            actual_duration=actual_duration,
            estimated_duration=estimated_duration,
            adjusted_duration=adjusted_duration,
        )

        # Create adjustment
        adjustment = ParameterAdjustment(
            adjustment_id=f"ADJ-{uuid4().hex[:8]}",
            step_id=step_id,
            original_value=estimated_duration,
            adjusted_value=adjusted_duration,
            strategy=strategy,
            confidence=confidence,
            rationale=rationale,
        )

        self.adjustments[adjustment.adjustment_id] = adjustment
        logger.info(
            f"Parameter adjustment generated for {step_id}: "
            f"{estimated_duration:.1f}m -> {adjusted_duration:.1f}m "
            f"({strategy} strategy, {confidence:.1%} confidence)"
        )

        return adjustment

    def create_adjusted_parameter_set(
        self,
        base_version: int,
        adjustments: List[ParameterAdjustment],
        base_parameters: Optional[Dict[str, float]] = None,
    ) -> WorkflowParameterSet:
        """
        Create a new parameter set with adjustments applied.

        Args:
            base_version: Version this is based on
            adjustments: Adjustments to apply
            base_parameters: Original parameter values

        Returns:
            New WorkflowParameterSet with adjustments applied
        """
        parameter_set_id = f"PARAMS-{uuid4().hex[:12]}"
        new_version = base_version + 1

        parameter_set = WorkflowParameterSet(
            parameter_set_id=parameter_set_id,
            version=new_version,
        )

        # Apply base parameters
        if base_parameters:
            for step_id, duration in base_parameters.items():
                parameter_set.set_step_duration(step_id, duration)

        # Apply adjustments
        for adjustment in adjustments:
            parameter_set.set_step_duration(
                adjustment.step_id, adjustment.adjusted_value
            )

        self.parameter_sets[parameter_set_id] = parameter_set
        logger.info(
            f"Parameter set {parameter_set_id} created (v{new_version}) "
            f"with {len(adjustments)} adjustments"
        )

        return parameter_set

    def activate_parameter_set(self, parameter_set_id: str):
        """Activate a parameter set for use."""
        # Deactivate current
        if (
            self.current_parameter_set_id
            and self.current_parameter_set_id in self.parameter_sets
        ):
            self.parameter_sets[self.current_parameter_set_id].is_active = False

        # Activate new
        if parameter_set_id in self.parameter_sets:
            self.parameter_sets[parameter_set_id].is_active = True
            self.current_parameter_set_id = parameter_set_id
            logger.info(f"Parameter set {parameter_set_id} activated")

            # Log to history
            self.adjustment_history.append(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "event": "parameter_set_activated",
                    "parameter_set_id": parameter_set_id,
                }
            )

    def rollback_to_version(self, version: int) -> Optional[WorkflowParameterSet]:
        """Rollback to a previous parameter set version."""
        for param_set in self.parameter_sets.values():
            if param_set.version == version:
                self.activate_parameter_set(param_set.parameter_set_id)
                logger.info(f"Rolled back to parameter set version {version}")

                self.adjustment_history.append(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "event": "rollback",
                        "version": version,
                    }
                )
                return param_set

        logger.warning(f"No parameter set found with version {version}")
        return None

    def get_active_parameter_set(self) -> Optional[WorkflowParameterSet]:
        """Get the currently active parameter set."""
        if (
            self.current_parameter_set_id
            and self.current_parameter_set_id in self.parameter_sets
        ):
            return self.parameter_sets[self.current_parameter_set_id]
        return None

    def get_adjustment_impact(
        self, adjustments: List[ParameterAdjustment]
    ) -> Dict[str, Any]:
        """Calculate overall impact of adjustments."""
        total_delta_minutes = sum(adj.delta for adj in adjustments)
        positive_deltas = sum(adj.delta for adj in adjustments if adj.delta > 0)
        negative_deltas = sum(adj.delta for adj in adjustments if adj.delta < 0)
        avg_confidence = (
            sum(adj.confidence for adj in adjustments) / len(adjustments)
            if adjustments
            else 0
        )

        return {
            "total_adjustments": len(adjustments),
            "total_delta_minutes": f"{total_delta_minutes:.1f}",
            "positive_deltas_minutes": f"{positive_deltas:.1f}",
            "negative_deltas_minutes": f"{negative_deltas:.1f}",
            "avg_confidence": f"{avg_confidence:.2f}",
            "adjustment_strategies": self._count_strategies(adjustments),
        }

    def get_summary(self) -> Dict[str, Any]:
        """Get parameter adjuster summary."""
        return {
            "total_adjustments": len(self.adjustments),
            "total_parameter_sets": len(self.parameter_sets),
            "active_parameter_set": self.current_parameter_set_id,
            "adjustment_history_length": len(self.adjustment_history),
            "adjustment_summary": self._summarize_adjustments(),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "adjustments": [adj.to_dict() for adj in self.adjustments.values()],
            "parameter_sets": [ps.to_dict() for ps in self.parameter_sets.values()],
            "active_parameter_set_id": self.current_parameter_set_id,
            "adjustment_history": self.adjustment_history[-20:],  # Last 20 events
            "summary": self.get_summary(),
        }

    @staticmethod
    def _calculate_adjusted_duration(
        step_id: str,
        estimated_duration: float,
        actual_duration: float,
        historical_durations: Optional[List[float]] = None,
    ) -> float:
        """Calculate adjusted duration using multiple strategies."""
        # Additive: use actual plus safety margin
        additive = actual_duration + (actual_duration * 0.1)  # 10% margin

        # Multiplicative: scale estimated by ratio
        ratio = actual_duration / estimated_duration if estimated_duration != 0 else 1.0
        multiplicative = estimated_duration * min(ratio, 2.0)  # Cap at 2x

        # Percentile: use 75th percentile if history available
        if historical_durations and len(historical_durations) > 2:
            sorted_hist = sorted(historical_durations + [actual_duration])
            percentile_idx = int(len(sorted_hist) * 0.75)
            percentile = sorted_hist[min(percentile_idx, len(sorted_hist) - 1)]
        else:
            percentile = actual_duration

        # Return weighted average
        adjusted = additive * 0.3 + multiplicative * 0.3 + percentile * 0.4
        return max(adjusted, actual_duration)  # Never reduce below actual

    @staticmethod
    def _select_strategy(
        variance_percent: float, has_history: bool
    ) -> AdjustmentStrategy:
        """Select best strategy based on variance characteristics."""
        if has_history and abs(variance_percent) > 10:
            return AdjustmentStrategy.PERCENTILE
        elif abs(variance_percent) > 30:
            return AdjustmentStrategy.ADAPTIVE
        else:
            return AdjustmentStrategy.ADDITIVE

    @staticmethod
    def _calculate_confidence(variance_percent: float, has_history: bool) -> float:
        """Calculate confidence in adjustment (0.0 - 1.0)."""
        base_confidence = 0.7

        # Reduce confidence if large variance
        if abs(variance_percent) > 50:
            base_confidence -= 0.2
        elif abs(variance_percent) > 30:
            base_confidence -= 0.1

        # Increase confidence if historical data
        if has_history:
            base_confidence += 0.15

        return max(0.0, min(1.0, base_confidence))

    @staticmethod
    def _generate_rationale(
        step_id: str,
        variance_percent: float,
        actual_duration: float,
        estimated_duration: float,
        adjusted_duration: float,
    ) -> str:
        """Generate human-readable rationale for adjustment."""
        if variance_percent > 0:
            direction = "longer"
        else:
            direction = "shorter"

        return (
            f"Step {step_id} completed {direction} than estimated "
            f"({actual_duration:.1f}m vs {estimated_duration:.1f}m, "
            f"{variance_percent:+.1f}%). "
            f"Adjusting estimate from {estimated_duration:.1f}m to {adjusted_duration:.1f}m."
        )

    @staticmethod
    def _count_strategies(adjustments: List[ParameterAdjustment]) -> Dict[str, int]:
        """Count adjustments by strategy."""
        counts = {}
        for adj in adjustments:
            strategy = adj.strategy
            counts[strategy] = counts.get(strategy, 0) + 1
        return counts

    def _summarize_adjustments(self) -> Dict[str, Any]:
        """Summarize all adjustments."""
        if not self.adjustments:
            return {"count": 0}

        total_delta = sum(adj.delta for adj in self.adjustments.values())
        avg_confidence = sum(adj.confidence for adj in self.adjustments.values()) / len(
            self.adjustments
        )

        return {
            "count": len(self.adjustments),
            "total_delta_minutes": f"{total_delta:.1f}",
            "avg_confidence": f"{avg_confidence:.2f}",
            "by_strategy": self._count_strategies(list(self.adjustments.values())),
        }
