#!/bin/bash
# CognitiveOS Actor Runtime — Stop Script
#
# Gracefully stops ONE Actor's runtime process — never Society
# infrastructure. Same PID-file-per-actor_id model as
# scripts/start_actor.sh. Graceful shutdown (SIGTERM) checkpoints the
# Actor's belief and deregisters this node before the process exits
# (src/monkey_brain/actor_runtime.py::ActorRuntime.shutdown) — it never
# deletes the Actor's identity; restart it with the same actor_id via
# scripts/start_actor.sh to resume the SAME Actor.
#
# Usage: ./scripts/stop_actor.sh <actor_id>

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/stop_actor.sh <actor_id>"
    exit 1
fi

PID_FILE="/tmp/monkeybrain_actor_${ACTOR_ID}.pid"

echo "=========================================="
echo "  CognitiveOS Actor Runtime - Stop"
echo "=========================================="

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found for actor '$ACTOR_ID'. It may not be running."
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    echo "Actor '$ACTOR_ID' process (PID: $PID) is not running"
    rm -f "$PID_FILE"
    exit 0
fi

echo "Stopping actor '$ACTOR_ID' (PID: $PID)..."
kill "$PID" 2>/dev/null || true

for i in {1..15}; do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Actor stopped gracefully (belief checkpointed, node deregistered)"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

echo "Force stopping actor (graceful shutdown did not complete in time)..."
kill -9 "$PID" 2>/dev/null || true
sleep 1

rm -f "$PID_FILE"
echo "Actor stopped (force) — note: an unclean stop may skip the final checkpoint"
