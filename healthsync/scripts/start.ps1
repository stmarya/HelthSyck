# ============================================================
#  HealthSync Indonesia — Start Script (Windows)
#
#  Gunakan ini setelah deploy.ps1 sudah dijalankan sebelumnya.
#  Jalankan untuk start/restart semua services:
#    cd healthsync
#    .\scripts\start.ps1
#
#  Options:
#    .\scripts\start.ps1 -Build    # rebuild Docker images dulu
#    .\scripts\start.ps1 -Logs     # tampilkan logs setelah start
#    .\scripts\start.ps1 -Down     # matikan semua services
# ============================================================

param(
  [switch]$Build,
  [switch]$Logs,
  [switch]$Down
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red; exit 1 }
function Write-Info  { param($msg) Write-Host "   •  $msg" -ForegroundColor Gray }

$COMPOSE_CMD = "docker compose -f `"$ROOT\infra\docker\docker-compose.dev.yml`" --env-file `"$ROOT\infra\docker\.env.dev`""

# ── Matikan dulu jika diminta ──────────────────────────────
if ($Down) {
  Write-Step "Mematikan semua HealthSync services..."
  Invoke-Expression "$COMPOSE_CMD down"
  Write-OK "Semua containers dihentikan."
  exit 0
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   HealthSync Indonesia — Starting Up...  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ═══════════════════════════════════════════════════════════
# STEP 1 — Cek Docker daemon
# ═══════════════════════════════════════════════════════════
Write-Step "Memeriksa Docker daemon"
try {
  docker info *>$null
  Write-OK "Docker daemon berjalan"
} catch {
  Write-Fail "Docker daemon tidak berjalan. Buka Docker Desktop terlebih dahulu."
}

# ═══════════════════════════════════════════════════════════
# STEP 2 — Jalankan docker compose
# ═══════════════════════════════════════════════════════════
Write-Step "Menjalankan semua services"

$buildFlag = if ($Build) { "--build" } else { "" }
$upCmd = "$COMPOSE_CMD up -d $buildFlag"

Write-Info "Perintah: $upCmd"
Invoke-Expression $upCmd 2>&1 | Select-String "Container|Network|Error" | Select-Object -Last 20

if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up gagal." }
Write-OK "Containers dimulai"

# ═══════════════════════════════════════════════════════════
# STEP 3 — Tunggu services siap
# ═══════════════════════════════════════════════════════════
Write-Step "Menunggu services siap"
Write-Info "Tunggu 20 detik untuk inisialisasi..."
Start-Sleep -Seconds 20

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

$online = 0
foreach ($svc in $services) {
  $ok = $false
  for ($i = 0; $i -lt 4; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$($svc.port)/health" -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 3 }
  }
  if ($ok) { Write-OK "$($svc.name):$($svc.port)"; $online++ }
  else      { Write-Host "   ⚠  $($svc.name):$($svc.port) — belum merespons" -ForegroundColor Yellow }
}

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   HEALTHSYNC BERJALAN — $online/$($services.Count) services online" + (" " * (28 - "$online/$($services.Count)".Length)) + "║" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  🌐 Auth / Web Login  → http://localhost:3001             ║"
Write-Host "║  📊 Command Center   → http://localhost:5173             ║"
Write-Host "║  ⚙️  Admin Panel      → http://localhost:5174             ║"
Write-Host "║  📖 Swagger UI       → http://localhost:4010/docs        ║"
Write-Host "║  📧 MailHog          → http://localhost:8025             ║"
Write-Host "║  📡 EMQX Dashboard  → http://localhost:18083             ║"
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  👤 demo@healthsync.id  |  Demo@12345                    ║"
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Lihat logs semua  : .\scripts\start.ps1 -Logs           ║" -ForegroundColor Gray
Write-Host "║  Jalankan tests    : .\scripts\test.ps1                  ║" -ForegroundColor Gray
Write-Host "║  Matikan semua     : .\scripts\start.ps1 -Down           ║" -ForegroundColor Gray
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ─── Tampilkan logs jika diminta ────────────────────────────
if ($Logs) {
  Write-Info "Streaming logs (Ctrl+C untuk berhenti)..."
  Invoke-Expression "$COMPOSE_CMD logs -f --tail=50"
}
