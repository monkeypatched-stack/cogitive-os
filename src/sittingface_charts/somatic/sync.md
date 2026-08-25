# sync

## Module: sync
- **Layer:** 0
- **Alias:** Synchronization Layer
- **Role:** Secure bidirectional sync of state, capabilities, insights, policies
- **Owns:** EdgeCloudSync, StateReplication, CapabilityDistribution, PolicyDistribution, ConflictResolution, OfflineFirstResilience, VersioningCompatibility
- **Never Owns:** Execution, Cognition, CapabilityLogic, DirectFleetControl

## Principle: sync-principle-1
> Every edge node executes independently. Cloud is never in the execution path.

## Principle: sync-principle-2
> Sync is secure and bidirectional. State, capabilities, insights, policies.

## Principle: sync-principle-3
> Edge node functions fully without cloud connectivity.

## Invariant: SYNC-INV-001
- **Rule:** cloud_not_in_execution_path
- **Severity:** critical
- **Rationale:** Cloud is never in the execution path. Edge executes autonomously.
- **Audit:** Verify: Cloud is never in the execution path. Edge executes autonomously.
- **Rejection:** REJECTED — Cloud dependency found in execution path.

## Invariant: SYNC-INV-002
- **Rule:** sync_never_executes
- **Severity:** critical
- **Rationale:** sync module never executes cognitive pipelines. It synchronizes state only.
- **Audit:** Verify: sync module never executes cognitive pipelines. It synchronizes state only.
- **Rejection:** REJECTED — Sync module contains execution logic.

## Prompt
**Preamble:** Module: sync — Secure bidirectional sync of state, capabilities, insights, policies

**Chain of Thought:**
1. Assert: sync is the synchronization layer. Edge executes autonomously. — _SYNC-INV-001_ ⚠️ AUDIT GATE
2. Map sync_manager.py, edge_node.py, cloud_aggregator.py to sync responsibilities.
3. Verify edge_node.py operates fully offline. No cloud dependency during execution. — _SYNC-INV-001_ ⚠️ AUDIT GATE
4. Design conflict resolution for bidirectional state sync.
5. Produce EdgeArchitecture, DeploymentModel, NodeLifecycle, SyncProtocol.

**Review Gate:** constitutional
- **Approved:** APPROVED — sync conforms to Edge Architecture Constitution v1.0.0
- **Rejected:** REJECTED — Cloud found in execution path., REJECTED — Sync module executes cognitive pipelines.
