# Plan: Refactor Cognitive Kernel to Learn Epistemic Transitions

## Objective
Separate the system into three independent responsibilities: Proposal Intelligence (LLM), Predictive Intelligence (Epistemic Transition Model), and Decision Intelligence (Planner). The LLM proposes; the transition model learns; the planner decides.

## Current State (from gap analysis)
- `epa_transition()` is already the single state mutation gate (Law 1 enforced)
- `epa_loss()` computes 5 of 7 loss terms (missing L_C, L_G)
- `_update_learning()` updates retrieval + capability utility + planner (correct but incomplete)
- BellmanLearningLoop operates in execution-universe, not epistemic-universe
- BellmanPolicy Q-table keyed by pipeline hash, not epistemic state
- MonteCarloPlanner uses Q-table + transition table, not epa_transition() predictions
- CognitiveLoop uses deprecated EpistemicState, not integrated with kernel step
- LossDrivenRepair uses its own loss decomposition, not epa_loss() terms
- Two parallel state universes exist (EPA vs execution)

## Changes Required

### Phase 1: Clean Dead Code (safe, no behavior change)
1. Remove dead `LossEngine` class from `cognitive_kernel.py` (lines 82-145)
2. Remove dead `SimulationEngine` class from `cognitive_kernel.py` (lines 152-211)
3. Remove deprecated `EpistemicState` import from `cognitive_kernel.py`
4. Deprecate `cognitive_loop.py` with a warning (superseded by kernel step)

### Phase 2: Complete epa_loss() Terms
5. Add L_C (constraint loss) to `epa_loss()` in `cortex/epa.py` — measures whether capability preconditions were satisfied
6. Add L_G (goal progress loss) to `epa_loss()` — measures distance to goal completion
7. Update `epa_loss()` to return all 7 terms: L_S, L_B, L_A, L_M, L_K, L_C, L_G

### Phase 3: Integrate LossDrivenRepair into Kernel
8. Wire `LossDrivenRepair` into `CognitiveKernel.step()` — when L_E exceeds threshold, run repair loop
9. Make `LossDrivenRepair` accept epa_loss() dict directly (not raw float)
10. Map L_S/L_B/L_A/L_M/L_K terms to repair strategies

### Phase 4: Unify Learning Updates
11. Remove redundant `_capability_utility` from `cognitive_kernel.py` (keep only in `_update_learning`)
12. Update `_update_learning()` to also update transition model quality tracking
13. Make `_update_learning()` log at DEBUG level (no silent `except Exception: pass`)

### Phase 5: Bridge BellmanPolicy to Epistemic Space (optional, lower priority)
14. Add epistemic state hash method to `EpistemicPredictiveState` for Q-table keying
15. Add `update_from_epa_loss()` to BellmanPolicy that uses epa_loss terms as reward signal
16. Document that BellmanPolicy operates in pipeline-execution domain until full bridge is complete

### Phase 6: Bridge MonteCarloPlanner to EPA (optional, lower priority)
17. Add `epa_predict` method to MonteCarloPlanner that uses epa_transition() for rollout predictions
18. Fall back to Q-table when epa_transition() unavailable

## Files Modified
1. `src/monkey_brain/kernel/cognitive_kernel.py` — remove dead code, wire repair, clean imports
2. `src/cortex/epa.py` — add L_C and L_G to epa_loss()
3. `src/monkey_brain/kernel/loss_driven_repair.py` — accept epa_loss dict, map terms
4. `src/monkey_brain/kernel/rl/cognitive_loop.py` — deprecate with warning

## Files NOT Modified (already correct)
- `cortex/epistemic.py` — B=(K,C,U) correctly structured
- `transition.py` — provenance system mature
- `consensus.py` — well-implemented

## Execution Order
Phase 1 (clean) → Phase 2 (loss terms) → Phase 3 (repair integration) → Phase 4 (unify learning)

Phases 5-6 are optional bridges that can be done later.

## Verification
- `python3 tests/harden_test.py` — must pass 61/61
- `python3 tests/unit/test_solvers.py` — must pass 61/61
- `python3 tests/unit/test_repair.py` — must pass 3/3
- `python3 tests/unit/test_performance.py` — must complete without error
- Run `python3 -c "from src.monkey_brain.kernel.cognitive_kernel import CognitiveKernel"` — no import errors
- Run `python3 -c "from src.cortex.epa import epa_loss"` — no import errors
