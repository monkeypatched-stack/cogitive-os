"""Execute phase — run the selected workload and return ExecutionResult."""

from __future__ import annotations

import time
from typing import Any

from src.monkey_brain.kernel.plan.goals.executor import GoalExecutor
from src.monkey_brain.kernel.execute.models import ExecutionResult


async def run_workload(
    goal: Any,
    selected_workload: Any,
    state: Any,
    mongo_client: Any,
) -> tuple[ExecutionResult, int]:
    """Execute the selected workload and return (result, elapsed_ms)."""
    start = time.perf_counter()
    result = await GoalExecutor().execute(
        goal=goal,
        mongo_client=mongo_client,
        question=state.question,
        workload=selected_workload,
        state=state,
    )
    exec_ms = int((time.perf_counter() - start) * 1000)
    return (
        result if isinstance(result, ExecutionResult) else ExecutionResult(*result),
        exec_ms,
    )
