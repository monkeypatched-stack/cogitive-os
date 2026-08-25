"""MonkeyBrain World Model (Xavier).

The simulator injects Kernel and Runtime.
The simulator never duplicates either.
Simulation executes identical pipelines to production.

Responsibilities:
- Digital Twins: virtual replicas of real-world entities
- Prediction: forecast pipeline outcomes
- Replay: replay historical executions
- Counterfactual: execute alternative scenarios
- World State: maintain current, expected, and counterfactual states
"""

from cortex.digital_twin import DigitalTwin, TwinState
from cortex.prediction import PredictionEngine, Prediction
from cortex.replay import ReplayEngine, Recording, Comparison
from cortex.counterfactual import CounterfactualEngine, Scenario
from cortex.world_state import WorldState, WorldSnapshot

__all__ = [
    "DigitalTwin",
    "TwinState",
    "PredictionEngine",
    "Prediction",
    "ReplayEngine",
    "Recording",
    "Comparison",
    "CounterfactualEngine",
    "Scenario",
    "WorldState",
    "WorldSnapshot",
]
