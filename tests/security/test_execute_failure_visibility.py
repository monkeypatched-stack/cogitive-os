"""A failed execution must be detectable by the client (E-1, E-3).

Found by driving /execute end-to-end through the LLM bridge:

    answer       : "LineResolverAgent: [ok] | ... | CalibrationDueEvaluatorAgent: [failed]"
    llm_answered : True
    HTTP         : 200

The server log said `transition compensating -> failed` and `one or more nodes could not be
compensated` — the run FAILED. But the workload's success flag is dropped by the
(answer, semantic_hits, graph_paths, llm_answered) tuple, so the route returned 200 with the
failure visible only as "[failed]" buried in a prose string. And llm_answered was
`bool(answer)` — true merely because that status string is non-empty.
"""
from __future__ import annotations

from src.monkey_brain.kernel.models.execute import ExecuteResponse
from src.monkey_brain.kernel.plan.goals.run_store import get_run_store


def test_execute_response_states_the_outcome_explicitly():
    fields = ExecuteResponse.model_fields
    assert "success" in fields, "a client must be able to detect a failed run"
    assert "failed_steps" in fields
    assert fields["success"].default is True          # additive: old clients keep working


def test_run_store_records_and_returns_the_outcome():
    store = get_run_store()
    store.store_outcome("run-xyz", {"success": False, "failed_steps": ["CalibrationDueEvaluatorAgent"]})
    out = store.get_outcome("run-xyz")
    assert out["success"] is False
    assert out["failed_steps"] == ["CalibrationDueEvaluatorAgent"]


def test_unknown_run_has_no_outcome():
    assert get_run_store().get_outcome("never-ran") is None


def test_llm_answered_is_not_merely_a_non_empty_string():
    """It used to be bool(answer) — so a status dump like 'A: [failed]' set it True."""
    src = (__import__("pathlib").Path("src/monkey_brain/kernel/execute/runtime/workload.py")
           .read_text())
    assert '"llm_answered": bool(answer)' not in src, "llm_answered is lying again"
    assert '"llm_answered": llm_answered' in src


def test_status_summary_is_not_reported_as_an_llm_answer():
    """When the only 'answer' is a join of per-agent statuses, llm_answered must be False."""
    src = (__import__("pathlib").Path("src/monkey_brain/kernel/execute/runtime/workload.py")
           .read_text())
    join = src.index('answer = " | ".join(parts)')          # the status-dump line
    tail = src[join:join + 200]
    assert "llm_answered = False" in tail, \
        "the status summary is still being reported as an LLM answer"
