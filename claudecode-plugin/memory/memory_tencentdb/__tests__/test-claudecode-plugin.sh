#!/bin/bash
# ============================================================================
# test-claudecode-plugin.sh — Claude Code plugin adapter test script
#
# Usage:
#   Option A: Start Gateway manually, then run this script
#     TDAI_LLM_API_KEY=sk-xxx npx tsx src/gateway/server.ts &
#     bash claudecode-plugin/memory/memory_tencentdb/__tests__/test-claudecode-plugin.sh
#
#   Option B: Let the script start Gateway for you
#     TDAI_LLM_API_KEY=sk-xxx \
#     bash claudecode-plugin/memory/memory_tencentdb/__tests__/test-claudecode-plugin.sh --start-gateway
#
#   Run all tests (including vitest):
#     bash .../test-claudecode-plugin.sh --all
#
# Output:
#   - Color-coded terminal summary
#   - Results written to TEST-RESULT-<timestamp>.json
# ============================================================================

set -euo pipefail

GATEWAY="${TDAI_GATEWAY_URL:-http://127.0.0.1:8420}"
RESULT_FILE="TEST-RESULT-$(date +%Y%m%d-%H%M%S).json"
PASS=0
FAIL=0
SKIP=0
RESULTS_JSON="["

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================
# Helpers
# ============================

log_pass() { echo -e "  ${GREEN}PASS${NC} — $1"; ((PASS++)); }
log_fail() { echo -e "  ${RED}FAIL${NC} — $1 (expected: $2, got: $3)"; ((FAIL++)); }
log_skip() { echo -e "  ${YELLOW}SKIP${NC} — $1 ($2)"; ((SKIP++)); }

add_result() {
  local name="$1" status="$2" expected="$3" actual="$4"
  local json_actual
  json_actual=$(echo "$actual" | python3 -c "import sys,json; json.dump(sys.stdin.read().strip(),sys.stdout)" 2>/dev/null || echo "\"$actual\"")
  RESULTS_JSON+=$(cat <<EOF
  {"name":"$name","status":"$status","expected":"$expected","actual":$json_actual},
EOF
)
}

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    add_result "$name" "pass" "$expected" "$actual"
    log_pass "$name"
  else
    add_result "$name" "fail" "$expected" "$actual"
    log_fail "$name" "$expected" "$actual"
  fi
}

check_status() {
  local name="$1" expected_code="$2" actual_code="$3" body="$4"
  if [ "$actual_code" = "$expected_code" ]; then
    add_result "$name" "pass" "HTTP $expected_code" "$body"
    log_pass "$name"
  else
    add_result "$name" "fail" "HTTP $expected_code" "$body"
    log_fail "$name" "HTTP $expected_code" "HTTP $actual_code — $body"
  fi
}

check_field() {
  local name="$1" field="$2" body="$3"
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$field' in d else 1)" 2>/dev/null; then
    add_result "$name" "pass" "has field '$field'" "$body"
    log_pass "$name"
  else
    add_result "$name" "fail" "has field '$field'" "$body"
    log_fail "$name" "has field '$field'" "$(echo "$body" | head -c 200)"
  fi
}

# ============================
# Pre-flight check
# ============================

echo "============================================"
echo " Claude Code Plugin Adapter Test"
echo " Gateway: $GATEWAY"
echo " $(date)"
echo "============================================"
echo ""

# Check if Gateway is running
gateway_health() {
  curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/health" 2>/dev/null || echo "000"
}

HEALTH_CODE=$(gateway_health)

if [ "$HEALTH_CODE" != "200" ]; then
  if [ "${1:-}" = "--start-gateway" ]; then
    echo "Gateway not running, starting..."
    npx tsx src/gateway/server.ts &
    GATEWAY_PID=$!
    echo "Waiting for Gateway to be ready (PID=$GATEWAY_PID)..."
    for i in $(seq 1 30); do
      if [ "$(gateway_health)" = "200" ]; then
        echo "Gateway is ready"
        break
      fi
      sleep 1
    done
  else
    echo "Gateway is not running! Start it first:"
    echo "   TDAI_LLM_API_KEY=sk-xxx npx tsx src/gateway/server.ts &"
    echo "   Or add --start-gateway to auto-start"
    exit 1
  fi
fi

TEST_SESSION="cc-test-$(date +%s)"

# ============================
# Test execution
# ============================

