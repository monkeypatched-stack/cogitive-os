"""Plan Compiler — the VALIDATED PLAN -> EXECUTABLE REPRESENTATION boundary.

Compilation-hardening pass. Confirmed by direct reading of `_execute_plan`
(belief_runtime.py) before this pass: no discrete compile stage existed --
each `PlanStep` was inline-converted into an `Action` with capability
resolution happening lazily, one action at a time, only when
`ActionExecutor` actually dispatched it. An unresolvable capability was
discovered mid-execution as a per-action failure, never rejected before
any action ran. A circular or out-of-range `depends_on` reference silently
deadlocked the involved actions into permanent "blocked" outcomes instead
of one clear, explicit rejection.

This module is the fix: a pure, deterministic function that validates a
selected `Plan` upfront -- capability resolvability (given the caller's own
precomputed resolution map), `depends_on` range, and dependency cycles --
and either rejects it explicitly (before any capability is invoked) or
produces a small, provenance-carrying `CompiledPlanGraph`.

Compilation contract (do not violate):
    - MUST NOT invent goals, reinterpret intent, select a different
      candidate, override preferences, predict, execute capabilities,
      mutate beliefs, or learn. It only transforms an already-selected,
      already-validated `Plan` into an inspectable, checked artifact.
    - MUST preserve every plan element verbatim: action/capability name,
      description, parameters (the planner's own structured decision --
      e.g. a chosen product "selection" -- passed through unexamined,
      exactly as `_execute_plan` already treats it), preconditions,
      depends_on, required_permission, step order.
    - MUST fail explicitly, before any capability is invoked, when a step's
      capability cannot be resolved or the dependency graph is malformed
      (out-of-range reference or a cycle) -- never produce a partially
      valid graph and let execution discover the problem later.
    - Output→input VALUE binding between steps (e.g. "node A's output
      provider_id becomes node B's input") is intentionally NOT attempted
      here: those values don't exist until a capability actually runs, so
      no compile-time function could bind them. That binding is already
      correctly implemented at execution time via
      `ActionExecutor`'s `_context_projector`. Compilation only preserves
      the STRUCTURAL ordering constraint (`depends_on`), not runtime data
      flow -- see test_plan_compilation_boundary.py's Test 8 for exactly
      what this means and why it isn't a gap.
    - No `agent` binding concept exists anywhere in this codebase's Plan/
      PlanStep model -- capability/action name is the only selection
      concept, and it is already preserved untouched. See Test 7.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Mapping


@dataclass(frozen=True)
class CompiledNode:
    """One compiled plan step -- traceable back to its exact plan.steps index."""

    step_index: int
    """Absolute 0-based index into the source plan.steps tuple. The
    identity anchor: stable across recompilation of the same plan, and
    what ActionExecutor's own depends_on gating already keys on."""
    node_id: str
    """f"{plan_id}:{step_index}" -- deterministic, no uuid, no clock."""
    capability: str
    """= step.action, verbatim. Never renamed or reinterpreted."""
    resolved_capability_name: str
    """What the capability bus will actually dispatch to (may differ from
    `capability` only in case -- mirrors ActionExecutor's existing
    case-insensitive fallback). Equals `capability` when no resolution
    map was supplied (no bus wired) or the exact name already matched."""
    description: str
    parameters: Mapping[str, Any]
    """Read-only view over step.parameters -- never copied into a mutable
    dict, never examined or reinterpreted."""
    preconditions: tuple[str, ...]
    expected_outcome: str
    depends_on: tuple[int, ...]
    """= step.depends_on, verbatim."""
    required_permission: str


@dataclass(frozen=True)
class CompiledPlanGraph:
    """The compiled, provenance-carrying representation of a validated Plan."""

    plan_id: str
    """The REAL, persisted plan_id when one exists (from plan-hysteresis's
    CurrentPlanRecord, threaded in by the caller), else falls back to the
    tick's execution_id -- see belief_runtime.py::_execute_plan's call
    site. Never fabricated here."""
    goal: str
    """= plan.goal, verbatim. Compilation never reinterprets intent."""
    actor_id: str
    nodes: tuple[CompiledNode, ...]
    """One per plan.steps, in original order -- order IS part of identity."""
    content_hash: str
    """sha256 over plan_id/actor_id/goal/nodes -- deterministic, excludes
    `compiled_at` so recompiling the same plan is verifiably idempotent."""
    source_plan_step_count: int
    """= len(plan.steps) -- cheap integrity cross-check."""
    compiled_at: float = field(default_factory=time.time)
    """Observability only. Never part of identity or content_hash."""


@dataclass(frozen=True)
class CompileOutcome:
    """Result of compile_plan(): either a graph, or a non-empty list of
    explicit, actionable violations. Never both."""

    graph: CompiledPlanGraph | None
    violations: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.violations


