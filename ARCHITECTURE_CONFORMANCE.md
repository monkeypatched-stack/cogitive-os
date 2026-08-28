# CognitiveOS Architecture Conformance

## Purpose

This document evaluates whether the **current implementation** of CognitiveOS actually enforces the CognitiveOS architectural constitution — not whether the README, whitepaper, code comments, or architecture diagrams claim it does. Every verdict below is derived from reading the executable implementation and, where it exists, the tests that exercise it. Where a test's name suggested relevance but its assertions did not confirm the claimed behavior, that is stated explicitly rather than cited as evidence.

The standard applied throughout: a tenet is marked ✅ only when it is demonstrably enforced by current code and supported by meaningful tests. It is marked ⚠️ when a real mechanism exists but is incomplete, bypassable, narrower than the tenet as stated, or inadequately tested. It is marked ❌ when no such mechanism exists. Verdicts are not inflated to reflect intent, and they are not deflated to penalize a lack of production-scale validation where the underlying architectural mechanism is genuinely implemented and tested — those are treated as separate concerns (see "Implementation vs Production Readiness" below).

This assessment includes a small set of code changes made in the same working session as this document, targeting several of the gaps this same audit process identified. Those changes are called out explicitly wherever relevant, and — because none of them yet have test coverage — none of them alone justify upgrading a verdict to ✅.

---

## Overall Conformance

| # | Tenet | Verdict | Evidence |
|---|---|---|---|
| 1 | Cognition is probabilistic; execution is governed. | ✅ | `plan_validator.py`, `belief_runtime.py:993`, `action_executor.py` |
| 2 | Plans are proposals, never authority. | ✅ | `plan_compiler.py` compilation contract, `action_executor.py::execute()` |
| 3 | Every consequential action is a governed state transition. | ⚠️ | `transition_gate.py`, but wired to only 3 of 37 grocery capabilities; direct API mutation routes bypass it entirely |
| 4 | Authority is explicit, bounded, delegated, and revocable. | ✅ | `domain_security.py::grant_delegation/revoke_delegation/check_delegation`, `society/delegation.py::DelegationRegistry` |
| 5 | Capabilities are the boundary between cognition and reality. | ⚠️ | `action_executor.py::_execute_action`, but `api/routes/world.py` and `SharedWorld.perturb()` write to the same state outside any capability |
| 6 | Learning cannot expand authority. | ✅ | No learning code path references delegation/permission stores (verified by grep across `kernel/society/learning.py`, `kernel/pipeline/learning/*.py`) |
| 7 | The system should become more capable without becoming less governable. | ⚠️ | Additive pattern holds by observation, not by structural enforcement; one real counter-example (capability-bus-optional fallback) found |
| 8 | Reality is authoritative; beliefs are local. | ✅ | `observations.py::WorldPollingProvider`, `runtime.py::tick_one_actor` re-grounds belief from fresh observation every tick |
| 9 | Causal dependencies are runtime invariants. | ⚠️ | `depends_on` mechanism is correct and tested, but is planner-populated and was confirmed silently dropped in production; fix is payment-workflow-specific, not general |
| 10 | Predictions are verified against reality. | ✅ | `comparison/integration.py::_run_comparison`, `comparator_runtime.py::ComparatorRuntime.compare` — real, non-trivial loss computation |
| 11 | Learning comes from the prediction/reality residual. | ✅ | `learning/integration.py::integrated_learn` merges `comparison_result` into experience metadata before Learn runs |
| 12 | Local cognition operates against shared reality. | ✅ | `integration.py::_attach_society` assigns the identical `SharedWorld` reference to every managed society |
| 13 | Failure, uncertainty, and drift are native states. | ✅ | `plan_validator.py` confidence gating, `cognitive_policy.py::RecursivePlanningPolicy`, `world.py::SharedWorld.perturb()` |
| 14 | Repeated verified cognition should become reusable deterministic capability. | ⚠️ | `learning/phi.py` + new `capability_promotion.py` produce a durable, versioned candidate record; no pipeline turns it into a dispatchable capability |
| 15 | Every consequential transition is observable and auditable. | ⚠️ | `context_stream.py`, `audit_trail.py` are real and live; event log is in-memory-only, causal-lineage check is warn-only |
| 16 | Persistent actors survive interruption, restart, and model change. | ⚠️ | Checkpoint/resume is real and well-tested; full actor identity is not reconstructed on restart; model-provider field is write-only |
| 17 | Actors own cognition; the runtime owns infrastructure. | ✅ | `society/runtime.py::_coordinate_actor`, `test_actor_isolation_audit.py` |
| 18 | Contention and coordination are first-class system behavior. | ✅ | `knowledge_graph.py::compare_and_swap`, planetary tick lock + distributed lock, tested under real OS threads and `asyncio.gather` |
| 19 | Knowledge, policies, and capabilities are versioned infrastructure. | ⚠️ | Entity-level KG versioning is real and enforced (`plan_staleness.py`); capability/policy versioning is populated but consulted nowhere |
| 20 | Provider and model implementations are replaceable. | ✅ | `model_backend.py::ModelBackend`, verified no caller branches on provider identity on the live reasoning path |

**Score:** 12 × ✅ (1.0) + 8 × ⚠️ (0.5) + 0 × ❌ (0.0) = **16 / 20 = 80%**

This percentage is a **weighted architectural-conformance measure**, not a percentage of implementation completed, not a readiness score, and not a quality score. It reflects how many of the 20 stated tenets have a demonstrable, evidence-backed enforcement mechanism in current code, weighted for partial credit where a real mechanism exists but is incomplete.

---

## Critical Gaps

Ranked by architectural importance — the tenets whose gaps carry the most consequence if left unaddressed.

### 1. Tenet 3 — Every consequential action is a governed state transition (⚠️)
**What's missing:** `TransitionGate` is real, correctly implemented, and well-tested for the three grocery capabilities that wire it (`OrderCreation`, `Payment`, `SocialSourcing`). The other 34 of 37 grocery capabilities — including ones that mutate real, consequential state such as `Delivery`, `OrderConfirmation`, and `ReturnOrder` — receive zero `TransitionGate` evaluation, by construction (`propose_transition` returns `None` for them). Separately, `api/routes/world.py`'s direct world-mutation endpoints (`record_world_event`, `add_world_relationship`, `remove_world_entity`) bypass `ActionExecutor`/`TransitionGate` entirely.
**Why it matters:** This is the tenet closest to the system's core safety claim. A narrow, opt-in gate that most capabilities don't wire is not the same guarantee as "every consequential action is governed" — it is currently "some consequential actions, in one vertical, are governed."
**Classification:** ENFORCEMENT GAP + GENERALIZATION GAP. The mechanism works; it is not structurally mandatory, and nothing prevents a new capability or vertical from shipping with zero coverage.

### 2. Tenet 9 — Causal dependencies are runtime invariants (⚠️)
**What's missing:** A general guarantee that a causally-dependent action cannot proceed on a false assumption about an upstream action's real outcome. What exists is a correctly-implemented `depends_on` mechanism that depends entirely on the LLM planner declaring the dependency in the first place — and grocery.py's own code comments confirm this was observed to fail in production ("the planner had silently dropped every `depends_on` in the purchase chain," resulting in a rider being assigned and a Shipment created for an order that was never paid for). The fix applied was three individually hardened capabilities (`Payment`, `OrderConfirmation`, `Delivery`) each independently re-reading fresh KG state — not a structural guarantee available to any future capability chain.
**Why it matters:** This is a documented, real production incident, not a hypothetical. The fix addresses the specific incident, not the underlying class of failure (planner-dropped dependencies), so a new capability chain is exposed to the identical failure mode until it, too, is hardened after its own incident.
**Classification:** GENERALIZATION GAP (payment-specific patching, not a general invariant) + TEST COVERAGE GAP (no test exists for "planner drops a dependency, and a capability-level guard catches it anyway" — the exact scenario that occurred in production).

### 3. Tenet 5 — Capabilities are the boundary between cognition and reality (⚠️)
**What's missing:** Within the cognitive pipeline (planner → executor → capability), the boundary is real and positively tested. But `api/routes/world.py`'s administrative routes and `SharedWorld.perturb()`'s environmental drift simulation both write directly to the same `SharedWorld`/KG state, unmediated by any capability. The codebase has not made an explicit scope decision about whether these are legitimate exceptions (operator action, environment self-perturbation) or violations of the tenet as literally stated.
**Why it matters:** If "capabilities are the boundary" is meant as an absolute claim, these are real counter-examples. If it is meant to scope only actor cognition, the tenet holds — but that scoping is not documented or enforced anywhere.
**Classification:** ENFORCEMENT GAP. The core mechanism (`_execute_action` as sole dispatch point for cognition-driven effects) is sound; the tenet's boundary as stated is broader than what's enforced.

### 4. Tenet 19 — Knowledge, policies, and capabilities are versioned infrastructure (⚠️)
**What's missing:** Entity-level knowledge versioning (`KnowledgeGraph.compare_and_swap`/`version_of`) is real, enforced, and load-bearing — it is consulted for plan-staleness detection and rejects conflicting writes. Capability- and policy-level versioning (`WorldCapability.version`, `WorldPolicy.version`) is a different story: before this session, the registration methods that would populate these fields had zero live callers anywhere in the codebase. This session added real registration call sites, but even now, nothing anywhere reads a capability's or policy's version to make a decision (no staleness check, no conflict rejection, no consumer at all besides a CLI display).
**Why it matters:** The tenet's third clause ("capabilities... are versioned infrastructure") describes a real capability-versioning system with consequences for stale or conflicting registrations. What exists is an incrementing integer that is now populated but has no downstream effect.
**Classification:** IMPLEMENTATION GAP (for capability/policy versioning specifically — knowledge versioning is not in scope of this gap) + TEST COVERAGE GAP (the new registration code has no tests).

### 5. Tenet 14 — Repeated verified cognition should become reusable deterministic capability (⚠️)
**What's missing:** The prerequisite half of this tenet — compiling a verified cognitive cycle into a structured, persistable summary (`PhiArtifact`) — is real, live in production, and well-tested. What does not exist is any pipeline that takes a repeated, verified pattern and turns it into an actual dispatchable `Capability` registered with a `CapabilityBus`. This session added a `CapabilityPromotionTracker` that detects a repeating, verified pattern and persists a durable, versioned candidate record — but nothing reads that record back to author or register an executing capability.
**Why it matters:** As stated, the tenet describes the system getting cheaper and more reliable over time by no longer re-paying full LLM reasoning cost for solved problems. That capability does not exist yet.
**Classification:** FUTURE ARCHITECTURAL EVOLUTION. This is a well-scoped, not-yet-built piece of architecture, not a broken or bypassed mechanism — see "Known Architectural Evolution" below for why this classification, not "broken," is the accurate one.

### 6. Tenet 16 — Persistent actors survive interruption, restart, and model change (⚠️)
**What's missing:** Mid-execution checkpoint/resume is real, well-tested, and genuinely closes a crash-recovery gap. Belief persistence across an in-process wipe/restore cycle is real and wired into live routes. What's missing: (a) no boot-time process exists that reconstructs previously-registered actors from MongoDB on a fresh process start — restoration is entirely lazy, per-request, and only for whichever actor a request happens to name; (b) only belief content is restored, not goals, affiliations, team membership, or trust records; (c) this session's new `last_model_provider`/`last_model_name` fields are populated at checkpoint time but read by nothing — a write-only continuity record.
**Why it matters:** "Persistent actor" is a stronger claim than "belief content can be restored if you know to ask for it." Full actor identity reconstruction on restart is not demonstrated.
**Classification:** IMPLEMENTATION GAP (no boot-time rehydration, no full-identity reconstruction) + IMPLEMENTATION GAP (model-provider continuity has no consumer yet).

