# ============================================================
#  HealthSync Indonesia — First-Time Deploy Script (Windows)
#  Jalankan: cd healthsync; .\scripts\deploy.ps1
# ============================================================
$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
function Write-Step { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red; exit 1 }

Write-Step "STEP 1/7 — Memeriksa prasyarat"
$prereqs = @(
  @{ name = "docker"; cmd = "docker --version" },
  @{ name = "node"; cmd = "node --version" },
  @{ name = "npm"; cmd = "npm --version" },
  @{ name = "go"; cmd = "go version" }
)
foreach ($p in $prereqs) {
  try { $out = Invoke-Expression $p.cmd 2>&1; Write-OK "$($p.name) — $out" }
  catch { Write-Fail "$($p.name) tidak ditemukan." }
}
try { docker info *>$null; Write-OK "Docker daemon sedang berjalan" } catch { Write-Fail "Docker daemon tidak berjalan." }

Write-Step "STEP 2/7 — Install Node.js dependencies (npm ci)"
Set-Location $ROOT
npm ci --prefer-offline
if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci gagal." }
Write-OK "Node modules terinstall"

Write-Step "STEP 3/7 — Build @healthsync/shared"
npm run build --workspace=packages/shared
if ($LASTEXITCODE -ne 0) { Write-Fail "Build shared gagal." }
Write-OK "Shared package sudah di-build"

Write-Step "STEP 4/7 — Build Docker images dan jalankan semua services"
docker compose -f infra/docker/docker-compose.dev.yml --env-file infra/docker/.env.dev up -d --build
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up gagal." }
Write-OK "Semua Docker containers dimulai"

Write-Step "STEP 5/7 — Menunggu database & infrastruktur siap"
foreach ($svc in @("hs-postgres", "hs-redis", "hs-kafka", "hs-emqx")) {
  $elapsed = 0
  do {
    Start-Sleep -Seconds 3; $elapsed += 3
    $status = docker inspect --format='{{.State.Health.Status}}' $svc 2>$null
    if (-not $status) { $status = docker inspect --format='{{.State.Status}}' $svc 2>$null }
    if ($elapsed -ge 120) { Write-Fail "Timeout menunggu $svc (120s)" }
  } while ($status -notin @("healthy", "running"))
  Write-OK "$svc siap ($status)"
}

Write-Step "STEP 6/7 — Menunggu seluruh migration V*.sql selesai"
$elapsed = 0
do {
  Start-Sleep -Seconds 5; $elapsed += 5
  $status = docker inspect --format='{{.State.Status}}' hs-migrate 2>$null
  if ($elapsed -ge 120) { Write-Fail "Timeout menunggu migration database (120s)." }
} while ($status -ne "exited")
$exitCode = docker inspect --format='{{.State.ExitCode}}' hs-migrate 2>$null
if ($exitCode -ne "0") { Write-Fail "Migration database gagal (exit code: $exitCode). Cek: docker logs hs-migrate" }
Write-OK "Seluruh migration V*.sql berhasil"

Write-Step "STEP 7/7 — Verifikasi semua services healthy"
Start-Sleep -Seconds 30
$services = @(
  @{ name = "auth-service"; port = 3001 }, @{ name = "patient-service"; port = 3002 },
  @{ name = "consultation-service"; port = 3003 }, @{ name = "prescription-service"; port = 3004 },
  @{ name = "ambulance-service"; port = 3005 }, @{ name = "referral-service"; port = 3006 },
  @{ name = "hospital-service"; port = 3007 }, @{ name = "pharmacy-service"; port = 3008 },
  @{ name = "notification-service"; port = 3009 }, @{ name = "integration-service"; port = 3010 },
  @{ name = "iot-ingestion"; port = 4001 }, @{ name = "alert-service"; port = 4002 }
)
$failed = 0
foreach ($svc in $services) {
  $ok = $false
  for ($retry = 0; $retry -lt 5 -and -not $ok; $retry++) {
    try { $r = Invoke-WebRequest -Uri "http://localhost:$($svc.port)/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop; $ok = ($r.StatusCode -eq 200) } catch { Start-Sleep -Seconds 3 }
  }
  if ($ok) { Write-OK "$($svc.name):$($svc.port) — HEALTHY" } else { Write-Host "   ✗  $($svc.name):$($svc.port) — TIDAK MERESPONS" -ForegroundColor Red; $failed++ }
}
if ($failed -gt 0) { Write-Fail "Deploy selesai dengan $failed service bermasalah." }
Write-Host "Deploy selesai: seluruh service merespons health check." -ForegroundColor Green