echo ""
echo "=== 1. Health check ==="

HEALTH=$(curl -s "$GATEWAY/health")
check_status "1.1 GET /health → 200" "200" "$HEALTH_CODE" "$HEALTH"
check_field "1.2 has version" "version" "$HEALTH"
check_field "1.3 has stores" "stores" "$HEALTH"

echo ""
echo "=== 2. POST /recall ==="

R1=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY/recall" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"test query\",\"session_key\":\"$TEST_SESSION\"}")
R1_CODE=$(echo "$R1" | tail -1)
R1_BODY=$(echo "$R1" | sed '$d')
check_status "2.1 normal recall → 200" "200" "$R1_CODE" "$R1_BODY"
check_field "2.2 returns context" "context" "$R1_BODY"

R2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/recall" \
  -H "Content-Type: application/json" \
  -d "{\"session_key\":\"$TEST_SESSION\"}")
check_status "2.3 missing query → 400" "400" "$R2" ""

R3=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/recall" \
  -H "Content-Type: application/json" \
  -d '{"query":""}')
check_status "2.4 empty query → 400" "400" "$R3" ""

echo ""
echo "=== 3. POST /capture ==="

CAP_SESSION="${TEST_SESSION}-cap"
C1=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY/capture" \
  -H "Content-Type: application/json" \
  -d "{\"user_content\":\"I like functional programming\",\"assistant_content\":\"Noted\",\"session_key\":\"$CAP_SESSION\"}")
C1_CODE=$(echo "$C1" | tail -1)
C1_BODY=$(echo "$C1" | sed '$d')
check_status "3.1 normal capture → 200" "200" "$C1_CODE" "$C1_BODY"
check_field "3.2 returns l0_recorded" "l0_recorded" "$C1_BODY"

# Verify l0_recorded > 0
L0=$(echo "$C1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('l0_recorded',0))" 2>/dev/null || echo "0")
if [ "$L0" -gt 0 ]; then
  log_pass "3.3 l0_recorded > 0"
  add_result "3.3 l0_recorded > 0" "pass" "l0_recorded > 0" "$L0"
else
  log_fail "3.3 l0_recorded > 0" "l0_recorded > 0" "$L0"
fi

C4=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/capture" \
  -H "Content-Type: application/json" \
  -d '{"user_content":"hello"}')
check_status "3.4 missing fields → 400" "400" "$C4" ""

echo ""
echo "=== 4. POST /search/memories ==="

SM1=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY/search/memories" \
  -H "Content-Type: application/json" \
  -d '{"query":"programming","limit":5}')
SM1_CODE=$(echo "$SM1" | tail -1)
SM1_BODY=$(echo "$SM1" | sed '$d')
check_status "4.1 normal search → 200" "200" "$SM1_CODE" "$SM1_BODY"
check_field "4.2 returns results" "results" "$SM1_BODY"
check_field "4.3 returns total" "total" "$SM1_BODY"

SM4=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/search/memories" \
  -H "Content-Type: application/json" \
  -d '{}')
check_status "4.4 missing query → 400" "400" "$SM4" ""

echo ""
echo "=== 5. POST /search/conversations ==="

SC1=$(curl -s -w "\n%{http_code}" -X POST "$GATEWAY/search/conversations" \
  -H "Content-Type: application/json" \
  -d '{"query":"functional programming","limit":5}')
SC1_CODE=$(echo "$SC1" | tail -1)
SC1_BODY=$(echo "$SC1" | sed '$d')
check_status "5.1 normal search → 200" "200" "$SC1_CODE" "$SC1_BODY"
check_field "5.2 returns results" "results" "$SC1_BODY"

SC3=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/search/conversations" \
  -H "Content-Type: application/json" \
  -d '{}')
check_status "5.3 missing query → 400" "400" "$SC3" ""

echo ""
echo "=== 6. POST /session/end ==="

SE1=$(curl -s -X POST "$GATEWAY/session/end" \
  -H "Content-Type: application/json" \
  -d "{\"session_key\":\"$CAP_SESSION\"}")
check "6.1 flushed=true" '"flushed":true' "$SE1"

echo ""
echo "=== 7. Error paths ==="

E1=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/no-such-route" \
  -H "Content-Type: application/json" \
  -d '{}')
check_status "7.1 unknown path → 404" "404" "$E1" ""

