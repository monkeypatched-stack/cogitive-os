#!/usr/bin/env python3
"""
verify_image_secrets.py — Docker image security assertion.

Build-time gate that inspects a Docker image and rejects it if it contains
.env files, key material, credentials, or other secrets that must never be
embedded in container images.

Usage:
    python scripts/verify_image_secrets.py <image-name:tag>
    python scripts/verify_image_secrets.py cognitiveos-auth:v1.2.3

Exit codes:
    0  — Image is clean (no secrets detected)
    1  — SECURITY VIOLATION: Image contains secrets
    2  — Usage error or image inspection failure

Related files:
    .dockerignore              — Primary control; excludes secrets from build
    .gitignore                 — Excludes secrets from git (keep in sync)
    docker/services/*/Dockerfile  — Must respect .dockerignore
    .github/workflows/ci.yml   — CI gate that runs this script
"""

import sys
import subprocess
import json
import tempfile
import os
from pathlib import Path
from fnmatch import fnmatch


# Forbidden file patterns. Keep synchronized with:
#   - .dockerignore
#   - .gitignore
#   - shell script version (scripts/verify-no-secrets-in-image.sh)
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

# Directories to exclude from search (system/build artifacts, not app code)
EXCLUDED_DIR_PREFIXES = (
    "/usr/",
    "/var/",
    "/sys/",
    "/proc/",
    "/dev/",
    "/etc/ssl/",
    "/etc/ssh/",
    "/.git/",
)


def should_exclude_path(path: str) -> bool:
    """Return True if path should be excluded from secret scanning."""
    for excluded in EXCLUDED_DIR_PREFIXES:
        if path.startswith(excluded):
            return True
    return False


def matches_pattern(filename: str, pattern: str) -> bool:
    """Check if filename matches the secret pattern (supports globs)."""
    return fnmatch(filename, pattern)


def extract_image_filesystem(image: str) -> Path:
    """
    Extract Docker image filesystem to a temporary directory.
    Returns the path to the extracted root filesystem.
    """
    tmpdir = Path(tempfile.mkdtemp(prefix="docker_inspect_"))

    try:
        # Try to start a container and copy its filesystem
        result = subprocess.run(
            ["docker", "run", "-d", "--rm", image, "sleep", "infinity"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode == 0:
            container_id = result.stdout.strip()
            try:
                subprocess.run(
                    ["docker", "cp", f"{container_id}:/", str(tmpdir / "root")],
                    check=True,
                    capture_output=True,
                    timeout=60,
                )
                subprocess.run(
                    ["docker", "stop", container_id],
                    capture_output=True,
                    timeout=10,
                )
                return tmpdir / "root"
            except subprocess.CalledProcessError as e:
                subprocess.run(["docker", "stop", container_id], capture_output=True)
                raise RuntimeError(
                    f"Failed to extract container filesystem: {e.stderr}"
                )
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        pass

    # Fallback: inspect image layers via docker inspect + history
    raise RuntimeError(
        "Could not extract image filesystem. Ensure the image exists and "
        "you have permission to run containers."
    )


def scan_filesystem_for_secrets(root_path: Path) -> list[str]:
    """
    Scan the extracted filesystem for forbidden file patterns.
    Returns a list of (pattern, file_path) tuples for all matches found.
    """
    matches_found = []

    for pattern in FORBIDDEN_PATTERNS:
        for fspath in root_path.rglob("*"):
            if not fspath.exists():
                continue

            # Build path relative to root for display
            rel_path = fspath.relative_to(root_path)
            full_path = f"/{rel_path}"

            # Skip excluded directories
            if should_exclude_path(full_path):
                continue

            # Check if filename matches the forbidden pattern
            if matches_pattern(fspath.name, pattern):
                matches_found.append((pattern, str(rel_path)))

    return matches_found


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python verify_image_secrets.py <image-name:tag>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Example:", file=sys.stderr)
        print("  python verify_image_secrets.py cognitiveos-auth:v1.2.3", file=sys.stderr)
        return 2

    image = sys.argv[1]

    print(f"📋 Scanning image for secrets: {image}")
    print("")

    try:
        print("  Extracting image filesystem...")
        root = extract_image_filesystem(image)
        print(f"  ✓ Extracted to {root}")
        print("")

        print("  Scanning for forbidden patterns...")
        matches = scan_filesystem_for_secrets(root)
        print(f"  ✓ Scan complete ({len(FORBIDDEN_PATTERNS)} patterns checked)")
        print("")

        if not matches:
            print("✅ PASS: No secrets detected in image.")
            print("")
            print(f"   Patterns checked: {len(FORBIDDEN_PATTERNS)}")
            print("   Result: Image is safe to push/deploy")
            return 0

        # Security violation found
        print("❌ SECURITY VIOLATION: The following secret files were found in the image:")
        print("")

        # Group matches by pattern for clarity
        by_pattern = {}
        for pattern, filepath in matches:
            if pattern not in by_pattern:
                by_pattern[pattern] = []
            by_pattern[pattern].append(filepath)

        for pattern, files in by_pattern.items():
            print(f"   Pattern: {pattern}")
            for filepath in sorted(files):
                print(f"     - {filepath}")
            print("")

        print("🔒 SECURITY GATE: Image rejected. Do not push.")
        print("")
        print("   Resolution:")
        print("   1. Verify .dockerignore includes all secret file patterns")
        print("   2. Verify no COPY/ADD in Dockerfile re-includes excluded files")
        print("   3. Clean build context and rebuild: docker build --no-cache ...")
        print("   4. Run this verification again")
        return 1

    except RuntimeError as e:
        print(f"❌ ERROR: {e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
