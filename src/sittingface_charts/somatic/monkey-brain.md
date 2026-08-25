# monkey-brain

## Module: monkey_brain
- **Layer:** 1
- **Alias:** Deadpool (kernel) + Wolverine (runtime)
- **Role:** Kernel, scheduler, runtime
- **Owns:** Intent, Goal, Planner, Policy, ExecutionState, Observer, Loss, Learning, LLMExplorer, DAG, Pipeline (definition only), PipelineExecution, ThreadPools, WorkerPools, Memory (working), Streaming, AsyncExecution, ResourceManagement, SchedulingInfrastructure, MessageBus, Supervisor
- **Never Owns:** capability-execution, integrations, world-model, observability

## Principle: kernel-principle-1
> The Kernel owns cognition only. It never executes capabilities.

## Principle: kernel-principle-2
> The Kernel only produces executable capability pipelines. Execution belongs to runtime.

## Principle: kernel-principle-3
> Every abstraction in the kernel must have exactly one responsibility.

## Principle: kernel-principle-4
> The LLM is an exploration mechanism. It is not the execution policy.

## Principle: kernel-principle-5
> As experience increases, execution converges toward reinforcement learning.

## Invariant: KERNEL-INV-001
- **Rule:** no_execution_in_kernel
- **Severity:** critical
- **Rationale:** monkey_brain/kernel never executes capabilities.
- **Audit:** Verify: monkey_brain/kernel never executes capabilities.
- **Rejection:** REJECTED — Kernel contains capability execution logic.

## Invariant: KERNEL-INV-002
- **Rule:** no_threads_in_kernel
- **Severity:** critical
- **Rationale:** monkey_brain/kernel never manages threads.
- **Audit:** Verify: monkey_brain/kernel never manages threads.
- **Rejection:** REJECTED — Kernel contains thread management.

## Invariant: KERNEL-INV-003
- **Rule:** no_integrations_in_kernel
- **Severity:** critical
- **Rationale:** monkey_brain/kernel never performs integrations.
- **Audit:** Verify: monkey_brain/kernel never performs integrations.
- **Rejection:** REJECTED — Kernel contains integration code.

## Invariant: KERNEL-INV-004
- **Rule:** policy_in_rl_only
- **Severity:** critical
- **Rationale:** Execution policy lives only in monkey_brain/kernel/rl.
- **Audit:** Verify: Execution policy lives only in monkey_brain/kernel/rl.
- **Rejection:** REJECTED — Execution policy found outside kernel/rl.

## Invariant: RUNTIME-INV-001
- **Rule:** no_planning_in_runtime
- **Severity:** critical
- **Rationale:** monkey_brain/runtime never performs planning.
- **Audit:** Verify: monkey_brain/runtime never performs planning.
- **Rejection:** REJECTED — Runtime contains planning logic.

## Invariant: RUNTIME-INV-002
- **Rule:** no_policy_in_runtime
- **Severity:** critical
- **Rationale:** monkey_brain/runtime never owns execution policy.
- **Audit:** Verify: monkey_brain/runtime never owns execution policy.
- **Rejection:** REJECTED — Runtime contains policy logic.

## Invariant: RUNTIME-INV-003
- **Rule:** no_cognition_in_runtime
- **Severity:** critical
- **Rationale:** monkey_brain/runtime never performs learning or cognition.
- **Audit:** Verify: monkey_brain/runtime never performs learning or cognition.
- **Rejection:** REJECTED — Runtime contains cognition.

## Invariant: PERSIST-INV-001
- **Rule:** no_direct_db_writes
- **Severity:** critical
- **Rationale:** No runtime component writes directly to a database. Only PersistenceManager does.
- **Audit:** Verify: No runtime component writes directly to a database. Only PersistenceManager does.
- **Rejection:** REJECTED — Direct database write found outside PersistenceManager.

## Invariant: PERSIST-INV-002
- **Rule:** reducers_are_pure
- **Severity:** critical
- **Rationale:** Reducers are pure functions. They emit persistence commands. They never perform I/O.
- **Audit:** Verify: Reducers are pure functions. They emit persistence commands. They never perform I/O.
- **Rejection:** REJECTED — Reducer contains I/O.

