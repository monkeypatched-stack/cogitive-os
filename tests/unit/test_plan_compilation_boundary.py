"""Regression coverage for the Compilation-hardening pass.

Scope-defining finding (research done before writing any code, confirmed
by direct reading + one Explore trace, not assumed): the live actor-tick
pipeline (`CognitiveRuntime._execute_plan`, belief_runtime.py) had NO
discrete compile stage. Each `PlanStep` was inline-converted into an
`Action` in a single for-loop, and capability resolution happened LAZILY --
`ActionExecutor._execute_action` called `self._capability_bus.discover(
action.capability)` only when that specific action was actually dispatched,
one at a time. An unresolvable capability was discovered mid-execution as a
per-action failure, never rejected before any action ran. A malformed
`depends_on` (out-of-range index, or a true cycle) silently deadlocked the
involved actions into permanent "blocked" outcomes instead of one clear,
explicit rejection.

Two OTHER real, live "execution graph" systems exist elsewhere in the repo
(`LegacyCognitiveRuntime`'s HTTP `/plan`+`/execute` gateway; `CodeGenRuntime`'s
`ExecutionGraph`/`GraphScheduler`/`ProcessManager`) -- confirmed genuinely
disconnected from this actor-tick pipeline. User explicitly confirmed via
AskUserQuestion: out of scope for this pass.

This pass adds `kernel/pipeline/plan_compiler.py::compile_plan` -- a pure,
deterministic function run at the top of `_execute_plan`, before any
capability is invoked -- validating capability resolvability (given a
precomputed resolution map from `ActionExecutor.resolve_capability`,
itself a small additive public accessor mirroring the executor's existing
case-insensitive resolution logic verbatim), `depends_on` range, and
dependency cycles. On any violation, the plan is rejected explicitly via
the existing `_reject_plan` mechanism -- zero capabilities invoked. On
success, a `CompiledPlanGraph` (real plan_id/goal/actor_id provenance,
one `CompiledNode` per plan step) is attached to `state.compiled_plan_graph`
purely for observability -- never consumed by `ActionExecutor`'s dispatch
loop, which is otherwise completely unchanged. The one behavior change to
the existing per-step loop: `Action.causation_id` now uses the real
plan_id (sourced from the already-built plan-hysteresis Decide stage's
`state.metrics["decide_new_plan_id"]`/`["decide_current_plan_id"]`) instead
of always falling back to execution_id -- finally honoring that field's
own pre-existing docstring contract.

Two required test items don't map onto real behavior here and get honest,
self-documenting tests rather than fabricated passing behavior:
  7. Agent binding -- no `agent`/`agent_id` field exists anywhere in this
     codebase's Plan/PlanStep/Action model. Capability/action name is the
     only selection concept, and it's already preserved untouched.
  8. Input/output VALUE binding between steps (e.g. "node A's output
     provider_id becomes node B's input") is inherently execution-time-only
     (the values don't exist until a capability runs) and is already
     correctly implemented via `ActionExecutor`'s `_context_projector`.
     Compilation only preserves the structural `depends_on` ordering
     constraint, never runtime data flow -- correctly, not as a gap.

Per this session's standing convention, this file is written but not
executed by the assistant. Run with:
    python -m pytest tests/unit/test_plan_compilation_boundary.py -v
"""
from __future__ import annotations

import pytest

from src.monkey_brain.kernel.pipeline.actor import Actor
from src.monkey_brain.kernel.pipeline.belief_runtime import CognitiveRuntime
from src.monkey_brain.kernel.pipeline.belief_state import BeliefState, Plan, PlanStep
from src.monkey_brain.kernel.pipeline.execution_state import CognitiveState
from src.monkey_brain.kernel.pipeline.execution import Action, ActionOutcome, ExecutionResult
from src.monkey_brain.kernel.pipeline.action_executor import ActionExecutor
from src.monkey_brain.kernel.pipeline.plan_compiler import compile_plan, CompiledPlanGraph


# ── Shared helpers (mirror test_execution_boundary_hardening.py's own) ─────

class _StubCapability:
    def __init__(self, success: bool = True, error: str = "", result: dict | None = None) -> None:
        self.success = success
        self.error = error
        self.result = result
        self.call_count = 0

    def handle(self, args: dict) -> dict:
        self.call_count += 1
        if self.result is not None:
            return self.result
        return {"success": self.success, "error": self.error}


