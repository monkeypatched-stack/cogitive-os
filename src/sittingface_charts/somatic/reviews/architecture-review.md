# Architecture Review

Generated from somatic constitution charts.

## Layer Architecture

```
Layer 0: meta (constitutional preamble)
Layer 1: monkey_brain (kernel + runtime)
Layer 2: cortex, broca, introspection (cognitive core)
Layer 3: cerebellum (capabilities & drivers)
Layer 4: homeostasis, deepdive, cingulate (operations)
Layer 5: sync (edge/cloud)
```

## Module Dependencies

### soma (Layer 0)
- **Alias:** Constitution Source
- **Invariants:**
  - [critical] soma_is_read_only: soma is never modified to preserve legacy code. Implementation changes. Constitution does not.
  - [high] single_source_of_truth: Every architectural decision traces to exactly one soma document.

### sync (Layer 0)
- **Alias:** Synchronization Layer
- **Principles:**
  - Every edge node executes independently. Cloud is never in the execution path.
  - Sync is secure and bidirectional. State, capabilities, insights, policies.
  - Edge node functions fully without cloud connectivity.
- **Invariants:**
  - [critical] cloud_not_in_execution_path: Cloud is never in the execution path. Edge executes autonomously.
  - [critical] sync_never_executes: sync module never executes cognitive pipelines. It synchronizes state only.

### monkey_brain (Layer 1)
- **Alias:** Deadpool (kernel) + Wolverine (runtime)

### broca (Layer 2)
- **Alias:** Broca
- **Principles:**
  - broca is the natural language surface. It translates — never plans or executes.
- **Invariants:**
  - [critical] no_planning_in_broca: broca never plans or classifies intent. It surfaces language only.

### cortex (Layer 2)
- **Alias:** Xavier
- **Principles:**
  - The simulator injects Kernel and Runtime. It never duplicates either.
  - Simulation executes identical pipelines to production. No separate sim-only path.
  - cortex supports what-if execution without modifying production state.
  - The world model observes. It never triggers execution.
- **Invariants:**
  - [critical] simulator_does_not_duplicate_kernel: cortex/simulator.py never duplicates monkey_brain/kernel logic.
  - [critical] no_execution_in_cortex: cortex never executes production pipelines. It simulates them.
  - [high] world_model_is_read_only: world_model.py is a read-consistent view. It never initiates writes.

### introspection (Layer 2)
- **Alias:** Lemon
- **Principles:**
  - Every runtime component emits telemetry. Nothing executes silently.
  - Every request is traceable from first user interaction to final response.
  - Lemon observes. It never changes runtime behavior.
  - Architecture is OpenTelemetry-compatible for future integrations.
  - Audit records are immutable. Written once. Never modified.
- **Invariants:**
  - [critical] lemon_observes_only: introspection never modifies runtime behavior. It observes only.
  - [high] no_unstructured_logs: No unstructured console output in production. All logs are structured JSON.
  - [critical] trace_id_propagation: Every operation must propagate TraceID and SpanID.

### cerebellum (Layer 3)
- **Alias:** Cerberus
- **Principles:**
  - Every external integration is a Capability. Runtime never knows implementation details.
  - Capabilities are runtime drivers. Same contract as OS device drivers.
  - Every capability implements the common lifecycle: Initialize → Configure → Validate → Register → Discover → Execute → Observe → Shutdown.
  - Capabilities never decide when they execute. Execution belongs to monkey_brain/runtime.
  - Capabilities remain stateless. State belongs to reducers and persistence manager.
  - Capabilities never instantiate dependencies. All injected by runtime.
- **Invariants:**
  - [critical] no_scheduling_in_cerebellum: cerebellum never schedules. Scheduling belongs to monkey_brain/runtime.
  - [critical] no_planning_in_cerebellum: cerebellum never plans. Planning belongs to monkey_brain/kernel.
  - [high] uniform_lifecycle: Every capability must implement the 8-stage lifecycle contract.
  - [high] stateless_capabilities: Capabilities must not own runtime state.

### cingulate (Layer 5)
- **Alias:** Governance + Benchmark
- **Principles:**
  - Review is constitutional not functional. Ask: does it conform? Not: does it compile?
  - Every benchmark executes against deterministic grounded data. Never dynamic.
  - Every benchmark produces reproducible results. Randomness is controlled.
- **Invariants:**
  - [critical] governance_never_executes: cingulate/governance never executes pipelines or capabilities.
  - [critical] benchmarks_use_ground_truth: Benchmarks never generate expected outputs dynamically during execution.

### deepdive (Layer 5)
- **Alias:** Aggregation Layer
- **Principles:**
  - deepdive aggregates and analyzes. It never performs cognition.
  - deepdive never controls execution. It observes fleet output.
- **Invariants:**
  - [critical] no_execution_control_in_deepdive: deepdive never controls execution or cognition.

### homeostasis (Layer 5)
- **Alias:** Control Plane
- **Principles:**
  - homeostasis never executes cognition. It manages the fleet.
  - homeostasis never executes pipelines. It deploys and configures.
- **Invariants:**
  - [critical] no_cognition_in_homeostasis: homeostasis never performs cognition or execution.

### plasticity (Layer 5)
- **Alias:** Learning + Testing + Seeding
- **Principles:**
  - All seed data created via FastAPI APIs. Never direct database manipulation.
  - Same config always produces identical datasets.
  - RL implementation can evolve (UCB → PPO) without changing kernel API.
  - Seed data generated from existing Pydantic domain models. Never redefine schemas.
- **Invariants:**
  - [critical] no_direct_db_writes_in_seeding: plasticity/seed never writes directly to databases. Only via APIs.
  - [critical] rl_interface_stable: RL policy interface must not change monkey_brain/kernel API.
  - [high] no_production_execution_in_testing: plasticity/testing never executes production pipelines.

### meta (Layer ?)

## Responsibility Violations Matrix

| Module | Owns | Never Owns |
|--------|------|------------|
| soma |  |  |
| sync |  |  |
| monkey_brain |  |  |
| broca |  |  |
| cortex |  |  |
| introspection |  |  |
| cerebellum |  |  |
| cingulate |  |  |
| deepdive |  |  |
| homeostasis |  |  |
| plasticity |  |  |
| meta |  |  |