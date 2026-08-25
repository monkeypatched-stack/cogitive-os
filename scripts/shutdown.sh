#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# MonkeyBrain 2.0 — Shutdown Script
# Gracefully stops the Runtime Gateway and infrastructure services.
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="/tmp/monkeybrain.pid"
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
SHUTDOWN_TIMEOUT=30

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[monkeybrain]${NC} $1"; }
warn() { echo -e "${YELLOW}[monkeybrain]${NC} $1"; }
err() { echo -e "${RED}[monkeybrain]${NC} $1"; }

log "MonkeyBrain 2.0 — Shutting down..."

# ── Stop Runtime Gateway ───────────────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        log "Stopping Runtime Gateway (PID $PID)..."

        # Send SIGTERM for graceful shutdown
        kill -TERM "$PID" 2>/dev/null || true

        # Wait for graceful shutdown
        START_TIME=$(date +%s)
        while kill -0 "$PID" 2>/dev/null; do
            ELAPSED=$(( $(date +%s) - START_TIME ))
            if [ "$ELAPSED" -ge "$SHUTDOWN_TIMEOUT" ]; then
                warn "Force killing (timeout exceeded)..."
                kill -9 "$PID" 2>/dev/null || true
                break
            fi
            sleep 1
        done

        log "  ✓ Runtime Gateway stopped"
    else
        warn "  Gateway PID $PID not running"
    fi
    rm -f "$PID_FILE"
else
    warn "No PID file found — trying to find running process..."

    # Try to find by port
    PID=$(lsof -ti :"$PORT" 2>/dev/null | head -1)
    if [ -n "$PID" ]; then
        log "Found process on port $PORT (PID $PID) — stopping..."
        kill -TERM "$PID" 2>/dev/null || true
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null || true
        fi
        log "  ✓ Process stopped"
    else
        warn "  No MonkeyBrain process found on port $PORT"
    fi
fi

# ── Stop Infrastructure (optional) ────────────────────────────────────────
if [ "$STOP_INFRA" = "true" ]; then
    log "Stopping infrastructure services..."
    if command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>&1; then
        docker compose down 2>/dev/null || \
        docker-compose down 2>/dev/null || \
        warn "Could not stop docker compose"
        log "  ✓ Infrastructure stopped"
    else
        warn "Docker not available — infrastructure must be stopped manually"
    fi
else
    log "Infrastructure left running (use STOP_INFRA=true to stop)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
log "MonkeyBrain 2.0 shutdown complete."
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  To start again:  ./scripts/start.sh"
echo "  To stop infra:    STOP_INFRA=true ./scripts/shutdown.sh"
echo ""