class _SpyBus:
    def __init__(self, capabilities: dict[str, _StubCapability]) -> None:
        self._capabilities = capabilities
        self.discover_calls: list[str] = []

    def discover(self, name: str):
        self.discover_calls.append(name)
        return self._capabilities.get(name)

    def names(self):
        return list(self._capabilities.keys())


class _CapturingEngine:
    """Wraps a real ActionExecutor and records the exact Action tuple
    execute() received -- the only way to observe causation_id, since
    ActionExecutor discards Actions after returning ActionOutcomes."""

    def __init__(self, inner: ActionExecutor) -> None:
        self._inner = inner
        self.captured: tuple[Action, ...] | None = None

    def resolve_capability(self, capability: str) -> str | None:
        return self._inner.resolve_capability(capability)

    async def execute(self, actions: tuple[Action, ...], context=None) -> ExecutionResult:
        self.captured = actions
        return await self._inner.execute(actions, context)


def _plan(steps: tuple[PlanStep, ...], goal: str = "buy groceries") -> Plan:
    return Plan(goal=goal, steps=steps, cost=0.0, confidence=0.8, risk=0.0, planner="llm")


def _state(plan: Plan, actor_id: str = "arjun", execution_id: str = "exec-1",
           resolved_permissions: frozenset = frozenset(), decide_plan_id: str = "") -> CognitiveState:
    actor = Actor(actor_id=actor_id, tenant_id="acme")
    belief = BeliefState(actor_id=actor_id, tenant_id="acme")
    belief.plan = plan
    belief.metadata["_resolved_permissions"] = resolved_permissions
    state = CognitiveState(actor=actor, belief=belief)
    state.metrics = {"execution_id": execution_id}
    if decide_plan_id:
        state.metrics["decide_new_plan_id"] = decide_plan_id
    return state


# ═══════════════════════════════════════════════════════════════════════════
# Test 1: Simple linear plan compilation.
# ═══════════════════════════════════════════════════════════════════════════

class TestLinearCompilation:
    def test_two_step_no_dependency_plan_compiles_in_order(self):
        plan = _plan((
            PlanStep(action="FindMilk", description="find milk"),
            PlanStep(action="AddToCart", description="add to cart", depends_on=(0,)),
        ))
        outcome = compile_plan(plan, plan_id="plan-1", actor_id="arjun")
        assert outcome.ok, outcome.violations
        assert [n.step_index for n in outcome.graph.nodes] == [0, 1]
        assert outcome.graph.nodes[1].depends_on == (0,)


# ═══════════════════════════════════════════════════════════════════════════
# Test 2: Branching graph compilation.
# ═══════════════════════════════════════════════════════════════════════════

class TestBranchingCompilation:
    def test_two_steps_both_depend_on_the_same_root(self):
        plan = _plan((
            PlanStep(action="A"),
            PlanStep(action="B", depends_on=(0,)),
            PlanStep(action="C", depends_on=(0,)),
        ))
        outcome = compile_plan(plan, plan_id="plan-2", actor_id="arjun")
        assert outcome.ok
        assert outcome.graph.nodes[1].depends_on == (0,)
        assert outcome.graph.nodes[2].depends_on == (0,)
        # B and C are preserved as distinct nodes, not merged.
        assert outcome.graph.nodes[1].node_id != outcome.graph.nodes[2].node_id


# ═══════════════════════════════════════════════════════════════════════════
# Test 3: Parallel independent nodes.
# ═══════════════════════════════════════════════════════════════════════════

class TestParallelIndependentNodes:
    def test_three_steps_with_no_shared_dependency_compile_independently(self):
        """"Parallel" is a compile-time structural fact only -- no false
        edge is invented between independent steps. Whether ActionExecutor
        actually dispatches them concurrently is an Execution-owned
        decision (it does not today -- a pre-existing, deliberate,
        out-of-scope choice, see belief_runtime.py's own comment at the
        top of the per-step loop) -- compilation does not and cannot
        change that."""
        plan = _plan((PlanStep(action="A"), PlanStep(action="B"), PlanStep(action="C")))
        outcome = compile_plan(plan, plan_id="plan-3", actor_id="arjun")
        assert outcome.ok
        assert all(n.depends_on == () for n in outcome.graph.nodes)


# ═══════════════════════════════════════════════════════════════════════════
# Test 4: Dependency preservation.
# ═══════════════════════════════════════════════════════════════════════════

