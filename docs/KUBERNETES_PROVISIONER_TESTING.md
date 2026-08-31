# KubernetesProvisioner Testing and Verification Guide

## Quick Start: Verify All Changes Are in Place

```bash
cd /Users/prashunjaveri/Code/monkeypatched

# 1. Verify Dockerfile includes kubectl
grep -A 3 "apt-get install" docker/Dockerfile.base | grep kubectl
# Expected: should show kubectl in the install line

# 2. Verify deployment.yaml has ServiceAccount set
grep -B 2 -A 2 "serviceAccountName" deploy/k8s/deployment.yaml
# Expected: should show "serviceAccountName: cognitiveos-actor-provisioner"

# 3. Verify configmap.yaml has provisioning flag
grep "KUBERNETES_PROVISIONING_ENABLED" deploy/k8s/configmap.yaml
# Expected: "KUBERNETES_PROVISIONING_ENABLED: \"false\""

# 4. Verify RBAC config exists
ls -la deploy/k8s/rbac.yaml
# Expected: file exists

# 5. Verify provisioner code exists
ls -la src/monkey_brain/kernel/society/kubernetes_provisioner.py
# Expected: file exists
```

---

## Test 1: Verify kubectl in Docker Image

### Build the image

```bash
cd /Users/prashunjaveri/Code/monkeypatched

# Build just the base image
docker build -f docker/Dockerfile.base -t test-kubectl:latest .
```

### Check kubectl is in the image

```bash
# Run which kubectl
docker run --rm test-kubectl:latest which kubectl
# Expected output: /usr/bin/kubectl

# Check kubectl version
docker run --rm test-kubectl:latest kubectl version --client
# Expected output: something like:
# Client Version: v1.29.x
# Kustomize Version: v5.x.x

# Verify kubectl help works
docker run --rm test-kubectl:latest kubectl --help | head -10
# Expected: kubectl help output
```

---

## Test 2: Verify ServiceAccount Configuration

### Apply RBAC to cluster

```bash
# If you have a Kubernetes cluster running (e.g., kind, minikube, etc.)
kubectl apply -f deploy/k8s/rbac.yaml

# Verify ServiceAccount was created
kubectl get serviceaccount -n monkeybrain cognitiveos-actor-provisioner
# Expected: 
# NAME                            SECRETS   AGE
# cognitiveos-actor-provisioner   1         XXs

# Verify Role was created
kubectl get role -n monkeybrain cognitiveos-actor-provisioner
# Expected:
# NAME                            CREATED AT
# cognitiveos-actor-provisioner   2024-08-30T...

# Verify RoleBinding was created
kubectl get rolebinding -n monkeybrain cognitiveos-actor-provisioner
# Expected:
# NAME                            ROLE                                  AGE
# cognitiveos-actor-provisioner   Role/cognitiveos-actor-provisioner   XXs
```

### Test RBAC permissions

```bash
# Check if the ServiceAccount can create deployments
kubectl auth can-i create deployments \
  --as=system:serviceaccount:monkeybrain:cognitiveos-actor-provisioner \
  -n monkeybrain
# Expected: yes

# Check if it can get deployments
kubectl auth can-i get deployments \
  --as=system:serviceaccount:monkeybrain:cognitiveos-actor-provisioner \
  -n monkeybrain
# Expected: yes

# Check if it can delete deployments (should fail)
kubectl auth can-i delete deployments \
  --as=system:serviceaccount:monkeybrain:cognitiveos-actor-provisioner \
  -n monkeybrain
# Expected: no
```

### Verify deployment uses the ServiceAccount

```bash
# Apply the deployment
kubectl apply -f deploy/k8s/deployment.yaml

# Check the pod's ServiceAccount
kubectl get pod -n monkeybrain -l app=agentos -o yaml | grep serviceAccountName
# Expected: serviceAccountName: cognitiveos-actor-provisioner

# Verify the pod can access the ServiceAccount token
kubectl exec -it -n monkeybrain $(kubectl get pod -n monkeybrain -l app=agentos -o name | head -1) -- \
  cat /var/run/secrets/kubernetes.io/serviceaccount/token | head -c 50
# Expected: JWT token (base64 encoded)
```

---

## Test 3: Verify ConfigMap Configuration

```bash
# Apply the configmap
kubectl apply -f deploy/k8s/configmap.yaml

# Check the provisioning flag is set
kubectl get configmap -n monkeybrain agentos-config -o yaml | grep KUBERNETES_PROVISIONING_ENABLED
# Expected: KUBERNETES_PROVISIONING_ENABLED: 'false'

# Check the pod receives the env var
kubectl get pod -n monkeybrain -l app=agentos -o yaml | grep -A 2 KUBERNETES_PROVISIONING_ENABLED
# Expected: environment variable passed from ConfigMap
```

---

## Test 4: Manual Template Rendering Test

