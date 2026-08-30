---
title: Security Policy: Fail-Closed Secrets
inclusion: manual
---

# Security Policy: Fail-Closed Secrets and Deployment Configuration

## TL;DR

- **Services MUST NOT start without required secrets** — this is intentional
- **Never commit .env files with real secrets to git** — they're in `.gitignore`
- **Production secrets come from explicit sources:** environment variables, Kubernetes Secrets, or secret managers
- **No defaults, no fallbacks** for security-sensitive values
- **Developer .env files must never enter container images** — verified by automated gate

---

## For Developers

### Local Development

1. Create a `.env` file in the workspace root or `services/auth/.env`:
   ```
   ACCESS_TOKEN_SECRET=dev-secret-key-here
   REFRESH_TOKEN_SECRET=dev-refresh-key-here
   ```

2. The service uses these when running locally.

3. **Never commit this file** — it's in `.gitignore`.

### If Service Fails to Start

**Error:** `RuntimeError: ACCESS_TOKEN_SECRET is required but not set`

**Fix:** Set the environment variable:
```bash
export ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)
./scripts/start-services.sh
```

### When Adding a New Secret

1. Define it in `services/common/secrets.py`:
   ```python
   AUTHENTICATION_SECRETS = [
       SecretClassification(
           name="MY_NEW_SECRET",
           purpose="What this guards",
           required=True,
           env_var="MY_NEW_SECRET",
       ),
   ]
   ```

2. Update `docs/SECURITY_SECRETS_DEPLOYMENT.md` with deployment instructions.

3. Test locally:
   ```bash
   export MY_NEW_SECRET=test-value
   ./scripts/start-services.sh
   ```

4. Document in your PR what secrets are now needed.

---

## For Deployment Teams

### Required Environment Variables by Service

**Auth Service:**
- `ACCESS_TOKEN_SECRET` — HMAC key for JWT access tokens (required)
- `REFRESH_TOKEN_SECRET` — HMAC key for JWT refresh tokens (required)
- `KEYCLOAK_ISSUER` — Keycloak issuer URL (optional, only if using Keycloak)
- `KEYCLOAK_AUDIENCE` — Expected audience (optional, only if using Keycloak)
- `KC_CLIENT_ID` — Keycloak client ID (optional, only if using Keycloak)
- `KC_CLIENT_SECRET` — Keycloak client secret (optional, only if using Keycloak)

**File Service:**
- `KEYCLOAK_ISSUER`, `KEYCLOAK_AUDIENCE`, `KC_CLIENT_ID`, `KC_CLIENT_SECRET` (required if Keycloak is enabled)

Get the full reference:
```bash
python domains/manufacturing/knowledge/services/common/secrets.py auth
python domains/manufacturing/knowledge/services/common/secrets.py file
```

### Docker Deployment

```bash
docker run \
  -e ACCESS_TOKEN_SECRET="$(openssl rand -hex 32)" \
  -e REFRESH_TOKEN_SECRET="$(openssl rand -hex 32)" \
  -e KEYCLOAK_ISSUER="https://keycloak.example.com" \
  -e KEYCLOAK_AUDIENCE="my-service" \
  -e KC_CLIENT_ID="my-client" \
  -e KC_CLIENT_SECRET="my-client-secret" \
  myservice:latest
```

### Kubernetes Deployment

Use `SecretKeyRef`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: auth-service-secrets
type: Opaque
data:
  ACCESS_TOKEN_SECRET: <base64-encoded-secret>
  REFRESH_TOKEN_SECRET: <base64-encoded-secret>
---
apiVersion: apps/v1
kind: Deployment
spec:
  containers:
  - name: auth
    env:
    - name: ACCESS_TOKEN_SECRET
      valueFrom:
        secretKeyRef:
          name: auth-service-secrets
          key: ACCESS_TOKEN_SECRET
```

### Generating Secrets

```bash
# For TOKEN_SECRET (HMAC keys, 32 bytes / 256 bits)
openssl rand -hex 32