class TestDependencyPreservation:
    def test_multi_dependency_tuple_preserved_exactly(self):
        plan = _plan((
            PlanStep(action="A"), PlanStep(action="B"),
            PlanStep(action="C", depends_on=(0, 1)),
        ))
        outcome = compile_plan(plan, plan_id="plan-4", actor_id="arjun")
        assert outcome.ok
        assert outcome.graph.nodes[2].depends_on == (0, 1)


# ═══════════════════════════════════════════════════════════════════════════
# Test 5: Candidate preservation (step.parameters fidelity).
# ═══════════════════════════════════════════════════════════════════════════

class TestCandidatePreservation:
    def test_structured_parameters_preserved_verbatim_and_source_unmutated(self):
        params = {"selection": [{"id": "sku-1", "qty": 2}]}
        plan = _plan((PlanStep(action="ProductSelection", parameters=params),))
        outcome = compile_plan(plan, plan_id="plan-5", actor_id="arjun")
        assert outcome.ok
        assert dict(outcome.graph.nodes[0].parameters) == params
        # Compilation must never reinterpret or select a different
        # candidate -- mutating the caller's original dict afterward must
        # not retroactively change what was already compiled.
        params["mutated"] = True
        assert "mutated" not in outcome.graph.nodes[0].parameters
        assert plan.steps[0].parameters is params  # original object untouched by us


# ═══════════════════════════════════════════════════════════════════════════
# Test 6: Capability binding.
# ═══════════════════════════════════════════════════════════════════════════

class TestCapabilityBinding:
    def test_exact_match_capability_resolves(self):
        plan = _plan((PlanStep(action="FindMilk"),))
        outcome = compile_plan(plan, plan_id="plan-6a", actor_id="arjun",
                                resolved_capabilities={"FindMilk": "FindMilk"})
        assert outcome.ok
        assert outcome.graph.nodes[0].capability == "FindMilk"
        assert outcome.graph.nodes[0].resolved_capability_name == "FindMilk"

    def test_case_drift_capability_resolves_to_canonical_registered_name(self):
        plan = _plan((PlanStep(action="findMilk"),))
        outcome = compile_plan(plan, plan_id="plan-6b", actor_id="arjun",
                                resolved_capabilities={"findMilk": "FindMilk"})
        assert outcome.ok
        node = outcome.graph.nodes[0]
        assert node.capability == "findMilk"          # original, verbatim
        assert node.resolved_capability_name == "FindMilk"  # what will actually dispatch

    @pytest.mark.asyncio
    async def test_integration_via_real_action_executor_resolve_capability(self):
        cap = _StubCapability()
        bus = _SpyBus({"FindMilk": cap})
        executor = ActionExecutor(capability_bus=bus)
        assert executor.resolve_capability("findmilk") == "FindMilk"
        assert executor.resolve_capability("FindMilk") == "FindMilk"
        assert executor.resolve_capability("Nonexistent") is None
        assert cap.call_count == 0  # a pure probe, never invokes .handle()


# ═══════════════════════════════════════════════════════════════════════════
# Test 7: Agent binding — honest limitation.
# ═══════════════════════════════════════════════════════════════════════════

class TestAgentBinding:
    def test_no_agent_concept_exists_capability_is_the_only_selection(self):
        """Confirmed by direct reading: PlanStep, Plan, and Action have no
        `agent`/`agent_id` field anywhere in this codebase. There is no
        separate agent-selection layer for compilation to preserve beyond
        capability binding, which IS already preserved untouched (Test 6).
        This test makes that absence self-documenting and regression-proof
        rather than silently skipped or faked as "passing" behavior that
        doesn't exist."""
        plan = _plan((PlanStep(action="AskActor"),))
        outcome = compile_plan(plan, plan_id="plan-7", actor_id="arjun")
        assert outcome.ok
        node = outcome.graph.nodes[0]
        assert not hasattr(node, "agent")
        assert not hasattr(node, "agent_id")
        assert node.capability == "AskActor"  # the closest existing analog, preserved


# ═══════════════════════════════════════════════════════════════════════════
# Test 8: Input/output binding — honest limitation.
# ═══════════════════════════════════════════════════════════════════════════

