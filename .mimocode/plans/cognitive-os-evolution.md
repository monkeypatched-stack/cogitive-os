# Plan: Cognitive OS Architecture Evolution

## Scope
Transform from "code generator" to "Cognitive OS" with stimulus→cognition→response loop, enterprise workflows, and self-improving engineering knowledge.

## Already Implemented (verify, don't rebuild)
- `epa_transition()` = single state mutation gate (Law 1) ✓
- `EpistemicPredictiveState` E_t = (S, B, A, M) ✓
- Solver mesh with 9 deterministic/stochastic solvers ✓
- Knowledge Pack system with fusion, decay, retrieval ✓
- Capability Bus with provider abstraction ✓
- Agent Mesh with spawn/execute/terminate ✓
- LossDrivenRepair convergence loop ✓
- RetrievalPolicy (E[IG] > Cost) ✓
- EvidenceFusionEngine ✓
- 13-stage engineering pipeline ✓
- Generated work-order service ✓

## New Implementation (6 work items)

### W1: Wire Solver Mesh into EPA Transition (HIGH)
**Spec**: "Simulation Precedes Execution" — solvers predict consequences before execution.
**What**: epa_transition() should use SolverMesh to predict E_{t+1} when no capability is provided, instead of just applying evidence.
**Files**: `src/cortex/epa.py`
**Change**: Add solver prediction path in epa_transition() that dispatches to JEPA for world prediction, MonteCarlo for planning, and Constraint for feasibility checks.

### W2: Mode A vs Mode B (Artifact vs Runtime) (HIGH)
**Spec**: Two execution modes — artifact generation (no simulator) vs runtime (simulator + execution).
**What**: Add execution_mode parameter to CognitiveKernel.step(). Mode A skips simulation. Mode B runs simulation alongside execution.
**Files**: `src/monkey_brain/kernel/cognitive_kernel.py`

### W3: WorkOrder → Todo → Notification Workflow (HIGH)
**Spec**: Cross-agent collaboration benchmark.
**What**: Create a working demo where:
1. WorkOrderAgent creates a work order
2. WorkOrderCreated event triggers TodoAgent
3. TodoAgent creates worker todos
4. NotificationCapability sends alerts
5. Worker accepts → Todo updated → WorkOrder progress updated
**Files**: `tests/integration/test_enterprise_workflow.py` + agent stubs

### W4: Engineering Knowledge Pack Publishing (MEDIUM)
**Spec**: Every successful pipeline execution publishes a Knowledge Pack.
**What**: After pipeline completion, auto-generate a KP containing spec, generated code, governance findings, benchmark results.
**Files**: `src/monkey_brain/kernel/engineering_knowledge.py` (new)

### W5: Cross-Agent Integration Benchmark (MEDIUM)
**Spec**: Part 5 of the refactor — automated validation of enterprise workflows.
**What**: Test that WorkOrder→Todo→Notification completes end-to-end with all assertions.
**Files**: `tests/integration/test_cross_agent_benchmark.py` (new)

### W6: Capability Discovery for Generated Agents (LOW)
**Spec**: Agents declare required capabilities, resolved dynamically.
**What**: Add `required_capabilities: list[str]` to AgentSpec. CapabilityBus auto-discovers and wires at spawn time.
**Files**: `src/monkey_brain/kernel/agent_mesh.py`, `src/monkey_brain/kernel/capabilities/bus.py`

## Execution Order
1. W1 (wire solvers into EPA) — unlocks prediction
2. W2 (Mode A/B) — clean separation
3. W3 (workflow demo) — demonstrates enterprise behavior
4. W5 (benchmark) — validates workflow
5. W4 (knowledge publishing) — self-improvement
6. W6 (capability discovery) — dynamic wiring

## Files to Read Before Implementation
- `src/cortex/epa.py` — understand current transition model
- `src/monkey_brain/kernel/cognitive_kernel.py` — already modified
- `generated/work-order/` — existing service to build workflow from
- `packages/broca/broca/agents/` — existing agent patterns
- `packages/cerebellum/capabilities/` — existing capability patterns