# For general API keys
openssl rand -base64 32

# For passwords
openssl rand -base64 24
```

### Pre-Deployment Checklist

- [ ] All required `*_SECRET` variables are generated (use `openssl rand`)
- [ ] Secrets are NOT committed to git
- [ ] Secrets are NOT in docker images (run `python scripts/verify_image_secrets.py`)
- [ ] Secrets are stored in secure secret manager (Vault, AWS Secrets Manager, K8s Secrets)
- [ ] Each environment (dev/staging/prod) has separate secrets
- [ ] No hardcoded defaults or fallbacks in the application code

---

## Design Rationale

### Why Fail-Closed?

Fail-closed means the service **refuses to start** if a required secret is missing. This is intentional:

1. **Immediate feedback:** Deployment error happens at startup, not after minutes of operation
2. **No silent failures:** You can't "accidentally" run with weak or missing credentials
3. **Audit trail:** Every service start logs that secrets were validated
4. **Production-ready:** Same validation code in dev, staging, and production

### Why Not Use os.getenv(secret, "default")?

```python
# ❌ WRONG — This silently allows missing secrets
SECRET = os.getenv("MY_SECRET", "default-value")

# Or even worse:
SECRET = os.getenv("MY_SECRET", "")  # Falls back to empty!
```

Problems:
- Silent failure: service starts but can't do anything important
- Debugging nightmare: errors appear later when the secret is first used
- Easy to forget: developers forget to set it, it works "locally", breaks in production
- No audit trail: you don't know when deployment was incomplete

### Why Fail at Import Time (Keycloak)?

Keycloak configuration is loaded at import time, before any requests are handled:

```python
# services/file/src/core/keycloak.py
KEYCLOAK_ISSUER = _require_keycloak_config("KEYCLOAK_ISSUER")

# If KEYCLOAK_ISSUER is missing, this line raises RuntimeError
# No requests are ever processed without it
```

This prevents a subtle problem:
- Request arrives → code tries to verify JWT → realizes KEYCLOAK_ISSUER is missing → returns 500 error
- But if we'd checked at startup: immediate error, clear problem, easy fix

---

## What Gets Protected

### Security-Critical Secrets (Fail-Closed)

| Name | What it guards | If missing |
|------|----------------|-----------|
| `ACCESS_TOKEN_SECRET` | JWT signing for access tokens | Service refuses to start |
| `REFRESH_TOKEN_SECRET` | JWT signing for refresh tokens | Service refuses to start |
| `KC_CLIENT_SECRET` | Keycloak authentication | Service refuses to start |
| `KEYCLOAK_ISSUER` | Keycloak identity provider | Service refuses to start |

### Optional Service Secrets (Service Runs Reduced)

These enable optional features. Service runs without them but may have reduced functionality:
- `OPENAI_API_KEY` — LLM operations disabled
- `DEEPGRAM_API_KEY` — Speech-to-text disabled
- `N8N_WEBHOOK_SECRET` — n8n webhooks disabled

---

## Docker Image Security

**All secrets are excluded from container images** via `.dockerignore`:

```dockerignore
.env
.env.*
**/.env
**/.env.*
*.key
*.pem
credentials.json
secrets.json
```

Automated verification in CI ensures no secrets leaked into images:

```bash
python scripts/verify_image_secrets.py myservice:latest
```

If this fails, the image is rejected before it can be pushed or deployed.

---

## References

- **Detailed guide:** `docs/SECURITY_SECRETS_DEPLOYMENT.md`
- **Secrets module:** `domains/manufacturing/knowledge/services/common/secrets.py`
- **Image security:** `docs/DOCKER_SECURITY_SECRETS_GATE.md`
- **Example config:** `domains/manufacturing/knowledge/services/common/config.py`
- **Example Keycloak:** `domains/manufacturing/knowledge/services/file/src/core/keycloak.py`

---

## Questions?

See `docs/SECURITY_SECRETS_DEPLOYMENT.md` for comprehensive troubleshooting and deployment instructions.
