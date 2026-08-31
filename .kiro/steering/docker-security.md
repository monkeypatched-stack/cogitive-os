---
title: Docker Security — Secrets Prevention
inclusion: manual
---

# Docker Security: Permanent Prevention of Secrets in Images

## The Problem

Docker builds previously embedded `.env` files containing local configuration and developer credentials into images. This creates a critical security vulnerability:
- **Exposure:** If an image is accidentally pushed to a registry, credentials are exposed to anyone with access
- **Blast radius:** Any developer's local secrets could leak in any image
- **Detection gap:** No way to know if an image contains secrets without manual inspection

## The Solution: Defense in Depth

We've implemented **three layers** of permanent prevention:

### 1. Primary Defense: `.dockerignore`

File: `.dockerignore` (in workspace root)

Prevents `.env`, keys, and credentials from entering the Docker build context **before any COPY instruction**.

```
# Environment / secrets files
.env
.env.*
**/.env
**/.env.*

# Key material
*.pem
*.key
credentials.json
secrets.json
```

**Why this works:** The Docker daemon applies `.dockerignore` before sending files to the builder. Excluded files never appear in any layer.

### 2. Secondary Defense: Build-Time Assertion

**New CI/CD gate** in `.github/workflows/ci.yml` that:
- Builds each service image
- Scans it for `.env`, keys, credentials, and other secrets
- **Rejects the image** if any secrets are found

Scripts:
- `scripts/verify_image_secrets.py` — Recommended, Python implementation
- `scripts/verify-no-secrets-in-image.sh` — Alternative, Bash implementation

**Usage (local):**
```bash
docker build -t myservice:latest -f docker/services/myservice/Dockerfile .
python3 scripts/verify_image_secrets.py myservice:latest
```

**CI/CD:**
- Runs automatically on every PR and push
- Runs AFTER unit tests complete
- Currently `continue-on-error: true` (informational) — will become a hard gate once stable

### 3. Tertiary Defense: `.gitignore`

Source control prevents secrets from being committed to git history.

```
# All .env variants
.env
.env.*
**/.env
**/.env.*
```

---

## How to Use This System

### For Daily Development

1. **Never manually put secrets in images** — use environment variables or secret management systems
2. **Keep `.env` files local** — they're already in `.gitignore` and `.dockerignore`
3. **Before pushing images:**
   ```bash
   python3 scripts/verify_image_secrets.py myimage:tag
   ```

### If You Add a New Secret Type

Example: You need to exclude `.apikey` files

1. **Add to `.dockerignore`:**
   ```
   *.apikey
   ```

2. **Add to `.gitignore`:**
   ```
   *.apikey
   ```

3. **Update verification scripts:**
   - `scripts/verify_image_secrets.py`: Add `"*.apikey"` to `FORBIDDEN_PATTERNS`
   - `scripts/verify-no-secrets-in-image.sh`: Add `"*.apikey"` to `FORBIDDEN_PATTERNS`

4. **Test locally:**
   ```bash
   docker build -t test:v1 .
   python3 scripts/verify_image_secrets.py test:v1
   ```

---

## What Gets Checked

The verification gate scans for:

```
.env                    # Environment variables
.env.*                  # .env.local, .env.production, etc.
*.pem                   # SSL/TLS certificates
*.key                   # Private keys
*.p12, *.pfx            # Certificate containers
id_rsa, id_rsa.pub      # SSH keys
id_ed25519, id_ed25519.pub  # Ed25519 keys
credentials.json        # Cloud credentials
secrets.json            # Generic secret stores
secrets.yaml            # YAML secret files
*.local.yaml            # Local config files
```

---

## Troubleshooting

### "Gate rejected my image but I don't have secrets"

**Cause:** A file matches a pattern but isn't actually a secret.

**Solution:**
1. Rename the file to avoid the pattern (e.g., `private.key` → `public.key`)
2. Or: Run `docker inspect` to manually verify:
   ```bash
   docker run --rm myimage:tag sh -c "find / -name '.env' 2>/dev/null" | head
   ```

### "My local image passes but CI fails"

**Cause:** Build context differences (paths, Docker version, or recent .dockerignore changes).

**Solution:**
1. Clean build with no cache:
   ```bash
   docker build --no-cache -t myimage:tag .
   ```
2. Run verification locally:
   ```bash
   python3 scripts/verify_image_secrets.py myimage:tag
   ```

### ".dockerignore isn't being applied"

**Cause:** Docker daemon isn't respecting `.dockerignore`.

**Troubleshoot:**
1. Verify `.dockerignore` is in the workspace root:
   ```bash
   ls -la .dockerignore
   ```
2. Try building with explicit context:
   ```bash
   docker build --no-cache -t test:v1 -f docker/services/auth/Dockerfile .
   ```
3. Check Docker version — `.dockerignore` support is old but bugs happen:
   ```bash
   docker --version
   ```

---

## Design Rationale

**Why three layers?**
- **`.dockerignore`** (primary): Correct, efficient, prevents secrets from entering the build
- **Verification gate** (secondary): Catches mistakes if `.dockerignore` is misconfigured
- **`.gitignore`** (tertiary): Prevents secrets from being committed to git

**Why not just `RUN rm -f .env`?**
- ❌ Does NOT work — the file is still readable in the prior layer's tarball
- ✅ `.dockerignore` is the correct approach

**Why verify in CI?**
- Defense in depth — catches mistakes before images reach registries or production

---

## Related Files

- **Exclusion list:** `.dockerignore` — What Docker excludes from the build
- **Git config:** `.gitignore` — What git excludes (keep in sync)
- **Verification scripts:** `scripts/verify_image_secrets.py`, `scripts/verify-no-secrets-in-image.sh`
- **CI/CD gate:** `.github/workflows/ci.yml` (jobs: `actor-artifact-build`, `docker-image-security-gates`)
- **Documentation:** `docs/DOCKER_SECURITY_SECRETS_GATE.md` — Full technical guide

---

## Questions or Issues?

- Check `docs/DOCKER_SECURITY_SECRETS_GATE.md` for detailed technical documentation
- Review `.dockerignore` comments for the rationale behind each exclusion
- Run the test suite: `./scripts/test-secrets-gate.sh`
