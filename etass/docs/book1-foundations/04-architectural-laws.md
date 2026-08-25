# Architectural Laws

These are non-negotiable structural invariants. Code that violates them is wrong, regardless of whether it works.

---

## Law 1 — Single Transition Gate

**Every persistent change to the Cognitive System must occur through `epa_transition()`.**

```python
# CORRECT
state = epa_transition(state, goal, action, evidence=evidence, ...)

# WRONG — belief.update() outside epa_transition
state.B = state.B.update(outcome)

# WRONG — direct confidence mutation
state.B.confidence += 0.1

# WRONG — spawn outside epa_transition's M update
mesh.spawn(agent)
```

This is the Cognitive System's equivalent of a database transaction. All four components of `E_t = (S, B, A, M)` must update together, atomically, in one call. Partial updates produce inconsistent state.

**Why:** The loss function `L_E = L_S + L_B + L_A + L_M` is defined over the joint update. If you update B without updating A, the loss computation is wrong. If you update S without updating M, the mesh becomes stale.

**Enforcement point:** `CognitiveKernel.step()` — the only place state advances.

---

## Law 2 — Evidence Pipeline

**Every solver result must flow through Evidence Fusion before reaching the belief state.**

```
SolverResult
    ↓
_build_evidence(action, solver_result)  →  evidence dict
    ↓
EvidenceFusionEngine.fuse(evidence)     →  fused evidence
    ↓
epa_transition(..., evidence=fused, fusion_engine=...) → E_{t+1}
```

```python
# CORRECT — solver result becomes evidence, fusion happens inside epa_transition
evidence = _build_evidence(action, cap_result)
E_next = epa_transition(E_t, G_t, action, evidence=evidence, fusion_engine=fusion_engine)

# WRONG — solver directly updates belief
belief = state.B.update(SimulationOutcome.from_round(solver_result, {}))

# WRONG — solver result bypasses fusion
state.B.confidence = solver_result.confidence
```

**Why:** Evidence fusion (harmonic mean, contradiction penalty, modality weighting) exists to prevent a single biased source from overwriting belief. Bypassing it means unverified, unweighted evidence reaches the epistemic state directly — this breaks the L_B accuracy guarantee.

**Enforcement point:** `epa_transition()` in `cortex/epa.py` — the only place `BeliefState.update()` is called.

---

## Law 3 — Capability Graph as Affordance Authority

**`A_t` (available actions) must come from `CapabilityGraph`, not from hardcoded lists.**

```python
# CORRECT
affordances = capability_graph.available(world_state)

# WRONG
affordances = ["CreateWorkOrder", "AssignWorkOrder"]  # hardcoded
```

The graph encodes which capabilities are enabled/disabled by each transition. Hardcoding affordances means the planner cannot learn from capability interactions.

---

## Corollary — The Center Is the Epistemic Transition

The system is not centered on:
- `BeliefState` (it's an input/output of transition)
- `KnowledgeItem` (it's content inside B)
- `SolverResult` (it's raw evidence, pre-fusion)
- `AgentMesh` (it's the M component)

The center is **`epa_transition()`** — the function that maps `(E_t, G_t, a_t) → E_{t+1}`.

Everything else is either input to that function or derived from its output.

---

## Law 4 — Learning Loop Completeness

**Every step must update all learning components. The planner must learn too.**

```
Simulation round
       ↓
_update_learning(E_t, E_next, action, evidence, loss_dict)
       │
       ├── RetrievalPolicy.update(cost=L_B, gained=ΔK)
       ├── _capability_utility[action] ← (1-α)*prev + α*(1 - L_E)
       └── PlannerPolicy.update(goal.objective, action, L_E)
```

**Why planner policy matters:** Without it, the system learns which capabilities reduce L_E, but the sequence in which capabilities are chosen for a given goal never improves. `PlannerPolicy.get_best_action(goal, candidates)` biases future selection toward historically effective actions for that specific goal.

**Enforcement point:** `CognitiveKernel._update_learning()` — called on every step.

---

## Migration State (as of current implementation)

| Component | Status | Target |
|---|---|---|
| `kernel/rl/epistemic.py::BeliefState` | DEPRECATED | Delete → use `cortex.epistemic.BeliefState` |
| `kernel/rl/epistemic.py::EpistemicState` | DEPRECATED | Delete → use `cortex.epa.EpistemicPredictiveState` |
| `kernel/agent_mesh.py::ExecutionPool` | Active (execution layer) | Keep |
| `broca/mesh.py::AgentMesh` | Active (EPA topology layer) | Keep |
| `cortex/epa.py::EpistemicPredictiveState` | Canonical | Keep |
| `cortex/epistemic.py::BeliefState` | Canonical | Keep |
