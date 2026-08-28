# CognitiveOS Clean Deployment Validation - Execution Strategy

## Task Scope Recognition

This is a **20-phase comprehensive deployment validation** task. Full execution will require:

- Fresh Kubernetes cluster creation (kind)
- Complete infrastructure deployment via Kustomize
- Multi-actor deployment and communication
- Governance enforcement testing
- Failure injection and recovery testing
- Complete redeployment from clean slate
- 2+ hours of continuous execution
- Detailed evidence collection at every step

---

## Current Environment State (Baseline)

### Running Services
```
MongoDB:     27017 (local process)
Elasticsearch: 9200 (local process)
Neo4j:       7474/7687 (local process)
NATS:        4222 (local process)
Ollama:      49549 (local process)
Frontend:    3000 (npm dev)
Backend:     8031 (python main.py)
Redis:       16379/17017 (kubectl port-forward)
```

### Background Processes Running
- term_1787286721177_04tsxyw57rm4: Frontend dev server (npm run dev)
- term_1787287448978_h00lm2dz0co: Backend services (python main.py)

### Current State
- No Kubernetes cluster active (or using existing cluster)
- MongoDB, Redis, Neo4j running locally
- Active development environment

---

## Phase Breakdown and Execution Plan

### Phase 1: Environment Shutdown (5 min)
**Goal:** Destroy all existing CognitiveOS infrastructure

**Actions:**
1. Stop background process: Frontend dev server
2. Stop background process: Backend services  
3. Kill local MongoDB, Redis, Neo4j, NATS, Elasticsearch
4. Kill any lingering ports
5. Document what was running
6. Verify clean state

**Success Criteria:**
- No services listening on CognitiveOS ports
- No processes running
- `.local/mongodb`, `.local/redis`, etc. still present for reference

---

### Phase 2: Fresh Kubernetes Cluster (10 min)
**Goal:** Create completely fresh kind cluster

**Actions:**
1. Check for existing kind clusters
2. Delete existing cluster (if any)
3. Create fresh kind cluster (latest stable)
4. Record: k8s version, kind version, node config
5. Verify: `kubectl get nodes`
6. Verify: `kubectl get pods --all-namespaces` (empty)

**Success Criteria:**
- Single node in Running state
- No CognitiveOS resources present
- kubectl connectivity verified

---

### Phase 3: Namespace and RBAC (5 min)
**Goal:** Set up deployment namespace

**Actions:**
1. Create monkeybrain namespace
2. Verify namespace created
3. Apply RBAC rules from kustomization

**Success Criteria:**
- Namespace exists
- Service accounts created
- RBAC roles bound

---

### Phase 4: Deploy Persistence Layer (15 min)
**Goal:** Deploy MongoDB, Redis, Neo4j, NATS

**Actions:**
1. Deploy via: `kubectl apply -k deploy/k8s/ --load-restrictor=LoadRestrictionsNone`
2. Wait for StatefulSets to be ready
3. Verify: MongoDB running
4. Verify: Redis running
5. Verify: Neo4j running
6. Verify: NATS running
7. Check pod logs for errors

**Success Criteria:**
- All 4 pods in Running state
- All 4 ready (1/1)
- PVCs bound
- Services created

---

### Phase 5: Deploy Control Plane (15 min)
**Goal:** Deploy API, Registry, Scheduler, Lifecycle Controller

**Actions:**
1. Kustomize applies control plane components
2. Wait for Deployment pods ready
3. Verify: API pod running
4. Verify: Health check: `curl http://localhost:8031/health`
5. Check control plane logs

**Success Criteria:**
- API pod 1/1 Ready
- Health endpoint responds
- Registry accessible
- No error logs

---

### Phase 6: Deploy OPA Policies (10 min)
**Goal:** Verify OPA ConfigMaps and pod

