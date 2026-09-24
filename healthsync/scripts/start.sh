#!/usr/bin/env bash
# ============================================================
#  HealthSync Indonesia — Start Script (Linux/Mac/WSL)
#
#  Gunakan ini setelah deploy.sh sudah dijalankan sebelumnya.
#  Jalankan untuk start/restart semua services:
#    cd healthsync
#    ./scripts/start.sh
#
#  Options:
#    ./scripts/start.sh --build    # rebuild Docker images dulu
#    ./scripts/start.sh --logs     # tampilkan logs setelah start
#    ./scripts/start.sh --down     # matikan semua services
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/infra/docker/.env.dev"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; GRAY='\033[0;90m'; NC='\033[0m'

step() { echo -e "\n${CYAN}▶  $1${NC}"; }
ok()   { echo -e "   ${GREEN}✓  $1${NC}"; }
fail() { echo -e "   ${RED}✗  $1${NC}"; exit 1; }
info() { echo -e "   ${GRAY}•  $1${NC}"; }
warn() { echo -e "   ${YELLOW}⚠  $1${NC}"; }

[[ -f "$ENV_FILE" ]] || fail "File $ENV_FILE belum ada. Jalankan: cp infra/docker/.env.dev.example infra/docker/.env.dev"

BUILD_FLAG=""
SHOW_LOGS=false
DO_DOWN=false

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    --logs)  SHOW_LOGS=true ;;
    --down)  DO_DOWN=true ;;
  esac
done

COMPOSE="docker compose -f \"$ROOT/infra/docker/docker-compose.dev.yml\" --env-file \"$ENV_FILE\""

# ── Matikan jika diminta ────────────────────────────────────
if $DO_DOWN; then
  step "Mematikan semua HealthSync services..."
  eval "$COMPOSE down"
  ok "Semua containers dihentikan."
  exit 0
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   HealthSync Indonesia — Starting Up...  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════
# STEP 1 — Cek Docker
# ═══════════════════════════════════════════════════════════
step "Memeriksa Docker daemon"
docker info &>/dev/null || fail "Docker daemon tidak berjalan. Jalankan Docker Desktop / dockerd."
ok "Docker daemon berjalan"

# ═══════════════════════════════════════════════════════════
# STEP 2 — Jalankan docker compose
# ═══════════════════════════════════════════════════════════
step "Menjalankan semua services"
info "Perintah: docker compose up -d $BUILD_FLAG"
eval "$COMPOSE up -d $BUILD_FLAG" 2>&1 | grep -E "Container|Network|Error|=>" | tail -20 || true
ok "Containers dimulai"

# ═══════════════════════════════════════════════════════════
# STEP 3 — Tunggu services siap
# ═══════════════════════════════════════════════════════════
step "Menunggu services siap"
info "Tunggu 20 detik untuk inisialisasi..."
sleep 20

declare -A SERVICES=(
  ["auth-service"]=3001         ["patient-service"]=3002
  ["consultation-service"]=3003 ["prescription-service"]=3004
  ["ambulance-service"]=3005    ["referral-service"]=3006
  ["hospital-service"]=3007     ["pharmacy-service"]=3008
  ["notification-service"]=3009 ["integration-service"]=3010
  ["iot-ingestion"]=4001        ["alert-service"]=4002
)

online=0
total=${#SERVICES[@]}
for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"
  code="000"
  for i in {1..4}; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:${port}/health" 2>/dev/null || echo "000")
    [[ "$code" == "200" ]] && break
    sleep 3
  done
  if [[ "$code" == "200" ]]; then
    ok "$svc:$port"; ((online++)) || true
  else
    warn "$svc:$port — belum merespons (HTTP $code)"
  fi
done

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
printf "${GREEN}║   HEALTHSYNC BERJALAN — %d/%d services online%-28s║${NC}\n" "$online" "$total" ""
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  🌐 Auth / Web Login  → ${CYAN}http://localhost:3001${NC}             ║"
echo -e "║  📊 Command Center   → ${CYAN}http://localhost:5173${NC}             ║"
echo -e "║  ⚙️  Admin Panel      → ${CYAN}http://localhost:5174${NC}             ║"
echo -e "║  📖 Swagger UI       → ${CYAN}http://localhost:4010/docs${NC}        ║"
echo -e "║  📧 MailHog          → ${CYAN}http://localhost:8025${NC}             ║"
echo -e "║  📡 EMQX Dashboard  → ${CYAN}http://localhost:18083${NC}             ║"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  👤 ${YELLOW}demo@healthsync.id${NC}  |  ${YELLOW}Demo@12345${NC}                    ║"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  ${GRAY}Lihat logs  : ./scripts/start.sh --logs${NC}                    ║"
echo -e "║  ${GRAY}Tes semua   : ./scripts/test.sh${NC}                            ║"
echo -e "║  ${GRAY}Matikan     : ./scripts/start.sh --down${NC}                    ║"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Tampilkan logs jika diminta ────────────────────────────
if $SHOW_LOGS; then
  info "Streaming logs (Ctrl+C untuk berhenti)..."
  eval "$COMPOSE logs -f --tail=50"
fi
