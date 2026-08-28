# CognitiveOS Clean-Room Deployment Validation Plan

## Executive Summary

This document outlines the execution plan for a complete clean-room deployment validation of CognitiveOS from an empty Kubernetes cluster. The validation is designed to verify that the current repository can deploy the entire CognitiveOS architecture end-to-end without manual intervention or workarounds.

**Status:** PLAN CREATED - Ready for execution  
**Target Timeline:** Full execution (Steps 1-20)  
**Success Criterion:** Empty cluster → Full deployment → Multi-actor communication → Governance verification → Failure recovery → Clean redeploy

---

## Phase 1: Environment Preparation

### Step 1: Current Infrastructure Assessment
- Document existing CognitiveOS services running
- Identify all running containers and processes  
- Note current cluster state (if any)

### Step 2: Destroy Existing Deployment
- Kill all running backend services
- Clear any Docker containers
- Document what was running

### Step 3: Clean Local State
- Backup `.local/mongodb`, `.local/logs` for reference
- Clear `.local/` directory completely
- Verify clean environment

---

## Phase 2: Fresh Kubernetes Cluster Creation

### Step 4: Create kind Cluster
- Install kind (if not present)
- Create fresh cluster with known configuration
- Record Kubernetes version, kind version
- Verify empty cluster: `kubectl get pods --all-namespaces`

### Step 5: Prepare Registry Namespace
- Create `monkeybrain` namespace (from kustomization.yaml)
- Verify namespace creation

---

## Phase 3: Deploy Infrastructure from Repository

### Step 6: Deploy Using Kustomize
Execute the exact deployment command from repository:
```bash
kubectl apply -k deploy/k8s/ --load-restrictor=LoadRestrictionsNone
```

Record:
- All resources created
- ConfigMaps generated (OPA policies)
- Secrets created
- StatefulSets, Deployments, Services

### Step 7: Verify Initial Deployment
- Document all created resources
- List pods in monkeybrain namespace
- Check for resource creation errors

---

## Phase 4: Infrastructure Verification

### Step 8: Verify Control Plane Components
- [ ] API Pod is Running and Ready
- [ ] Registry is accessible
- [ ] Scheduler Pod exists
- [ ] Lifecycle Controller Pod exists
- [ ] Check pod logs for errors

### Step 9: Verify Persistence Layer
- [ ] MongoDB Pod running
- [ ] Redis Pod running
- [ ] Neo4j Pod running
- [ ] NATS Pod running
- [ ] Verify PVCs are bound

### Step 10: Verify Networking
- [ ] Services are created
- [ ] DNS resolution works
- [ ] Pod-to-pod communication possible

### Step 11: Verify OPA Policies
- [ ] OPA ConfigMaps generated correctly
- [ ] OPA Pod running
- [ ] Policies mounted in pod

---

## Phase 5: Control Plane Testing

### Step 12: Test API Connectivity
- Port-forward to API
- Health check: `/health`
- Verify system is responsive

### Step 13: Registry Verification
- Query existing actors
- Verify empty registry (clean deployment)

---

## Phase 6: Actor Deployment

### Step 14: Deploy First Actor (Kubernetes)
- Use actual deployment mechanism (likely actor-deployment.yaml template)
- Create Actor A: "Alice"
- Record: Actor ID, Pod ID, deployment target
- Verify: Actor ID ≠ Pod ID

### Step 15: Deploy Second Actor (Kubernetes)
- Create Actor B: "Bob"
- Record: Actor ID, Pod ID, deployment target
- Verify: Distinct Actor IDs and runtime instances

### Step 16: Deploy Edge Actor (if supported)
- Use edge-actor-deployment.yaml
- Create Edge Actor C
- Verify: Edge actor registered in same registry

---

## Phase 7: Multi-Actor Testing

### Step 17: Actor-to-Actor Communication
- Alice sends message to Bob through NATS
- Verify: Message delivery
- Verify: Actor identities preserved
- Check: Registry state after communication

### Step 18: Governed World Action
- Alice attempts authorized action
- Verify: Action succeeds and world state updates
- Alice attempts unauthorized action
- Verify: Action denied by governance

---

## Phase 8: Failure and Recovery

### Step 19: Actor Pod Failure
- Delete one Actor pod: `kubectl delete pod ...`
- Observe: Lifecycle Controller reconciliation
- Verify: Same Actor ID restored
- Verify: Actor state recovered from persistence

### Step 20: Control Plane Restart
- Restart Scheduler pod
- Verify: System converges
- Verify: Existing actors remain valid
- Verify: New actor deployment still works

### Step 21: Registry Restart
- Restart Registry
- Verify: Actor identities persisted
- Verify: Stale state doesn't overwrite current state
- Verify: Reconciliation resumes

---

## Phase 9: Complete Redeployment

### Step 22: Full Teardown
- Delete monkeybrain namespace
- Verify: All resources destroyed
- Verify: No orphaned resources

### Step 23: Create Second Cluster
- Create new fresh kind cluster
- Verify: Empty state
- No carryover from deployment #1

### Step 24: Second Deployment
- Execute deployment from repository again
- Deploy actors to new cluster
- Verify: Identical behavior to deployment #1
- Verify: New cluster independent of first

---

## Phase 10: Validation and Reporting

### Step 25: Collect Evidence
- kubectl resource state
- Pod readiness status
- Controller logs
- Actor logs
- Communication transcripts
- Governance audit

### Step 26: Generate Report
Create `CLEAN_DEPLOYMENT_VALIDATION_REPORT.md` with:
- Evidence table (each test and result)
- Timeline of deployment
- Issues encountered and resolutions
- Remaining blockers
- Architectural verification

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Fresh cluster created | [ ] |
| Deployment succeeds | [ ] |
| All components healthy | [ ] |
| Actor deployment works | [ ] |
| Multi-actor communication | [ ] |
| Governance enforcement | [ ] |
| Failure recovery | [ ] |
| Control plane restart | [ ] |
| Complete clean redeploy | [ ] |
| Reproducible | [ ] |

**OVERALL RESULT:** PASS / FAIL

---

## Known Issues to Verify

From DEPLOYMENT_ARCHITECTURE.md:
- [ ] World tensor persistence (Redis or file?)
- [ ] Message queue cross-process support
- [ ] Governance engine persistence
- [ ] Multi-replica safety
- [ ] Cross-process actor discovery
- [ ] Lease mechanism functionality
- [ ] Edge actor convergence with cloud actors

---

## Execution Log

### Pre-Deployment
- Current time: [To be filled]
- Existing services: [To be filled]
- Current cluster state: [To be filled]

### Deployment Steps
[To be filled during execution]

---

## Next Steps

1. Execute Phase 1: Environment Preparation
2. Run Phase 2: Create Fresh Cluster
3. Execute Phase 3-4: Deploy and Verify
4. Continue through all phases
5. Document all findings in CLEAN_DEPLOYMENT_VALIDATION_REPORT.md
