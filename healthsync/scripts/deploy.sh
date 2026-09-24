#!/usr/bin/env bash
# ============================================================
#  HealthSync Indonesia — First-Time Deploy Script (Linux/Mac/WSL)
#
#  Jalankan SEKALI saat pertama kali setup project:
#    cd healthsync
#    chmod +x scripts/deploy.sh
#    ./scripts/deploy.sh
#
#  Skrip ini akan:
#    1. Cek prasyarat (Docker, Node, Go)
#    2. npm install semua workspace
#    3. Build shared package
#    4. Build semua Docker images
#    5. Jalankan infra (postgres, redis, kafka, emqx)
#    6. Tunggu infra siap, jalankan migrasi database
#    7. Jalankan semua application services
#    8. Verifikasi semua endpoint /health
#    9. Print ringkasan URL
# ============================================================

set -euo pipefail

# ── Resolve root dir ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Warna helper ────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; GRAY='\033[0;90m'; MAGENTA='\033[0;35m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}▶  $1${NC}"; }
ok()    { echo -e "   ${GREEN}✓  $1${NC}"; }
fail()  { echo -e "   ${RED}✗  $1${NC}"; exit 1; }
info()  { echo -e "   ${GRAY}•  $1${NC}"; }
warn()  { echo -e "   ${YELLOW}⚠  $1${NC}"; }
banner() {
  echo -e "${MAGENTA}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   HealthSync Indonesia — First-Time Deploy       ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

banner

# ═══════════════════════════════════════════════════════════
# STEP 1 — Cek prasyarat
# ═══════════════════════════════════════════════════════════
step "STEP 1/7 — Memeriksa prasyarat"

for cmd in docker node npm go; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "$cmd tidak ditemukan. Pastikan sudah terinstall dan ada di PATH."
  fi
  ok "$cmd — $($cmd --version 2>&1 | head -1)"
done

# Cek Docker daemon
if ! docker info &>/dev/null; then
  fail "Docker daemon tidak berjalan. Jalankan Docker Desktop / dockerd terlebih dahulu."
fi
ok "Docker daemon sedang berjalan"

# ═══════════════════════════════════════════════════════════
# STEP 2 — Install Node dependencies
# ═══════════════════════════════════════════════════════════
step "STEP 2/7 — Install Node.js dependencies (npm ci)"
cd "$ROOT"
npm ci --prefer-offline 2>&1 | tail -3
ok "Node modules terinstall"

# ═══════════════════════════════════════════════════════════
# STEP 3 — Build shared package
# ═══════════════════════════════════════════════════════════
step "STEP 3/7 — Build @healthsync/shared"
cd "$ROOT"
npm run build --workspace=packages/shared 2>&1 | tail -3
ok "Shared package sudah di-build"

# ═══════════════════════════════════════════════════════════
# STEP 4 — Build & jalankan semua Docker services
# ═══════════════════════════════════════════════════════════
step "STEP 4/7 — Build Docker images dan jalankan semua services"
info "Ini mungkin memakan waktu 5-10 menit untuk build pertama kali..."
cd "$ROOT"

docker compose \
  -f infra/docker/docker-compose.dev.yml \
  --env-file infra/docker/.env.dev \
  up -d --build 2>&1 | grep -E "Container|Error|Warning|=>| ✓" | tail -20

ok "Semua Docker containers dimulai"

# ═══════════════════════════════════════════════════════════
# STEP 5 — Tunggu infra siap
# ═══════════════════════════════════════════════════════════
step "STEP 5/7 — Menunggu database & infrastruktur siap"

wait_healthy() {
  local container="$1"
  local max=120
  local elapsed=0
  info "Menunggu $container ..."
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || \
             docker inspect --format='{{.State.Status}}'        "$container" 2>/dev/null || echo "unknown")
    [[ "$status" =~ ^(healthy|running)$ ]] && break
    sleep 3; elapsed=$((elapsed + 3))
    [[ $elapsed -ge $max ]] && fail "Timeout menunggu $container (${max}s)"
  done
  ok "$container siap ($status)"
}

