#!/bin/bash
# MonkeyBrain Server Startup Script
# Usage: ./scripts/start_server.sh [port] [workers] [auth_required]

set -e

PORT=${1:-8000}
WORKERS=${2:-1}
AUTH_REQUIRED=${3:-false}
LOG_LEVEL=${4:-info}
LOG_FILE="/tmp/monkeybrain_server.log"
PID_FILE="/tmp/monkeybrain_server.pid"

echo "=========================================="
echo "  MonkeyBrain Cognitive OS - Server Start"
echo "=========================================="

# Check if server is already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Server already running (PID: $PID)"
        echo "Use ./scripts/stop_server.sh to stop it first"
        exit 1
    else
        echo "Removing stale PID file..."
        rm -f "$PID_FILE"
    fi
fi

# Activate virtual environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
source "$PROJECT_DIR/.venv/bin/activate"

# Set authentication environment
export AGENTOS_AUTH_REQUIRED="$AUTH_REQUIRED"
if [ "$AUTH_REQUIRED" = "true" ]; then
    echo "Authentication: ENABLED"
    echo "  - Bearer token or X-User-ID header required"
    echo "  - Set AGENTOS_API_KEY for API key authentication"
else
    echo "Authentication: DISABLED (development mode only)"
fi

echo "Starting server on port $PORT with $WORKERS worker(s)..."
echo "Logs: $LOG_FILE"

# Start server in background
nohup python -m uvicorn src.monkey_brain.api.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers "$WORKERS" \
    --log-level "$LOG_LEVEL" \
    > "$LOG_FILE" 2>&1 &

# Save PID
echo $! > "$PID_FILE"
echo "Server started (PID: $(cat $PID_FILE))"

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:$PORT/health" | grep -q "healthy"; then
        echo "Server is healthy!"
        curl -s "http://localhost:$PORT/health" | python -m json.tool
        exit 0
    fi
    sleep 1
done

echo "Server failed to start within 30 seconds"
echo "Check logs: $LOG_FILE"
exit 1
