# Quick Start: Deploying Services with Fail-Closed Secrets

## TL;DR: The Three-Step Deploy

```bash
# 1. Generate secrets (only do once per environment)
ACCESS_SECRET=$(openssl rand -hex 32)
REFRESH_SECRET=$(openssl rand -hex 32)

# 2. Deploy with secrets from environment
docker run \
  -e ACCESS_TOKEN_SECRET="$ACCESS_SECRET" \
  -e REFRESH_TOKEN_SECRET="$REFRESH_SECRET" \
  myservice:latest

# 3. Verify no secrets in the image
python scripts/verify_image_secrets.py myservice:latest
```

If this fails, the service refuses to start. That's correct — fix it before proceeding.

---

## Docker Compose Quick Start

**File:** `docker-compose.prod.yml`

```yaml
version: "3.8"

services:
  auth:
    image: myservice:latest
    environment:
      # Required: secrets from environment
      ACCESS_TOKEN_SECRET: ${ACCESS_TOKEN_SECRET}
      REFRESH_TOKEN_SECRET: ${REFRESH_TOKEN_SECRET}
      
      # Optional: Keycloak configuration
      KEYCLOAK_ISSUER: ${KEYCLOAK_ISSUER:-}
      KEYCLOAK_AUDIENCE: ${KEYCLOAK_AUDIENCE:-}
      KC_CLIENT_ID: ${KC_CLIENT_ID:-}
      KC_CLIENT_SECRET: ${KC_CLIENT_SECRET:-}
      
      # Other config
      MONGODB_URL: mongodb://mongodb:27017
      DB_NAME: production
```

**Deploy:**

```bash
# 1. Create secrets file (NEVER commit to git)
cat > .env.production <<EOF
ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)
KEYCLOAK_ISSUER=https://keycloak.example.com
KEYCLOAK_AUDIENCE=my-service
KC_CLIENT_ID=my-client
KC_CLIENT_SECRET=$(openssl rand -base64 32)
EOF

# 2. Deploy
docker-compose -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d

# 3. Verify it started
docker logs <container-id> | grep "✓.*secrets validated"
```

**Important:** `.env.production` is in `.gitignore` — it will never be committed.

---

## Kubernetes Quick Start

**File:** `k8s/secrets.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: auth-service-secrets
  namespace: production
type: Opaque
stringData:
  ACCESS_TOKEN_SECRET: "must-be-set-by-deployment-pipeline"
  REFRESH_TOKEN_SECRET: "must-be-set-by-deployment-pipeline"
  KEYCLOAK_ISSUER: "https://keycloak.example.com"
  KEYCLOAK_AUDIENCE: "my-service"
  KC_CLIENT_ID: "my-client"
  KC_CLIENT_SECRET: "must-be-set-by-deployment-pipeline"
```

**File:** `k8s/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth
        image: myservice:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8010
        env:
        - name: ACCESS_TOKEN_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: ACCESS_TOKEN_SECRET
        - name: REFRESH_TOKEN_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: REFRESH_TOKEN_SECRET
        - name: KEYCLOAK_ISSUER
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: KEYCLOAK_ISSUER
        - name: KEYCLOAK_AUDIENCE
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: KEYCLOAK_AUDIENCE
        - name: KC_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: KC_CLIENT_ID
        - name: KC_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-service-secrets
              key: KC_CLIENT_SECRET
        - name: MONGODB_URL
          value: "mongodb://mongodb:27017"
        - name: DB_NAME
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 8010
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8010
          initialDelaySeconds: 10
          periodSeconds: 5
```

**Deploy:**

```bash
# 1. Create the secret with generated values
kubectl create secret generic auth-service-secrets \
  -n production \
  --from-literal=ACCESS_TOKEN_SECRET=$(openssl rand -hex 32) \
  --from-literal=REFRESH_TOKEN_SECRET=$(openssl rand -hex 32) \
  --from-literal=KEYCLOAK_ISSUER=https://keycloak.example.com \
  --from-literal=KEYCLOAK_AUDIENCE=my-service \
  --from-literal=KC_CLIENT_ID=my-client \
  --from-literal=KC_CLIENT_SECRET=$(openssl rand -base64 32)

# 2. Deploy the service
kubectl apply -f k8s/deployment.yaml

# 3. Verify it started
kubectl logs -n production deployment/auth-service | grep "✓.*secrets validated"
```

---

## Secrets Manager Integration (AWS Secrets Manager)

For enterprise deployments, store secrets in a secrets manager:

```bash
# 1. Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name "prod/auth-service-secrets" \
  --secret-string '{
    "ACCESS_TOKEN_SECRET": "'$(openssl rand -hex 32)'",
    "REFRESH_TOKEN_SECRET": "'$(openssl rand -hex 32)'",
    "KEYCLOAK_ISSUER": "https://keycloak.example.com",
    "KEYCLOAK_AUDIENCE": "my-service",
    "KC_CLIENT_ID": "my-client",
    "KC_CLIENT_SECRET": "'$(openssl rand -base64 32)'"
  }' \
  --region us-east-1
```

**Python init container to load secrets:**