Test that the template rendering logic works correctly (without kubectl):

```bash
cd /Users/prashunjaveri/Code/monkeypatched

# Test template rendering with variable substitution
ACTOR_ID=test-alice \
ACTOR_NODE_CLASS=cloud \
ACTOR_ARTIFACT_VERSION=2.1.0 \
envsubst < deploy/k8s/actor-deployment.yaml | head -40

# Expected: template with variables replaced:
# metadata:
#   name: cognitiveos-actor-test-alice
#   labels:
#     node-class: "cloud"
#   version: "2.1.0"
```

---

## Test 5: End-to-End Provisioning Test (Requires Running K8s)

### Setup test environment

```bash
# Create a kind cluster for testing
kind create cluster --name test-provisioner

# Load the docker image into the cluster
docker build -f docker/Dockerfile.base -t monkeybrain/agentos:test .
kind load docker-image monkeybrain/agentos:test --name test-provisioner

# Create namespace
kubectl create namespace monkeybrain

# Apply RBAC
kubectl apply -f deploy/k8s/rbac.yaml

# Apply supporting services (NATS, MongoDB, etc.)
# (full stack would go here)
```

### Enable provisioning

```bash
# Enable the provisioning flag
kubectl set env deployment/agentos \
  KUBERNETES_PROVISIONING_ENABLED=true \
  -n monkeybrain

# Or edit the configmap directly
kubectl edit configmap agentos-config -n monkeybrain
# Change: KUBERNETES_PROVISIONING_ENABLED: 'true'
```

### Trigger provisioning

```bash
# Create a situation where provisioning is needed
# (manually or via test API call to create an actor)

# Monitor logs for provisioning attempts
kubectl logs -n monkeybrain -l app=agentos -f | grep -i provisioner

# Expected log patterns:
# INFO: KubernetesProvisioner: provisioned Pod for actor_id=xyz
# Or on failure:
# WARNING: KubernetesProvisioner: kubectl apply rejected...
```

### Verify provisioned pod

```bash
# Check that new actor pod was created
kubectl get pods -n monkeybrain -l actor-id=

# Check pod logs
kubectl logs -n monkeybrain pod/cognitiveos-actor-<id>

# Check pod status
kubectl describe pod -n monkeybrain cognitiveos-actor-<id>
```

---

## Test 6: Unit Test Verification

Run existing provisioner unit tests:

```bash
cd /Users/prashunjaveri/Code/monkeypatched

# Run provisioner-specific tests
python -m pytest tests/scenarios/test_gap_remediation_fixes.py::test_06_provision_returns_false_when_kubectl_missing -v
python -m pytest tests/scenarios/test_gap_remediation_fixes.py::test_07_provision_applies_rendered_template_via_kubectl -v
python -m pytest tests/scenarios/test_gap_remediation_fixes.py::test_07b_provision_never_raises_on_kubectl_failure -v

# Expected: all tests pass
# ✓ test_06_provision_returns_false_when_kubectl_missing PASSED
# ✓ test_07_provision_applies_rendered_template_via_kubectl PASSED
# ✓ test_07b_provision_never_raises_on_kubectl_failure PASSED
```

---

## Test 7: Docker Image Smoke Test

```bash
cd /Users/prashunjaveri/Code/monkeypatched

# Build all service images
docker build -f docker/Dockerfile.base -t base:test .
docker build -f docker/services/auth/Dockerfile -t auth:test .
docker build -f docker/services/agentos/Dockerfile -t agentos:test .

# Verify kubectl in each
for img in base auth agentos; do
  echo "=== Testing $img ==="
  docker run --rm $img:test which kubectl || echo "FAILED"
  docker run --rm $img:test kubectl version --client || echo "FAILED"
done

# Expected: all show kubectl path and version
```

---

## Verification Checklist

### Pre-Deployment

- [ ] Docker Dockerfile.base includes kubectl in apt-get install
- [ ] deployment.yaml sets `serviceAccountName: cognitiveos-actor-provisioner`
- [ ] configmap.yaml has `KUBERNETES_PROVISIONING_ENABLED: "false"`
- [ ] rbac.yaml exists and defines ServiceAccount/Role/RoleBinding
- [ ] kubernetes_provisioner.py implementation exists and is unchanged
- [ ] actor_lifecycle_controller.py integration is in place

### Docker Build

- [ ] Docker image builds successfully: `docker build -f docker/Dockerfile.base .`
- [ ] kubectl is in image: `docker run --rm image:tag which kubectl`
- [ ] kubectl works: `docker run --rm image:tag kubectl --help`

### Kubernetes Pre-Flight