class TestInputOutputBinding:
    def test_compiled_node_has_no_field_for_a_cross_step_runtime_value(self):
        """Compilation cannot bind "node A's output becomes node B's
        input": output values don't exist until a capability actually
        runs, and compilation happens before any capability is invoked.
        CompiledNode only carries the planner's own STATIC parameters
        (Test 5) and the STRUCTURAL depends_on ordering constraint
        (Test 4) -- never a placeholder for a future runtime value."""
        plan = _plan((
            PlanStep(action="ProductSelection", parameters={"selection": [{"id": "prod_milk", "qty": 2}]}),
            PlanStep(action="OrderCreation", depends_on=(0,)),
        ))
        outcome = compile_plan(plan, plan_id="plan-8", actor_id="arjun")
        assert outcome.ok
        for node in outcome.graph.nodes:
            assert not hasattr(node, "output")
            assert not hasattr(node, "inputs")
            assert not hasattr(node, "bindings")

    @pytest.mark.asyncio
    async def test_real_output_to_input_propagation_still_works_with_compile_step_inserted(self):
        """Regression, not a new capability: the compile step must be a
        no-op with respect to ActionExecutor's existing, correct,
        execution-time output->input binding (_context_projector). Mirrors
        test_execution_boundary_hardening.py::TestOutputPropagation."""
        from src.monkey_brain.kernel.domains.grocery import (
            build_default_capability_bus, project_action_result_to_context,
        )
        from src.monkey_brain.kernel.knowledge_graph import EntityType, KnowledgeGraph

        kg = KnowledgeGraph()
        kg.add_entity("prod_milk", EntityType.ASSET, "Whole Milk (2L)", {"price": 4.5, "quantity": 20})

        bus = build_default_capability_bus()
        executor = ActionExecutor(capability_bus=bus, context_projector=project_action_result_to_context)

        plan = _plan((
            PlanStep(action="ProductSelection", description="select milk",
                     parameters={"selection": [{"id": "prod_milk", "qty": 2}]}, confidence=0.9),
            PlanStep(action="OrderCreation", description="create order", depends_on=(0,), confidence=0.9),
        ), goal="buy 2 liters of whole milk")

        state = _state(plan, actor_id="milk_buyer", execution_id="exec-milk-trace")
        state.context = {"knowledge_graph": kg, "actor_id": "milk_buyer", "question": "Buy 2 liters of whole milk"}
        rt = CognitiveRuntime(execution_engine=executor)
        result_state = await rt._execute_plan(state)

        er = result_state.execution_result
        assert er.actions[0].success is True
        assert er.actions[1].success is True
        assert er.actions[1].result["order_id"] is not None
        assert result_state.compiled_plan_graph is not None  # compile ran, didn't interfere


# ═══════════════════════════════════════════════════════════════════════════
# Test 9: Invalid capability rejection.
# ═══════════════════════════════════════════════════════════════════════════

class TestInvalidCapabilityRejection:
    def test_unresolvable_capability_rejected_with_actionable_error(self):
        plan = _plan((PlanStep(action="Nonexistent"),))
        outcome = compile_plan(plan, plan_id="plan-9", actor_id="arjun",
                                resolved_capabilities={"Nonexistent": None})
        assert not outcome.ok
        assert outcome.graph is None
        assert "Nonexistent" in outcome.violations[0]

    @pytest.mark.asyncio
    async def test_integration_missing_capability_rejects_before_any_dispatch(self):
        cap_a = _StubCapability()
        bus = _SpyBus({"FindMilk": cap_a})  # AddToCart intentionally not registered
        plan = _plan((
            PlanStep(action="FindMilk"),
            PlanStep(action="AddToCart"),
        ))
        state = _state(plan)
        rt = CognitiveRuntime(execution_engine=ActionExecutor(capability_bus=bus))
        result_state = await rt._execute_plan(state)

        assert result_state.execution_result.success_count == 0
        assert result_state.execution_result.failure_count == 2
        assert cap_a.call_count == 0, "not even the resolvable capability may be invoked"
        assert "compile_violations" in result_state.metrics
        assert "AddToCart" in result_state.metrics["compile_violations"][0]


# ═══════════════════════════════════════════════════════════════════════════
# Test 10: Circular dependency rejection.
# ═══════════════════════════════════════════════════════════════════════════

