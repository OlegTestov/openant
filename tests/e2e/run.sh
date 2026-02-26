#!/usr/bin/env bash
# End-to-end test for openant
# Designed for a fresh installation — walks through the full wizard flow.
# Requires: curl, jq
# Usage: sudo bash tests/e2e/run.sh

set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Counters ─────────────────────────────────────────────────────────────────

TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# ── Helpers ──────────────────────────────────────────────────────────────────

check_deps() {
  if ! command -v curl &>/dev/null; then
    echo -e "${RED}[ERROR]${NC} curl is required but not installed."
    exit 1
  fi
  if ! command -v jq &>/dev/null; then
    echo -e "${RED}[ERROR]${NC} jq is required but not installed."
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "Install it: brew install jq"
    else
      echo "Install it: apt-get install -y jq"
    fi
    exit 1
  fi
}

run_test() {
  local name="$1"
  shift
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if "$@" 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}  $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}FAIL${NC}  $name"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

api_get() {
  curl -sf -H "Authorization: Bearer ${SETUP_TOKEN}" "${BASE_URL}$1"
}

api_post() {
  local path="$1"
  local body="$2"
  curl -sf -X POST \
    -H "Authorization: Bearer ${SETUP_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BASE_URL}${path}"
}

# ── Test functions ───────────────────────────────────────────────────────────

test_health() {
  local resp
  resp=$(curl -sf "${BASE_URL}/api/health")
  echo "$resp" | jq -e '.status == "ok"' >/dev/null
}

test_welcome() {
  local resp
  resp=$(api_post "/api/setup/welcome" '{"language":"en"}')
  echo "$resp" | jq -e '.success == true' >/dev/null
}

test_domain() {
  local resp
  resp=$(api_post "/api/setup/domain" '{"use_domain":false}')
  echo "$resp" | jq -e '.success == true' >/dev/null
}

test_llm() {
  local resp
  resp=$(api_post "/api/setup/llm" '{
    "provider": "openai",
    "api_url": "https://api.openai.com/v1",
    "api_key": "sk-test-placeholder",
    "model": "gpt-4o-mini"
  }')
  echo "$resp" | jq -e '.success == true' >/dev/null
}

test_blog() {
  local resp
  resp=$(api_post "/api/setup/blog" '{
    "title": "E2E Test Blog",
    "description": "Automated test blog",
    "language": "en",
    "tone": "professional",
    "publish_interval_minutes": 300
  }')
  echo "$resp" | jq -e '.success == true' >/dev/null
}

test_social() {
  local resp
  resp=$(api_post "/api/setup/social" '{
    "make_webhook_url": "",
    "pinterest_enabled": false,
    "threads_enabled": false
  }')
  echo "$resp" | jq -e '.success == true' >/dev/null
}

test_deploy() {
  local tmpfile
  tmpfile=$(mktemp)

  # Stream the SSE response; timeout after 5 minutes
  curl -sS -N --max-time 300 \
    -X POST \
    -H "Authorization: Bearer ${SETUP_TOKEN}" \
    "${BASE_URL}/api/setup/apply" > "$tmpfile" 2>&1 || true

  local result=1

  if grep -q '"success":true' "$tmpfile"; then
    result=0
  else
    echo ""
    echo -e "    ${YELLOW}Deploy output (last 10 lines):${NC}"
    tail -10 "$tmpfile" | sed 's/^/    /'
  fi

  rm -f "$tmpfile"
  return $result
}

test_dashboard_status() {
  local resp
  resp=$(api_get "/api/dashboard/status")
  echo "$resp" | jq -e '.success == true' >/dev/null
  echo "$resp" | jq -e '.data.ghost == "healthy"' >/dev/null
  echo "$resp" | jq -e '.data.nocodb == "healthy"' >/dev/null
  echo "$resp" | jq -e '.data.n8n == "healthy"' >/dev/null
}

test_dashboard_stats() {
  local resp
  resp=$(api_get "/api/dashboard/stats")
  echo "$resp" | jq -e '.success == true' >/dev/null
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "=============================="
  echo "   openant E2E tests"
  echo "=============================="
  echo ""

  check_deps

  local env_file="${INSTALL_DIR:-/opt/openant}/.env"

  if [[ ! -f "$env_file" ]]; then
    echo -e "${RED}[ERROR]${NC} .env not found at $env_file"
    echo "Run install.sh first."
    exit 1
  fi

  SETUP_TOKEN=$(grep '^SETUP_TOKEN=' "$env_file" | cut -d= -f2)
  SERVER_IP=$(grep '^SERVER_IP=' "$env_file" | cut -d= -f2)
  BASE_URL="http://${SERVER_IP}:3000"

  if [[ -z "$SETUP_TOKEN" ]]; then
    echo -e "${RED}[ERROR]${NC} SETUP_TOKEN is empty in $env_file"
    exit 1
  fi

  echo "  Target: $BASE_URL"
  echo ""

  # Tests must run in order — each step advances the wizard
  echo "Step 1: Health"
  run_test "GET /api/health" test_health

  echo "Step 2: Welcome"
  run_test "POST /api/setup/welcome" test_welcome

  echo "Step 3: Domain"
  run_test "POST /api/setup/domain (IP mode)" test_domain

  echo "Step 4: LLM"
  run_test "POST /api/setup/llm" test_llm

  echo "Step 5: Blog"
  run_test "POST /api/setup/blog" test_blog

  echo "Step 6: Social"
  run_test "POST /api/setup/social" test_social

  echo "Step 7: Deploy (SSE stream, may take several minutes)"
  run_test "POST /api/setup/apply" test_deploy

  echo "Step 8: Dashboard"
  run_test "GET /api/dashboard/status" test_dashboard_status

  echo "Step 9: Stats"
  run_test "GET /api/dashboard/stats" test_dashboard_stats

  # ── Summary ──────────────────────────────────────────────────────────────

  echo ""
  echo "============================================"
  echo "  E2E Test Results"
  echo "============================================"
  echo "  Total:  $TESTS_TOTAL"
  echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
  fi
  echo "============================================"
  echo ""

  if [[ $TESTS_FAILED -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
