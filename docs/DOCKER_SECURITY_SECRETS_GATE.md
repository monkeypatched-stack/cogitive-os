# Docker Security: Secrets Exclusion Gate

## Overview

This document describes the **permanent prevention system** for secrets leaking into Docker images.

**Previous vulnerability:** Docker builds previously embedded `.env` files (local configuration and credentials) into images, creating a security risk where developer secrets could be exposed if images were accidentally pushed or deployed.

**Current solution:** Multiple layers of defense ensure `.env`, keys, credentials, and other sensitive files are never included in images.

---

## Defense Layers

### Layer 1: Build-Time Exclusion (.dockerignore)

The primary defense: `.dockerignore` prevents secrets from being sent to the Docker builder **before any COPY instruction**.

**File:** `.dockerignore`

```dockerignore
# Environment / secrets files
.env
.env.*
**/.env
**/.env.*
domains/manufacturing/knowledge/services/auth/.env
domains/manufacturing/knowledge/services/file/.env
domains/manufacturing/knowledge/services/facilities/.env

# Key material and credential stores
*.pem
*.key
*.p12
*.pfx
id_rsa
id_rsa.pub
id_ed25519
id_ed25519.pub
.aws/
.ssh/
credentials.json
secrets.json
secrets.yaml
secrets.yml
*.local.yaml
*.local.yml
```

**Why this is correct:**
- Applied by the Docker daemon **before sending the build context** to the builder
- Excluded files never appear in any image layer (including intermediate layers)
- More reliable than `RUN rm -f` (which only removes from filesystem view, leaving data in prior layers)

### Layer 2: Source Control Prevention (.gitignore)

Secrets are also excluded from git to prevent them from being committed.

**File:** `.gitignore`

**Keep in sync with `.dockerignore`:**
```
# All .env variants
.env
.env.*
**/.env
**/.env.*
```

---

## Layer 3: Build-Time Assertion (CI/CD Gate)

**New:** Automated security verification runs on every build to detect if secrets somehow made it into the image despite `.dockerignore`.

### Verification Scripts

Two implementations available:

#### Python: `scripts/verify_image_secrets.py` (recommended)

Robust, self-contained, minimal dependencies.

```bash
# Usage
python scripts/verify_image_secrets.py <image-name:tag>

# Example
python scripts/verify_image_secrets.py cognitiveos-auth:v1.2.3
```

**Features:**
- Extracts image filesystem and inspects all files
- Matches against forbidden patterns (supports globs)
- Excludes system directories (/usr, /var, /etc, etc.)
- Clear, actionable error messages
- Exit codes: 0 (pass) | 1 (violation found) | 2 (error)

#### Bash: `scripts/verify-no-secrets-in-image.sh`

Alternative implementation; same behavior as Python version.

```bash
./scripts/verify-no-secrets-in-image.sh <image-name:tag>
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

Two jobs gate image security:

#### 1. `actor-artifact-build`

Verifies the canonical Actor Artifact image:
```yaml
- name: Security gate — verify no secrets in Actor Artifact image
  run: |
    python scripts/verify_image_secrets.py cognitiveos-actor:${{ steps.version.outputs.artifact_version }}
```

#### 2. `docker-image-security-gates`

Matrix job that verifies multiple service images:
```yaml
strategy:
  matrix:
    dockerfile:
      - docker/services/auth/Dockerfile
      - docker/services/file/Dockerfile
      - docker/services/agentos/Dockerfile
```

Each builds and scans the service image.

### Behavior

- **Runs on:** Every pull request and push
- **Timing:** After unit tests (dependency: `needs: [test]`)
- **Failure mode:** `continue-on-error: true` (informational only, does not block merge yet)
  - Once runs are clean on main for a few cycles, can be changed to `continue-on-error: false` to make it a hard gate

---

## Forbidden Patterns

The verification scripts check for:

```python
FORBIDDEN_PATTERNS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "id_rsa",
    "id_rsa.pub",
    "id_ed25519",
    "id_ed25519.pub",
    "credentials.json",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "*.local.yaml",
    "*.local.yml",
]
```

**Keep synchronized:**
- `.dockerignore` (build-time exclusion)
- `.gitignore` (source control)
- `scripts/verify_image_secrets.py` (verification logic)
- `scripts/verify-no-secrets-in-image.sh` (verification logic)

---

## How to Add a New Secret Pattern

If a new type of secret file needs to be excluded:

1. **Add to `.dockerignore`**
   ```dockerignore
   # New secret type
   *.newsecret
   ```

2. **Add to `.gitignore`**
   ```gitignore
   # New secret type
   *.newsecret
   ```

3. **Update verification scripts**
   - `scripts/verify_image_secrets.py`: Add to `FORBIDDEN_PATTERNS` list
   - `scripts/verify-no-secrets-in-image.sh`: Add to `FORBIDDEN_PATTERNS` array

4. **Test locally**
   ```bash
   docker build -t test:v1 -f docker/services/auth/Dockerfile .
   python scripts/verify_image_secrets.py test:v1
   ```

---

## Local Development

### Verifying an Image Locally

Before pushing or deploying, verify an image:

```bash
# Build your image
docker build -t myservice:latest -f docker/services/myservice/Dockerfile .