```python
# scripts/load-secrets-from-aws.py
import boto3
import json
import os

secrets_client = boto3.client("secretsmanager", region_name="us-east-1")
response = secrets_client.get_secret_value(SecretId="prod/auth-service-secrets")
secrets = json.loads(response["SecretString"])

# Write to environment or mounted volume
for key, value in secrets.items():
    os.environ[key] = value
    print(f"Loaded {key} from Secrets Manager")
```

**Kubernetes init container:**

```yaml
initContainers:
- name: load-secrets-from-aws
  image: amazon/aws-cli:latest
  command:
  - /bin/sh
  - -c
  - |
    aws secretsmanager get-secret-value \
      --secret-id "prod/auth-service-secrets" \
      --region us-east-1 \
      | jq .SecretString | jq 'to_entries[] | "export \(.key)=\(.value)"' \
      > /tmp/secrets.env
    source /tmp/secrets.env
  volumeMounts:
  - name: secrets-volume
    mountPath: /tmp
  env:
  - name: AWS_REGION
    value: us-east-1
```

---

## Pre-Deployment Verification Checklist

### Before Deploying to Production

```bash
# 1. Build the image
docker build -t myservice:v1.2.3 .

# 2. Verify no secrets are in the image
python scripts/verify_image_secrets.py myservice:v1.2.3
# Expected: ✅ PASS: No secrets detected in image.

# 3. Generate production secrets (do this once, store securely)
ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)
echo "Store these securely:"
echo "ACCESS_TOKEN_SECRET=$ACCESS_TOKEN_SECRET"
echo "REFRESH_TOKEN_SECRET=$REFRESH_TOKEN_SECRET"

# 4. Test deployment locally with docker-compose
docker-compose -f docker-compose.test.yml \
  -e ACCESS_TOKEN_SECRET="$ACCESS_TOKEN_SECRET" \
  -e REFRESH_TOKEN_SECRET="$REFRESH_TOKEN_SECRET" \
  up --abort-on-container-exit

# 5. Verify service started successfully
docker logs <container> | grep "✓.*service started"

# 6. Test authentication flow
curl -X POST http://localhost:8010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

---

## What If Service Fails to Start?

### Error: "RuntimeError: ACCESS_TOKEN_SECRET is not configured"

**Cause:** Environment variable not set

**Fix:**
```bash
# Option 1: Set via environment
export ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
docker run -e ACCESS_TOKEN_SECRET=$ACCESS_TOKEN_SECRET myservice:latest

# Option 2: Set via compose file
environment:
  ACCESS_TOKEN_SECRET: "${ACCESS_TOKEN_SECRET}"

# Option 3: Set via K8s Secret
valueFrom:
  secretKeyRef:
    name: auth-service-secrets
    key: ACCESS_TOKEN_SECRET
```

### Error: "ValueError: ACCESS_TOKEN_SECRET must be set to a non-empty value"

**Cause:** Environment variable is set but empty (or whitespace-only)

**Fix:**
```bash
# Verify the value
echo $ACCESS_TOKEN_SECRET | od -c  # Should not be empty

# If empty, regenerate
export ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
```

### Service Runs But Tokens Fail

**Cause:** Different secrets used in local development vs. production

**Fix:**
1. Verify secrets are set BEFORE service starts
2. Check if .env file is being used instead of environment variables
3. Ensure no code is overriding the secret with a default value

```bash
# Debug: check what the service is using
docker inspect <container-id> | grep -A 50 '"Env"'

# Should show:
# "ACCESS_TOKEN_SECRET=<your-secret>",
# "REFRESH_TOKEN_SECRET=<your-secret>",
```

---

## Automation: CI/CD Pipeline Integration

**GitHub Actions Example:**

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Build image
      run: docker build -t myservice:${{ github.sha }} .
    
    - name: Verify no secrets in image
      run: python scripts/verify_image_secrets.py myservice:${{ github.sha }}
    
    - name: Push to registry
      run: docker push myservice:${{ github.sha }}
    
    - name: Deploy to Kubernetes
      env:
        KUBE_CONFIG: ${{ secrets.KUBE_CONFIG }}
      run: |
        # Create K8s secret from encrypted GitHub Secrets
        kubectl create secret generic auth-service-secrets \
          -n production \
          --from-literal=ACCESS_TOKEN_SECRET=${{ secrets.AUTH_ACCESS_TOKEN_SECRET }} \
          --from-literal=REFRESH_TOKEN_SECRET=${{ secrets.AUTH_REFRESH_TOKEN_SECRET }} \
          --from-literal=KEYCLOAK_ISSUER=${{ secrets.KEYCLOAK_ISSUER }} \
          --from-literal=KC_CLIENT_SECRET=${{ secrets.KC_CLIENT_SECRET }}
        
        # Deploy the service
        kubectl apply -f k8s/deployment.yaml
        
        # Verify deployment
        kubectl rollout status deployment/auth-service -n production
```

---

## Reference

- **Detailed docs:** `docs/SECURITY_SECRETS_DEPLOYMENT.md`
- **Secrets module:** `domains/manufacturing/knowledge/services/common/secrets.py`
- **Image verification:** `scripts/verify_image_secrets.py`
- **Policy:** `.kiro/steering/secrets-deployment-policy.md`
