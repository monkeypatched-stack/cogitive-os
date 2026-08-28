#!/bin/bash
# CognitiveOS Edge Agent — Start Script
#
# Boots the Edge Agent (src/monkey_brain/edge_agent.py) on THIS device --
# the process-supervisor counterpart to scripts/start_actor.sh: instead
# of directly running one Actor's runtime in the foreground/nohup, this
# starts the daemon that lets the control plane (via EdgeProvisioner,
# kernel/society/edge_provisioner.py) remotely start/stop/restart Actor
# runtimes ON this device, with local crash recovery. A device runs ONE
# Edge Agent; the Agent itself spawns and supervises as many Actor
# runtime subprocesses as are scheduled here.
#
# scripts/start_edge_actor.sh remains the correct choice for manually
# starting a single Actor on this device without an Agent managing it
# (e.g. local dev) -- this script is for the automated,
# control-plane-driven deployment path.
#
# Usage: ./scripts/start_edge_agent.sh [device_id] [port]
#   device_id   default: this machine's hostname (EDGE_DEVICE_ID)
#   port        default: 8061 (EDGE_AGENT_PORT)

set -e

DEVICE_ID="${1:-$(hostname)}"
PORT="${2:-8061}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

PID_FILE="/tmp/monkeybrain_edge_agent_${DEVICE_ID}.pid"
LOG_FILE="/tmp/monkeybrain_edge_agent_${DEVICE_ID}.log"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Edge Agent for device '$DEVICE_ID' already running (PID: $(cat "$PID_FILE"))"
    exit 0
fi

export EDGE_DEVICE_ID="$DEVICE_ID"
export EDGE_AGENT_PORT="$PORT"
# Same Society infrastructure defaults scripts/start_actor.sh already
# uses -- an Edge Agent's own device-heartbeat registration and every
# Actor subprocess it spawns need the same reachability.
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export MONGODB_URL="${MONGODB_URL:-mongodb://localhost:27017}"
export DATABASE_URL="${DATABASE_URL:-mongodb://localhost:27017/cognitive_platform}"
export NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"

echo "device_id: $DEVICE_ID"
echo "port:      $PORT"
echo "Logs: $LOG_FILE"

if [ -x "$PROJECT_ROOT/.venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python3"
else
    PYTHON_BIN="$(command -v python3 || command -v python)"
fi

nohup "$PYTHON_BIN" -m uvicorn src.monkey_brain.edge_agent:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --log-level warning \
    > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Edge Agent for device '$DEVICE_ID' started (PID: $(cat "$PID_FILE"))"

echo "Waiting for Edge Agent to be ready..."
for i in {1..15}; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" | grep -q "200"; then
        echo "Edge Agent is READY!"
        curl -s "http://localhost:$PORT/health"
        echo
        exit 0
    fi
    sleep 1
done

echo "Edge Agent did not reach READY within 15 seconds — check $LOG_FILE"
exit 1
