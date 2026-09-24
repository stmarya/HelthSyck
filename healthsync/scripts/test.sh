#!/usr/bin/env bash
# ============================================================
#  HealthSync Indonesia — Test Script (Linux/Mac/WSL)
#
#  Jalankan semua test suite sekaligus:
#    cd healthsync
#    chmod +x scripts/test.sh
#    ./scripts/test.sh
#
#  Options:
#    ./scripts/test.sh --unit          # hanya unit tests (Node + Go)
#    ./scripts/test.sh --integration   # hanya integration/smoke tests
#    ./scripts/test.sh --typecheck     # hanya TypeScript type check
#    ./scripts/test.sh --coverage      # unit tests dengan coverage report
#    ./scripts/test.sh --service auth-service  # satu service saja
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; GRAY='\033[0;90m'; DARK_CYAN='\033[0;36m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}▶  $1${NC}"; }
ok()    { echo -e "   ${GREEN}✓  $1${NC}"; }
fail()  { echo -e "   ${RED}✗  $1${NC}"; }
info()  { echo -e "   ${GRAY}•  $1${NC}"; }

# ── Parse argumen ────────────────────────────────────────────
RUN_UNIT=false; RUN_INTEGRATION=false; RUN_TYPECHECK=false
RUN_COVERAGE=false; SERVICE=""

for arg in "$@"; do
  case "$arg" in
    --unit)        RUN_UNIT=true ;;
    --integration) RUN_INTEGRATION=true ;;
    --typecheck)   RUN_TYPECHECK=true ;;
    --coverage)    RUN_COVERAGE=true; RUN_UNIT=true ;;
    --service)     : ;;  # next arg
    *)
      # Tangkap nilai setelah --service
      if [[ "${PREV_ARG:-}" == "--service" ]]; then SERVICE="$arg"; fi
      ;;
  esac
  PREV_ARG="$arg"
done

# Jika tidak ada flag, jalankan semua
if ! $RUN_UNIT && ! $RUN_INTEGRATION && ! $RUN_TYPECHECK && [[ -z "$SERVICE" ]]; then
  RUN_UNIT=true; RUN_INTEGRATION=true; RUN_TYPECHECK=true
fi

START_TIME=$(date +%s)
PASS_COUNT=0; FAIL_COUNT=0
declare -a RESULT_LABELS=(); declare -a RESULT_STATUS=(); declare -a RESULT_DETAIL=()

