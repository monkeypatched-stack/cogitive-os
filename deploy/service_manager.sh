#!/bin/bash
# MonkeyBrain Service Manager
# Usage: ./deploy/service_manager.sh {start|stop|status|restart}

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_DIR="$HOME/.monkeybrain"
VENV_PYTHON="$INSTALL_DIR/venv/bin/python"
PID_DIR="$INSTALL_DIR/pids"
LOG_DIR="$INSTALL_DIR/logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

check_port() {
    lsof -i :"$1" -sTCP:LISTEN -t 2>/dev/null | head -1
}

start_service() {
    local name="$1"
    local port="$2"

    if check_port "$port" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✔${RESET} $name already running on port $port"
        return 0
    fi

    case "$name" in
        mongodb)
            if command -v brew &>/dev/null; then
                brew services start mongodb-community 2>/dev/null || true
            elif command -v systemctl &>/dev/null; then
                sudo systemctl start mongod 2>/dev/null || true
            fi
            ;;
        redis)
            if command -v brew &>/dev/null; then
                brew services start redis 2>/dev/null || true
            elif command -v systemctl &>/dev/null; then
                sudo systemctl start redis-server 2>/dev/null || true
            fi
            ;;
        nats)
            mkdir -p "$INSTALL_DIR/data/nats"
            nats-server -js -sd "$INSTALL_DIR/data/nats" -l "$LOG_DIR/nats.log" &
            echo $! > "$PID_DIR/nats.pid"
            ;;
        influxdb)
            mkdir -p "$INSTALL_DIR/data/influxdb"
            influxd3 serve --data-dir "$INSTALL_DIR/data/influxdb" --http-bind ":8181" \
                > "$LOG_DIR/influxdb.log" 2>&1 &
            echo $! > "$PID_DIR/influxdb.pid"
            ;;
    esac
}

stop_service() {
    local name="$1"
    local pid_file="$PID_DIR/$name.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        kill "$pid" 2>/dev/null || true
        rm -f "$pid_file"
        echo -e "  ${GREEN}✔${RESET} $name stopped"
        return
    fi

    case "$name" in
        mongodb)
            if command -v brew &>/dev/null; then
                brew services stop mongodb-community 2>/dev/null || true
            elif command -v systemctl &>/dev/null; then
                sudo systemctl stop mongod 2>/dev/null || true
            fi
            ;;
        redis)
            if command -v brew &>/dev/null; then
                brew services stop redis 2>/dev/null || true
            elif command -v systemctl &>/dev/null; then
                sudo systemctl stop redis-server 2>/dev/null || true
            fi
            ;;
    esac
}

show_status() {
    echo -e "\n${CYAN}Persistence Services${RESET}"
    for pair in "MongoDB:27017" "Redis:6379" "Neo4j:7687" "InfluxDB:8181" "Elasticsearch:9200" "NATS:4222"; do
        name="${pair%%:*}"
        port="${pair##*:}"
        if check_port "$port" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✔${RESET} $name (port $port)"
        else
            echo -e "  ${RED}✘${RESET} $name (port $port)"
        fi
    done

    echo -e "\n${CYAN}API Services${RESET}"
    found=0
    for port in $(seq 8000 8032); do
        if check_port "$port" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✔${RESET} Port $port"
            found=1
        fi
    done
    if [ "$found" -eq 0 ]; then
        echo -e "  ${YELLOW}⚠${RESET} No API services running"
    fi
}

case "${1:-status}" in
    start)
        echo -e "\n${CYAN}Starting MonkeyBrain services...${RESET}"
        start_service mongodb 27017
        start_service redis 6379
        start_service nats 4222
        start_service influxdb 8181
        sleep 2
        show_status
        echo -e "\n${CYAN}Starting API server...${RESET}"
        cd "$PROJECT_DIR"
        if [ -f "$VENV_PYTHON" ]; then
            "$VENV_PYTHON" main.py &
            echo -e "  ${GREEN}✔${RESET} API server starting..."
        else
            echo -e "  ${RED}✘${RESET} Venv not found at $VENV_PYTHON. Run: python install_agentos.py install"
        fi
        ;;
    stop)
        echo -e "\n${CYAN}Stopping MonkeyBrain services...${RESET}"
        for pid_file in "$PID_DIR"/*.pid; do
            [ -f "$pid_file" ] || continue
            name=$(basename "$pid_file" .pid)
            pid=$(cat "$pid_file")
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
            echo -e "  ${GREEN}✔${RESET} $name stopped"
        done
        pkill -f "uvicorn.*main:app" 2>/dev/null || true
        pkill -f "main.py" 2>/dev/null || true
        show_status
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