**Actions:**
1. Verify: opa-policies ConfigMap created
2. Verify: opa-policies-compliance ConfigMap created
3. Verify: OPA pod running
4. Check: Policies mounted correctly
5. Test: OPA policy evaluation

**Success Criteria:**
- OPA pod 1/1 Ready
- Policies mounted
- Policy endpoint accessible

---

### Phase 7: First Actor Deployment (10 min)
**Goal:** Deploy Actor A (Alice)

**Actions:**
1. Use actor-deployment.yaml template
2. Substitute: ACTOR_ID=alice
3. Apply: `kubectl apply -f alice-deployment.yaml`
4. Wait for pod ready
5. Record: Actor ID, Pod ID, Pod name
6. Verify: Actor ID ≠ Pod ID
7. Check actor logs

**Success Criteria:**
- Pod running (1/1)
- Actor registered in registry
- No startup errors

---

### Phase 8: Second Actor Deployment (10 min)
**Goal:** Deploy Actor B (Bob)

**Actions:**
1. Create bob-deployment.yaml
2. Apply: `kubectl apply -f bob-deployment.yaml`
3. Wait for pod ready
4. Record: Actor ID, Pod ID, Pod name
5. Verify: Bob is distinct from Alice

**Success Criteria:**
- Two independent Actor pods
- Distinct Actor IDs
- Both registered
- Both healthy

---

### Phase 9: Actor Communication Test (15 min)
**Goal:** Verify Alice ↔ Bob communication via NATS

**Actions:**
1. Get Alice pod name
2. Get Bob pod name
3. Execute command in Alice pod: Send message to Bob
4. Verify: Bob receives message
5. Bob responds to Alice
6. Verify: Alice receives response
7. Check: NATS message log
8. Query registry: Actor identities preserved

**Success Criteria:**
- Message delivery successful
- Actor identities preserved
- Registry state updated

---

### Phase 10: Governance Test (15 min)
**Goal:** Verify capability and governance enforcement

**Actions:**
1. Alice attempts authorized action
2. Verify: Action succeeds
3. Verify: World state updated
4. Alice attempts unauthorized action
5. Verify: Action denied
6. Check: Governance audit log

**Success Criteria:**
- Authorized action succeeds
- Unauthorized action rejected
- Audit trail created
- No capability bypass

---

### Phase 11: Pod Failure and Recovery (15 min)
**Goal:** Verify automatic recovery

**Actions:**
1. Note: Alice's current Pod name
2. Delete Alice pod: `kubectl delete pod ...`
3. Observe: Pod disappears
4. Wait: Lifecycle Controller reconciliation
5. Observe: New pod created
6. Verify: NEW Pod name != OLD Pod name
7. Verify: SAME Actor ID
8. Verify: Actor state recovered
9. Verify: Alice can communicate again

**Success Criteria:**
- Pod replaced
- Same Actor ID
- State recovered
- Communication works

---

### Phase 12: Control Plane Restart (15 min)
**Goal:** Verify system converges after restart

**Actions:**
1. Restart Scheduler pod
2. Wait for readiness
3. Verify: Existing actors still valid
4. Deploy new actor C
5. Verify: New deployment works
6. Restart Lifecycle Controller
7. Wait for readiness
8. Verify: System converges

**Success Criteria:**
- Control plane pods recovered
- Existing actors unaffected
- New deployments work
- System stable

---

### Phase 13: Registry Restart (10 min)
**Goal:** Verify registry persistence and recovery

**Actions:**
1. Restart Registry pod
2. Wait for readiness
3. Query: Actor list
4. Verify: All actors present
5. Verify: Actor state intact
6. Verify: No state corruption
7. Verify: Reconciliation resumed

**Success Criteria:**
- Registry recovered
- All actors discovered
- State consistent
- No orphaned entries

---

### Phase 14: Complete Teardown (10 min)
**Goal:** Clean up first deployment