class TestCircularDependencyRejection:
    def test_two_node_mutual_cycle_rejected(self):
        plan = _plan((
            PlanStep(action="A", depends_on=(1,)),
            PlanStep(action="B", depends_on=(0,)),
        ))
        outcome = compile_plan(plan, plan_id="plan-10a", actor_id="arjun")
        assert not outcome.ok
        assert "circular" in outcome.violations[0]
        assert "0" in outcome.violations[0] and "1" in outcome.violations[0]

    def test_three_node_cycle_rejected(self):
        plan = _plan((
            PlanStep(action="A", depends_on=(2,)),
            PlanStep(action="B", depends_on=(0,)),
            PlanStep(action="C", depends_on=(1,)),
        ))
        outcome = compile_plan(plan, plan_id="plan-10b", actor_id="arjun")
        assert not outcome.ok
        assert "circular" in outcome.violations[0]

    @pytest.mark.asyncio
    async def test_integration_cycle_rejects_before_any_dispatch(self):
        """Closes the pre-existing gap: before this pass, a mutual cycle
        silently deadlocked both actions into permanent "blocked" outcomes
        (each waiting on the other's depends_on) with no single clear
        rejection reason. Now it's one explicit compile-time rejection."""
        cap_a, cap_b = _StubCapability(), _StubCapability()
        bus = _SpyBus({"A": cap_a, "B": cap_b})
        plan = _plan((
            PlanStep(action="A", depends_on=(1,)),
            PlanStep(action="B", depends_on=(0,)),
        ))
        state = _state(plan)
        rt = CognitiveRuntime(execution_engine=ActionExecutor(capability_bus=bus))
        result_state = await rt._execute_plan(state)

        assert result_state.execution_result.failure_count == 2
        assert cap_a.call_count == 0 and cap_b.call_count == 0
        assert "circular" in result_state.metrics["compile_violations"][0]


# ═══════════════════════════════════════════════════════════════════════════
# Test 11: Missing dependency rejection.
# ═══════════════════════════════════════════════════════════════════════════

class TestMissingDependencyRejection:
    def test_out_of_range_index_rejected(self):
        plan = _plan((PlanStep(action="A", depends_on=(5,)),))
        outcome = compile_plan(plan, plan_id="plan-11a", actor_id="arjun")
        assert not outcome.ok
        assert "out-of-range" in outcome.violations[0]
        assert "5" in outcome.violations[0]

    def test_negative_index_rejected(self):
        plan = _plan((PlanStep(action="A", depends_on=(-1,)),))
        outcome = compile_plan(plan, plan_id="plan-11b", actor_id="arjun")
        assert not outcome.ok
        assert "out-of-range" in outcome.violations[0]


# ═══════════════════════════════════════════════════════════════════════════
# Test 12: Stable node identity.
# ═══════════════════════════════════════════════════════════════════════════

class TestStableNodeIdentity:
    def test_node_id_derived_from_plan_id_and_step_index(self):
        plan = _plan((PlanStep(action="A"), PlanStep(action="B")))
        outcome = compile_plan(plan, plan_id="plan-12", actor_id="arjun")
        assert outcome.graph.nodes[0].node_id == "plan-12:0"
        assert outcome.graph.nodes[1].node_id == "plan-12:1"

    def test_identical_across_two_compiles_of_the_same_plan_and_plan_id(self):
        plan = _plan((PlanStep(action="A"),))
        out_a = compile_plan(plan, plan_id="plan-12b", actor_id="arjun")
        out_b = compile_plan(plan, plan_id="plan-12b", actor_id="arjun")
        assert out_a.graph.nodes[0].node_id == out_b.graph.nodes[0].node_id


# ═══════════════════════════════════════════════════════════════════════════
# Test 13: Deterministic compilation.
# ═══════════════════════════════════════════════════════════════════════════

class TestDeterministicCompilation:
    def test_same_plan_object_compiled_twice_yields_equal_hash_and_nodes(self):
        plan = _plan((PlanStep(action="A", depends_on=()), PlanStep(action="B", depends_on=(0,))))
        out_a = compile_plan(plan, plan_id="plan-13", actor_id="arjun")
        out_b = compile_plan(plan, plan_id="plan-13", actor_id="arjun")
        assert out_a.graph.content_hash == out_b.graph.content_hash
        assert out_a.graph.nodes == out_b.graph.nodes
        # Deliberately NOT asserting full dataclass equality of the two
        # CompiledPlanGraph objects -- compiled_at is a real wall-clock
        # timestamp (observability only, excluded from content_hash) and
        # would make that assertion spuriously flaky. Do not "fix" this
        # into `out_a.graph == out_b.graph` later.


# ═══════════════════════════════════════════════════════════════════════════
# Test 14: Compilation provenance.
# ═══════════════════════════════════════════════════════════════════════════

