#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# MonkeyBrain 2.0 — Startup Script
# Starts infrastructure, services, and the Runtime Gateway.
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Configuration ──────────────────────────────────────────────────────────
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
WORKERS="${WORKERS:-1}"
LOG_DIR="/tmp/monkeybrain"
PID_FILE="/tmp/monkeybrain.pid"
BOOT_TIMEOUT=120

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[monkeybrain]${NC} $1"; }
warn() { echo -e "${YELLOW}[monkeybrain]${NC} $1"; }
err() { echo -e "${RED}[monkeybrain]${NC} $1"; }

# ── Preflight ──────────────────────────────────────────────────────────────
log "MonkeyBrain 2.0 — Starting up..."

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        warn "Already running (PID $OLD_PID). Use './scripts/shutdown.sh' first."
        exit 1
    fi
    rm -f "$PID_FILE"
fi

# Create log directory
mkdir -p "$LOG_DIR"

# ── Start Infrastructure ───────────────────────────────────────────────────
log "Starting infrastructure services..."

# Check if docker-compose is available
if command -v docker-compose &>/dev/null || docker compose version &>/dev/null 2>&1; then
    # Start infrastructure only (MongoDB, Redis, Elasticsearch, NATS, InfluxDB)
    docker compose up -d mongodb redis nats influxdb 2>/dev/null || \
    docker-compose up -d mongodb redis nats influxdb 2>/dev/null || \
    warn "Docker compose not available — infrastructure services must be running manually"

    # Wait for infrastructure to be healthy
    log "Waiting for infrastructure to be healthy..."
    for service in "mongodb:27017" "redis:6379" "nats:4222"; do
        NAME="${service%%:*}"
        PORT_NUM="${service##*:}"
        if nc -z localhost "$PORT_NUM" 2>/dev/null; then
            log "  ✓ $NAME (port $PORT_NUM)"
        else
            warn "  ⚠ $NAME (port $PORT_NUM) not responding — continuing anyway"
        fi
    done
else
    warn "Docker not available — assuming infrastructure is running externally"
fi

# ── Start Runtime Gateway ──────────────────────────────────────────────────
log "Starting Runtime Gateway on $HOST:$PORT..."

# Start uvicorn in background via wrapper script (ensures PYTHONPATH)
cd "$SCRIPT_DIR"
chmod +x "$SCRIPT_DIR/run_gateway.sh"
nohup "$SCRIPT_DIR/run_gateway.sh" > "$LOG_DIR/runtime.log" 2>&1 &

GATEWAY_PID=$!
echo "$GATEWAY_PID" > "$PID_FILE"

log "Runtime Gateway started (PID $GATEWAY_PID)"

# ── Wait for Gateway to be ready ──────────────────────────────────────────
log "Waiting for Runtime Gateway to boot (timeout: ${BOOT_TIMEOUT}s)..."

START_TIME=$(date +%s)
while true; do
    ELAPSED=$(( $(date +%s) - START_TIME ))
    if [ "$ELAPSED" -ge "$BOOT_TIMEOUT" ]; then
        err "Gateway did not start within ${BOOT_TIMEOUT}s"
        err "Check logs: $LOG_DIR/runtime.log"
        exit 1
    fi

    # Check if process is still alive
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
        err "Gateway process died. Check logs: $LOG_DIR/runtime.log"
        exit 1
    fi

    # Check health endpoint (returns 200 when alive, even if degraded)
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ] || [ "$HEALTH" = "503" ]; then
        log "  ✓ Gateway ready (${ELAPSED}s)"
        break
    fi

    sleep 2
done

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
log "MonkeyBrain 2.0 is running!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Runtime Gateway:  http://$HOST:$PORT"
echo "  Health:           http://$HOST:$PORT/health"
echo "  API Docs:         http://$HOST:$PORT/docs"
echo "  PID:              $GATEWAY_PID"
echo "  Logs:             $LOG_DIR/runtime.log"
echo ""
echo "  Endpoints:"
echo "    GET  /health              - Health check"
echo "    GET  /ready               - Readiness probe"
echo "    GET  /api/v1/agentos/planet - Planet state"
echo "    GET  /api/v1/agentos/runtime/status - Runtime status"
echo ""
echo "  To stop:  ./scripts/shutdown.sh"
echo "═══════════════════════════════════════════════════════════════"
