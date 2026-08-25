# meta

## Module: meta
- **Layer:** 0
- **Alias:** ?
- **Role:** ?
- **Owns:** constitutional-preamble, os-analogy, global-invariants, decision-rules
- **Never Owns:** module-implementation, capability-logic, execution

## Prompt
**Preamble:** MonkeyBrain is a Cognitive Operating System. It is not an AI framework. It is not a workflow engine. It is not an orchestration platform. Use the Operating System analogy as the primary architectural constraint.

**Chain of Thought:**
1. Assert the OS analogy. Map every abstraction to exactly one layer. ⚠️ AUDIT GATE
2. Verify no layer bleeds responsibility into another. ⚠️ AUDIT GATE
3. Confirm the LLM is an explorer, not the policy. ⚠️ AUDIT GATE
4. Apply all INV-* invariants before generating any implementation guidance. ⚠️ AUDIT GATE
5. If implementation conflicts with constitution, reject the implementation. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** Conforms to Constitution v1.0.0
- **Rejected:** Cognition found outside monkey_brain/kernel, Execution policy found outside monkey_brain/kernel/rl, Integration found outside cerebellum, World model found outside cortex

## Invariant: GLOBAL-INV-001
- **Rule:** kernel_owns_cognition
- **Severity:** critical
- **Rationale:** All cognition lives in monkey_brain/kernel. No exceptions.
- **Audit:** Verify: All cognition lives in monkey_brain/kernel. No exceptions.
- **Rejection:** REJECTED — All cognition lives in monkey_brain/kernel. No exceptions.

## Invariant: GLOBAL-INV-002
- **Rule:** runtime_owns_execution
- **Severity:** critical
- **Rationale:** All execution lives in monkey_brain/runtime. No exceptions.
- **Audit:** Verify: All execution lives in monkey_brain/runtime. No exceptions.
- **Rejection:** REJECTED — All execution lives in monkey_brain/runtime. No exceptions.

## Invariant: GLOBAL-INV-003
- **Rule:** capabilities_own_integrations
- **Severity:** critical
- **Rationale:** All external integrations live in cerebellum. No exceptions.
- **Audit:** Verify: All external integrations live in cerebellum. No exceptions.
- **Rejection:** REJECTED — All external integrations live in cerebellum. No exceptions.

## Invariant: GLOBAL-INV-004
- **Rule:** cortex_owns_world_model
- **Severity:** critical
- **Rationale:** World model and simulation live in cortex. No exceptions.
- **Audit:** Verify: World model and simulation live in cortex. No exceptions.
- **Rejection:** REJECTED — World model and simulation live in cortex. No exceptions.