class TestCompilationProvenance:
    @pytest.mark.asyncio
    async def test_compiled_graph_carries_real_plan_id_goal_and_actor_id(self):
        cap = _StubCapability()
        bus = _SpyBus({"FindMilk": cap})
        plan = _plan((PlanStep(action="FindMilk"),), goal="buy milk")
        state = _state(plan, actor_id="arjun", execution_id="exec-1", decide_plan_id="plan-real-123")
        rt = CognitiveRuntime(execution_engine=ActionExecutor(capability_bus=bus))
        result_state = await rt._execute_plan(state)

        graph = result_state.compiled_plan_graph
        assert graph.plan_id == "plan-real-123"
        assert graph.goal == "buy milk"
        assert graph.actor_id == "arjun"

    @pytest.mark.asyncio
    async def test_dispatched_action_causation_id_is_the_real_plan_id_not_execution_id(self):
        cap = _StubCapability()
        bus = _SpyBus({"FindMilk": cap})
        inner = ActionExecutor(capability_bus=bus)
        capturing = _CapturingEngine(inner)
        plan = _plan((PlanStep(action="FindMilk"),))
        state = _state(plan, execution_id="exec-1", decide_plan_id="plan-real-999")
        rt = CognitiveRuntime(execution_engine=capturing)
        await rt._execute_plan(state)

        assert capturing.captured[0].causation_id == "plan-real-999"
        assert capturing.captured[0].correlation_id == "exec-1"

    @pytest.mark.asyncio
    async def test_causation_id_falls_back_to_execution_id_when_no_real_plan_id_exists(self):
        cap = _StubCapability()
        bus = _SpyBus({"FindMilk": cap})
        inner = ActionExecutor(capability_bus=bus)
        capturing = _CapturingEngine(inner)
        plan = _plan((PlanStep(action="FindMilk"),))
        state = _state(plan, execution_id="exec-1")  # no decide_plan_id
        rt = CognitiveRuntime(execution_engine=capturing)
        await rt._execute_plan(state)

        assert capturing.captured[0].causation_id == "exec-1"


# ═══════════════════════════════════════════════════════════════════════════
# Test 15: Same plan compiled twice (independently-constructed objects)
# produces equivalent graphs.
# ═══════════════════════════════════════════════════════════════════════════

class TestSamePlanTwiceProducesEquivalentGraphs:
    def test_value_equal_but_distinct_plan_objects_hash_equal(self):
        plan_a = _plan((PlanStep(action="A", description="find milk"),))
        plan_b = _plan((PlanStep(action="A", description="find milk"),))
        assert plan_a is not plan_b
        h1 = compile_plan(plan_a, plan_id="plan-15", actor_id="arjun").graph.content_hash
        h2 = compile_plan(plan_b, plan_id="plan-15", actor_id="arjun").graph.content_hash
        assert h1 == h2

    def test_hash_is_not_degenerate_a_real_field_change_changes_it(self):
        plan_a = _plan((PlanStep(action="A", description="find milk"),))
        plan_c = _plan((PlanStep(action="A", description="find bread"),))
        h1 = compile_plan(plan_a, plan_id="plan-15", actor_id="arjun").graph.content_hash
        h3 = compile_plan(plan_c, plan_id="plan-15", actor_id="arjun").graph.content_hash
        assert h1 != h3


# ═══════════════════════════════════════════════════════════════════════════
# Regression: compilation does not interfere with permission denial.
# ═══════════════════════════════════════════════════════════════════════════

class TestCompilationDoesNotInterfereWithPermissionDenial:
    @pytest.mark.asyncio
    async def test_permission_denied_step_with_unregistered_capability_still_denied_not_compile_rejected(self):
        """A permission-denied step is never dispatched regardless of
        whether its capability exists in the bus -- compilation must not
        require bus registration for it (governance and capability
        existence are different concerns). Confirms this existing,
        working, tested behavior (test_execution_boundary_hardening.py::
        TestDependenciesAreRespected) survives the compile step's
        insertion unchanged."""
        cap_b = _StubCapability()
        bus = _SpyBus({"OrderCreation": cap_b})  # ReserveFunds intentionally unregistered
        plan = _plan((
            PlanStep(action="ReserveFunds", description="reserve", required_permission="perm-finance"),
            PlanStep(action="OrderCreation", description="place order", depends_on=(0,)),
        ))
        state = _state(plan, resolved_permissions=frozenset())
        rt = CognitiveRuntime(execution_engine=ActionExecutor(capability_bus=bus))
        result_state = await rt._execute_plan(state)

        assert "Permission denied" in result_state.actions[0].error
        assert "blocked" in result_state.actions[1].error
        assert cap_b.call_count == 0
        assert result_state.compiled_plan_graph is not None, (
            "compile must succeed -- ReserveFunds is permission-denied, "
            "never dispatched, so its missing bus registration must not "
            "reject the whole plan"
        )
