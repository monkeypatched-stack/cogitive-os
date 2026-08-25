#!/bin/bash
# MonkeyBrain Server Shutdown Script
# Usage: ./scripts/stop_server.sh

set -e

PID_FILE="/tmp/monkeybrain_server.pid"

echo "=========================================="
echo "  MonkeyBrain Cognitive OS - Server Stop"
echo "=========================================="

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found. Server may not be running."
    
    # Try to find and kill any running uvicorn process
    PIDS=$(pgrep -f "uvicorn src.monkey_brain.api.main:app" || true)
    if [ -n "$PIDS" ]; then
        echo "Found running server processes: $PIDS"
        echo "Stopping..."
        kill $PIDS 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        PIDS=$(pgrep -f "uvicorn src.monkey_brain.api.main:app" || true)
        if [ -n "$PIDS" ]; then
            echo "Force stopping..."
            kill -9 $PIDS 2>/dev/null || true
        fi
        
        echo "Server stopped"
    else
        echo "No running server found"
    fi
    exit 0
fi

PID=$(cat "$PID_FILE")

# Check if process is running
if ! kill -0 "$PID" 2>/dev/null; then
    echo "Server process (PID: $PID) is not running"
    rm -f "$PID_FILE"
    exit 0
fi

echo "Stopping server (PID: $PID)..."

# Send SIGTERM for graceful shutdown
kill "$PID" 2>/dev/null || true

# Wait for process to stop
for i in {1..10}; do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Server stopped gracefully"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

# Force kill if still running
echo "Force stopping server..."
kill -9 "$PID" 2>/dev/null || true
sleep 1

# Clean up
rm -f "$PID_FILE"
echo "Server stopped (force)"
