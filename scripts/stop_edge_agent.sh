#!/bin/bash
# CognitiveOS Edge Agent — Stop Script
#
# Stops the Edge Agent daemon on this device. Same PID-file model as
# scripts/stop_actor.sh. The Agent's own shutdown handler stops every
# Actor subprocess it's supervising gracefully (SIGTERM, checkpoint,
# deregister) before exiting — see src/monkey_brain/edge_agent.py's
# own FastAPI shutdown event.
#
# Usage: ./scripts/stop_edge_agent.sh [device_id]

set -e

DEVICE_ID="${1:-$(hostname)}"
PID_FILE="/tmp/monkeybrain_edge_agent_${DEVICE_ID}.pid"

echo "=========================================="
echo "  CognitiveOS Edge Agent - Stop"
echo "=========================================="

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found for device '$DEVICE_ID'. It may not be running."
    exit 0
fi

PID=$(cat "$PID_FILE")
if ! kill -0 "$PID" 2>/dev/null; then
    echo "Process $PID is not running. Removing stale PID file."
    rm -f "$PID_FILE"
    exit 0
fi

echo "Stopping Edge Agent for device '$DEVICE_ID' (PID: $PID)..."
kill "$PID" 2>/dev/null || true

for i in {1..15}; do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Edge Agent stopped gracefully (managed Actor subprocesses checkpointed and stopped)"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

echo "Force stopping Edge Agent (graceful shutdown did not complete in time)..."
kill -9 "$PID" 2>/dev/null || true
sleep 1

rm -f "$PID_FILE"
echo "Edge Agent stopped (force) — any managed Actor subprocesses may still be running orphaned; check 'ps' for stray uvicorn/actor_runtime processes"
