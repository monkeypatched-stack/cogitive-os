FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app:/app/src

# PYTHONPATH=/app:/app/src replicates what the local dev venv's editable
# install actually does (.venv/lib/*/site-packages/__editable__.
# monkeybrain_runtime-*.pth contains a single line: the repo's src/
# directory). Confirmed live this codebase relies on BOTH import styles
# resolving to the same files — e.g. runtime/runtime.py does
# `from monkey_brain.runtime.agent_resolver import ...` (bare, needs
# src/ itself on sys.path) while most of the rest of the app does
# `from src.monkey_brain....` (needs /app, the repo-root equivalent, on
# sys.path) — without both, imports fail partway through app startup
# with ModuleNotFoundError, which is exactly what happened here before
# this fix (confirmed via a real `docker build` + `docker run`).

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

COPY src/ ./src/
# monkeypatched_sdk is its own top-level package (repo root, sibling to
# src/) — src.cortex.prediction imports monkeypatched_sdk.models directly.
COPY monkeypatched_sdk/ ./monkeypatched_sdk/
# services/{common,auth,agentos} live under domains/manufacturing/knowledge/
# (see tests/conftest.py's sys.path setup — same reason), NOT at the repo
# root, which only has services/file/. The previous COPY services/common/
# and COPY services/agentos/ referenced paths that do not exist relative
# to this Dockerfile's build context (docker-compose.yml: context: .,
# the repo root) — Gate 8 confirmed via a real `docker build` that this
# broke image creation outright (COPY of a nonexistent source path fails
# the build), before ever reaching a container to run. src.monkey_brain
# imports from services.common.* and services.auth.* (grepped — nothing
# else under services.*), plus services.agentos itself for this
# Dockerfile's own CMD entrypoint below.
COPY domains/manufacturing/knowledge/services/common/ ./services/common/
COPY domains/manufacturing/knowledge/services/auth/ ./services/auth/
COPY domains/manufacturing/knowledge/services/agentos/ ./services/agentos/

EXPOSE 8031

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8031/health || exit 1

CMD ["python", "-m", "uvicorn", "services.agentos.main:app", "--host", "0.0.0.0", "--port", "8031"]
