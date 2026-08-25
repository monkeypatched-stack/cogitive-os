# cortex

## Module: cortex
- **Layer:** 2
- **Alias:** Xavier
- **Role:** World model, knowledge graph, digital twins, simulation
- **Owns:** DigitalTwins, Simulation, Prediction, Replay, CounterfactualExecution, WorldModelState, Reward, Loss, Experience, Feedback
- **Never Owns:** PipelineExecution, CapabilityExecution, Planning, NaturalLanguageProcessing, Persistence (canonical)

## Principle: cortex-principle-1
> The simulator injects Kernel and Runtime. It never duplicates either.

## Principle: cortex-principle-2
> Simulation executes identical pipelines to production. No separate sim-only path.

## Principle: cortex-principle-3
> cortex supports what-if execution without modifying production state.

## Principle: cortex-principle-4
> The world model observes. It never triggers execution.

## Invariant: CORTEX-INV-001
- **Rule:** simulator_does_not_duplicate_kernel
- **Severity:** critical
- **Rationale:** cortex/simulator.py never duplicates monkey_brain/kernel logic.
- **Audit:** Verify: cortex/simulator.py never duplicates monkey_brain/kernel logic.
- **Rejection:** REJECTED — Simulator duplicates kernel.

## Invariant: CORTEX-INV-002
- **Rule:** no_execution_in_cortex
- **Severity:** critical
- **Rationale:** cortex never executes production pipelines. It simulates them.
- **Audit:** Verify: cortex never executes production pipelines. It simulates them.
- **Rejection:** REJECTED — cortex contains production execution.

## Invariant: CORTEX-INV-003
- **Rule:** world_model_is_read_only
- **Severity:** high
- **Rationale:** world_model.py is a read-consistent view. It never initiates writes.
- **Audit:** Verify: world_model.py is a read-consistent view. It never initiates writes.
- **Rejection:** REJECTED — World model initiates writes.

## Prompt
**Preamble:** Module: cortex — World model, knowledge graph, digital twins, simulation

**Chain of Thought:**
1. Assert: cortex maintains the world model. It reasons about state. It never executes. — _CORTEX-INV-002_ ⚠️ AUDIT GATE
2. Map each file in src/cortex/ to exactly one world-model responsibility.
3. Verify simulator.py injects kernel and runtime — never reimplements them. — _CORTEX-INV-001_ ⚠️ AUDIT GATE
4. Verify world_model.py is a consistent read view. No writes initiated. — _CORTEX-INV-003_ ⚠️ AUDIT GATE
5. Verify prediction.py and replay.py use production pipeline contracts.
6. Produce: SimulationArchitecture, PredictionAPIs, ReplayAPIs.

**Review Gate:** constitutional
- **Approved:** APPROVED — cortex conforms to World Model Constitution v1.0.0
- **Rejected:** REJECTED — Simulator duplicates kernel., REJECTED — cortex executes production pipelines., REJECTED — World model initiates writes.
