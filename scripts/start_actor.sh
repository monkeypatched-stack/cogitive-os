#!/bin/bash
# CognitiveOS Actor Runtime — Start Script
#
# Boots ONE Actor's canonical runtime (src/monkey_brain/actor_runtime.py)
# against the SAME Society infrastructure scripts/start_server.sh /
# scripts/start.sh already started — this script never starts or
# restarts Society infrastructure itself. A developer runs Society once,
# then this script once per Actor:
#
#   ./scripts/start_server.sh                      # Society, once
#   ./scripts/start_actor.sh alice                  # Actor A
#   ./scripts/start_actor.sh bob --node-class edge  # Actor B, independently
#
# Usage: ./scripts/start_actor.sh <actor_id> [--node-class cloud|edge|device|robot]
#                                  [--port PORT] [--claim] [--bootstrap]
#   actor_id       required — must already exist in the Actor Registry
#                  (register it first via the Society API/CLI), unless
#                  --bootstrap is passed for local dev convenience.
#   --node-class   default: cloud
#   --port         default: 8051 (+ a small offset per invocation is the
#                  caller's job if running several locally at once)
#   --claim        sets ACTOR_CLAIM_PLACEMENT=true (this instance explicitly
#                  claims the actor rather than only consulting the
#                  Scheduler's existing decision)
#   --bootstrap    sets ACTOR_BOOTSTRAP_IF_MISSING=true (dev/test only —
#                  registers a brand-new actor_id if none exists yet)

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/start_actor.sh <actor_id> [--node-class cloud|edge|device|robot] [--port PORT] [--claim] [--bootstrap]"
    exit 1
fi
shift

NODE_CLASS="cloud"
PORT="8051"
CLAIM="false"
BOOTSTRAP="false"
while [ $# -gt 0 ]; do
    case "$1" in
        --node-class) NODE_CLASS="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --claim) CLAIM="true"; shift ;;
        --bootstrap) BOOTSTRAP="true"; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

LOG_FILE="/tmp/monkeybrain_actor_${ACTOR_ID}.log"
PID_FILE="/tmp/monkeybrain_actor_${ACTOR_ID}.pid"

echo "=========================================="
echo "  CognitiveOS Actor Runtime - Start"
echo "=========================================="

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Actor '$ACTOR_ID' already running (PID: $PID)"
        echo "Use ./scripts/stop_actor.sh $ACTOR_ID to stop it first"
        exit 1
    else
        echo "Removing stale PID file..."
        rm -f "$PID_FILE"
    fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "$PROJECT_DIR/.venv/bin/activate"

export ACTOR_ID="$ACTOR_ID"
export ACTOR_NODE_CLASS="$NODE_CLASS"
export ACTOR_NODE_ID="${ACTOR_NODE_ID:-$(hostname)-${ACTOR_ID}}"
export ACTOR_CLAIM_PLACEMENT="$CLAIM"
export ACTOR_BOOTSTRAP_IF_MISSING="$BOOTSTRAP"
# Same Society infrastructure endpoints scripts/start_server.sh /
# start.sh / docker-compose.yml already use — never a second set of
# names for the same thing (see docs/ACTOR_ARTIFACT.md "Actor
# configuration"). Final Conformance run finding (live deployment test):
# PlanetaryRuntime's own Redis client reads REDIS_HOST/REDIS_PORT, not
# REDIS_URL; ActorStateStore's own Mongo connection reads DATABASE_URL,
# not MONGODB_URL — both names set below so every subsystem
# actor_runtime.py touches resolves correctly (deploy/k8s/configmap.yaml
# carries the same fix for the Kubernetes path).
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export MONGODB_URL="${MONGODB_URL:-mongodb://localhost:27017}"
export DATABASE_URL="${DATABASE_URL:-mongodb://localhost:27017/cognitive_platform}"
export NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"

echo "actor_id:    $ACTOR_ID"
echo "node_class:  $NODE_CLASS"
echo "node_id:     $ACTOR_NODE_ID"
echo "port:        $PORT"
echo "claim:       $CLAIM"
echo "bootstrap:   $BOOTSTRAP"
echo "Logs: $LOG_FILE"

nohup python -m uvicorn src.monkey_brain.actor_runtime:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level warning \
    > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Actor '$ACTOR_ID' started (PID: $(cat "$PID_FILE"))"

echo "Waiting for Actor to be ready..."
for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/ready" | grep -q "200"; then
        echo "Actor is READY!"
        curl -s "http://localhost:$PORT/status"
        echo
        exit 0
    fi
    sleep 1
done

echo "Actor did not reach READY within 30 seconds — check its current state:"
curl -s "http://localhost:$PORT/status" || true
echo
echo "(This may be expected: SCHEDULED_ELSEWHERE/UNSCHEDULABLE are valid,"
echo " non-error states — see /status and $LOG_FILE for details.)"
exit 1
