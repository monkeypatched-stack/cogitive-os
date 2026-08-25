#!/bin/bash
# Wrapper to start uvicorn with correct PYTHONPATH
cd /Users/prashunjaveri/Code/monkeypatched
export PYTHONPATH="/Users/prashunjaveri/Code/monkeypatched"
export AGENTOS_AUTH_REQUIRED="${AGENTOS_AUTH_REQUIRED:-false}"
exec .venv/bin/python -m uvicorn src.monkey_brain.api.main:app \
    --host "${HOST:-0.0.0.0}" \
    --port "${PORT:-8000}" \
    --workers "${WORKERS:-1}" \
    --log-level info