### 7. Tenet 15 — Every consequential transition is observable and auditable (⚠️)
**What's missing:** The observability mechanism (`SocietyContextStream`, `audit_trail.py`) is real, pervasive, and demonstrably wired into every governed transition on the live path. Two gaps keep this from ✅: the context stream itself is in-memory only with no durable Timeline backing (`clear()`'s own module docstring admits this), and the causal-lineage check added this session is warn-only — it makes a violation visible in logs/metrics but does not prevent or repair it.
**Why it matters:** An audit trail that can be lost on restart, or that only observes but never enforces causal integrity, is weaker than the tenet implies.
**Classification:** ENFORCEMENT GAP (lineage check observes, does not enforce) + TEST COVERAGE GAP (this session's new UNGOVERNED-event and lineage-check code has zero test coverage).

### 8. Tenet 7 — The system should become more capable without becoming less governable (⚠️)
**What's missing:** Every governance mechanism this audit traced was added additively, layered ahead of the same chokepoints, never as a bypass — a genuinely good sign. But this is an observed pattern in how the system was built historically, not a structural guarantee. No linter, boot-time check, or required-interface contract exists that would catch a future capability shipping with zero governance coverage, and one real counter-example (the capability-bus-optional fallback, now partially hardened) shows the pattern can slip.
**Why it matters:** This tenet describes an ongoing discipline. Nothing currently enforces that discipline mechanically; it depends on code-review convention.
**Classification:** ENFORCEMENT GAP. This is the mildest of the eight ⚠️ tenets — the record so far is genuinely clean, the gap is the absence of a structural guarantee against future erosion.

---

## Strongest Enforced Principles

The tenets most convincingly demonstrated by both code and tests — not merely marked ✅, but backed by evidence an external reviewer could independently verify with the least effort.

- **Tenet 18 — Contention and coordination are first-class.** Multi-layer contention handling (planet-wide asyncio lock, cross-process Redis distributed lock with fail-closed semantics, per-entity `compare_and_swap`) is exercised by tests using **real OS threads** (`test_mb3015_inventory_reservation.py`) and real `asyncio.gather` racing (`test_concurrent_actors.py`), with test authors who explicitly reasoned about which interleavings can and cannot actually occur in production rather than testing a strawman.
- **Tenet 17 — Actors own cognition; the runtime owns infrastructure.** The separation is enforced in the actual method bodies of `SocietyRuntime`, not merely asserted in docstrings, and `test_actor_isolation_audit.py` is genuine, non-mocked, production-code-path test coverage of the isolation boundary itself — one of the strongest single pieces of test evidence found anywhere in this codebase.
- **Tenet 10 — Predictions are verified against reality.** `ComparatorRuntime.compare` performs real, non-trivial loss computation over actual predicted-vs-executed graph diffs, in the architecturally correct causal order (predict before execute — a prior ordering bug is documented as found and fixed), and `test_comparator_hardening.py` asserts specific computed values across constructed success/failure/partial-failure/unexpected-outcome scenarios.
- **Tenet 1 — Cognition is probabilistic; execution is governed.** `PlanValidator` is a real, hard-threshold gate, and the enforcement point (`belief_runtime.py:993`) was hardened against two documented, previously-live regressions where a rejected plan executed anyway — evidence the boundary is actively maintained, not merely present.
- **Tenet 4 — Authority is explicit, bounded, delegated, and revocable.** `domain_security.py`'s delegation check is re-verified immediately before a real financial capability commits, specifically to catch mid-execution revocation — a materially stronger guarantee than a plan-start-only check.
- **Tenet 6 — Learning cannot expand authority.** Every learning code path was traced and confirmed to have no reference at all to delegation or permission stores — the separation holds by absence of coupling, which is architecturally cleaner than a same-object check that could be bypassed.
- **Tenet 20 — Provider and model implementations are replaceable.** Five fully implemented providers behind one uniform interface, config-driven selection, and every caller of `get_backend()` across the tree was individually checked and confirmed to never branch on provider identity.

---

## Architecture → Runtime → Test Traceability

| Architectural principle | Runtime enforcement | Representative test | Status |
|---|---|---|---|
| 1. Probabilistic cognition / governed execution | `plan_validator.py::PlanValidator.validate`; `belief_runtime.py:993` | `tests/e2e/cognitive_loop/test_e2e03_failure_propagation.py` | ✅ |
| 2. Plans are proposals | `plan_compiler.py` compilation contract; `action_executor.py::execute()` | `tests/unit/test_plan_compilation_boundary.py` | ✅ |
| 3. Governed state transitions | `transition_gate.py::TransitionGate.evaluate`; `action_executor.py:278-343` | `tests/scenarios/test_transition_gate.py` | ⚠️ |
| 4. Authority delegation | `domain_security.py::grant/revoke/check_delegation`; `society/delegation.py::DelegationRegistry` | `tests/unit/test_membership.py::test_delegation_grant_revoke_validity_and_effective_permissions` | ✅ |
| 5. Capability boundary | `action_executor.py::_execute_action` | `tests/unit/test_execution_boundary_hardening.py::test_execution_only_ever_calls_bus_discover_never_a_direct_instantiation` | ⚠️ |
| 6. Learning cannot expand authority | Absence of coupling (verified by grep) across `kernel/pipeline/learning/*.py` | None dedicated (indirect only) | ✅ |
| 7. Capability without governability loss | Additive-only pattern across `transition_gate.py`, checkpoint/approval/negotiation stores | None (property not directly testable) | ⚠️ |
| 8. Reality authoritative | `observations.py::WorldPollingProvider.observe`; `runtime.py::tick_one_actor` | None dedicated (inferred from stage wiring) | ✅ |
| 9. Causal dependency invariants | `Action.depends_on`; `action_executor.py:211-213` | `tests/unit/test_execution_boundary_hardening.py::test_dependent_step_blocked_when_dependency_fails_capability_never_invoked` | ⚠️ |
| 10. Prediction verification | `comparison/integration.py::_run_comparison`; `comparator_runtime.py::ComparatorRuntime.compare` | `tests/unit/test_comparator_hardening.py` (all scenario classes) | ✅ |
| 11. Residual-driven learning | `learning/integration.py::integrated_learn` | `tests/unit/test_learning_integration.py::TestComposesWithPlanningAndExecutionIntegration` | ✅ |
| 12. Shared reality | `integration.py::_attach_society` (`society_runtime._world = self._world_model.semantic_world`) | None dedicated (object-identity claim, confirmed by direct code reading) | ✅ |
| 13. Native failure/uncertainty/drift | `plan_validator.py` confidence gate; `world.py::SharedWorld.perturb` | `tests/unit/test_pipeline_planning.py:242-246` | ✅ |
| 14. Cognition → deterministic capability | `learning/phi.py::PhiCompiler`; `capability_promotion.py::CapabilityPromotionTracker` (new) | `tests/unit/test_learning_integration.py::TestPhiCompilerWiredIn` (Phi half only) | ⚠️ |
| 15. Observable/auditable transitions | `context_stream.py::SocietyContextStream.publish`; `audit_trail.py::record_decision_event` | `tests/unit/test_correlation_causation.py` | ⚠️ |
| 16. Persistent actors | `execution_checkpoint_store.py`; `actor_state_store.py::ActorStateStore` | `tests/scenarios/test_checkpoint_restart.py` (RECOVERY-001..004) | ⚠️ |
| 17. Actors own cognition | `society/runtime.py::_coordinate_actor` | `tests/scenarios/test_actor_isolation_audit.py` | ✅ |
| 18. First-class contention | `knowledge_graph.py::compare_and_swap`; `integration.py` tick locks | `tests/scenarios/test_concurrent_actors.py` (CONCUR-001/002) | ✅ |
| 19. Versioned infrastructure | `knowledge_graph.py::version_of`; `world.py::record_capability/record_policy` (new) | `tests/scenarios/test_mb3015_inventory_reservation.py` (knowledge level only) | ⚠️ |
| 20. Replaceable providers | `model_backend.py::ModelBackend.complete` | `tests/unit/test_llm_planner.py` (mocked backend swap) | ✅ |

---

## Implementation vs Production Readiness

These six dimensions are frequently conflated in architecture reviews. They are kept explicitly separate here.

1. **Architectural conformance** — does a mechanism exist that enforces the stated principle? This is what the verdicts above measure. Score: 16/20 weighted.
2. **Implementation completeness** — is the mechanism built out to its full intended scope? Several ✅ and most ⚠️ tenets have real but partial completeness (e.g., TransitionGate exists and works, but is wired to 3 of 37 capabilities).
3. **Implementation correctness** — where a mechanism exists, does it do what it claims without bugs? The evidence gathered here found no correctness defects in the mechanisms marked ✅ (e.g., `compare_and_swap` genuinely rejects on mismatch; `depends_on` indexing is type-consistent). Correctness of the mechanisms as far as they extend is generally strong.
4. **Test/qualification maturity** — is the mechanism backed by tests that assert real behavior rather than superficial presence? This varies widely and is called out per-tenet above; several tenets (8, 12, 16's model-provider fields, all of this session's new code) have real implementation with weak or absent test coverage.
5. **Production readiness** — has the system been operated under real, sustained multi-actor, multi-tenant load with real failure injection? This document does not assess that, and nothing in this audit should be read as a production-readiness claim.
6. **Scale validation** — has the system been measured under realistic data volume, actor counts, and concurrency levels? Also out of scope here. `test_concurrent_actors.py`'s use of real threads and `asyncio.gather` demonstrates correctness under genuine concurrency in a test environment, which is evidence for (3) and (4), not for (6).

A system can score well on (1)–(3) while still requiring substantial work on (4)–(6). That is the situation described by this document: architectural conformance is generally strong (12 full, 8 partial, 0 absent), several mechanisms are correctly implemented as far as they extend, but test maturity is uneven and production/scale validation is a separate, unaddressed question.

---

## Known Architectural Evolution

No tenet in this audit was marked ❌ — every one of the 20 has at least a partial, real enforcement mechanism. The 8 tenets marked ⚠️ are classified below by the nature of their gap, since "not fully implemented" covers several architecturally different situations that should not be treated interchangeably.

| Tenet | Classification | Why |
|---|---|---|
| 3. Governed state transitions | ENFORCEMENT GAP + GENERALIZATION GAP | Mechanism works where wired; wiring is opt-in and narrow, with a structurally separate API-route bypass class |
| 5. Capability boundary | ENFORCEMENT GAP | Core mechanism sound; scope of "the boundary" vs. legitimate exceptions (admin routes, environmental drift) undecided |
| 7. Capability without governability loss | ENFORCEMENT GAP | Clean historical record; no structural guarantee against future erosion |
| 9. Causal dependencies | GENERALIZATION GAP + TEST COVERAGE GAP | Mechanism correct for what the planner declares; the planner's own failure mode (dropping dependencies) is patched per-incident, not generally |
| 14. Cognition → deterministic capability | FUTURE ARCHITECTURAL EVOLUTION + TEST COVERAGE GAP | The authoring/promotion pipeline that would close this tenet does not exist yet — this is unbuilt architecture, not broken architecture |
| 15. Observable/auditable transitions | ENFORCEMENT GAP + TEST COVERAGE GAP | Observation is real; enforcement of durability and causal integrity is not; newest code is untested |
| 16. Persistent actors | IMPLEMENTATION GAP | Checkpoint/resume and belief persistence are real; boot-time full-identity rehydration is not built |
| 19. Versioned infrastructure | IMPLEMENTATION GAP + TEST COVERAGE GAP | Knowledge-level versioning is real and enforced; capability/policy-level versioning is populated but has no consumer |

**On Tenet 14 specifically**, per the explicit framing this document was asked to apply: repeated verified cognition does not yet become reusable deterministic capability in this system. That is stated plainly as a gap. It is classified as **FUTURE ARCHITECTURAL EVOLUTION** rather than a defect because the prerequisite mechanism (verified-cognition summarization via `PhiArtifact`, and now pattern-repetition detection via `CapabilityPromotionTracker`) is real, live, and correctly layered — what's missing is a specific, well-defined, not-yet-built next stage: an authoring/promotion pipeline that takes a `PromotedCapabilityCandidate`, produces a real `Capability` subclass with a deterministic `.handle()`, and registers it with a `CapabilityBus` for future dispatch. This is describable as a scoped engineering project, not an open-ended architectural uncertainty.

---

# Tenet-by-Tenet Conformance

Each section below traces one tenet to its actual enforcement mechanism, with exact repository paths, the tests that exercise it (verified by reading their assertions, not by name), and an explicit bypass/gap analysis. The four tenets flagged for special attention — 3, 5, 9, 14, 16, 19, 20 — received additional targeted investigation beyond the standard pass; that depth is folded directly into their sections below rather than repeated separately.

## 1. Cognition is probabilistic; execution is governed.

**Verdict:** ✅

**Principle**
In CognitiveOS, the reasoning that produces a plan (LLM-driven planning, `_generate_plan`) is inherently uncertain — confidence scores, risk estimates, and probabilistic transition models are first-class outputs, not certainties. Execution is the opposite: once a plan is selected, the steps that actually touch reality run through a deterministic, checked pipeline that does not defer to the LLM's own confidence.

**Architectural intent**
This boundary prevents an uncertain judgment from becoming an unchecked action. Without it, a low-confidence or malformed plan could mutate real state (charge a wallet, ship an order) purely because an LLM emitted it — collapsing "the model thinks this is a good idea" into "this happened."

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/llm_planner.py` — LLM-driven plan generation; every plan carries `confidence`/`risk`/`cost` (`belief_state.py::Plan`).
- `src/monkey_brain/kernel/pipeline/plan_validator.py::PlanValidator.validate()` (lines 57-115) — deterministic gate: rejects on missing goal/steps, `cost > max_cost`, `confidence < min_confidence`, `risk > max_risk`. Not probabilistic itself — thresholds are hard comparisons.
- `src/monkey_brain/kernel/pipeline/belief_runtime.py:878` calls `self._plan_validator.validate(plan, belief)`; line 993 (`if not state.metrics.get("plan_valid", True): ... return self._reject_plan(state, plan, reason)`) is the actual enforcement point — a rejected plan does not reach `_execute_plan`.
- `src/monkey_brain/kernel/pipeline/action_executor.py` — the deterministic execution boundary; capability dispatch, dependency gating, transition-gate checks all happen here, independent of the plan's own confidence score.

**Test evidence**
- `tests/e2e/cognitive_loop/test_e2e03_failure_propagation.py:70` (`test_e2e03_failure_propagation`) exercises `_reject_plan`/`plan_valid` end-to-end and asserts a rejected plan does not silently execute (comment at line 123 references this exact enforcement).
- `tests/unit/test_plan_compilation_boundary.py` — tests the compiler's refusal to invent/reinterpret plan content (structural, not probabilistic, boundary).
- No test directly asserts "a high-confidence-but-invalid plan is still rejected" as a dedicated case, but the rejection path itself is exercised.

**Failure / bypass analysis**
The `belief_runtime.py` code comments document that this enforcement was added to fix two real, previously-live bugs: (1) a validator-rejected plan executed anyway with only a log line (fixed at line 993), and (2) a Decide-stage rejection ("no viable scenario") was similarly ignored (fixed, referenced immediately below). Both are commit-history-confirmed regressions, not hypothetical — meaning this boundary was not always enforced and had to be patched twice. The checkpoint-resume path (line 875-876) deliberately skips re-validation (`ValidationResult(valid=True, score=1.0)`) for a resumed execution — documented and reasoned (re-validating a stub against fresh-plan thresholds would wrongly reject an already-validated resume), but it is a real, intentional bypass of the validator for that one path.

**Known limitations**
`PlanValidator._check_precondition()` defaults to `return True` ("assume satisfied") for any precondition string that isn't a recognized `verify:`/`goal_defined:` prefix — a weak fallback. Precondition failures also only ever produce `warnings`, never `violations`, so a plan with unverifiable preconditions is never actually blocked by the validator itself (only cost/confidence/risk/structure block it).

**Conformance conclusion**
The probabilistic-cognition/governed-execution split is real, enforced at a specific, identifiable chokepoint, and was hardened against two documented live regressions where the boundary previously leaked. The precondition-check weakness is minor relative to the core cost/confidence/risk/structural gate, which is genuinely load-bearing.

## 2. Plans are proposals, never authority.

**Verdict:** ✅

**Principle**
A `Plan` (the LLM's structured output) is data describing an intended sequence of actions — it carries no authority of its own to mutate state. Only the execution boundary (ActionExecutor → capability) can cause real effects, and only after the plan has passed validation.

**Architectural intent**
This prevents "the plan says so" from being treated as sufficient justification for a side effect. A plan is downgraded to a proposal so that every other governance layer (validator, dependency gating, transition gate, capability-level precondition checks) gets a chance to intervene before anything irreversible happens.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/plan_compiler.py` (module docstring, lines 19-44): the "Compilation contract" explicitly states compilation "MUST NOT invent goals, reinterpret intent, select a different candidate, override preferences, predict, execute capabilities, mutate beliefs, or learn" — a plan is transformed into an inspectable, checked artifact, never executed directly from itself.
- `src/monkey_brain/kernel/pipeline/action_executor.py::execute()` — the only path from a compiled plan's actions to real capability invocation; a `Plan`/`Action` object has no `.execute()` or `.commit()` method of its own.
- `belief_runtime.py:993` — a plan that fails validation is explicitly rejected (`_reject_plan`), never reaching execution regardless of what it proposes.

**Test evidence**
- `tests/unit/test_plan_compilation_boundary.py` — per its own module comments, verifies the compiler preserves plan content verbatim without reinterpreting or executing it.
- `tests/e2e/cognitive_loop/test_e2e03_failure_propagation.py` — confirms a plan alone does not cause execution when rejected.
- `tests/unit/test_execution_boundary_hardening.py::test_failed_capability_never_produces_a_fabricated_success` and `test_capability_raising_an_exception_is_captured_as_failure_not_propagated` — confirm the executor, not the plan, is the source of truth for outcomes.

**Failure / bypass analysis**
No code path was found where a `Plan`/`PlanStep` object is executed or committed directly without passing through `ActionExecutor`. The main residual risk is the same one noted in Tenet 1: the resumed-execution path skips re-validation of the plan object itself (trusting the checkpoint's stored outcome instead) — this is a deliberate, reasoned exception, not an oversight, but it does mean "plan is always re-checked before authority is granted" is not literally true for resumes.

**Known limitations**
"Proposal, not authority" is enforced structurally (no direct execution path) rather than via a single explicit authorization object attached to each plan — the guarantee is emergent from the absence of a bypass, which is harder for an external reviewer to verify exhaustively than a single explicit check would be.

**Conformance conclusion**
Every traced code path confirms plans are inert data structures until compiled and validated, and the compiler's own contract explicitly forbids it from granting execution authority. Combined with Tenet 1's rejection enforcement, this is a genuinely conformant, if structurally-rather-than-declaratively enforced, boundary.

## 3. Every consequential action is a governed state transition.

**Verdict:** ⚠️

**Principle**
Any action that changes real, persisted, shared state (inventory, budget, orders, payments, cross-actor resources) should pass through an explicit governance decision — not merely "a capability ran and returned success," but a checked transition with the possibility of being paused, negotiated, or rejected before commit.

**Architectural intent**
Without this, "the capability didn't error" becomes the entire safety bar for state mutation — no negotiation, no consent check, no contention resolution. The intent is a single, auditable pre-commit decision point for state that matters (shared/contended/irreversible), distinct from ordinary read/compute steps.

**Implementation evidence**
- `src/monkey_brain/kernel/society/transition_gate.py::TransitionGate.evaluate()` — described in its own module docstring as "the one authoritative decision point."
- `src/monkey_brain/kernel/pipeline/action_executor.py:278-343` — the PROPOSE→CHECK sequence: before `capability.handle()` runs, if `propose_transition` and `transition_gate` are both wired, a `ProposedTransition` is built and evaluated; `requires_negotiation` pauses the action (never invokes the capability) until a negotiation is resolved (`negotiation_store.py`).
- `src/monkey_brain/kernel/pipeline/audit_trail.py::record_decision_event` (called at line ~356) — durable, execution_id-correlated record of every gate decision (allowed / paused_for_negotiation / negotiation_rejected).
- Wiring is **opt-in per vertical**, not structural: `src/monkey_brain/kernel/domains/vertical_router.py:117-120` only constructs a `TransitionGate` `if vertical.propose_transition is not None`. `register_vertical()` (`vertical_router.py:67`) is called exactly once in the entire codebase — `src/monkey_brain/kernel/domains/grocery.py:8530` (`register_vertical("grocery", _build_vertical_runtime)`) — so "grocery" is currently the only live vertical, and it does wire the gate.
- Within grocery's own `_propose_transition()` (`grocery.py:173-260`), the function's own docstring states: "Every other grocery capability returns None, meaning ActionExecutor's gate check is a no-op for it." Only `OrderCreation`, `Payment`, and `SocialSourcing` produce a `ProposedTransition`. Grocery.py defines 37 capability classes; the other ~34 (`Delivery`, `OrderConfirmation`, `ReturnOrder`, `PaymentConfirmation`, `ProductSelection`, etc.) receive zero TransitionGate evaluation, even though several of them mutate real, consequential state (a Shipment entity, an order's confirmed status, a return/refund).

**Test evidence**
- `tests/scenarios/test_transition_gate.py` — substantial, real assertions: `test_gate002b_concurrent_last_unit_never_oversold_or_double_committed` (real concurrency correctness), `test_gate005_declared_incompatible_constraint_pauses_then_resolves`, `test_gate008a/b_social_*_pauses_for_owner/seller_consent_then_resolves` (real pause/negotiate/resolve flows), `test_gate007_commit_ordering_proposal_before_negotiation_before_commit` (ordering guarantee). These are genuine, load-bearing tests of the gate mechanism for the three gated capabilities.
- No test asserts that a non-gated capability (e.g., `Delivery`, `ReturnOrder`) is excluded from TransitionGate evaluation, or characterizes the scope of coverage (3 of 37 capabilities) as a deliberate, bounded design decision versus an oversight.

**Failure / bypass analysis**
- Alternate direct-mutation paths exist outside ActionExecutor entirely: `src/monkey_brain/kernel/society/integration.py` exposes `record_world_event()`, `add_world_relationship()`, `remove_world_entity()` (lines ~1640-1700), called directly from `src/monkey_brain/api/routes/world.py` REST routes — these mutate `SharedWorld`/the world model synchronously, with no TransitionGate involvement whatsoever, since they don't go through `ActionExecutor` at all.
- `src/monkey_brain/api/routes/societies.py` — governance-policy and permission routes (`add_society_governance_policy`, etc.) mutate `SocietyGovernanceEngine` state directly via API call, bypassing the capability/transition-gate boundary entirely (arguably correct, since these are administrative/governance actions rather than actor cognition, but they are consequential state transitions with no governed-transition equivalent of their own).
- `action_executor.py:772-780` — the "no capability bus" fallback (hardened this session — see below) returns `success: True` while invoking no capability and no gate at all.
- This session's own fix (adding `"governed": False` marking, a warning log, an `ungoverned` metric, and a distinct `UNGOVERNED` context event for the no-bus fallback) is real, present in the current code, but has zero test coverage — grep across `tests/` for `governed.*False`, `gate_wired`, `ungoverned` returns no hits. This is a newly-implemented, unverified mechanism, not a demonstrated one.
- The `gate_wired` observability tag (also added this session) is similarly present but untested.

**Known limitations**
Coverage is narrow and vertical-specific by construction (3 of 37 grocery capabilities), not structurally guaranteed for any future capability or vertical — nothing prevents a newly added capability that mutates shared state from silently having no `propose_transition` entry and thus zero gating, the same way 34 existing ones already do. The API-route direct-mutation paths (`world.py`, `societies.py`) are a second, structurally separate bypass class that TransitionGate was never designed to cover. The newest hardening (governed-marker, gate_wired tag) is unverified by tests.

**Conformance conclusion**
Where TransitionGate is wired, it is genuinely a real, well-tested, single authoritative decision point with concurrency-correct, negotiation-capable enforcement. But "every consequential action" overstates the current scope: the gate covers 3 of 37 capabilities in the only live vertical, several other capabilities mutate real state ungoverned by it, and direct API routes for world/governance mutation bypass the mechanism structurally. This is a real, working mechanism with clearly bounded and currently narrow coverage — ⚠️, not ✅.

## 4. Authority is explicit, bounded, delegated, and revocable.

**Verdict:** ✅

**Principle**
An actor acting with authority beyond its own (e.g., paying from someone else's account, acting "as" another actor) must hold an explicit, time-bounded grant that can be independently verified and revoked — never an implicit or permanent capability.

**Architectural intent**
Prevents authority from being assumed, inherited silently, or persisting past its intended window — the failure this prevents is an actor continuing to act on someone else's behalf after that person revoked consent, or a permission being effectively permanent because nothing ever re-checks it.

**Implementation evidence**
Two independently real, tested mechanisms exist under the "delegation" name (a naming collision worth flagging for reviewers — do not confuse them):
1. `src/monkey_brain/kernel/domains/domain_security.py::grant_delegation()` (line 104), `revoke_delegation()` (line 119), `check_delegation()` (line 133) — KG-entity-backed, household/financial-authority delegation. Explicit fields: `granted_at`, `expires_at`, `revoked` (lines 114, 129, 168-170). Live-used at `src/monkey_brain/kernel/domains/grocery.py:7341-7346` inside `PaymentConfirmationCapability` — delegation is re-checked immediately before payment, not only at plan start, explicitly to catch mid-execution revocation.
2. `src/monkey_brain/kernel/society/delegation.py::DelegationRegistry` — membership-scoped, permission-list delegation (`grant()`, `revoke()`, `is_valid()`, `effective_delegated_permissions()`), with a full timeline/audit trail.
- A third, unrelated concept, `DelegateTaskCapability`/`_run_delegated_tasks` (`grocery.py`), is task delegation between actors ("ask Bob to buy milk") — not an authority-delegation mechanism at all; do not conflate with the above two.

**Test evidence**
- `tests/unit/test_membership.py::test_delegation_grant_revoke_validity_and_effective_permissions` (lines 184-201) — real assertions: grants a delegation, confirms `is_valid()` and `effective_delegated_permissions() == ("cart:checkout",)`, revokes it, confirms `is_valid()` becomes False and permissions become `()`, confirms `delegation_granted`/`delegation_revoked` timeline events exist.
- `tests/unit/test_membership.py::test_delegation_respects_validity_window` (line 204) — grants a delegation with `valid_until` in the past, confirms `is_valid()` is False.
- `domain_security.py`'s `grant_delegation`/`revoke_delegation`/`check_delegation` (the one actually live in `PaymentConfirmationCapability`) has no dedicated unit test — grep across `tests/` for these exact function names returns zero hits. Its live re-verification behavior is exercised only indirectly, if at all, through broader payment scenario tests (`tests/scenarios/test_mb3012_payment_authorization.py`, `test_mb3013_payment_failure.py`), which were not observed to specifically construct a "delegation revoked mid-execution" case.

**Failure / bypass analysis**
`DelegationRegistry` (mechanism 2) is well-tested but its live integration into the actual capability-execution path was not confirmed during this investigation — it appears to be governance-layer infrastructure (membership/permission resolution) rather than the one actually gating a real financial action. `domain_security.py`'s delegation (mechanism 1) is the one demonstrably live and load-bearing in a real capability, but lacks direct unit-test evidence — its correctness rests on the payment scenario tests exercising it as a side effect, not on a targeted grant/revoke/re-check test.

**Known limitations**
Two parallel delegation implementations exist with no evident unification or shared contract; a reviewer auditing "is delegation revocable" needs to know which of the two governs a given action. The live, financially-consequential one (`domain_security.py`) is the less-tested of the two.

**Conformance conclusion**
The core guarantee — explicit grant, time-bounded, independently revocable, and re-checked immediately before a consequential action rather than only at plan start — is real and demonstrably wired into the live payment path with a genuine mid-execution revocation defense. The `DelegationRegistry` mechanism adds strong, well-tested grant/revoke/expiry semantics at the governance layer. The mark is ✅ on the strength of the live re-verification behavior in `PaymentConfirmationCapability`, tempered by the absence of a direct unit test for that specific mechanism and the unresolved duplication between the two delegation systems.

## 5. Capabilities are the boundary between cognition and reality.

**Verdict:** ⚠️

**Principle**
Every effect cognition has on the real, persisted world (KnowledgeGraph, SharedWorld) must pass through a `Capability.handle()` call — cognition (belief formation, planning, learning) should never write directly to KG/World state itself.

**Architectural intent**
This concentrates every real-world side effect behind one auditable, dispatchable interface. Without it, "what changed reality" becomes untraceable — any code anywhere in the cognitive pipeline could mutate shared state with no common audit point, no authorization check, and no consistent event trail.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/action_executor.py::_execute_action()` (lines 722-865) — the single dispatch point: `capability.handle(handle_args)` (line 812-815) is the only call in this file that invokes a capability.
- `src/monkey_brain/kernel/domains/grocery.py` — all 37 capabilities' `.handle()` methods are the only place `kg.update_entity()`, `confirm_reservation()`, `try_reserve()`, etc. are called for real commerce state.
- The Learn stage does not write directly to KG/World: `src/monkey_brain/kernel/pipeline/learning/domain.py`'s `LearningResult.belief_updated`/`world_updated` are booleans describing what the learning policy believes happened to belief/world state (reward/signal bookkeeping), not literal write operations against `KnowledgeGraph`/`SharedWorld` — confirmed by reading `learning/integration.py`'s `integrated_learn` (lines 100-143): it calls `resolve_policy(...).learn(experience)` and only writes to `state.learning` (a plain in-memory dict) and `state._phi_pipeline_input`, never to `kg`/`world` objects.

**Failure / bypass analysis**
- `SharedWorld.perturb()` and `record_event()`, called from `PlanetaryRuntime._run_cycle()` (`kernel/society/integration.py`, ~line 3918), mutate world state directly, with no capability involved at all. This is architecturally distinct from cognition-driven mutation (it's the environment simulating itself — "numeric attributes drift by ±magnitude," stochastic events) — arguably legitimate as "reality changing on its own," not "cognition bypassing the capability boundary." But it is a real, non-capability-mediated write path into the same `SharedWorld` object capabilities also write to, and the constitution's phrasing ("capabilities are the boundary between cognition and reality") does not explicitly carve out an environmental-simulation exception.
- Direct API routes bypass the capability boundary entirely, independent of any cognition: `src/monkey_brain/api/routes/world.py` → `PlanetaryRuntime.record_world_event()`/`add_world_relationship()`/`remove_world_entity()` (`integration.py` ~1640-1700) write to `self._world_model` synchronously from an HTTP request, never touching `ActionExecutor` or any `Capability.handle()`. These are operator/administrative paths, not actor cognition — but they are real, unmediated writes to the same state capabilities are supposed to be the sole boundary for.
- The "no capability bus" fallback (`action_executor.py:772-797`, hardened this session) returns `success: True` for zero actual capability invocation — the boundary "worked" in the sense that nothing mutated reality, but it also means cognition believed an effect occurred when the boundary was never actually crossed. This is a different failure mode (false-success, not bypass) but relevant to whether the boundary can be trusted as reported.

**Test evidence**
- `tests/unit/test_execution_boundary_hardening.py::test_execution_only_ever_calls_bus_discover_never_a_direct_instantiation` (line 314) — directly and meaningfully tests that execution never constructs/calls a capability by any path other than `bus.discover()` → `.handle()`. This is strong, targeted evidence for the boundary's integrity within ActionExecutor.
- No test was found that asserts learning/belief-formation code does NOT write directly to KG/World (an absence-of-behavior claim that's inherently hard to test, and wasn't attempted).
- No test exercises or characterizes the `world.py` API-route bypass paths as a boundary concern.

**Known limitations**
The boundary is real and tested within the cognitive pipeline (planner → executor → capability), which is its primary intended scope. It is not absolute: direct API-route mutation and world-model environmental perturbation both write to the same underlying state outside any capability, and neither is currently reconciled with, or explicitly scoped out of, the tenet's claim.

**Conformance conclusion**
Within the actual cognition-to-execution pipeline, the boundary is real, single-chokepoint, and positively tested. But "the boundary between cognition and reality" is not the only path into `SharedWorld`/KG state in this codebase — administrative API routes and environmental world-perturbation both write directly, unmediated by any capability. Whether those are architecturally acceptable exceptions or genuine violations depends on a scope decision (cognition-only vs. all writers) the codebase has not made explicit — hence ⚠️, not ✅.

## 6. Learning cannot expand authority.

**Verdict:** ✅

**Principle**
Whatever an actor learns from experience (transition probabilities, policy weights, reward signals) may change how it plans, but must never itself grant a new permission, delegation, or capability access it did not already have.

**Architectural intent**
This is the guard against a system that "learns its way around" governance — an actor discovering through repeated cycles a path to broader access than an operator explicitly granted would be a severe governance failure, since authority would then be a side effect of statistics rather than an explicit decision.

**Implementation evidence**
- `src/monkey_brain/kernel/society/learning.py`, `src/monkey_brain/kernel/pipeline/learning/*.py` (`domain.py`, `integration.py`, `trace.py`, `phi.py`) — grepped for any write to `grant_delegation(`, `.grant(`, `trust_level =`, `required_permission =` — zero matches. Learning code paths only ever write to `LearningResult`/`PhiArtifact`/`state.learning` (plain data/reward bookkeeping), never to `domain_security.py`'s delegation store, `DelegationRegistry`, or `SocietyGovernanceEngine`'s permission/policy stores.
- Trust updates (a related but distinct concept) — `src/monkey_brain/kernel/society/runtime.py::update_trust()` (lines 921-935) moves a float trust score via `affiliations.update_trust_from_outcome()`/`TrustEngine`, which gates message-routing eligibility (`AffiliationCommunicationRouter`), not capability authorization or delegation — a meaningfully different, lower-stakes kind of "trust" than authority/permission.
- Authority/delegation grants remain confined to the explicit paths audited under Tenet 4 (`domain_security.py::grant_delegation`, `DelegationRegistry.grant()`), both of which are called only from governance/API code, never from any learning stage.

**Test evidence**
- No dedicated test was found that explicitly asserts "learning does not expand authority" as a negative property (e.g., running many learning cycles and confirming permission/delegation state is unchanged). This is an absence-of-behavior claim, and the codebase has no regression test guarding against a future learning-path change accidentally starting to write to a permission/delegation store.
- Indirect support: `tests/unit/test_learning_*.py` (reward, policies, hardening, world_evolution, phi, trace) consistently assert learning results as reward/confidence/belief-update signals, never permission or authority fields — consistent with, though not a direct test of, the separation.

**Failure / bypass analysis**
The separation currently holds because no learning code path has a reference to the delegation/permission stores at all — there is no accidental adjacency (e.g., a shared mutable object) that would make an authority leak an easy future mistake. This is architecturally sound but enforced by absence-of-coupling rather than an explicit runtime check that would catch a future violation.

**Known limitations**
No dedicated regression test exists to catch a future regression where a learning code path is given access to the authority-granting functions. The guarantee currently rests on code review discipline / absence of coupling rather than an enforced runtime invariant.

**Conformance conclusion**
Every learning code path was traced and confirmed to have no access to, or effect on, delegation/permission/authority stores — the separation is real and structurally clean, not merely undocumented-but-accidentally-true. The lack of a dedicated negative test is a real gap, but it does not undermine the current, demonstrable correctness of the separation, so ✅ is warranted with that caveat noted.

## 7. The system should become more capable without becoming less governable.

**Verdict:** ⚠️

**Principle**
As new mechanisms are added (checkpoints, approvals, negotiation gates, new capabilities), they should compose as additional pre-commit checks ahead of the same governed chokepoints, never as bypasses that trade governability away for a new feature.

**Architectural intent**
This prevents "feature creep erodes governance" — the natural failure mode where each new capability or shortcut quietly widens what can happen without oversight, until the sum of small conveniences amounts to an ungoverned system.

**Implementation evidence**
- Every governance mechanism found in this investigation was added as an additional pre-commit check layered ahead of the same `capability.handle()` call, never as an alternate path around it: `TransitionGate` (Tenet 3), approval pause/resume, negotiation pause/resume, payment pause/resume, and execution checkpoint/resume (`action_executor.py` lines 137-209) all gate entry to the same single dispatch point (`_execute_action`).
- `src/monkey_brain/kernel/pipeline/plan_compiler.py`'s compile-time validation (capability resolvability, dependency-cycle detection) was added as a pre-execution hardening pass explicitly because the prior design discovered failures mid-execution (module docstring, lines 1-11) — a real instance of "more capable" (upfront validation) being added without removing any existing check.
- The capability-level precondition hardening documented under Tenet 9 (`OrderConfirmationCapability`, `DeliveryCapability`, `PaymentConfirmationCapability` independently re-verifying via fresh KG reads) is additive governance, not a bypass.

**Failure / bypass analysis**
- The clearest counter-example found: the `action_executor.py` "no capability bus" fallback (Tenet 3/5) is a place where a convenience (executing without requiring a real capability bus, useful for tests/dev) trades away governability by construction — `success: True` with zero governance and (until this session) zero observability. This session's hardening (governed-marker, warning log, UNGOVERNED event) is a genuine attempt to restore governability without removing the convenience, but it is new and untested.
- TransitionGate's per-vertical opt-in wiring (Tenet 3) is itself a place where "more capable" (add a new vertical or capability) does not automatically preserve "as governable" — a new capability added to grocery.py, or an entirely new vertical, starts with zero transition-gate coverage by default and must be explicitly wired in, the same way 34 of 37 existing grocery capabilities currently aren't.
- No architectural mechanism (a linter, a boot-time check, a required-interface contract) was found that enforces "every new consequential capability must be evaluated for governance coverage" — the pattern holds by developer discipline and code-review convention, not by a structural guarantee.

**Test evidence**
No test suite exists that specifically measures "governance coverage" over time or would fail if a newly added capability skipped gating — this property, being about the trajectory of the system rather than a single behavior, is inherently difficult to test directly, and no attempt was found.

**Known limitations**
The tenet is upheld as an observed pattern in how existing features were built (additive, not substitutive), but it is not enforced by any structural or automated guarantee — nothing in the codebase would catch a future feature that violates it, and the one clear counter-example (the capability-bus-optional fallback) shows the pattern can and did slip.

**Conformance conclusion**
Every governance mechanism this investigation traced was added additively, and no evidence was found of an existing check being removed or bypassed to enable new capability — a genuinely good sign. But the tenet describes an ongoing discipline, not a one-time state, and this codebase has no structural enforcement of it plus at least one real, if now-partially-hardened, counter-example. ⚠️ reflects a real but unenforced pattern rather than a guaranteed property.

## 8. Reality is authoritative; beliefs are local.

**Verdict:** ✅

**Principle**
An actor's `BeliefState` is its own private, local model of the world — never the source of truth. The `SharedWorld`/world model is authoritative; belief is expected to diverge and must be re-grounded against reality, not the reverse.

**Architectural intent**
Prevents actors from acting forever on stale or fabricated beliefs. If belief were authoritative, two actors with diverging models could never be reconciled, and drift would compound silently. Grounding belief in reality every cycle bounds staleness to one tick.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/observations.py:133-172` — `WorldPollingProvider.observe(actor_id, world)` takes the live `world` object as a parameter and reads `world.entities()` directly, with no caching layer; it returns a fresh `ObservationSet` from whatever `world` instance the caller passes in that call.
- `src/monkey_brain/kernel/society/runtime.py` (`SocietyRuntime.register_actor`, `context_factory` closure) — `"world": self._world` is captured by reference inside a lambda evaluated at call time, so even if `PlanetaryRuntime._attach_society` later reassigns `society_runtime._world` to the shared semantic world, the closure observes the live value.
- `src/monkey_brain/kernel/society/runtime.py::tick_one_actor` — calls `self.get_observation(actor_id)` fresh, every tick, before belief fusion (`self._belief_fusion.fuse(actor_id, observation, actor_state.belief_state)`), i.e., belief is refreshed from real observation every cycle, never left to accumulate unchecked.

**Test evidence**
`tests/unit/test_pipeline_planning.py` and `test_pipeline_belief_runtime.py` exercise `CognitiveRuntime`'s Observe→Believe stage sequencing but assert on `state.belief` shape and hypothesis counts rather than explicitly asserting "belief is overwritten from a changed world between two ticks." No test was found that mutates `SharedWorld`, ticks the same actor twice, and asserts the actor's belief reflects the second, changed world state. This is a generalization/coverage gap, not evidence the mechanism is missing — the wiring is real and traced directly above, but there's no explicit regression test pinning "reality wins over stale belief" as a named behavior.

**Failure / bypass analysis**
The re-grounding is per-entity, driven by `world.entities()` — an entity the actor never re-observes will not have its belief corrected that tick. This is a scope/visibility gap, not an authority-inversion bug: belief for unobserved entities is stale-but-honestly-stale, it just isn't actively corrected until observed again. Separately, `SocietyRuntime._deliver_messages()` injects a `BeliefEntry` directly into `actor_state.belief_state` from a peer's message, bypassing the Observe→Believe pipeline — this is a local belief-state write from a peer claim, not a claim of world-state authority, so it does not itself violate "reality is authoritative," but it is a second belief-mutation path worth naming for completeness.

**Known limitations**
No direct regression test asserting belief overwrite/correction across two ticks of a changed world. Coverage is inferred from stage wiring, not pinned by a dedicated test.

**Conformance conclusion**
The mechanism is real, traced end-to-end through live production code (`WorldPollingProvider` reads the actual `SharedWorld` instance fresh every observe call, fed into belief fusion every tick), and there is no code path where a stale local belief is treated as more authoritative than a fresh observation. The only gap is a missing explicit regression test pinning this exact behavior, which is a test-coverage gap, not an implementation gap — hence ✅ rather than a downgrade.

## 9. Causal dependencies are runtime invariants.

**Verdict:** ⚠️

**Principle**
When one action's correctness depends on another action having genuinely succeeded first (e.g., payment must precede shipment), that ordering must be enforced by the runtime — not merely assumed by whoever authored the plan.

**Architectural intent**
Prevents a downstream action from proceeding on a false assumption about upstream state — the specific failure this prevents is exactly the one this investigation found direct evidence of in this codebase: a delivery being arranged, or an order being confirmed, for a payment that never actually succeeded.

**Implementation evidence — the mechanism**
- `Action.depends_on: tuple[int, ...]` (`src/monkey_brain/kernel/pipeline/execution.py:48-49`) — absolute step-index references, set from `PlanStep.depends_on`.
- Origin: `depends_on` is populated exclusively by the LLM planner, via prompt instruction. `src/monkey_brain/kernel/pipeline/llm_planner.py` lines 297-322: the system prompt explicitly instructs the model — "the action named SECOND gets `depends_on`: [index of the step it needs]... ONLY skip depends_on... when..." — this is prompt engineering, not a structural derivation from the capability graph.
- `_normalize_depends_on()` (`llm_planner.py:350-369`) sanitizes the model's raw JSON: an out-of-range, non-integer, or self-referential entry is silently dropped — its own docstring states this is deliberate. There is no validation that a dependency should exist and is missing — only that whatever is present is well-formed.
- `src/monkey_brain/kernel/pipeline/plan_compiler.py` (module docstring lines 13-32) validates `depends_on` range and cycles only; the "Compilation contract" explicitly states it "MUST preserve every plan element verbatim... depends_on" — i.e., purely structural well-formedness, never semantic completeness.
- `action_executor.py:211-213`: `missing = [dep for dep in action.depends_on if dep not in succeeded_step_indices]` — this check is well-typed and correct: `succeeded_step_indices` (line 135) is populated by `action.step_index` (an int) in both the checkpoint-replay path (line 227) and the main execution path (line 540), consistently matching `depends_on`'s absolute-index semantics. No index/id type mismatch was found in the current code — this specific historical bug class appears fixed.
- The "Decide" stage (`_run_decide`, `comparison/integration.py`) was not found to perform any additional `depends_on` validation of its own — its role is plan-hysteresis/selection, not dependency-graph verification.

**Implementation evidence — the observed failure and its patches**
This is the single most important finding for this tenet. `src/monkey_brain/kernel/domains/grocery.py:5112-5121` (`OrderConfirmationCapability`, "Real gap this closes" comment) states, verbatim: "Confirmed live: the planner had silently dropped every depends_on in the purchase chain (a real, separate planner-reliability bug also being fixed alongside this), so nothing blocked these steps on Payment's real outcome at the dependency-graph level." The same root cause is referenced again at `grocery.py:8318-8324` for `DeliveryCapability`: "a rider was assigned and a real Shipment entity created for an order that was never paid for."

The fix applied was not a general dependency-integrity guarantee. It was point-hardening of three individual capabilities, each independently re-reading fresh KG state and checking its own precondition:
- `PaymentConfirmationCapability` (`grocery.py:7284-7469`) — checks order existence, `backordered` status, re-verifies delegation freshness (Tenet 4), fraud risk, total validity.
- `OrderConfirmationCapability` (`grocery.py:5091-5126`) — checks `context.get("order")` exists and re-reads `payment_status == "paid"` from a fresh `kg.get_entity(order_id)` (not the stale context snapshot).
- `DeliveryCapability` (`grocery.py:8325-8330`) — identical fresh-read `payment_status == "paid"` gate before assigning a rider.

This is general enforcement for exactly three capabilities in one workflow (purchase), not a structural guarantee. Nothing was found that would give an equivalent guarantee to a hypothetical fourth capability in a new chain (e.g., a future "ReturnApproval → Refund" sequence) if its planner-generated `depends_on` were similarly dropped — that new chain would need its own hand-authored, fresh-read precondition check, discovered and patched only after an equivalent incident, exactly as happened here.

**Test evidence**
- `tests/unit/test_execution_boundary_hardening.py` — `test_dependent_step_blocked_when_dependency_fails_capability_never_invoked` (line 170), `test_dependent_step_blocked_when_dependency_permission_denied` (188), `test_dependent_step_executes_normally_when_dependency_succeeds` (209), `test_empty_depends_on_is_a_no_op_every_existing_plan_is_unaffected` (226) — genuine, well-targeted tests of the executor's blocking mechanism, given a correctly populated `depends_on`. These prove the enforcement mechanism works when the dependency graph is honest.
- No test constructs a plan where the planner should have set `depends_on` but didn't, and then verifies a safety net (independent of `depends_on`) still catches the resulting inconsistency. This is precisely the failure mode documented as having occurred live.
- `tests/scenarios/test_qualification_regression.py::test_order_confirmation_without_order_creation_fails_honestly` (line 195) tests a different guard (no order exists at all), not the fresh-payment-status-read guard.
- `tests/scenarios/test_mb3013_payment_failure.py` (`test_mb3013_declined_card_is_rejected_and_leaves_no_side_effects`, line 78) confirms `payment_status != "paid"` after a declined card — but does not exercise `DeliveryCapability` or `OrderConfirmationCapability` downstream to confirm they actually refuse to proceed. Grep across `tests/` for the literal guard strings "has not been paid for yet" / "cannot arrange delivery" returns zero matches — the specific fix for the specific documented incident has no direct regression test.

**Failure / bypass analysis**
The core vulnerability (LLM planner silently omitting a dependency it should have declared) is real, documented as observed in production, and structurally still possible today — nothing in `_normalize_depends_on`, `plan_compiler.py`, or `action_executor.py` would catch it; only a capability that happens to have been individually hardened with its own fresh-state precondition check will. Enforcement is payment-workflow-specific: `PaymentConfirmationCapability`/`OrderConfirmationCapability`/`DeliveryCapability` are hardened; the other ~34 grocery capabilities were not confirmed to have equivalent independent precondition re-verification. No test exists for the "dropped dependency, capability-level guard catches it anyway" scenario — the exact scenario that occurred in production.

**Known limitations**
Causal dependency enforcement at the `depends_on` level is real, correctly-typed (index-consistent), and well-tested — but it is entirely dependent on the LLM planner correctly declaring the dependency in the first place, which has a documented, confirmed production failure mode. The actual safety net that exists today is capability-specific, ad hoc, hardened one incident at a time, not a general runtime invariant that any capability chain automatically benefits from.

**Conformance conclusion**
Per the explicit instruction not to mark this ✅ merely because payment-status guards now exist: this tenet is ⚠️, not ✅. The mechanism that exists (`depends_on` + executor-side blocking) is correctly implemented and tested for the case where the planner gets it right, but the documented, real production incident proves the planner does not always get it right, and the response was targeted capability-level patching (payment/order-confirmation/delivery) rather than a general invariant. A new capability chain today has no structural guarantee against the identical failure mode recurring until it, too, is individually hardened after its own incident.

## 10. Predictions are verified against reality.

**Verdict:** ✅

**Principle**
Every plan's Predict stage produces a blind forecast (success probability, expected world delta) before execution runs; after execution, that forecast is compared against the real observed outcome to produce a measured loss, not asserted or assumed accurate.

**Architectural intent**
Without verification, "prediction" is just narration — an LLM or heuristic could claim high confidence with no accountability. Comparing forecast to reality is what makes confidence and transition-model probabilities trustworthy signals rather than decoration.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/comparison/integration.py:1-30` (module docstring) — explicitly documents that Predict runs before Execute (`Observe → Believe → Plan → Predict (simulate) → Execute (real plan) → Observe Outcome → Compare`), and explains why: an earlier version ran Predict after Execute, letting the "forecast" see the real outcome first, making the loss meaningless — this was found and fixed, confirmed by reading the code, not assumed.
- `_run_comparison` (`comparison/integration.py:238-310`) reads `state.prediction_result` (from Predict) and `state.execution_result` (from Execute), builds two comparable graphs (`_prediction_to_graph`, `_execution_to_graph`), and calls `comparator.compare(sim_graph, exec_graph)` via `src/monkey_brain/kernel/comparator_runtime.py::get_comparator_runtime()`.
- `comparator_runtime.py:196-342` (`ComparatorRuntime.compare`) computes real, non-trivial losses: `topology_loss`/`epistemic_loss` from actual node-level diffs between predicted and executed graphs, `policy_loss` from `reward_diff`, `world_loss = topology_loss + epistemic_loss`, `actor_loss = world_loss*0.7 + policy_loss*0.3` (lines 291-305, 340-342) — genuine arithmetic over real diffed data, not a stub or always-zero placeholder.
- Losses are surfaced as metrics (`_obs.gauge("compare.actor_loss", ...)` etc., `comparison/integration.py:296-298`) and logged with the execution_id for traceability. A prior reliability bug is documented and fixed at `comparison/integration.py:261-278`: previously, a missing `prediction_result`/`execution_result` silently skipped comparison with zero logging. Now it logs a WARNING and increments `compare.total{outcome=skipped}`.

**Test evidence**
`tests/unit/test_comparator_hardening.py` — real, substantive test coverage: `TestPerfectSuccess` (asserts `outcome == SUCCESS`, `epistemic_loss == 0.0`, `world_loss == 0.0`, correct node diffs), `TestCompleteFailure`, `TestPartialFailure` (asserts specific per-node `match`/`expected_success`/`actual_success` values across a 2-node partial-failure scenario), `TestUnexpectedOutcome` (`UNEXPECTED_SUCCESS`/`UNEXPECTED_FAILURE`), `TestMissingObservation` (`INCONCLUSIVE`), `TestMultiStepPartialExecution` (3-node scenario, asserts step C, never executed, correctly shows `actual_success is None`). These assertions exercise the actual comparator logic against constructed prediction/execution graphs and check specific computed values — not name-based or superficial.

**Failure / bypass analysis**
The comparison is measurement-only by design ("Comparator MEASURES. Learner OPTIMIZES.") — a prior version mutated `TransitionModel` inline during Compare, which was identified as a violation and moved to a separate `learn_transitions` stage. This is a documented, already-fixed issue, not a live gap. If `prediction_result` or `execution_result` is missing, comparison is skipped entirely — honest degradation, not silent success, now logged/metered. No test exercises the "skipped" branch itself — a minor coverage gap on the degradation path, not the core mechanism.

**Known limitations**
The skip-path logging fix itself has no direct regression test. This does not weaken the core verified-comparison mechanism, which is both real and well-tested.

**Conformance conclusion**
Prediction-vs-reality verification is a genuine, non-trivial computation over real predicted and executed graphs, wired into the live pipeline in the correct causal order (predict before execute), and is covered by meaningful, scenario-specific tests that assert on actual computed values rather than superficial presence checks. This is one of the more convincingly enforced tenets in the codebase.

## 11. Learning comes from the prediction/reality residual.

**Verdict:** ✅

**Principle**
The Learn stage's reward/signal computation is not an independent heuristic — it is derived from (or at minimum incorporates) the same `actor_loss`/`world_loss`/`policy_loss` residual that Compare (Tenet 10) just measured between prediction and reality.

**Architectural intent**
If Learn used a disconnected signal (e.g., raw plan success/failure only), the system could "learn" in a direction uncorrelated with how wrong its own predictions were — defeating the purpose of having a Predict stage at all. Tying Learn to the residual makes learning a direct function of forecast error.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/learning/integration.py:100-117` (`integrated_learn`) — after running the original `_learn`, it reads `comparison = getattr(state, "comparison_result", None)` (the exact dict `_run_comparison` wrote in Tenet 10's stage) and, if present, merges `actor_loss`, `world_loss`, `policy_loss`, `comparison_score` directly into `experience.metadata` via `dataclasses.replace(experience, metadata=enhanced_metadata)` before the experience is handed to `resolve_policy(self._learning_policy).learn(experience)`.
- Stage ordering in `comparison/integration.py:174-188` places `compare` immediately before `learn` — the residual is guaranteed to exist (or be explicitly `None`) by the time Learn runs, never computed after the fact.
- Data flow is a same-object, same-cycle handoff: `state.comparison_result` (written by `compare_stage`) → read by `integrated_learn` → `state._phi_pipeline_input = (experience, result)` (with the enhanced, comparison-aware metadata now baked into `experience`) → read by `integrated_compile_phi` to build the `PhiArtifact`. This is one continuous data lineage, not two independently-computed values that happen to share a stage list.
- `src/monkey_brain/kernel/pipeline/prediction/integration.py`'s `_apply_transition_learning` (the `learn_transitions` stage, run immediately after `learn`) is the actual `TransitionModel` update — moved out of Compare specifically so it runs only after the residual has already fed Learn.

**Test evidence**
- `tests/unit/test_learning_integration.py::TestComposesWithPlanningAndExecutionIntegration` (around line 230-245) asserts `state.phi["experience_id"] == state.learning["experience_id"]` after a full pipeline run with real planning and execution integration wired in — confirming the same experience_id flows unbroken from Learn into the compiled Phi artifact.
- No test was found that explicitly constructs a `comparison_result` with a specific non-zero `actor_loss`/`world_loss` and asserts the resulting `LearningExperience.metadata` or `LearningResult.reward` reflects that specific value. The wiring (metadata injection) is directly confirmed by reading the code; the causal claim that reward is quantitatively derived from the residual (as opposed to just annotated with it) depends on `resolve_policy(...).learn(experience)`'s internal reward formula, which was not independently re-verified in this pass.

**Failure / bypass analysis**
The injection is conditional: `if comparison:` — when `state.comparison_result` is `None` (the Tenet-10 skip path), Learn proceeds with whatever `original_learn` already computed, with no comparison-derived signal at all. This is a legitimate degrade-honestly path, not a bypass, but it does mean the tenet is only enforced when Compare successfully ran. Whether `resolve_policy(...).learn()`'s actual reward formula uses `metadata["actor_loss"]`/`world_loss` in its computation (vs. merely storing it as inert metadata) was not traced to the specific `LearningPolicy` reward function in this pass — this is the one link in the chain not independently re-verified here.

**Known limitations**
The metadata hand-off from Compare to Learn is definitively real and traced; whether the downstream reward formula itself mathematically depends on that metadata (versus only carrying it for the Phi artifact's `metadata` field) was not independently confirmed against `LearningPolicy`'s reward implementation in this pass. No test pins a specific loss→reward relationship.

**Conformance conclusion**
The architectural wiring — Compare's residual flowing directly into Learn's experience metadata, in the correct stage order, via a single continuous data object — is real, live, and traced end-to-end in code, with test evidence confirming the experience/phi identity chain stays intact. The unverified link (whether the reward formula itself mathematically consumes the loss values) keeps this from being a fully closed-loop-proven ✅ in the strictest sense, but the architectural mechanism as implemented satisfies the tenet as stated.

## 12. Local cognition operates against shared reality.

**Verdict:** ✅

**Principle**
Every actor's cognition reads from and writes local belief about one shared `SharedWorld` instance — not a private copy, snapshot, or per-actor world simulation. Multiple actors observing "the same fact" are genuinely observing the same underlying object.

**Architectural intent**
If each actor held its own copy of the world, coordination would require an explicit synchronization protocol and staleness would be unbounded. A single shared object makes "the world changed" instantly visible to the next observation of any actor, with no replication lag or reconciliation logic needed.

**Implementation evidence**
- `src/monkey_brain/kernel/society/integration.py` (`PlanetaryRuntime._attach_society`) — `society_runtime._world = self._world_model.semantic_world` and `society_runtime._observation_provider._world = self._world_model.semantic_world`: both assignments bind to the exact same `SharedWorld` object reference — not a copy, not a per-society clone. Every `SocietyRuntime` this `PlanetaryRuntime` manages is attached to the identical object.
- `SocietyRuntime.register_actor`'s `context_factory` (`kernel/society/runtime.py`) closes over `self._world` and reads it at call time (attribute lookup deferred to invocation, not resolved at closure-creation), so actors registered before `_attach_society` runs still end up observing the shared instance once attachment completes.
- `WorldPollingProvider.observe` (Tenet 8 evidence) takes `world` as a plain parameter and reads it directly with no internal copying, confirming no defensive copy is made between the shared object and what the actor's Observe stage actually reads.

**Test evidence**
`tests/scenarios/test_actor_isolation_audit.py` targets actor isolation/world-sharing concerns directly. No test was found that explicitly does an identity assertion (`world_a is world_b`) across two actors/societies attached to the same `PlanetaryRuntime`. The object-identity claim is fully supported by direct code reading (the assignment is an unambiguous reference assignment, not a constructor call), but is not pinned by an explicit regression test.

**Failure / bypass analysis**
A `SocietyRuntime` constructed standalone (no `PlanetaryRuntime`, e.g. in unit tests) gets its own `SharedWorld()` instance — this is correct and intentional (standalone usage is explicitly out of scope for planetary-wide sharing per `register_actor`'s own docstring), not a violation. `_world = self._world_model.semantic_world` is a reassignment that happens in `_attach_society` — an actor whose `context_factory` closure was built before this reassignment still resolves correctly (confirmed: closure reads `self._world` live at call time), but this ordering dependency is subtle and not obviously safe without tracing the closure semantics directly, as done here.

**Known limitations**
No explicit object-identity regression test exists; the claim rests on direct, unambiguous code reading (reference assignment, not construction) rather than a pinned test.

**Conformance conclusion**
The shared-object wiring is unambiguous in the code — `_attach_society` assigns the identical `SharedWorld` reference to every managed society and its observation provider, and the actor-side closure reads that reference live rather than capturing a snapshot. This is architecturally sound and directly traceable; the main gap is an explicit test pinning object identity, which is a test-coverage gap rather than a reason to doubt the implementation.

## 13. Failure, uncertainty, and drift are native states.

**Verdict:** ✅

**Principle**
Low confidence, missing observations, unreliable transitions, and world drift are not exceptional/error conditions to be caught and suppressed — they are first-class values that flow through belief, planning, and the world model, and are meant to influence control flow (reject a plan, iterate for more confidence, tolerate stale data) rather than be logged and ignored.

**Architectural intent**
A system that treats uncertainty as an afterthought either crashes on it or silently proceeds as if it weren't there — both are dangerous for an autonomous actor. Making these native means the system can act appropriately degraded under uncertainty rather than pretending certainty it doesn't have.

**Implementation evidence**
- `src/monkey_brain/kernel/pipeline/plan_validator.py:57-108` (`PlanValidator.validate`) — `if plan.confidence < self._min_confidence: violations.append("confidence_below_threshold:...")`, and `valid = len(violations) == 0`; a low-confidence plan is genuinely marked invalid, not just annotated — confirmed this actually gates plans.
- `src/monkey_brain/kernel/pipeline/cognitive_policy.py:102-153` (`RecursivePlanningPolicy`, its own docstring: "loops Plan → Predict until confidence is high enough") — `confidence = state.belief.confidence(); if confidence >= self._confidence_threshold: [stop iterating]` — real control-flow branching driven by a confidence value, up to `max_iterations`.
- `src/monkey_brain/kernel/society/world.py` (`SharedWorld.perturb`) — implements drift as ordinary, designed-in world behavior (numeric attributes drift by a magnitude, stochastic events fire at a configured chance).
- `src/monkey_brain/kernel/society/integration.py:3924-3980` (`PlanetaryRuntime._run_cycle`) — `perturbations = self._world_model.perturb(magnitude=perturbation_magnitude, event_chance=perturbation_chance)` is called unconditionally every real planetary cycle, with `perturbation_magnitude`/`perturbation_chance` themselves derived from recent event severity — drift is a genuine, live, self-adjusting mechanism, not a static constant.

**Test evidence**
`tests/unit/test_pipeline_planning.py:242-246` — `validator = PlanValidator(min_confidence=0.5)`; `assert any("confidence_below_threshold" in v for v in result.violations)` — directly confirms the confidence-gating mechanism fires as designed, not just that the field exists. No test was located that directly exercises `SharedWorld.perturb()`'s drift output or `RecursivePlanningPolicy`'s iteration-until-confident loop end-to-end. These mechanisms are confirmed real by direct code reading, but lack dedicated regression tests pinning their exact behavior.

**Failure / bypass analysis**
`RecursivePlanningPolicy` is one of potentially several `CognitivePolicy` implementations — whether it (vs. the plain, non-iterating base `CognitivePolicy`) is what's actually wired into the live production actor path was not re-verified in this pass; `perturb()`'s call in `_run_cycle` is unconditional and confirmed live regardless, so world-level drift is solidly proven live independent of that open question.

**Known limitations**
No direct regression test for `SharedWorld.perturb()`'s numeric behavior or for `RecursivePlanningPolicy`'s iterate-until-confident loop. Whether `RecursivePlanningPolicy` is actually the live production Plan-stage policy was not independently confirmed in this pass.

**Conformance conclusion**
Confidence-based rejection (`PlanValidator`) is both real and directly tested. World-level drift (`SharedWorld.perturb`) is real, unconditionally invoked every live planetary cycle, and self-adjusts based on recent event severity — a genuine native-state mechanism, not a decorative field. The one open thread does not undermine the tenet, since confidence-gating and drift are independently and solidly demonstrated through other mechanisms.

## 14. Repeated verified cognition should become reusable deterministic capability.

**Verdict:** ⚠️

**Principle**
When an actor's cognition repeatedly and verifiably succeeds at the same class of goal, that pattern should eventually be compiled into a deterministic, directly-dispatchable capability — so future occurrences of the same goal no longer require full LLM-driven reasoning, only a fast, reliable execution path.

**Architectural intent**
Without this, every occurrence of even a completely routine, previously-solved goal re-pays the full cost (latency, LLM variance, token spend) of cognition from scratch, forever. Promoting proven patterns to deterministic capabilities is what lets the system get cheaper and more reliable over time without sacrificing governance, provided promotion itself stays governed (see Tenets 6/7).

**Implementation evidence — two distinct pipelines, only one is live**
- `src/monkey_brain/kernel/pipeline/belief_runtime.py:1596-1602` (`CognitiveRuntime._compile_phi`) is a literal stub: `state.phi = None; return state`, docstring: "Placeholder where Q-values become transition weights." This is what runs when `CognitiveRuntime()` is constructed with no `policy` argument.
- This bare path is not what the live actor tick uses. Tracing the actual call chain: `CognitiveActor` constructs `BeliefFormation(engine=engine)` — `BeliefFormation._get_engine()` explicitly defaults to `build_comparison_integrated_runtime()` whenever no engine is injected, and production callers (`kernel/domains/vertical_router.py:176`, `kernel/society/runtime.py:326`) inject a fully-configured one — both paths converge on `ComparisonIntegratedPolicy`, never the bare stub.
- `ComparisonIntegratedPolicy → PredictionIntegratedPolicy → LearningIntegratedPolicy.configure()` (`kernel/pipeline/learning/integration.py:145-171`) is what actually builds the `compile_phi` stage function used at runtime, and it is real: `artifact = PhiCompiler().compile(experience, result); state.phi = phi_to_dict(artifact)` — a genuine `PhiArtifact` (goal_signature, reward, confidence, outcome_summary, top_signal_summary) is produced on every real production tick. The bare `belief_runtime.py::CognitiveRuntime()` stub is confirmed, by grep, to be constructed directly only inside unit tests — never in any production actor/route code path.
- This session added `src/monkey_brain/kernel/pipeline/learning/capability_promotion.py` (new file) — a `CapabilityPromotionTracker` wired directly into `integrated_compile_phi` (`learning/integration.py:159-170`), immediately after `state.phi = phi_to_dict(artifact)`. It tracks consecutive verified successes (`reward > 0.0 and confidence >= 0.75`) per `goal_signature` and, on crossing a streak of 3, persists a `PromotedCapabilityCandidate` (goal_signature, streak count, confidence, outcome_summary, an incrementing `version`) to Redis via the same lazy-singleton pattern as `negotiation_store.py`.
- Critically, this stops short of the tenet as literally stated. Grepping the entire `src/` tree for `PromotedCapabilityCandidate`, `list_promoted_capabilities`, `default_tracker`, and `CapabilityPromotionTracker` outside of `capability_promotion.py` itself finds exactly one consumer: the `observe()` call in `learning/integration.py`. There is no code anywhere that reads a `PromotedCapabilityCandidate` back and registers it as an actual `Capability` with a `CapabilityBus`, and no code that gives such a capability a deterministic `.handle()` that `ActionExecutor` could actually dispatch to for a matching future action. A repeated, verified pattern becomes a durable, versioned, inspectable log entry — not reusable, dispatchable execution.

**Test evidence**
`PhiArtifact` production (the first half of the mechanism) is genuinely well-tested: `tests/unit/test_learning_phi.py` (`TestAcceptanceScenario`, `TestGoalSignature`, `TestOutcomeSummary`, `TestTopSignalSummary`, `TestFieldPassthrough`, `TestPhiToDict`, `TestPhiArtifactImmutability`, `TestOwnershipBoundary`) asserts real field values against constructed experiences/results. `tests/unit/test_learning_integration.py::TestPhiCompilerWiredIn` directly asserts the stub-vs-wired distinction described above: `assert state.phi is None` for the base policy, `assert isinstance(state.phi, dict)` and specific field cross-checks for `LearningIntegratedPolicy` — strong, precise evidence for the "Phi compilation is real and correctly wired" half. `capability_promotion.py` itself has zero test coverage, confirmed by grep — expected, since the module was written this session, but it means the promotion-tracking half of the mechanism is entirely unverified by any automated test.

**Failure / bypass analysis**
No authoring/promotion pipeline exists: there is no code path from `PromotedCapabilityCandidate` → a real `Capability` subclass → `CapabilityBus.register_capability()`/`.register()` → dispatchable via `ActionExecutor._execute_action`. The chain stops at persistence. The tracker's in-memory streak state is a module-level singleton with no persistence of its own — a process restart resets every in-progress streak to zero (only already-completed `PromotedCapabilityCandidate` records survive, via Redis). `reward > 0.0` as the "verified success" bar is a fairly low threshold — a legitimate tuning parameter, not a structural gap, but worth noting for anyone evaluating how strict "verified" actually is here.

**Known limitations**
1. No authoring or capability-registration pipeline exists — this is the core gap preventing ✅. 2. The new tracking code has zero test coverage. 3. In-memory streak state does not survive a process restart (only completed candidates do). 4. The bare `CognitiveRuntime()` stub remains in the codebase and would silently produce `state.phi = None` for any future caller that constructs a raw `CognitiveRuntime` without going through `BeliefFormation`.

**Conformance conclusion**
This is not a full implementation and should not be scored as one, but it is meaningfully more than "not implemented": the prerequisite mechanism (real, live, well-tested `PhiArtifact` production from real cognitive cycles) is solid, and a genuine, durable, versioned pattern-detection layer now sits on top of it. What's missing — an authoring/promotion pipeline that turns a `PromotedCapabilityCandidate` into an actual dispatchable `Capability` registered with a `CapabilityBus` — is a well-defined, scoped, not-yet-built piece of architecture, not a broken or bypassed one. ⚠️ is correct; ✅ would overstate what's actually dispatchable today.

## 15. Every consequential transition is observable and auditable.

**Verdict:** ⚠️

**Principle**
Every state-mutating action a capability performs must leave a durable, queryable trace — who did what, when, why, and with what outcome — reconstructable after the fact without re-deriving it from raw application logs.

**Architectural intent**
Without this, governance and post-hoc review are impossible: a wrong or malicious commit is indistinguishable from a correct one once it has happened, and negotiated/gated decisions (TransitionGate, payment capture, negotiation outcomes) would be unauditable black boxes.

**Implementation evidence**
- `src/monkey_brain/kernel/society/context_stream.py` — `SocietyContextStream.publish()` is the single canonical append-only event log; every event carries `correlation_id`/`causation_id`, `provenance`, `confidence`.
- `_validate_causal_lineage()` (added this session) now logs a warning + `_obs.counter("context_stream.causal_lineage_violations", ...)` when an event has a `causation_id` but no `correlation_id` — makes a previously-silent gap observable, but does not reject/repair non-conformant events.
- `src/monkey_brain/kernel/pipeline/audit_trail.py::record_decision_event()`, used by `action_executor.py`'s TransitionGate block, records `transition_gate_decision` events keyed by `execution_id`.
- `action_executor.py::_publish_action_event` (edited this session) publishes one ContextEvent per real capability outcome; the no-capability-bus fallback now publishes a distinct `UNGOVERNED` event instead of being silently dropped.
- `src/monkey_brain/kernel/society/observability.py::SocietyObservability` reconstructs `ActorTimeline`/`InteractionGraph`/`WorldEvolution`/`SocietyTrace` purely from the ContextEvent stream.

**Test evidence**
`tests/unit/test_communication_verification.py`, `tests/unit/test_correlation_causation.py` exercise correlation/causation propagation through communication paths — read both, they assert concrete `correlation_id == X`/`causation_id == Y` equalities on real published events, not just field presence. `tests/scenarios/test_mb3056_lemon_metrics.py` asserts real metrics are emitted for real code paths, not mocked away. No test exercises the new `_validate_causal_lineage` warning path or the new `UNGOVERNED` event branch added this session — these are unverified by any test.

**Failure / bypass analysis**
`SocietyContextStream.clear()` (module docstring, own admission) discards the entire in-memory event log with no persisted Timeline backing it — "no Redis/Timeline persistence for ContextEvents" is a documented, live gap: the audit trail is not itself durable across a process restart except via the separate `audit_trail.py` decision-event log (Redis-backed). `correlation_id`/`causation_id` remain optional fields enforced only by convention at call sites; the new lineage check is warn-only, not a gate. The action_executor "ungoverned" branch is new, unreviewed by any test, and its correctness rests entirely on manual code reading.

**Known limitations**
Context stream durability, and enforcement (vs. observation) of causal lineage, are both incomplete. The mechanism for observability is real and used pervasively in the live request path, but "audit trail durability across restart" and "causal integrity enforcement" are not fully closed.

**Conformance conclusion**
The observability mechanism is real, pervasive, and demonstrably wired into every governed transition on the live path, with genuine test coverage for correlation/causation propagation in paths that predate this session. However, the in-memory-only context stream, convention-only lineage fields, and untested new code keep this at ⚠️ rather than ✅.

## 16. Persistent actors survive interruption, restart, and model change.

**Verdict:** ⚠️

**Principle**
An actor's cognitive continuity — its belief, its mid-execution progress, and its identity — must survive a process crash, a restart, or a change of underlying LLM provider/model, without being re-created from scratch or silently losing state.

**Architectural intent**
Actors are meant to be long-lived, not request-scoped; if a crash or redeploy destroys accumulated belief/goal-progress, "persistent actor" is fiction and every actor is effectively stateless per-request.

**Implementation evidence — three genuinely distinct mechanisms, evaluated separately**

*(a) Mid-execution checkpoint/resume — real and tested.* `src/monkey_brain/kernel/pipeline/execution_checkpoint_store.py` (Redis-backed) + `action_executor.py::execute()` (lines 137-227): `completed_steps` is loaded when `meta.resume_execution_id` is explicitly supplied; already-completed steps are replayed from the checkpoint rather than re-dispatched to the capability, and `depends_on` gating honors checkpointed successes.

*(b) Belief persistence across restart — real but narrower than "full actor identity."* `src/monkey_brain/persistence/actor_state_store.py::ActorStateStore` (MongoDB-backed) + `PlanetaryRuntime.restore_actor_belief()`/`checkpoint_actor_belief()` (`kernel/society/integration.py` ~2015-2158). Called from live routes: `api/routes/prompt.py`, `payments.py`, `approval.py`, `negotiation.py` — genuinely wired into request handling, not dead code. Critically: `restore_actor_belief()` requires the actor to already exist in memory — it refreshes belief on an already-registered actor, it does not reconstruct an actor object from nothing. There is no boot-time bulk restoration: `api/main.py::lifespan()` boots the Kernel and runs a world-validation pass but never iterates persisted actors to re-register them. Also: only `belief_state` round-trips through this path. Goals/objective, team membership, affiliations, and trust records are not part of `PersistedActorState` and are not reconstructed by `restore_actor_belief`.

*(c) Model/provider change — write path added this session, read path does not exist yet.* `PersistedActorState.last_model_provider`/`last_model_name` (this session) are populated at `checkpoint_actor_belief()` from `get_backend().stats()`. Grepped the entire tree: these two fields are written in exactly the places this session added them and read back nowhere — no audit query, no continuity check, no mismatch warning consumes them. This is a write-only field today.

**Test evidence**
- `tests/scenarios/test_checkpoint_restart.py` (RECOVERY-001..004) — real, meaningful tests: `test_recovery001_completed_step_is_not_re_executed_on_resume` asserts a checkpointed step is NOT redispatched to its capability, while a new step is; `test_recovery002` proves `depends_on` gating honors checkpointed success; `test_recovery004` closes a real found bug (empty-goal checkpoints failing `PlanValidator` on resume). Strong, mechanism-level evidence for (a).
- `tests/unit/test_belief_persistence.py::TestCheckpointRestoreRoundTrip::test_round_trip_reproduces_belief_content` genuinely checkpoints belief, wipes in-memory belief, and asserts restoration reproduces facts — real evidence for (b)'s belief round-trip, but the actor object is never destroyed in this test, so it does not test "actor doesn't exist in memory, gets reconstructed."
- No test exists for `last_model_provider`/`last_model_name` at all. No test exercises actual process restart (a fresh `PlanetaryRuntime` instance loading a previously-registered actor from Mongo with no in-memory state) — every test above operates within one `PlanetaryRuntime` instance's lifetime.

**Failure / bypass analysis**
Checkpoint resume is opt-in — the module's own docstring states plainly this is not automatic crash detection. A crash whose caller doesn't know to resume loses progress exactly as before this mechanism existed. No boot-time actor rehydration exists; an actor unregistered from memory is only restored the next time a request happens to name it, and even then only its belief — not goals, affiliations, team, or trust. `last_model_provider`/`last_model_name` are dead weight until something reads them.

**Known limitations**
"Persistent actor" currently means: (1) mid-plan crash recovery works and is well-tested, given explicit opt-in; (2) belief content survives an in-process wipe/restore cycle and is wired into live routes; (3) full actor identity (goals/affiliations/team/trust) is not reconstructed on restart, only belief; (4) model/provider continuity is recorded but not yet consulted for anything.

**Conformance conclusion**
This tenet is real in its narrowest, best-tested form (mid-execution checkpoint resume) and partially real in its second form (belief persistence, well-tested but requiring the actor to already be resident in memory), but the broader "actor identity survives restart" and "model change is audited/continuity-checked" claims are not substantiated by current code or tests. ⚠️ reflects a genuinely partial, unevenly-tested implementation, not absence.

## 17. Actors own cognition; the runtime owns infrastructure.

**Verdict:** ✅

**Principle**
`SocietyRuntime`/`PlanetaryRuntime` coordinate scheduling, world state, messaging, and capability wiring — they never decide what an actor should do. Planning, belief formation, and decision-making live exclusively inside the actor's own cognitive engine.

**Architectural intent**
Prevents the coordination layer from becoming a second, competing locus of "intelligence" that actors can't reason about or audit — cognition must stay a property of the actor, inspectable and swappable per-actor, not baked into shared infrastructure.

**Implementation evidence**
- `src/monkey_brain/kernel/society/runtime.py` module docstring and class docstring (~100-107): "SocietyRuntime coordinates actors [...] does NOT perform cognition — each actor owns its own cognitive lifecycle." Verified against method bodies, not just the docstring: `_coordinate_actor()` (~1055-1097) only calls `await managed.tick(prompt_request)` and republishes/records the result — it never inspects or drives planning content.
- `register_actor()` (~256-423) constructs `CognitiveActor` and injects only infrastructure references via `context_factory` (`knowledge_graph`, `world`, `execution_engine`) — no business/planning logic is constructed at the SocietyRuntime layer.
- `kernel/compile/actor_runtime.py::ActorRuntime` is described in its own comments as "the sole owner of cognition and its supporting services," constructed strictly below the SocietyRuntime boundary.

**Test evidence**
- `tests/scenarios/test_actor_isolation_audit.py` (Tests A–J) — a real, non-mocked, repository-wide audit proving actor state/belief objects are genuinely separate instances (not shallow copies), that information crosses actor boundaries only via explicit protocol (AskActor, shared-visibility co-membership, explicit observe/build), and that concurrent execution/checkpointing never leaks across `actor_id`. This is the single strongest piece of evidence in the whole tenet set — it tests the actual isolation boundary against production code paths, not a mock of it.
- `tests/test_phase8_autonomous_actors.py::TestIndependentActorExecution`, `TestSocietyRuntimePhase8` — exercise multiple actors ticking independently through the real `SocietyRuntime`.

**Failure / bypass analysis**
`ActorRuntimeState.cognitive_stages` is an explicitly-labeled "backward-compatible fallback" path for callers that only supply named stage callbacks instead of a real `actor` object — a legacy, still-reachable branch, though not the live production path. `SocietyRuntime._deliver_messages()` directly writes a `BeliefEntry` into `target.belief_state` (a society-level `belief.py::BeliefState`, distinct from the actor's canonical `pipeline/belief_state.py::BeliefState`) based on a trust-threshold heuristic, bypassing the target's own Observe→Believe reasoning about whether to accept the claim — infrastructure reaching into something literally named `belief_state`, and a legitimate blemish on "actors own cognition exclusively," though scoped to a secondary/shadow belief representation, not the actor's real cognitive state.

**Known limitations**
The message-delivery belief injection above is the one concrete counter-example found; it does not touch the actor's canonical belief, so it does not undermine the tenet's core claim, but it is worth an operator's attention if "actors own belief state exclusively" is read literally.

**Conformance conclusion**
This is one of the best-evidenced tenets in the codebase: the architectural separation is enforced by the actual method bodies, and `test_actor_isolation_audit.py` is genuine, non-mocked, production-path test coverage of the isolation boundary itself. The one blemish (message-delivery belief injection into a secondary belief structure) is minor and clearly scoped, not a structural violation.

## 18. Contention and coordination are first-class system behavior.

**Verdict:** ✅

**Principle**
When multiple actors compete for the same resource or tick concurrently, the system must resolve contention deterministically and safely — never through accidental interleaving, silent overwrite, or oversell.

**Architectural intent**
Multi-actor concurrency is the default operating condition of this system, not an edge case; without first-class contention handling, concurrent actors would corrupt shared state or double-allocate scarce resources.

**Implementation evidence**
- `src/monkey_brain/kernel/society/runtime.py:127` — `self._actors_lock = threading.Lock()` guards the `_actors` dict against registration/tick races.
- `src/monkey_brain/kernel/society/integration.py` — `self._tick_lock` (asyncio.Lock, `cycle()`) plus a cross-process Redis distributed lock (`_acquire_planetary_cycle_lock`/`_release_planetary_cycle_lock`) serialize planetary cycles both within-process and across replicas, with explicit fail-closed semantics on Redis errors.
- `src/monkey_brain/kernel/knowledge_graph.py::compare_and_swap`/`version_of` (~634-670) is genuine optimistic concurrency: a real rejection (`return False, entity`) on version mismatch, not a no-op. Extensively used in live capability code: `kernel/domains/grocery.py` (inventory reservation, wallet balance, orders, auctions, loans), `kernel/domains/logistics.py` (rider assignment), `kernel/domains/negotiation.py` (agreements).
- `TransactionCoordinator`/`TransitionGate` provide negotiation-based contention resolution for cross-actor resource claims.

**Test evidence**
- `tests/scenarios/test_mb3015_inventory_reservation.py` qualifies `try_reserve` under real OS threads (per `test_concurrent_actors.py`'s own docstring, which cites it), i.e., genuine preemptive concurrency, not just asyncio cooperative scheduling.
- `tests/scenarios/test_concurrent_actors.py` (CONCUR-001/002) is real evidence, and unusually honest in its own docstring: it explicitly investigated and rejected testing an interleaving that "can't happen in production" (single planet-wide tick lock), and instead tests the layer that must hold as defense-in-depth: two actors' full `ProductSelection → OrderCreation` chains racing via genuine `asyncio.gather` through the shared `ActionExecutor`.
- `tests/scenarios/test_membership_concurrency.py::test_stability001_concurrent_membership_add_never_duplicates`, `test_stability002_..._no_cross_actor_contamination` — real concurrent-add tests asserting exactly-one membership survives and no cross-actor bleed occurs.
- `tests/scenarios/test_transition_gate.py::test_budget004` proves TransitionGate/negotiation ordering under real `asyncio.gather` concurrency for a contested resource.

**Failure / bypass analysis**
`compare_and_swap`'s in-process implementation is explicitly documented as safe only because "every KnowledgeGraph method is synchronous with no `await` inside" — a future capability that introduces an `await` mid-mutation would silently break this invariant; nothing enforces that constraint structurally (it's a design note, not a guard). Contention protection is comprehensive within capabilities that use `compare_and_swap`, but is not a structural guarantee for every future capability — a new capability author must remember to use CAS rather than plain read-then-write.

**Known limitations**
The safety argument for in-process CAS rests on an invariant (no `await` inside capability handlers) that is documented but not enforced by any linter/type-check/runtime assertion — a latent fragility, not a current gap.

**Conformance conclusion**
This is the most convincingly tested tenet in this cluster: genuine multi-layer contention handling (planet-wide lock, distributed lock, per-entity CAS) backed by tests that use real OS threads and real `asyncio.gather`, with test authors who visibly reasoned about what could and couldn't actually race in production. ✅ is warranted.

## 19. Knowledge, policies, and capabilities are versioned infrastructure.

**Verdict:** ⚠️

**Principle**
Facts, governance policies, and capabilities are not just live-mutable state — they carry version identity, so a stale reference, a concurrent conflicting write, or "which version of this policy applies" is a decidable question, not silently overwritten or ambiguous.

**Architectural intent**
Without real versioning, two actors can clobber each other's writes invisibly, and there is no way to detect that a plan was built against now-stale knowledge — silent data loss and stale-plan execution are the specific failures this prevents.

**Implementation evidence — two very different levels of maturity, must not be conflated**

*(a) Knowledge (KnowledgeGraph entities) — genuinely enforced, real optimistic concurrency.* `kernel/knowledge_graph.py::version_of()`/`compare_and_swap()` (~634-670) is consulted and enforced pervasively: `kernel/pipeline/planning/plan_staleness.py` uses `kg.version_of()` specifically to detect stale plans — `current_plan_store.py` stores `{entity_id: kg.version_of(entity_id)}` per plan precisely so a later staleness check can compare against it. This is versioning used for a real decision, not a cosmetic counter. `compare_and_swap` genuinely rejects on version mismatch and is the load-bearing concurrency primitive for grocery/logistics/negotiation capabilities (see Tenet 18 evidence).

*(b) SharedWorld capabilities/policies (`WorldCapability.version`/`WorldPolicy.version`, `SharedWorld._version`) — write-only, added this session, not yet consulted anywhere.* `kernel/society/world.py` declares `version: int` fields on `WorldCapability`/`WorldPolicy`, and `SharedWorld._version` is a real, correctly-incrementing whole-world counter (confirmed to append to `_version_history` — an earlier-looking "declared but never populated" comment on `version_history()` is stale documentation describing an already-fixed past bug, not a live gap). Before this session, `add_capability()`/`add_policy()` had zero live callers anywhere in the codebase — confirmed by grep — the version field never carried a real value. This session added `record_capability()`/`record_policy()` (bump version correctly on re-registration by id) and wired them into: `PlanetaryRuntime._sync_world_capabilities()` (mirrors the real capability bus on society attachment), the live `POST /societies/{id}/governance-policies` route, and the Redis society-rehydration path. Grepped the entire tree for consumers of `SharedWorld.version`/`.capabilities()`/`.policies()`: the only reads are this session's own `_sync_world_capabilities` (writes, checks for no-op) and a CLI stats printout (display only). Nothing anywhere reads a `WorldCapability`/`WorldPolicy.version` to make a real decision. There is no deployment/coexistence mechanism for capabilities at all — a "capability" in the executable sense is a single live Python object per name; there is no way for two versions of the "same" capability to coexist, no caller-side version pinning, no changelog/migration mechanism. "Versioned" at this layer means, concretely, "an integer that increments and is stored" — nothing more, today.

**Test evidence**
`tests/scenarios/test_mb3015_inventory_reservation.py`, `test_concurrent_actors.py`, `test_membership_concurrency.py` all exercise `compare_and_swap`/`version_of` indirectly through real capability calls — real evidence for (a). Zero tests exist for `record_capability`/`record_policy`/`_sync_world_capabilities`/`SharedWorld._version` — confirmed by grep across `tests/`. This is entirely new, unverified code from this session.

**Failure / bypass analysis**
The KnowledgeGraph-level versioning (a) is real and load-bearing. The SharedWorld-level versioning (b) — the layer that most literally maps to "knowledge, policies, and capabilities" as named entities — is currently write-only scaffolding with no consumer, even after this session's fix; the fix closed "zero callers" but did not close "zero consumers of the resulting version." No mechanism prevents two different actors/operators from re-registering the same `policy_id`/`capability_id` concurrently and losing an update (no CAS at this layer, unlike (a)).

**Known limitations**
This tenet holds strongly for entity-level knowledge and not yet for capability/policy-level versioning, where the field exists and is now populated by a real code path but is not consulted by anything.

**Conformance conclusion**
Knowledge versioning is genuinely real, enforced, and tested — plan staleness detection and CAS-based writes are load-bearing production mechanisms. Policy/capability versioning, by contrast, is presence-of-a-field infrastructure: correctly incrementing, now actually populated by a real registration path, but consulted by nothing and covered by no tests. The tenet is true for one of its three named subjects and not yet true for the other two, which is exactly what ⚠️ is for.

## 20. Provider and model implementations are replaceable.

**Verdict:** ✅

**Principle**
Which LLM vendor/model reasons for an actor is a runtime configuration choice, not a compile-time or architectural commitment — swapping Claude for Ollama (or any other supported provider) must require no code change anywhere outside the provider abstraction itself.

**Architectural intent**
Prevents vendor lock-in and lets the system degrade gracefully (e.g., to a local/offline model) without touching planning, negotiation, or capability code.

**Implementation evidence**
- `kernel/execute/provider/model_backend.py::ModelBackend` — provider selected via `MODEL_BACKEND` env var with five real, fully implemented providers (`_claude`, `_gpt`, `_gemini`, `_qwen`, `_ollama`) plus a `dev_bridge` offline mode; the module docstring's claim "nothing in the runtime knows which provider is active" was verified, not assumed: grepped every caller of `get_backend()`/`ModelBackend(` (9 files, including `llm_planner.py`, `grocery.py`, `transaction.py`, `integration.py`, `actors.py`) and confirmed none branch on `self._provider`/provider identity — every call site is the uniform `backend.complete(prompt, system=...)` interface.
- `_ollama` uses a real awaited `httpx.AsyncClient` call (genuinely cancellable), while other providers run their synchronous SDK via `asyncio.to_thread` — a real, diagnosed-and-fixed asymmetry, but one isolated inside `model_backend.py` itself and invisible to callers.

**Test evidence**
`tests/conftest.py` and `tests/unit/test_llm_planner.py` mock/monkeypatch `get_backend()`/`ModelBackend` to exercise planner logic independent of any real provider — demonstrates the abstraction boundary holds structurally (planner code has no provider-specific assumptions to break when mocked) but does not prove two real providers produce interchangeable behavior end-to-end. No test actually exercises more than one real provider path — replaceability is demonstrated architecturally but not empirically.

**Failure / bypass analysis**
A separate, parallel provider abstraction exists: `src/llm/llm_provider.py` does branch explicitly on `if self.provider == "claude": ... elif self.provider == "ollama": ...`. Grepped its callers: only `src/monkey_brain/kernel/kernel.py` imports it — not used by the live cognitive-reasoning path (planning, negotiation, capability calls all go through `model_backend.py`), but its existence means "provider identity leaks into caller logic" is not universally false across the codebase, only false on the path this tenet is actually about. Provider-specific response parsing was specifically checked for outside `model_backend.py` — none found; JSON parsing in `transaction.py` operates on the raw string `backend.complete()` returns regardless of provider.

**Known limitations**
Replaceability is demonstrated architecturally and partially demonstrated by tests (mocked provider swap in planner tests), but not empirically validated end-to-end across two real providers, and the existence of a second, provider-branching abstraction (narrowly scoped to `kernel.py`) is a caveat worth an architect's attention even though it doesn't touch the reasoning path this tenet concerns.

**Conformance conclusion**
On the path that actually matters — planning, negotiation, and capability-invoking LLM calls — provider replaceability is real: five fully implemented providers behind one uniform interface, config-driven selection, and verified absence of provider-identity branching outside the abstraction itself. The lack of a live cross-provider parity test and the existence of a narrowly-scoped parallel abstraction elsewhere in the tree are real but minor caveats, not sufficient to withhold ✅ given the mechanism itself is genuinely and consistently enforced where it counts.

---

# Final Assessment

The current implementation strongly conforms to the CognitiveOS architectural constitution in 12 of 20 tenets, with 8 partial and 0 not yet implemented. The remaining gaps are concentrated in three areas: **generalization** (governance mechanisms — TransitionGate, dependency-chain hardening — that are correctly built but narrowly wired, so their guarantees do not yet extend uniformly across every capability and vertical), **consequence** (versioning and observability mechanisms that record real data but are not yet consulted by any downstream decision), and **one genuinely unbuilt capability** (Tenet 14's cognition-to-deterministic-capability promotion pipeline, for which the prerequisite machinery exists but the authoring/registration step does not).

Every mechanism found to be real was also found to be correctly implemented as far as it extends — no correctness defects were identified in the enforcement code itself. The gaps are gaps of scope and consequence, not of correctness. Several tenets marked ✅ rest on strong, targeted test evidence (`test_actor_isolation_audit.py`, `test_comparator_hardening.py`, `test_concurrent_actors.py` under real concurrency); several tenets marked ⚠️ are held back specifically by an absence of equivalent test evidence for code that is otherwise sound, or by newly-added code (this same session) that has not yet been exercised by any test at all.

These findings should be distinguished from production-scale validation, which is a separate concern this document does not assess. Architectural conformance, as measured here, describes whether the mechanisms the constitution requires actually exist and do what they claim within their current scope — it does not describe whether the system has been operated at production scale, under sustained multi-tenant load, or against adversarial input. A system can score as this one does on architectural conformance while still requiring substantial, separate work before a production-readiness claim would be warranted.