## Invariant: PERSIST-INV-003
- **Rule:** no_responsibility_overlap
- **Severity:** critical
- **Rationale:** No two stores own the same data class.
- **Audit:** Verify: No two stores own the same data class.
- **Rejection:** REJECTED — Duplicate data ownership detected across stores.

## Prompt
**Preamble:** MonkeyBrain is a Cognitive Operating System. monkey_brain/kernel is the Cognitive Kernel. It owns cognition only.

**Chain of Thought:**
1. Assert: this module is the cognitive kernel. It reasons. It does not execute. — _KERNEL-INV-001_ ⚠️ AUDIT GATE
2. Map each file in monkey_brain/kernel/ to exactly one cognitive responsibility.
3. Verify goal_planner, goal_router, planner produce pipelines — never execute them. — _KERNEL-INV-001_ ⚠️ AUDIT GATE
4. Verify monkey_brain/kernel/rl owns all policy selection. No policy elsewhere. — _KERNEL-INV-004_ ⚠️ AUDIT GATE
5. Verify observer.py computes loss only. Never modifies state.
6. Verify llm_explorer.py is an exploration tool. Not the decision maker. — _KERNEL-INV-004_
7. Produce KernelArchitecture, KernelAPIs, ExecutionLoop, ClassDiagram.
8. Run constitutional review gate. APPROVED only if all INV-* pass. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — Conforms to monkey_brain Constitution v1.0.0
- **Rejected:** REJECTED — Kernel contains execution logic., REJECTED — Runtime contains planning logic., REJECTED — Direct database write found outside PersistenceManager., REJECTED — Reducer contains I/O., REJECTED — Policy found outside kernel/rl.

## Prompt
**Preamble:** monkey_brain/runtime is the Execution Runtime. It executes pipelines. It never plans.

**Chain of Thought:**
1. Assert: monkey_brain/runtime executes pipelines. It never plans. — _RUNTIME-INV-001_ ⚠️ AUDIT GATE
2. Map engine.py, executor.py, scheduler.py to execution responsibilities only.
3. Verify worker_pool.py and thread_pool.py manage concurrency — no cognitive logic.
4. Verify message_bus.py is transport only. No routing decisions.
5. Verify supervisor.py manages process lifecycle. Never execution policy. — _RUNTIME-INV-002_ ⚠️ AUDIT GATE
6. Produce RuntimeArchitecture, RuntimeAPIs, ExecutionLifecycle.
7. Run constitutional review gate. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — Conforms to monkey_brain Constitution v1.0.0
- **Rejected:** REJECTED — Kernel contains execution logic., REJECTED — Runtime contains planning logic., REJECTED — Direct database write found outside PersistenceManager., REJECTED — Reducer contains I/O., REJECTED — Policy found outside kernel/rl.

## Prompt
**Preamble:** Persistence is a runtime subsystem, not a database abstraction. All writes route through PersistenceManager.

**Chain of Thought:**
1. Assert: persistence is a runtime subsystem, not a database abstraction.
2. Map each store to exactly one responsibility. Verify no overlap. — _PERSIST-INV-003_ ⚠️ AUDIT GATE
3. Verify PersistenceManager is the single write gateway. — _PERSIST-INV-001_ ⚠️ AUDIT GATE
4. Verify all reducers are pure — current state + event → new state + commands. — _PERSIST-INV-002_ ⚠️ AUDIT GATE
5. Implement: PersistenceManager, Reducer framework, store adapters, persistence events.

**Review Gate:** constitutional
- **Approved:** APPROVED — Conforms to monkey_brain Constitution v1.0.0
- **Rejected:** REJECTED — Kernel contains execution logic., REJECTED — Runtime contains planning logic., REJECTED — Direct database write found outside PersistenceManager., REJECTED — Reducer contains I/O., REJECTED — Policy found outside kernel/rl.