- [ ] kubectl installed and configured locally: `kubectl version`
- [ ] Cluster accessible: `kubectl get nodes`
- [ ] monkeybrain namespace exists: `kubectl get namespace monkeybrain`
- [ ] RBAC manifests valid: `kubectl apply --dry-run=client -f deploy/k8s/rbac.yaml`
- [ ] Deployment manifest valid: `kubectl apply --dry-run=client -f deploy/k8s/deployment.yaml`

### Kubernetes Deployment

- [ ] RBAC applied: `kubectl apply -f deploy/k8s/rbac.yaml`
- [ ] ServiceAccount exists: `kubectl get sa -n monkeybrain`
- [ ] Role exists: `kubectl get role -n monkeybrain`
- [ ] RoleBinding exists: `kubectl get rolebinding -n monkeybrain`
- [ ] Deployment applied: `kubectl apply -f deploy/k8s/deployment.yaml`
- [ ] Pod running: `kubectl get pod -n monkeybrain -l app=agentos`

### Permission Verification

- [ ] ServiceAccount test passes: `kubectl auth can-i create deployments --as=system:serviceaccount:monkeybrain:cognitiveos-actor-provisioner -n monkeybrain` → `yes`
- [ ] Pod uses correct SA: `kubectl get pod -o yaml | grep serviceAccountName` → `cognitiveos-actor-provisioner`

### Functional Testing

- [ ] Unit tests pass: `pytest tests/scenarios/test_gap_remediation_fixes.py::test_0[67]* -v`
- [ ] Provisioning disabled by default: `KUBERNETES_PROVISIONING_ENABLED: "false"`
- [ ] Provisioning can be enabled: `kubectl set env deployment/agentos KUBERNETES_PROVISIONING_ENABLED=true`
- [ ] Log shows provisioning attempts when enabled
- [ ] Provisioning can be disabled: `kubectl set env deployment/agentos KUBERNETES_PROVISIONING_ENABLED=false`

---

## Common Issues and Fixes

### kubectl not in image

**Symptom:** `docker run image:tag which kubectl` returns empty

**Fix:** Rebuild image after Dockerfile change:
```bash
docker build --no-cache -f docker/Dockerfile.base -t image:new .
```

### Image pull always trying to pull from registry

**Symptom:** Pod stuck in "Pulling" state

**Fix:** Ensure imagePullPolicy is set:
```yaml
containers:
- name: agentos
  image: monkeybrain/agentos:latest
  imagePullPolicy: IfNotPresent  # Use local image
```

### RBAC 403 Forbidden

**Symptom:** Provisioner logs: `kubectl apply rejected... (403) Forbidden`

**Fix:**
1. Verify SA exists: `kubectl get sa -n monkeybrain`
2. Verify pod uses SA: `kubectl get pod -o yaml | grep serviceAccountName`
3. Verify Role exists: `kubectl get role -n monkeybrain`
4. Verify RoleBinding exists: `kubectl get rolebinding -n monkeybrain`
5. Test permission: `kubectl auth can-i create deployments --as=system:serviceaccount:monkeybrain:cognitiveos-actor-provisioner -n monkeybrain`

### ServiceAccount token not mounted

**Symptom:** Provisioner logs: `kubectl: error reading /var/run/secrets/kubernetes.io/serviceaccount/token`

**Fix:** Kubernetes automatically mounts token; likely means:
- Pod not using correct ServiceAccount
- Cluster admission controller not working
- Pod security policy blocking admission

Verify pod is using correct SA and check cluster events.

---

## Rollback Procedure

If you need to rollback the changes:

```bash
# 1. Disable provisioning
kubectl set env deployment/agentos KUBERNETES_PROVISIONING_ENABLED=false -n monkeybrain

# 2. Remove kubectl from next image build (revert Dockerfile.base)
# 3. Remove ServiceAccount from deployment (revert deployment.yaml)
# 4. Optionally remove RBAC (but leaving it doesn't hurt):
#    kubectl delete -f deploy/k8s/rbac.yaml

# Pods will continue running; new provisioning attempts won't be made
```

---

## Success Indicators

When everything is working:

1. ✅ `docker run image:tag which kubectl` shows `/usr/bin/kubectl`
2. ✅ `kubectl get sa -n monkeybrain | grep provisioner` shows the SA
3. ✅ `kubectl auth can-i create deployments --as=...provisioner -n monkeybrain` returns `yes`
4. ✅ Pod logs show provisioning attempts (if enabled)
5. ✅ Provisioned Actor pods appear in cluster

---

## Next Steps After Verification

1. **Enable in staging:** Set `KUBERNETES_PROVISIONING_ENABLED: true` in staging environment
2. **Monitor behavior:** Watch logs for provisioning attempts and success rates
3. **Test failure scenarios:** Verify graceful degradation when provisioning fails
4. **Scale test:** Try provisioning multiple actors simultaneously
5. **Enable in production:** Move to production after successful staging test

See `docs/KUBERNETES_PROVISIONER_ENABLEMENT.md` for full implementation details.
