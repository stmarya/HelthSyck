# ============================================================
#  HealthSync Indonesia — Seed Admin Account
#
#  Buat akun ADMIN untuk testing Apps Admin Panel.
#  Jalankan SETELAH deploy.ps1 / start.ps1 berhasil:
#
#    cd healthsync
#    .\scripts\seed-admin.ps1
#
#  Opsional — custom email/password:
#    .\scripts\seed-admin.ps1 -Email "myadmin@healthsync.id" -Password "MyPass@999"
# ============================================================

param(
  [string]$Email    = "admin@healthsync.id",
  [string]$Password = "Admin@12345",
  [string]$Name     = "HealthSync Administrator",
  [string]$AuthUrl  = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red; exit 1 }
function Write-Info  { param($msg) Write-Host "   •  $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   HealthSync — Seed Admin Account               ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── STEP 1: Cek auth-service hidup ──────────────────────────
Write-Step "Memeriksa koneksi ke auth-service ($AuthUrl)"
try {
  $health = Invoke-WebRequest -Uri "$AuthUrl/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
  if ($health.StatusCode -ne 200) { Write-Fail "Auth-service merespons status $($health.StatusCode)" }
  Write-OK "auth-service aktif"
} catch {
  Write-Fail "Tidak bisa terhubung ke auth-service di $AuthUrl. Pastikan stack sudah running: .\scripts\start.ps1"
}

# ── STEP 2: Register akun ADMIN ──────────────────────────────
Write-Step "Mendaftarkan akun ADMIN: $Email"

$body = @{
  email    = $Email
  password = $Password
  name     = $Name
  role     = "ADMIN"
} | ConvertTo-Json

try {
  $response = Invoke-WebRequest `
    -Uri          "$AuthUrl/v1/auth/register" `
    -Method       POST `
    -Body         $body `
    -ContentType  "application/json" `
    -UseBasicParsing `
    -ErrorAction  Stop

  $data = ($response.Content | ConvertFrom-Json).data
  Write-OK "Akun ADMIN berhasil dibuat!"
  Write-Info "User ID   : $($data.userId)"
  Write-Info "Email     : $($data.email)"
  Write-Info "Role      : $($data.role)"

} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  $errBody    = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue

  if ($statusCode -eq 409) {
    Write-Host "   ⚠  Email '$Email' sudah terdaftar sebelumnya." -ForegroundColor Yellow
    Write-Info "Gunakan akun yang sudah ada, atau jalankan ulang dengan -Email yang berbeda."
  } else {
    $detail = if ($errBody) { $errBody.detail } else { $_.Exception.Message }
    Write-Fail "Gagal membuat akun ADMIN (HTTP $statusCode): $detail"
  }
}

# ── STEP 3: Verifikasi login ─────────────────────────────────
Write-Step "Verifikasi login dengan akun baru"

$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json

try {
  $loginRes = Invoke-WebRequest `
    -Uri         "$AuthUrl/v1/auth/login" `
    -Method      POST `
    -Body        $loginBody `
    -ContentType "application/json" `
    -UseBasicParsing `
    -ErrorAction Stop

  $loginData = ($loginRes.Content | ConvertFrom-Json).data
  if ($loginData.role -ne "ADMIN") {
    Write-Fail "Login berhasil tapi role = '$($loginData.role)' (bukan ADMIN). Ada masalah dengan registrasi."
  }
  Write-OK "Login berhasil! Role terverifikasi: ADMIN"

} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Fail "Login gagal (HTTP $statusCode). Pastikan password benar."
}

# ── RINGKASAN ────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   AKUN ADMIN SIAP DIGUNAKAN                                 ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  URL Admin Panel  : http://localhost:5174                   ║" -ForegroundColor White
Write-Host "║  Email            : $($Email.PadRight(44)) ║" -ForegroundColor White
Write-Host "║  Password         : $($Password.PadRight(44)) ║" -ForegroundColor White
Write-Host "║  Role             : ADMIN                                   ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
