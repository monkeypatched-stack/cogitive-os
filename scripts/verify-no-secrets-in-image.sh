#!/usr/bin/env bash

# =============================================================================
# verify-no-secrets-in-image.sh
# =============================================================================
# Build-time security assertion: verifies that .env files, key material, and
# other secrets are NOT present in a Docker image.
#
# Usage:
#   ./scripts/verify-no-secrets-in-image.sh <image-name:tag>
#
# Exits:
#   0  — Image is clean (no secrets detected)
#   1  — SECURITY VIOLATION: Image contains secrets
#   2  — Usage error or image inspection failure
#
# This script is run as a gate in CI/CD (see .github/workflows/ci.yml)
# to prevent accidental commits of images containing .env or credentials.
#
# Context:
#   Docker's .dockerignore file prevents secrets from being sent to the builder
#   (applied before any COPY instruction). However, it's easy to accidentally
#   COPY a directory pattern that re-includes a secret file. This script
#   detects that mistake at build time before the image is pushed or deployed.
#
# Related files:
#   .dockerignore              — Primary control; excludes secrets from build
#   .gitignore                 — Excludes secrets from git (keep in sync)
#   docker/services/*/Dockerfile  — Must respect .dockerignore
# =============================================================================

set -euo pipefail

IMAGE="${1:-}"

if [[ -z "$IMAGE" ]]; then
    cat >&2 <<EOF
Usage: $0 <image-name:tag>

Verifies that a Docker image does not contain .env files, keys, or other
secrets that must never be embedded in container images.

Example:
  $0 cognitiveos-auth:v1.2.3
  $0 myapp:latest
EOF
    exit 2
fi

# List of secret-related file patterns to reject in the image.
# These are shell globs; each is checked with 'find' inside the image.
#
# Keep this list in sync with:
#   - .dockerignore
#   - .gitignore
#   - DOCKERFILE comments (if any)
#
FORBIDDEN_PATTERNS=(
    ".env"
    ".env.*"
    "*.pem"
    "*.key"
    "*.p12"
    "*.pfx"
    "id_rsa"
    "id_rsa.pub"
    "id_ed25519"
    "id_ed25519.pub"
    "credentials.json"
    "secrets.json"
    "secrets.yaml"
    "secrets.yml"
    "*.local.yaml"
    "*.local.yml"
)

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "📋 Scanning image for secrets: $IMAGE"
echo ""

# Extract image filesystem to a temporary directory for inspection.
# Use 'docker run' to extract, not 'docker export' (which requires a container).
# We'll mount the image as a filesystem and copy its contents out.
#
# Alternative: use 'docker save' + tar to inspect layer contents, but
# examining the running filesystem is more straightforward for this use case.

# docker create + export works for any image without relying on CMD/ENTRYPOINT
# (``docker run image sleep infinity`` passes sleep to uvicorn and fails).
CONTAINER_ID=$(docker create "$IMAGE" 2>/dev/null || true)

if [[ -z "$CONTAINER_ID" ]]; then
    echo "❌ ERROR: Could not create container from image. Verify image exists and is valid."
    exit 2
fi

trap "docker rm -f $CONTAINER_ID 2>/dev/null || true; rm -rf \"$TMPDIR\"" EXIT

if ! docker export "$CONTAINER_ID" -o "$TMPDIR/image.tar" 2>/dev/null; then
    echo "❌ ERROR: Could not export image filesystem."
    exit 2
fi

mkdir -p "$TMPDIR/root"
tar -xf "$TMPDIR/image.tar" -C "$TMPDIR/root" 2>/dev/null || {
    echo "❌ ERROR: Could not unpack exported image filesystem."
    exit 2
}

FOUND_SECRETS=0

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    # Search for the pattern in the extracted filesystem.
    # Use 'find' to handle globs; exclude common non-secret locations.
    if [[ -d "$TMPDIR/root" ]]; then
        SEARCH_DIR="$TMPDIR/root"
    else
        # If we used docker save instead, structure is different; search whole tmpdir
        SEARCH_DIR="$TMPDIR"
    fi

    # Find files matching the pattern, excluding system/build dirs
    matches=$(find "$SEARCH_DIR" \
        -name "$pattern" \
        ! -path "*/usr/*" \
        ! -path "*/var/*" \
        ! -path "*/sys/*" \
        ! -path "*/proc/*" \
        ! -path "*/dev/*" \
        ! -path "*/etc/ssl/*" \
        ! -path "*/etc/ssh/*" \
        ! -path "*/.git/*" \
        ! -path "*/root/.cache/*" \
        ! -path "*/.cache/*" \
        ! -name "cacert.pem" \
        2>/dev/null || true)

    if [[ -n "$matches" ]]; then
        if [[ $FOUND_SECRETS -eq 0 ]]; then
            echo "❌ SECURITY VIOLATION: The following secret files were found in the image:"
            echo ""
            FOUND_SECRETS=1
        fi
        echo "   Pattern: $pattern"
        echo "$matches" | sed 's|^|     - |'
        echo ""
    fi
done

if [[ $FOUND_SECRETS -eq 0 ]]; then
    echo "✅ PASS: No secrets detected in image."
    echo ""
    echo "   Patterns checked: ${#FORBIDDEN_PATTERNS[@]}"
    echo "   Result: Image is safe to push/deploy"
    exit 0
else
    echo "🔒 SECURITY GATE: Image rejected. Do not push."
    echo ""
    echo "   Resolution:"
    echo "   1. Verify .dockerignore includes all secret file patterns"
    echo "   2. Verify no COPY/ADD in Dockerfile re-includes excluded files"
    echo "   3. Clean build context and rebuild: docker build --no-cache ..."
    echo "   4. Run this verification again"
    exit 1
fi
