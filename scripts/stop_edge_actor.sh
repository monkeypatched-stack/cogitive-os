#!/bin/bash
# CognitiveOS Edge Actor Shutdown Script
#
# Usage: ./scripts/stop_edge_actor.sh <actor_id>

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/stop_edge_actor.sh <actor_id>"
    exit 1
fi

PID_FILE="/tmp/monkeybrain_edge_${ACTOR_ID}.pid"

echo "=========================================="
echo "  CognitiveOS Edge Actor - Stop"
echo "=========================================="

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found for actor '$ACTOR_ID'. It may not be running."
    exit 0
fi

PID=$(cat "$PID_FILE")

if ! kill -0 "$PID" 2>/dev/null; then
    echo "Edge actor '$ACTOR_ID' process (PID: $PID) is not running"
    rm -f "$PID_FILE"
    exit 0
fi

echo "Stopping edge actor '$ACTOR_ID' (PID: $PID)..."
kill "$PID" 2>/dev/null || true

for i in {1..10}; do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Edge actor stopped gracefully"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

echo "Force stopping edge actor..."
kill -9 "$PID" 2>/dev/null || true
sleep 1

rm -f "$PID_FILE"
echo "Edge actor stopped (force)"