run_suite() {
  local label="$1"; local cmd="$2"; local workdir="${3:-$ROOT}"
  echo -e "\n  ${DARK_CYAN}── $label ────────────────────────────────────${NC}"
  local t_start=$(date +%s)
  pushd "$workdir" >/dev/null

  set +e
  output=$(eval "$cmd" 2>&1)
  local code=$?
  set -e

  local t_end=$(date +%s)
  local duration=$((t_end - t_start))
  local passed=$(echo "$output" | grep -oE '[0-9]+ passed' | tail -1 || echo "")
  local failed=$(echo "$output" | grep -oE '[0-9]+ failed' | tail -1 || echo "")

  if [[ $code -eq 0 ]]; then
    ok "$label — ${passed:-OK} (${duration}s)"
    RESULT_LABELS+=("$label"); RESULT_STATUS+=("PASS"); RESULT_DETAIL+=("${passed:-OK} ${duration}s")
    ((PASS_COUNT++)) || true
  else
    fail "$label — ${failed:-Error}"
    echo "$output" | grep -E "●|FAIL|Error|---" | head -8 | sed 's/^/     /' | while IFS= read -r line; do echo -e "     ${RED}$line${NC}"; done
    RESULT_LABELS+=("$label"); RESULT_STATUS+=("FAIL"); RESULT_DETAIL+=("${failed:-error} ${duration}s")
    ((FAIL_COUNT++)) || true
  fi
  popd >/dev/null
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   HealthSync Indonesia — Test Runner         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

cd "$ROOT"

# ── Jalankan satu service saja ─────────────────────────────
if [[ -n "$SERVICE" ]]; then
  step "Menjalankan tests untuk: $SERVICE"
  if $RUN_COVERAGE; then
    run_suite "$SERVICE" "npm test --workspace=services/$SERVICE -- --coverage"
  else
    run_suite "$SERVICE" "npm test --workspace=services/$SERVICE"
  fi
  exit $?
fi

# ═══════════════════════════════════════════════════════════
# BAGIAN 1 — TypeScript Type Check
# ═══════════════════════════════════════════════════════════
if $RUN_TYPECHECK; then
  step "BAGIAN 1 — TypeScript Type Check"
  run_suite "typecheck:command-center" "npm run typecheck --workspace=apps/command-center"
  run_suite "typecheck:admin"          "npm run typecheck --workspace=apps/admin"
fi

# ═══════════════════════════════════════════════════════════
# BAGIAN 2 — Node.js Unit Tests
# ═══════════════════════════════════════════════════════════
if $RUN_UNIT; then
  step "BAGIAN 2 — Node.js Unit Tests (10 services)"

  NODE_SERVICES=(
    "auth-service"          "patient-service"
    "consultation-service"  "prescription-service"
    "ambulance-service"     "referral-service"
    "hospital-service"      "pharmacy-service"
    "notification-service"  "integration-service"
  )

  COV_FLAG=""
  $RUN_COVERAGE && COV_FLAG="-- --coverage"

  for svc in "${NODE_SERVICES[@]}"; do
    run_suite "$svc" "npm test --workspace=services/$svc $COV_FLAG"
  done
fi

# ═══════════════════════════════════════════════════════════
# BAGIAN 3 — Go Unit Tests
# ═══════════════════════════════════════════════════════════
if $RUN_UNIT; then
  step "BAGIAN 3 — Go Unit Tests"

  GO_COV=""
  $RUN_COVERAGE && GO_COV="-coverprofile=coverage.out"

  run_suite "iot-ingestion (Go)" \
    "go test ./... -v $GO_COV" \
    "$ROOT/services/iot-ingestion"

  run_suite "alert-service (Go)" \
    "go test ./... -v $GO_COV" \
    "$ROOT/services/alert-service"
fi

# ═══════════════════════════════════════════════════════════
# BAGIAN 4 — Integration / Smoke Tests
# ═══════════════════════════════════════════════════════════
if $RUN_INTEGRATION; then
  step "BAGIAN 4 — Integration Smoke Tests (live endpoints)"
  info "Memerlukan semua Docker services berjalan"

  smoke_pass=0; smoke_fail=0
  declare -A SMOKE_ENDPOINTS=(
    ["auth /health"]="http://localhost:3001/health"
    ["patient /health"]="http://localhost:3002/health"
    ["consultation /health"]="http://localhost:3003/health"
    ["prescription /health"]="http://localhost:3004/health"
    ["ambulance /health"]="http://localhost:3005/health"
    ["referral /health"]="http://localhost:3006/health"
    ["hospital /health"]="http://localhost:3007/health"
    ["pharmacy /health"]="http://localhost:3008/health"
    ["notification /health"]="http://localhost:3009/health"
    ["integration /health"]="http://localhost:3010/health"
    ["iot-ingestion /health"]="http://localhost:4001/health"
    ["alert-service /health"]="http://localhost:4002/health"
    ["swagger UI /docs"]="http://localhost:4010/docs"
    ["auth / (web login)"]="http://localhost:3001/"
    ["hospital list (public)"]="http://localhost:3007/v1/hospitals"
  )

  for ep in "${!SMOKE_ENDPOINTS[@]}"; do
    url="${SMOKE_ENDPOINTS[$ep]}"
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
    if [[ "$code" =~ ^(200|301|302)$ ]]; then
      ok "smoke:$ep — HTTP $code"; ((smoke_pass++)) || true
    else
      fail "smoke:$ep — HTTP $code (${url})"; ((smoke_fail++)) || true
    fi
  done

  smoke_status="PASS"; [[ $smoke_fail -gt 0 ]] && smoke_status="FAIL"
  RESULT_LABELS+=("Integration Smoke Tests")
  RESULT_STATUS+=("$smoke_status")
  RESULT_DETAIL+=("$smoke_pass passed, $smoke_fail failed")
  [[ $smoke_status == "PASS" ]] && ((PASS_COUNT++)) || { ((FAIL_COUNT++)) || true; }
fi

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
COLOR=$( [[ $FAIL_COUNT -eq 0 ]] && echo "$GREEN" || echo "$RED" )

echo ""
echo -e "${COLOR}╔══════════════════════════════════════════════════════════╗${NC}"
printf "${COLOR}║   HASIL TEST — %d PASS  /  %d FAIL  (%ds total)%*s║${NC}\n" \
  "$PASS_COUNT" "$FAIL_COUNT" "$TOTAL_DURATION" $((28 - ${#PASS_COUNT} - ${#FAIL_COUNT} - ${#TOTAL_DURATION})) ""
echo -e "${COLOR}╠══════════════════════════════════════════════════════════╣${NC}"

for i in "${!RESULT_LABELS[@]}"; do
  label="${RESULT_LABELS[$i]}"
  status="${RESULT_STATUS[$i]}"
  detail="${RESULT_DETAIL[$i]}"
  if [[ "$status" == "PASS" ]]; then
    printf "${GREEN}║  ✓  %-30s %-6s  %s${NC}\n" "$label" "$status" "$detail"
  else
    printf "${RED}║  ✗  %-30s %-6s  %s${NC}\n" "$label" "$status" "$detail"
  fi
done

echo -e "${COLOR}╠══════════════════════════════════════════════════════════╣${NC}"
if $RUN_COVERAGE; then
  echo -e "║  ${GRAY}Coverage reports: services/<name>/coverage/lcov-report/${NC}    ║"
  echo -e "${COLOR}╠══════════════════════════════════════════════════════════╣${NC}"
fi
echo -e "║  ${GRAY}Satu service  : ./scripts/test.sh --service <nama>${NC}         ║"
echo -e "║  ${GRAY}Dengan coverage: ./scripts/test.sh --coverage${NC}              ║"
echo -e "${COLOR}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

[[ $FAIL_COUNT -eq 0 ]] && exit 0 || exit 1