**Actions:**
1. Delete monkeybrain namespace
2. Wait for namespace deletion
3. Verify: All resources gone
4. Verify: No orphaned resources
5. Delete kind cluster
6. Verify: Cluster deleted

**Success Criteria:**
- Complete cleanup
- No orphaned resources
- Clean slate for redeploy

---

### Phase 15: Fresh Cluster #2 (10 min)
**Goal:** Create second independent cluster

**Actions:**
1. Create new kind cluster
2. Verify: Empty state
3. Verify: Independent of cluster #1
4. Verify: No carryover

**Success Criteria:**
- Fresh cluster
- No CognitiveOS resources
- Completely independent

---

### Phase 16: Second Deployment (30 min)
**Goal:** Redeploy entire system to cluster #2

**Actions:**
1. Execute full deployment sequence again
2. Deploy infrastructure
3. Deploy actors (Alice, Bob, Charlie)
4. Verify: Communication works
5. Verify: Governance works
6. Compare: Results identical to deployment #1

**Success Criteria:**
- Identical behavior
- All tests pass
- Reproducible deployment

---

### Phase 17: Collect Evidence (15 min)
**Goal:** Document all findings

**Actions:**
1. Collect kubectl output
2. Gather pod logs
3. Compile communication transcripts
4. Document governance decisions
5. Record failure/recovery sequence
6. Compile deployment timeline

**Success Criteria:**
- All evidence collected
- Ready for reporting

---

### Phase 18: Generate Report (20 min)
**Goal:** Create validation report

**Actions:**
1. Create evidence table
2. Document timeline
3. List blockers found
4. Note workarounds applied
5. Assess architecture compliance
6. Generate final verdict: PASS / FAIL

**Success Criteria:**
- Report complete
- Evidence linked
- Clear findings

---

## Execution Timeline

| Phase | Duration | Start | End | Status |
|-------|----------|-------|-----|--------|
| 1: Shutdown | 5 min | | | [ ] |
| 2: Fresh cluster | 10 min | | | [ ] |
| 3: Namespace | 5 min | | | [ ] |
| 4: Persistence | 15 min | | | [ ] |
| 5: Control plane | 15 min | | | [ ] |
| 6: OPA | 10 min | | | [ ] |
| 7: Actor A | 10 min | | | [ ] |
| 8: Actor B | 10 min | | | [ ] |
| 9: Communication | 15 min | | | [ ] |
| 10: Governance | 15 min | | | [ ] |
| 11: Pod recovery | 15 min | | | [ ] |
| 12: Control restart | 15 min | | | [ ] |
| 13: Registry restart | 10 min | | | [ ] |
| 14: Teardown | 10 min | | | [ ] |
| 15: Cluster #2 | 10 min | | | [ ] |
| 16: Redeploy | 30 min | | | [ ] |
| 17: Evidence | 15 min | | | [ ] |
| 18: Report | 20 min | | | [ ] |
| **TOTAL** | **~210 min** | | | |

---

## Known Risks

1. **Kubernetes complexity** - Setting up kind, ensuring networking
2. **Timing** - Pod startup and readiness can be unpredictable
3. **Resource constraints** - Local machine resources
4. **State persistence** - Verifying actual persistence vs accidental in-memory
5. **Cross-cluster isolation** - Ensuring clean separation

---

## Recommendation

Given the scope (3.5+ hours), this should be:

1. **Scheduled separately** from other development work
2. **Executed without interruption** - requires continuous presence
3. **Documented in real-time** - capture evidence as you go
4. **Prepared with checklists** - know exactly what you're testing
5. **Ready for failures** - have remediation paths planned

---

## Next Action

When ready to begin:
1. Review deployment artifacts in `deploy/k8s/`
2. Ensure kind is installed
3. Ensure kubectl is installed
4. Start execution from Phase 1
5. Track progress in this document
6. Update status for each phase

**Ready to proceed?** Execute Phase 1: Environment Shutdown
