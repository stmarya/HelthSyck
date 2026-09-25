#!/usr/bin/env bash
# ============================================================
#  HealthSync Indonesia — First-Time Deploy Script (Linux/Mac/WSL)
#
#  Jalankan SEKALI saat pertama kali setup project:
#    cd healthsync
#    chmod +x scripts/deploy.sh
#    ./scripts/deploy.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; GRAY='\033[0;90m'; MAGENTA='\033[0;35m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}▶  $1${NC}"; }
ok()    { echo -e "   ${GREEN}✓  $1${NC}"; }
fail()  { echo -e "   ${RED}✗  $1${NC}"; exit 1; }
info()  { echo -e "   ${GRAY}•  $1${NC}"; }
banner() {
  echo -e "${MAGENTA}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   HealthSync Indonesia — First-Time Deploy       ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

banner
step "STEP 1/7 — Memeriksa prasyarat"
for cmd in docker node npm go; do
  command -v "$cmd" &>/dev/null || fail "$cmd tidak ditemukan. Pastikan sudah terinstall dan ada di PATH."
  ok "$cmd — $($cmd --version 2>&1 | head -1)"
done
docker info &>/dev/null || fail "Docker daemon tidak berjalan."
ok "Docker daemon sedang berjalan"

step "STEP 2/7 — Install Node.js dependencies (npm ci)"
cd "$ROOT"
npm ci --prefer-offline
ok "Node modules terinstall"

step "STEP 3/7 — Build @healthsync/shared"
npm run build --workspace=packages/shared
ok "Shared package sudah di-build"

step "STEP 4/7 — Build Docker images dan jalankan semua services"
info "Ini mungkin memakan waktu 5-10 menit untuk build pertama kali..."
docker compose -f infra/docker/docker-compose.dev.yml --env-file infra/docker/.env.dev up -d --build
ok "Semua Docker containers dimulai"

step "STEP 5/7 — Menunggu database & infrastruktur siap"
wait_healthy() {
  local container="$1" max=120 elapsed=0 status
  info "Menunggu $container ..."
  while true; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo unknown)
    [[ "$status" =~ ^(healthy|running)$ ]] && break
    sleep 3; elapsed=$((elapsed + 3))
    [[ $elapsed -ge $max ]] && fail "Timeout menunggu $container (${max}s)"
  done
  ok "$container siap ($status)"
}
for container in hs-postgres hs-redis hs-kafka hs-emqx; do wait_healthy "$container"; done

step "STEP 6/7 — Menunggu seluruh migration V*.sql selesai"
elapsed=0
while true; do
  status=$(docker inspect --format='{{.State.Status}}' hs-migrate 2>/dev/null || echo unknown)
  [[ "$status" == exited ]] && break
  sleep 5; elapsed=$((elapsed + 5))
  [[ $elapsed -ge 120 ]] && fail "Timeout menunggu migration database (120s)."
done
exit_code=$(docker inspect --format='{{.State.ExitCode}}' hs-migrate 2>/dev/null || echo 1)
[[ "$exit_code" == 0 ]] || fail "Migration database gagal (exit code: $exit_code). Cek: docker logs hs-migrate"
ok "Seluruh migration V*.sql berhasil"

step "STEP 7/7 — Verifikasi semua services healthy"
info "Menunggu application services siap (30 detik)..."
sleep 30
declare -A SERVICES=([auth-service]=3001 [patient-service]=3002 [consultation-service]=3003 [prescription-service]=3004 [ambulance-service]=3005 [referral-service]=3006 [hospital-service]=3007 [pharmacy-service]=3008 [notification-service]=3009 [integration-service]=3010 [iot-ingestion]=4001 [alert-service]=4002)
failed=0
for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"; code=000
  for _ in {1..5}; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${port}/health" 2>/dev/null || echo 000)
    [[ "$code" == 200 ]] && break
    sleep 3
  done
  if [[ "$code" == 200 ]]; then ok "$svc:$port — HEALTHY"; else echo -e "   ${RED}✗  $svc:$port — TIDAK MERESPONS (HTTP $code)${NC}"; ((failed++)) || true; fi
done

if [[ $failed -gt 0 ]]; then
  echo -e "${YELLOW}Deploy selesai dengan $failed service bermasalah.${NC}"
  exit 1
fi
echo -e "${GREEN}Deploy selesai: seluruh service merespons health check.${NC}"