def compile_plan(
    plan: Any,
    *,
    plan_id: str,
    actor_id: str,
    resolved_capabilities: Mapping[str, str | None] | None = None,
) -> CompileOutcome:
    """Compile a validated, already-selected Plan into a CompiledPlanGraph.

    `resolved_capabilities` is plain data: a precomputed
    {step.action: resolved_name_or_None} map the caller builds (typically
    via ActionExecutor.resolve_capability -- see belief_runtime.py). This
    keeps compile_plan unambiguously pure (data in, data out) so it stays
    trivially deterministic. `None` means no bus-backed engine is wired --
    mirrors ActionExecutor's own no-bus "simulate success" fallback, so
    every step is trusted as-is rather than rejected for lacking a bus to
    check against.

    Collects ALL violations (does not stop at the first) -- same idiom as
    PlanValidator's own `.violations` list -- so a single compile failure
    reports everything wrong with the plan, not just the first symptom.
    """
    steps = tuple(plan.steps) if plan is not None else ()
    n = len(steps)
    violations: list[str] = []

    # 1. Capability resolvability.
    if resolved_capabilities is not None:
        for i, step in enumerate(steps):
            if resolved_capabilities.get(step.action) is None:
                violations.append(
                    f"step {i} ({step.action!r}): capability not resolvable "
                    f"against the wired capability bus"
                )

    # 2. depends_on range check.
    range_violation_indices: set[int] = set()
    for i, step in enumerate(steps):
        for dep in step.depends_on:
            if dep < 0 or dep >= n:
                violations.append(
                    f"step {i} ({step.action!r}): depends_on references "
                    f"out-of-range index {dep} (plan has {n} steps)"
                )
                range_violation_indices.add(i)

    # 3. Cycle detection -- only meaningful once every edge endpoint is
    # known to exist; an out-of-range edge can't be placed in a graph.
    if not range_violation_indices:
        cycle = _find_cycle(steps)
        if cycle is not None:
            path = " -> ".join(f"{idx}({steps[idx].action})" for idx in cycle)
            violations.append(f"circular dependency: {path}")

    if violations:
        return CompileOutcome(graph=None, violations=tuple(violations))

    nodes = tuple(
        CompiledNode(
            step_index=i,
            node_id=f"{plan_id}:{i}",
            capability=step.action,
            resolved_capability_name=(
                resolved_capabilities.get(step.action, step.action)
                if resolved_capabilities is not None else step.action
            ),
            description=step.description,
            parameters=MappingProxyType(dict(step.parameters)),
            preconditions=tuple(step.preconditions),
            expected_outcome=step.expected_outcome,
            depends_on=tuple(step.depends_on),
            required_permission=step.required_permission,
        )
        for i, step in enumerate(steps)
    )

    goal = getattr(plan, "goal", "") or ""
    content_hash = _content_hash(plan_id, actor_id, goal, nodes)

    graph = CompiledPlanGraph(
        plan_id=plan_id,
        goal=goal,
        actor_id=actor_id,
        nodes=nodes,
        content_hash=content_hash,
        source_plan_step_count=n,
    )
    return CompileOutcome(graph=graph, violations=())


def _find_cycle(steps: tuple) -> tuple[int, ...] | None:
    """Kahn's-algorithm topological sort over depends_on edges (dep -> i).
    Returns one concrete cycle path (as a tuple of step indices) if the
    graph isn't a DAG, else None. Deterministic: starting node for cycle
    reconstruction is always min(leftover) when a cycle exists.

    A self-dependency (dep == i) is a length-1 cycle and falls out of this
    same mechanism without a special case.
    """
    n = len(steps)
    indegree = [0] * n
    out_edges: list[list[int]] = [[] for _ in range(n)]
    for i, step in enumerate(steps):
        for dep in step.depends_on:
            out_edges[dep].append(i)
            indegree[i] += 1

    queue = [i for i in range(n) if indegree[i] == 0]
    processed: list[int] = []
    # Deterministic order: process in ascending index order at each layer.
    queue.sort()
    while queue:
        node = queue.pop(0)
        processed.append(node)
        newly_ready = []
        for nxt in out_edges[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                newly_ready.append(nxt)
        queue.extend(sorted(newly_ready))
        queue.sort()

    if len(processed) == n:
        return None

    leftover = sorted(set(range(n)) - set(processed))
    start = leftover[0]
    return _reconstruct_cycle(steps, start, set(leftover))


def _reconstruct_cycle(steps: tuple, start: int, leftover: set[int]) -> tuple[int, ...]:
    """DFS restricted to the leftover (still-in-a-cycle) node set, starting
    from `start`, until a repeat is found -- yields one concrete cycle."""
    path: list[int] = []
    on_path: dict[int, int] = {}
    node = start
    while True:
        if node in on_path:
            start_pos = on_path[node]
            cycle = path[start_pos:] + [node]
            return tuple(cycle)
        on_path[node] = len(path)
        path.append(node)
        deps = [d for d in steps[node].depends_on if d in leftover]
        # Deterministic: always follow the smallest still-valid dependency.
        node = min(deps)


def _content_hash(plan_id: str, actor_id: str, goal: str, nodes: tuple[CompiledNode, ...]) -> str:
    payload = {
        "plan_id": plan_id,
        "actor_id": actor_id,
        "goal": goal,
        "nodes": [
            {
                "step_index": node.step_index,
                "node_id": node.node_id,
                "capability": node.capability,
                "resolved_capability_name": node.resolved_capability_name,
                "description": node.description,
                "parameters": dict(node.parameters),
                "preconditions": list(node.preconditions),
                "expected_outcome": node.expected_outcome,
                "depends_on": list(node.depends_on),
                "required_permission": node.required_permission,
            }
            for node in nodes
        ],
    }
    blob = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