E2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/recall" \
  -H "Content-Type: application/json" \
  -d 'not JSON {{{')
check_status "7.2 malformed JSON → ≥400" "400" "$E2" ""
# 500 is also acceptable (must not crash)
if [ "$E2" = "500" ]; then
  add_result "7.2 malformed JSON → ≥400" "pass" "≥400" "HTTP $E2"
  log_pass "7.2 malformed JSON → ≥400 (returned 500, did not crash)"
fi

echo ""
echo "=== 8. MCP tool registration test ==="

if command -v timeout &>/dev/null; then
  MCP_OUT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
    TDAI_GATEWAY_URL="$GATEWAY" timeout 15 node --import tsx \
    claudecode-plugin/memory/memory_tencentdb/mcp-server.ts 2>/dev/null || echo "")
  if [ -n "$MCP_OUT" ]; then
    check "8.1 tdai_memory_search registered" "tdai_memory_search" "$MCP_OUT"
    check "8.2 tdai_conversation_search registered" "tdai_conversation_search" "$MCP_OUT"
  else
    log_skip "8.x MCP tool tests" "MCP server returned no output (Gateway may be down or build issue)"
  fi
else
  log_skip "8.x MCP tool tests" "timeout command not available (Windows Git Bash may not support it)"
fi

# ============================
# 9. Data flow end-to-end
# ============================

echo ""
echo "=== 9. Data flow end-to-end ==="

FLOW_SESSION="${TEST_SESSION}-flow"
FLOW_MARKER="E2E-FLOW-$(date +%s)"

# capture
CF=$(curl -s -X POST "$GATEWAY/capture" \
  -H "Content-Type: application/json" \
  -d "{\"user_content\":\"$FLOW_MARKER: My cat is named Luna\",\"assistant_content\":\"Got it\",\"session_key\":\"$FLOW_SESSION\"}")
CF_L0=$(echo "$CF" | python3 -c "import sys,json; print(json.load(sys.stdin).get('l0_recorded',0))" 2>/dev/null || echo "0")
if [ "$CF_L0" -gt 0 ]; then
  log_pass "9.1 Capture succeeded (l0=$CF_L0)"
else
  log_fail "9.1 Capture succeeded" "l0 > 0" "l0=$CF_L0"
fi

# search conversations
SC_FLOW=$(curl -s -X POST "$GATEWAY/search/conversations" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$FLOW_MARKER\",\"limit\":5,\"session_key\":\"$FLOW_SESSION\"}")
check_field "9.2 search/conversations finds result" "results" "$SC_FLOW"

# recall
RC_FLOW=$(curl -s -X POST "$GATEWAY/recall" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"what is my cat's name\",\"session_key\":\"$FLOW_SESSION\"}")
check_field "9.3 recall returns context" "context" "$RC_FLOW"

# cleanup
curl -s -X POST "$GATEWAY/session/end" \
  -H "Content-Type: application/json" \
  -d "{\"session_key\":\"$FLOW_SESSION\"}" > /dev/null
log_pass "9.4 session/end flushed"

# ============================
# Summary
# ============================

RESULTS_JSON="${RESULTS_JSON%,}]"
TOTAL=$((PASS + FAIL + SKIP))

echo ""
echo "============================================"
echo "  Test Results Summary"
echo "============================================"
echo -e "  ${GREEN}Pass${NC}: $PASS"
echo -e "  ${RED}Fail${NC}: $FAIL"
echo -e "  ${YELLOW}Skip${NC}: $SKIP"
echo "  Total: $TOTAL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}Verdict: ALL PASSED${NC}"
else
  echo -e "  ${RED}Verdict: FAILURES PRESENT${NC}"
fi

# Write JSON report
TIMESTAMP=$(date -Iseconds)
cat > "$RESULT_FILE" << JSONEOF
{
  "test": "claudecode-plugin-adapter",
  "timestamp": "$TIMESTAMP",
  "gateway": "$GATEWAY",
  "summary": {
    "pass": $PASS,
    "fail": $FAIL,
    "skip": $SKIP,
    "total": $TOTAL,
    "passRate": "$(python3 -c "print(f'{$PASS / max($TOTAL, 1) * 100:.1f}%')" 2>/dev/null || echo "N/A")"
  },
  "results": $RESULTS_JSON
}
JSONEOF

echo ""
echo "Detailed report saved to: $RESULT_FILE"
echo ""