wait_healthy hs-postgres
wait_healthy hs-redis
wait_healthy hs-kafka
wait_healthy hs-emqx

# ═══════════════════════════════════════════════════════════
# STEP 6 — Tunggu migrasi selesai
# ═══════════════════════════════════════════════════════════
step "STEP 6/7 — Menunggu migrasi database (V001-V007) selesai"

elapsed=0
while true; do
  status=$(docker inspect --format='{{.State.Status}}' hs-migrate 2>/dev/null || echo "unknown")
  [[ "$status" == "exited" ]] && break
  sleep 5; elapsed=$((elapsed + 5))
  [[ $elapsed -ge 120 ]] && fail "Timeout menunggu migrasi database (120s)."
done

exit_code=$(docker inspect --format='{{.State.ExitCode}}' hs-migrate 2>/dev/null || echo "1")
[[ "$exit_code" == "0" ]] || fail "Migrasi database gagal (exit code: $exit_code). Cek: docker logs hs-migrate"
ok "Migrasi database V001-V007 berhasil"

# ═══════════════════════════════════════════════════════════
# STEP 7 — Verifikasi semua services
# ═══════════════════════════════════════════════════════════
step "STEP 7/7 — Verifikasi semua services healthy"
info "Menunggu application services siap (30 detik)..."
sleep 30

declare -A SERVICES=(
  ["auth-service"]=3001
  ["patient-service"]=3002
  ["consultation-service"]=3003
  ["prescription-service"]=3004
  ["ambulance-service"]=3005
  ["referral-service"]=3006
  ["hospital-service"]=3007
  ["pharmacy-service"]=3008
  ["notification-service"]=3009
  ["integration-service"]=3010
  ["iot-ingestion"]=4001
  ["alert-service"]=4002
)

failed=0
for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"
  for i in {1..5}; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${port}/health" 2>/dev/null || echo "000")
    [[ "$code" == "200" ]] && break
    sleep 3
  done
  if [[ "$code" == "200" ]]; then
    ok "$svc:$port — HEALTHY"
  else
    echo -e "   ${RED}✗  $svc:$port — TIDAK MERESPONS (HTTP $code)${NC}"
    ((failed++)) || true
  fi
done

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
COLOR=$( [[ $failed -eq 0 ]] && echo "$GREEN" || echo "$YELLOW" )
echo ""
echo -e "${COLOR}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${COLOR}║   DEPLOY SELESAI$([ $failed -gt 0 ] && printf ' (dengan %d service bermasalah)       ' $failed || printf '                                    ')║${NC}"
echo -e "${COLOR}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  🌐 Auth Web Login    → ${CYAN}http://localhost:3001${NC}              ║"
echo -e "║  📊 Command Center   → ${CYAN}http://localhost:5173${NC}              ║"
echo -e "║  ⚙️  Admin Panel      → ${CYAN}http://localhost:5174${NC}              ║"
echo -e "║  📖 Swagger UI       → ${CYAN}http://localhost:4010/docs${NC}         ║"
echo -e "║  📧 MailHog (email)  → ${CYAN}http://localhost:8025${NC}              ║"
echo -e "║  📡 EMQX Dashboard  → ${CYAN}http://localhost:18083${NC}              ║"
echo -e "${COLOR}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  👤 Demo login: ${YELLOW}demo@healthsync.id${NC} / ${YELLOW}Demo@12345${NC}           ║"
echo -e "${COLOR}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "║  ${GRAY}Untuk menjalankan ulang  : ./scripts/start.sh${NC}              ║"
echo -e "║  ${GRAY}Untuk menjalankan tests  : ./scripts/test.sh${NC}               ║"
echo -e "║  ${GRAY}Untuk mematikan          : docker compose ... down${NC}         ║"
echo -e "${COLOR}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
