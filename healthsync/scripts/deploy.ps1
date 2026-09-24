# ============================================================
#  HealthSync Indonesia — First-Time Deploy Script (Windows)
#
#  Jalankan SEKALI saat pertama kali setup project:
#    cd healthsync
#    .\scripts\deploy.ps1
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

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT "infra\docker\.env.dev"

# ── Warna helper ────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red; exit 1 }
function Write-Info  { param($msg) Write-Host "   •  $msg" -ForegroundColor Gray }
function Write-Banner {
  Write-Host ""
  Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
  Write-Host "║   HealthSync Indonesia — First-Time Deploy       ║" -ForegroundColor Magenta
  Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Magenta
  Write-Host ""
}

if (-not (Test-Path $ENV_FILE)) {
  Write-Fail "File $ENV_FILE belum ada. Jalankan: Copy-Item infra/docker/.env.dev.example infra/docker/.env.dev"
}

Write-Banner

# ═══════════════════════════════════════════════════════════
# STEP 1 — Cek prasyarat
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 1/7 — Memeriksa prasyarat"

$prereqs = @(
  @{ name = "docker";  cmd = "docker --version" },
  @{ name = "node";    cmd = "node --version" },
  @{ name = "npm";     cmd = "npm --version" },
  @{ name = "go";      cmd = "go version" }
)

foreach ($p in $prereqs) {
  try {
    $out = Invoke-Expression $p.cmd 2>&1
    Write-OK "$($p.name) — $out"
  } catch {
    Write-Fail "$($p.name) tidak ditemukan. Pastikan sudah terinstall dan ada di PATH."
  }
}

# Cek Docker daemon berjalan
try {
  docker info *>$null
  Write-OK "Docker daemon sedang berjalan"
} catch {
  Write-Fail "Docker daemon tidak berjalan. Buka Docker Desktop terlebih dahulu."
}

# ═══════════════════════════════════════════════════════════
# STEP 2 — Install Node dependencies
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 2/7 — Install Node.js dependencies (npm ci)"
Set-Location $ROOT
npm ci --prefer-offline 2>&1 | Select-String "added|warn|error" | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) { Write-Fail "npm ci gagal." }
Write-OK "Node modules terinstall"

# ═══════════════════════════════════════════════════════════
# STEP 3 — Build shared package
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 3/7 — Build @healthsync/shared"
Set-Location $ROOT
npm run build --workspace=packages/shared 2>&1 | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Fail "Build shared gagal." }
Write-OK "Shared package sudah di-build"

# ═══════════════════════════════════════════════════════════
# STEP 4 — Build & jalankan semua Docker services
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 4/7 — Build Docker images dan jalankan semua services"
Write-Info "Ini mungkin memakan waktu 5-10 menit untuk build pertama kali..."
Set-Location $ROOT

docker compose `
  -f infra/docker/docker-compose.dev.yml `
  --env-file `"$ENV_FILE`" `
  up -d --build 2>&1 | Select-String "Container|Error|Warning" | Select-Object -Last 20

if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up gagal." }
Write-OK "Semua Docker containers dimulai"

# ═══════════════════════════════════════════════════════════
# STEP 5 — Tunggu infra siap
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 5/7 — Menunggu database & infrastruktur siap"

$infraServices = @("hs-postgres", "hs-redis", "hs-kafka", "hs-emqx")
$maxWait = 120  # detik
$waited = 0

foreach ($svc in $infraServices) {
  Write-Info "Menunggu $svc ..."
  $elapsed = 0
  do {
    Start-Sleep -Seconds 3
    $elapsed += 3
    $status = docker inspect --format='{{.State.Health.Status}}' $svc 2>$null
    if ($status -eq $null) { $status = docker inspect --format='{{.State.Status}}' $svc 2>$null }
    if ($elapsed -ge $maxWait) { Write-Fail "Timeout menunggu $svc (${maxWait}s)" }
  } while ($status -notin @("healthy", "running"))
  Write-OK "$svc siap ($status)"
}

# ═══════════════════════════════════════════════════════════
# STEP 6 — Tunggu migrasi database selesai
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 6/7 — Menunggu migrasi database (V001-V012) selesai"

$elapsed = 0
do {
  Start-Sleep -Seconds 5
  $elapsed += 5
  $status = docker inspect --format='{{.State.Status}}' hs-migrate 2>$null
  if ($elapsed -ge 120) { Write-Fail "Timeout menunggu migrasi database (120s)." }
} while ($status -ne "exited")

$exitCode = docker inspect --format='{{.State.ExitCode}}' hs-migrate 2>$null
if ($exitCode -ne "0") { Write-Fail "Migrasi database gagal (exit code: $exitCode). Cek: docker logs hs-migrate" }
Write-OK "Migrasi database V001-V012 berhasil"

# ═══════════════════════════════════════════════════════════
# STEP 7 — Verifikasi semua services
# ═══════════════════════════════════════════════════════════
Write-Step "STEP 7/7 — Verifikasi semua services healthy"
Write-Info "Menunggu application services siap (30 detik)..."
Start-Sleep -Seconds 30

$services = @(
  @{ name = "auth-service";           port = 3001 },
  @{ name = "patient-service";        port = 3002 },
  @{ name = "consultation-service";   port = 3003 },
  @{ name = "prescription-service";   port = 3004 },
  @{ name = "ambulance-service";      port = 3005 },
  @{ name = "referral-service";       port = 3006 },
  @{ name = "hospital-service";       port = 3007 },
  @{ name = "pharmacy-service";       port = 3008 },
  @{ name = "notification-service";   port = 3009 },
  @{ name = "integration-service";    port = 3010 },
  @{ name = "iot-ingestion";          port = 4001 },
  @{ name = "alert-service";          port = 4002 }
)

$failed = 0
foreach ($svc in $services) {
  $retries = 0
  $ok = $false
  while ($retries -lt 5 -and -not $ok) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$($svc.port)/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
      if ($r.StatusCode -eq 200) { $ok = $true }
    } catch { }
    if (-not $ok) { Start-Sleep -Seconds 3; $retries++ }
  }
  if ($ok) { Write-OK "$($svc.name):$($svc.port) — HEALTHY" }
  else { Write-Host "   ✗  $($svc.name):$($svc.port) — TIDAK MERESPONS" -ForegroundColor Red; $failed++ }
}

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "║   DEPLOY SELESAI$(if ($failed -gt 0) { " (dengan $failed service bermasalah)" } else { "                          " })  ║" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "║  🌐 Auth Web Login    → http://localhost:3001              ║" -ForegroundColor White
Write-Host "║  📊 Command Center   → http://localhost:5173              ║" -ForegroundColor White
Write-Host "║  ⚙️  Admin Panel      → http://localhost:5174              ║" -ForegroundColor White
Write-Host "║  📖 Swagger UI       → http://localhost:4010/docs         ║" -ForegroundColor White
Write-Host "║  📧 MailHog (email)  → http://localhost:8025              ║" -ForegroundColor White
Write-Host "║  📡 EMQX Dashboard  → http://localhost:18083              ║" -ForegroundColor White
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "║  👤 Demo login: demo@healthsync.id / Demo@12345            ║" -ForegroundColor White
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host "║  Untuk menjalankan ulang : .\scripts\start.ps1            ║" -ForegroundColor Gray
Write-Host "║  Untuk menjalankan tests : .\scripts\test.ps1             ║" -ForegroundColor Gray
Write-Host "║  Untuk mematikan         : docker compose -f infra/docker/docker-compose.dev.yml down ║" -ForegroundColor Gray
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""
