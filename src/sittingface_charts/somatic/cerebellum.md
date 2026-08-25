# cerebellum

## Module: cerebellum
- **Layer:** 3
- **Alias:** Cerberus
- **Role:** Capabilities, workflows, tools
- **Owns:** CapabilityDiscovery, CapabilityRegistration, CapabilityLifecycle, CapabilityResolution, CapabilityMetadata, CapabilityHealth, DriverManagement, CapabilityContracts
- **Never Owns:** Scheduling, WorkflowExecution, RuntimeState, Memory, Planning, IntentResolution, WorldModeling

## Principle: cerebellum-principle-1
> Every external integration is a Capability. Runtime never knows implementation details.

## Principle: cerebellum-principle-2
> Capabilities are runtime drivers. Same contract as OS device drivers.

## Principle: cerebellum-principle-3
> Every capability implements the common lifecycle: Initialize → Configure → Validate → Register → Discover → Execute → Observe → Shutdown.

## Principle: cerebellum-principle-4
> Capabilities never decide when they execute. Execution belongs to monkey_brain/runtime.

## Principle: cerebellum-principle-5
> Capabilities remain stateless. State belongs to reducers and persistence manager.

## Principle: cerebellum-principle-6
> Capabilities never instantiate dependencies. All injected by runtime.

## Invariant: CER-INV-001
- **Rule:** no_scheduling_in_cerebellum
- **Severity:** critical
- **Rationale:** cerebellum never schedules. Scheduling belongs to monkey_brain/runtime.
- **Audit:** Verify: cerebellum never schedules. Scheduling belongs to monkey_brain/runtime.
- **Rejection:** REJECTED — Scheduling logic found in cerebellum.

## Invariant: CER-INV-002
- **Rule:** no_planning_in_cerebellum
- **Severity:** critical
- **Rationale:** cerebellum never plans. Planning belongs to monkey_brain/kernel.
- **Audit:** Verify: cerebellum never plans. Planning belongs to monkey_brain/kernel.
- **Rejection:** REJECTED — Planning logic found in cerebellum.

## Invariant: CER-INV-003
- **Rule:** uniform_lifecycle
- **Severity:** high
- **Rationale:** Every capability must implement the 8-stage lifecycle contract.
- **Audit:** Verify: Every capability must implement the 8-stage lifecycle contract.
- **Rejection:** REJECTED — Capability missing lifecycle contract.

## Invariant: CER-INV-004
- **Rule:** stateless_capabilities
- **Severity:** high
- **Rationale:** Capabilities must not own runtime state.
- **Audit:** Verify: Capabilities must not own runtime state.
- **Rejection:** REJECTED — Capability owns runtime state.

## Prompt
**Preamble:** Module: cerebellum — Capabilities, workflows, tools

**Chain of Thought:**
1. Assert: cerebellum is the driver layer. Every external system is a Capability.
2. Map each capability category to its src/cerebellum/capabilities/<category>/ directory.
3. Verify every capability in the tree implements the 8-stage lifecycle. — _CER-INV-003_ ⚠️ AUDIT GATE
4. Verify no capability contains scheduling or planning logic. — _CER-INV-001_ ⚠️ AUDIT GATE
5. Verify all dependencies are injected. No direct instantiation.
6. Verify all capabilities emit observability events to introspection module.
7. Produce all 14 deliverables.
8. Run constitutional review gate. ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — cerebellum conforms to Capability Constitution v1.0.0
- **Rejected:** REJECTED — Capability contains scheduling logic., REJECTED — Capability contains planning logic., REJECTED — Capability missing lifecycle contract., REJECTED — Capability owns runtime state.