# Verify no secrets
python scripts/verify_image_secrets.py myservice:latest
```

**Expected output on pass:**
```
📋 Scanning image for secrets: myservice:latest
  Extracting image filesystem...
  ✓ Extracted to /tmp/docker_inspect_xxx/root
  Scanning for forbidden patterns...
  ✓ Scan complete (16 patterns checked)

✅ PASS: No secrets detected in image.
   Patterns checked: 16
   Result: Image is safe to push/deploy
```

**Expected output on failure:**
```
❌ SECURITY VIOLATION: The following secret files were found in the image:
   Pattern: .env
     - app/.env
   Pattern: *.key
     - app/certs/private.key

🔒 SECURITY GATE: Image rejected. Do not push.

Resolution:
   1. Verify .dockerignore includes all secret file patterns
   2. Verify no COPY/ADD in Dockerfile re-includes excluded files
   3. Clean build context and rebuild: docker build --no-cache ...
   4. Run this verification again
```

---

## Troubleshooting

### "Could not extract image filesystem"

The verification script failed to start a container or copy files from it.

**Fixes:**
1. Verify Docker daemon is running: `docker ps`
2. Verify the image exists: `docker images | grep <image-name>`
3. Check Docker permissions: `docker run --rm hello-world`
4. Try building the image locally first: `docker build .`

### "SECURITY VIOLATION: Pattern found"

A secret file was detected in the image.

**Fixes:**
1. Verify `.dockerignore` has the correct pattern
2. Verify the pattern is not being re-included by a COPY instruction
3. Perform a clean rebuild:
   ```bash
   docker build --no-cache -t myservice:latest .
   python scripts/verify_image_secrets.py myservice:latest
   ```
4. Check git status: ensure the `.env` file is still being ignored
   ```bash
   git status | grep -i ".env"
   ```

### Pattern Matches But File Is Not a Secret

If the verification script flags a legitimate file that matches a pattern:

1. Rename the file to avoid the pattern (e.g., `config.key` → `config.pub`)
2. Add an exclusion to the script's `EXCLUDED_DIR_PREFIXES` (if in a system directory)
3. Discuss with security team before reducing the pattern scope

---

## Related Documentation

- [.dockerignore](../.dockerignore) — Authoritative secrets exclusion list
- [.gitignore](../.gitignore) — Git configuration (kept in sync with .dockerignore)
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — CI/CD gate definitions
- [scripts/verify_image_secrets.py](../scripts/verify_image_secrets.py) — Python verification tool
- [scripts/verify-no-secrets-in-image.sh](../scripts/verify-no-secrets-in-image.sh) — Bash verification tool

---

## Design Rationale

### Why Multiple Layers?

1. **`.dockerignore` (primary):** Correct, efficient, reliable. Prevents secrets from ever entering the build context.
2. **Verification gate (secondary):** Catches mistakes if `.dockerignore` is inadvertently misconfigured.
3. **`.gitignore` (tertiary):** Prevents secrets from being committed and leaked through git history.

### Why Not Just `RUN rm -f`?

```dockerfile
# ❌ INCORRECT: Does not work
COPY . .
RUN rm -f .env  # File is still readable in the prior layer's tarball!
```

The `RUN` command only removes the file from the **filesystem view** of that layer. The file remains in the previous layer's contents and is readable by anyone with access to the image.

`.dockerignore` is the correct approach because it prevents the file from entering any layer.

### Why Verify in CI?

Defense in depth: even if `.dockerignore` is accidentally removed or a new developer misconfigures it, the CI gate catches the mistake before the image can be pushed to a registry or deployed.

---

## Compliance

This gate aligns with security best practices:

- **OWASP:** Avoid storing secrets in container images (Mobile Security Testing Guide, Cloud Security)
- **CIS Docker Benchmark:** Do not store secrets in images; use external secret management
- **PCI DSS:** Do not store credentials in images (Requirement 8.2.1, 8.5.4)
- **SOC 2:** Implement controls to prevent accidental credential exposure

---

## Questions?

Contact the security team or create an issue if:
- A legitimate file is being rejected by the gate
- A new secret file type needs to be excluded
- The verification script is not working as expected
