#!/bin/bash
# CognitiveOS Edge Actor Startup Script
#
# Boots ONE actor's independently-deployable edge execution domain
# (src/sync/edge_server.py, wrapping src/sync/edge_actor.py::EdgeActor).
# Unlike start_server.sh (the shared cloud/society process, pinned to
# one instance because of its process-global world-tensor file), this
# script is designed to be run once PER ACTOR — each invocation is its
# own process, own PID file, own log file, own port, keyed by actor_id.
#
# Usage: ./scripts/start_edge_actor.sh <actor_id> [node_id] [port] [cloud_url]
#   actor_id   required — this edge node's actor_id
#   node_id    default: <actor_id>
#   port       default: 8041
#   cloud_url  default: http://localhost:8031 (empty string "" = offline mode)

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/start_edge_actor.sh <actor_id> [node_id] [port] [cloud_url]"
    exit 1
fi

NODE_ID="${2:-$ACTOR_ID}"
PORT="${3:-8041}"
CLOUD_URL="${4:-http://localhost:8031}"

LOG_FILE="/tmp/monkeybrain_edge_${ACTOR_ID}.log"
PID_FILE="/tmp/monkeybrain_edge_${ACTOR_ID}.pid"

echo "=========================================="
echo "  CognitiveOS Edge Actor - Start"
echo "=========================================="

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Edge actor '$ACTOR_ID' already running (PID: $PID)"
        echo "Use ./scripts/stop_edge_actor.sh $ACTOR_ID to stop it first"
        exit 1
    else
        echo "Removing stale PID file..."
        rm -f "$PID_FILE"
    fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "$PROJECT_DIR/.venv/bin/activate"

export EDGE_ACTOR_ID="$ACTOR_ID"
export EDGE_NODE_ID="$NODE_ID"
export EDGE_CLOUD_URL="$CLOUD_URL"

echo "actor_id:  $ACTOR_ID"
echo "node_id:   $NODE_ID"
echo "port:      $PORT"
echo "cloud_url: ${CLOUD_URL:-(none — offline mode)}"
echo "Logs: $LOG_FILE"

nohup python -m uvicorn src.sync.edge_server:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level warning \
    > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Edge actor '$ACTOR_ID' started (PID: $(cat "$PID_FILE"))"

echo "Waiting for edge actor to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/ready" | grep -q '"ready":true'; then
        echo "Edge actor is ready!"
        curl -s "http://localhost:$PORT/ready"
        echo
        exit 0
    fi
    sleep 1
done

echo "Edge actor failed to start within 30 seconds"
echo "Check logs: $LOG_FILE"
exit 1
