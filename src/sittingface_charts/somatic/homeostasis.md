# homeostasis

## Module: homeostasis
- **Layer:** 5
- **Alias:** Control Plane
- **Role:** Fleet management, health, orchestration
- **Owns:** Deployment, Configuration, Updates, Monitoring, FleetManagement, CapabilityDistribution, PolicyDistribution
- **Never Owns:** Cognition, Execution, CapabilityLogic, WorldModel

## Principle: homeostasis-principle-1
> homeostasis never executes cognition. It manages the fleet.

## Principle: homeostasis-principle-2
> homeostasis never executes pipelines. It deploys and configures.

## Invariant: HOME-INV-001
- **Rule:** no_cognition_in_homeostasis
- **Severity:** critical
- **Rationale:** homeostasis never performs cognition or execution.
- **Audit:** Verify: homeostasis never performs cognition or execution.
- **Rejection:** REJECTED — homeostasis contains cognition or pipeline execution.

## Prompt
**Preamble:** Module: homeostasis — Fleet management, health, orchestration

**Chain of Thought:**
1. Assert: homeostasis manages the fleet. It never reasons or executes pipelines. — _HOME-INV-001_ ⚠️ AUDIT GATE
2. Map control_plane.py to fleet management responsibilities exclusively.
3. Design deployment, update, configuration, and policy distribution APIs.
4. Produce ControlPlaneAPIs, DeploymentWorkflows, ManagementArchitecture.

**Review Gate:** constitutional
- **Approved:** APPROVED — homeostasis conforms to Control Plane Constitution v1.0.0
- **Rejected:** REJECTED — homeostasis contains cognition., REJECTED — homeostasis executes pipelines.
