#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# MonkeyBrain 2.0 — Health Check Script
# Checks all services and reports status.
# ═══════════════════════════════════════════════════════════════════════════

HOST="${HOST:-localhost}"
PORT="${PORT:-8000}"
AUTH_HEADER="${AUTH_HEADER:-X-User-ID: test-user}"

# ── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
    local name="$1"
    local url="$2"
    local auth="${3:-}"
    local code
    if [ -n "$auth" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" -H "$auth" "$url" 2>/dev/null || echo "000")
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    fi
    if [ "$code" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} $name (HTTP $code)"
        return 0
    elif [ "$code" = "503" ]; then
        echo -e "  ${YELLOW}⚠${NC} $name (HTTP $code — degraded)"
        return 1
    else
        echo -e "  ${RED}✗${NC} $name (HTTP $code)"
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════════"
echo "  MonkeyBrain 2.0 — Health Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

ERRORS=0

echo "Runtime Gateway:"
check "Health" "http://$HOST:$PORT/health" || ((ERRORS++))
check "Readiness" "http://$HOST:$PORT/ready" || ((ERRORS++))
check "Version" "http://$HOST:$PORT/api/v1/agentos/version" || ((ERRORS++))

echo ""
echo "Runtime Status:"
check "Runtime Status" "http://$HOST:$PORT/api/v1/agentos/runtime/status" "$AUTH_HEADER" || ((ERRORS++))
check "Runtime Health" "http://$HOST:$PORT/api/v1/agentos/runtime/health" "$AUTH_HEADER" || ((ERRORS++))
check "Runtime Config" "http://$HOST:$PORT/api/v1/agentos/runtime/configuration" "$AUTH_HEADER" || ((ERRORS++))

echo ""
echo "Planet:"
check "Planet" "http://$HOST:$PORT/api/v1/agentos/planet" "$AUTH_HEADER" || ((ERRORS++))
check "Planet Status" "http://$HOST:$PORT/api/v1/agentos/planet/status" "$AUTH_HEADER" || ((ERRORS++))

echo ""
echo "Data Stores:"
check "World" "http://$HOST:$PORT/api/v1/agentos/world" "$AUTH_HEADER" || ((ERRORS++))
check "Learn Stats" "http://$HOST:$PORT/api/v1/agentos/learn/statistics" "$AUTH_HEADER" || ((ERRORS++))

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
    echo -e "  ${GREEN}All checks passed${NC}"
else
    echo -e "  ${RED}$ERRORS check(s) failed${NC}"
fi
echo "═══════════════════════════════════════════════════════════════"

exit $ERRORS
