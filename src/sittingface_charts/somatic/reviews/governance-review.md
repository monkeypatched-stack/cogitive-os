# Governance Review

Generated from somatic constitution charts.

## Summary

- **Total Invariants:** 22
- **Total Principles:** 30
- **Total Deliverables:** 52
- **Critical Invariants:** 16
- **High Invariants:** 6

## Critical Invariants

| Module | Rule | Statement | Rejection |
|--------|------|-----------|-----------|
| broca | no_planning_in_broca | broca never plans or classifies intent. It surfaces language | REJECTED — broca contains planning or in |
| cerebellum | no_scheduling_in_cerebellum | cerebellum never schedules. Scheduling belongs to monkey_bra | REJECTED — Scheduling logic found in cer |
| cerebellum | no_planning_in_cerebellum | cerebellum never plans. Planning belongs to monkey_brain/ker | REJECTED — Planning logic found in cereb |
| cingulate | governance_never_executes | cingulate/governance never executes pipelines or capabilitie | REJECTED — governance module contains ex |
| cingulate | benchmarks_use_ground_truth | Benchmarks never generate expected outputs dynamically durin | REJECTED — Benchmark uses dynamic expect |
| cortex | simulator_does_not_duplicate_kernel | cortex/simulator.py never duplicates monkey_brain/kernel log | REJECTED — Simulator duplicates kernel. |
| cortex | no_execution_in_cortex | cortex never executes production pipelines. It simulates the | REJECTED — cortex contains production ex |
| deepdive | no_execution_control_in_deepdive | deepdive never controls execution or cognition. | REJECTED — deepdive contains execution c |
| homeostasis | no_cognition_in_homeostasis | homeostasis never performs cognition or execution. | REJECTED — homeostasis contains cognitio |
| introspection | lemon_observes_only | introspection never modifies runtime behavior. It observes o | REJECTED — introspection contains runtim |
| introspection | trace_id_propagation | Every operation must propagate TraceID and SpanID. | REJECTED — Operation missing TraceID pro |
| plasticity | no_direct_db_writes_in_seeding | plasticity/seed never writes directly to databases. Only via | REJECTED — Seeder writes directly to dat |
| plasticity | rl_interface_stable | RL policy interface must not change monkey_brain/kernel API. | REJECTED — RL change breaks kernel API. |
| soma | soma_is_read_only | soma is never modified to preserve legacy code. Implementati | REJECTED — soma document modified to acc |
| sync | cloud_not_in_execution_path | Cloud is never in the execution path. Edge executes autonomo | REJECTED — Cloud dependency found in exe |
| sync | sync_never_executes | sync module never executes cognitive pipelines. It synchroni | REJECTED — Sync module contains executio |

## Principles by Module

### broca
- broca is the natural language surface. It translates — never plans or executes.

### cerebellum
- Every external integration is a Capability. Runtime never knows implementation details.
- Capabilities are runtime drivers. Same contract as OS device drivers.
- Every capability implements the common lifecycle: Initialize → Configure → Validate → Register → Discover → Execute → Observe → Shutdown.
- Capabilities never decide when they execute. Execution belongs to monkey_brain/runtime.
- Capabilities remain stateless. State belongs to reducers and persistence manager.
- Capabilities never instantiate dependencies. All injected by runtime.

### cingulate
- Review is constitutional not functional. Ask: does it conform? Not: does it compile?
- Every benchmark executes against deterministic grounded data. Never dynamic.
- Every benchmark produces reproducible results. Randomness is controlled.

### cortex
- The simulator injects Kernel and Runtime. It never duplicates either.
- Simulation executes identical pipelines to production. No separate sim-only path.
- cortex supports what-if execution without modifying production state.
- The world model observes. It never triggers execution.

### deepdive
- deepdive aggregates and analyzes. It never performs cognition.
- deepdive never controls execution. It observes fleet output.

### homeostasis
- homeostasis never executes cognition. It manages the fleet.
- homeostasis never executes pipelines. It deploys and configures.

### introspection
- Every runtime component emits telemetry. Nothing executes silently.
- Every request is traceable from first user interaction to final response.
- Lemon observes. It never changes runtime behavior.
- Architecture is OpenTelemetry-compatible for future integrations.
- Audit records are immutable. Written once. Never modified.

### plasticity
- All seed data created via FastAPI APIs. Never direct database manipulation.
- Same config always produces identical datasets.
- RL implementation can evolve (UCB → PPO) without changing kernel API.
- Seed data generated from existing Pydantic domain models. Never redefine schemas.

### sync
- Every edge node executes independently. Cloud is never in the execution path.
- Sync is secure and bidirectional. State, capabilities, insights, policies.
- Edge node functions fully without cloud connectivity.

## Deliverables

| Module | Artifact |
|--------|----------|
| broca | NLInterface |
| broca | AgentCommunicationProtocol |
| cerebellum | CapabilityBaseInterfaces |
| cerebellum | CapabilityMetadataModel |
| cerebellum | CapabilityLifecycleFramework |
| cerebellum | DriverRegistry |
| cerebellum | DriverResolver |
| cerebellum | DependencyInjectionSupport |
| cerebellum | DynamicCapabilityDiscovery |
| cerebellum | HotLoadingSupport |
| cerebellum | EventEmission |
| cerebellum | HealthMonitoring |
| cerebellum | VersionManagement |
| cerebellum | ContractValidation |
| cerebellum | TestingFramework |
| cerebellum | ExampleImplementations |
| cingulate | governance |
| cingulate | benchmark |
| cortex | SimulationArchitecture |
| cortex | PredictionAPIs |
| cortex | ReplayAPIs |
| cortex | DigitalTwinFramework |
| cortex | CounterfactualEngine |
| deepdive | AggregationAPIs |
| deepdive | KnowledgeSynchronization |
| deepdive | AnalyticsArchitecture |
| deepdive | EnterpriseDashboards |
| homeostasis | ControlPlaneAPIs |
| homeostasis | DeploymentWorkflows |
| homeostasis | ManagementArchitecture |
| homeostasis | FleetMonitoringDashboard |
| introspection | DistributedTracing |
| introspection | MetricsCollection |
| introspection | StructuredLogging |
| introspection | RuntimeProfiling |
| introspection | HealthMonitoring |
| introspection | EventTelemetry |
| introspection | AuditFramework |
| introspection | AlertingSystem |
| introspection | DashboardIntegration |
| introspection | PerformanceAnalytics |
| introspection | CostAnalytics |
| introspection | EndToEndExecutionVisualization |
| introspection | AutomaticInstrumentationForAllSubsystems |
| introspection | OpenTelemetryCompatibleArchitecture |
| plasticity | seeding |
| plasticity | testing |
| sync | EdgeArchitecture |
| sync | DeploymentModel |
| sync | NodeLifecycle |
| sync | SyncProtocol |
| sync | ConflictResolutionStrategy |