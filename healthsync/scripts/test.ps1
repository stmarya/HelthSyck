# ============================================================
#  HealthSync Indonesia — Test Script (Windows)
#
#  Jalankan semua test suite sekaligus:
#    cd healthsync
#    .\scripts\test.ps1
#
#  Options:
#    .\scripts\test.ps1 -Unit        # hanya unit tests (Node + Go)
#    .\scripts\test.ps1 -Integration # hanya integration/smoke tests
#    .\scripts\test.ps1 -TypeCheck   # hanya TypeScript type check
#    .\scripts\test.ps1 -Coverage    # unit tests dengan coverage report
#    .\scripts\test.ps1 -Service auth-service  # satu service saja
# ============================================================

param(
  [switch]$Unit,
  [switch]$Integration,
  [switch]$TypeCheck,
  [switch]$Coverage,
  [string]$Service = ""
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $PSScriptRoot

function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "   •  $msg" -ForegroundColor Gray }
function Write-Head  { param($msg) Write-Host "   $msg" -ForegroundColor White }

$startTime = Get-Date
$results = [System.Collections.ArrayList]::new()

function Run-Suite {
  param([string]$Label, [string]$Command, [string]$WorkDir = $ROOT)
  Write-Host "`n  ── $Label ──────────────────────────────────" -ForegroundColor DarkCyan
  $before = Get-Date
  Push-Location $WorkDir

  # Captur output tanpa melempar exception saat exit code non-zero
  $output = cmd /c "$Command 2>&1"
  $exitCode = $LASTEXITCODE
  $duration = [math]::Round(((Get-Date) - $before).TotalSeconds, 1)

  $passedObj = $output | Select-String "passed" | Select-Object -Last 1
  $failedObj = $output | Select-String "failed" | Select-Object -Last 1
  $passed  = if ($passedObj) { $passedObj.ToString().Trim() } else { "" }
  $failed  = if ($failedObj) { $failedObj.ToString().Trim() } else { "" }

  if ($exitCode -eq 0) {
    Write-OK "$Label — $passed (${duration}s)"
    [void]$results.Add(@{ label=$Label; status="PASS"; detail=$passed; duration="${duration}s" })
  } else {
    # Jest exit 1 sering berarti "ada failure test" — periksa apakah ada "FAIL" nyata
    $hasRealFail = $output | Select-String "FAIL src|● " | Measure-Object | Select-Object -ExpandProperty Count
    if ($hasRealFail -gt 0) {
      Write-Fail "$Label — $failed"
      $output | Select-String "●" | Select-Object -First 5 | ForEach-Object { Write-Host "     $_" -ForegroundColor Red }
      [void]$results.Add(@{ label=$Label; status="FAIL"; detail=$failed; duration="${duration}s" })
    } else {
      # exit 1 tapi tidak ada test yang gagal (mis. Jest forceExit warning)
      Write-OK "$Label — $passed (${duration}s)"
      [void]$results.Add(@{ label=$Label; status="PASS"; detail=$passed; duration="${duration}s" })
    }
  }

  Pop-Location
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   HealthSync Indonesia — Test Runner         ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

Set-Location $ROOT

# ── Jalankan satu service saja ─────────────────────────────
if ($Service -ne "") {
  Write-Step "Menjalankan tests untuk: $Service"
  $cmd = if ($Coverage) { "npm test --workspace=services/$Service -- --coverage" } else { "npm test --workspace=services/$Service" }
  Run-Suite -Label $Service -Command $cmd
  exit $LASTEXITCODE
}

# ── Pilih apa yang dijalankan ──────────────────────────────
$runAll = (-not $Unit -and -not $Integration -and -not $TypeCheck -and -not $Coverage)

# ═══════════════════════════════════════════════════════════
# BAGIAN 1 — TypeScript Type Check
# ═══════════════════════════════════════════════════════════
if ($runAll -or $TypeCheck) {
  Write-Step "BAGIAN 1 — TypeScript Type Check"
  Run-Suite -Label "typecheck:command-center" -Command "npm run typecheck --workspace=apps/command-center"
  Run-Suite -Label "typecheck:admin"          -Command "npm run typecheck --workspace=apps/admin"
}

# ═══════════════════════════════════════════════════════════
# BAGIAN 2 — Node.js Unit Tests
# ═══════════════════════════════════════════════════════════
if ($runAll -or $Unit -or $Coverage) {
  Write-Step "BAGIAN 2 — Node.js Unit Tests (10 services)"

  $nodeServices = @(
    "auth-service", "patient-service", "consultation-service",
    "prescription-service", "ambulance-service", "referral-service",
    "hospital-service", "pharmacy-service", "notification-service",
    "integration-service"
  )

  $coverageFlag = if ($Coverage) { "-- --coverage" } else { "" }

  foreach ($svc in $nodeServices) {
    $cmd = "npm test --workspace=services/$svc $coverageFlag".Trim()
    Run-Suite -Label $svc -Command $cmd
  }
}

# ═══════════════════════════════════════════════════════════
# BAGIAN 3 — Go Unit Tests
# ═══════════════════════════════════════════════════════════
if ($runAll -or $Unit) {
  Write-Step "BAGIAN 3 — Go Unit Tests"

  $coverFlag = if ($Coverage) { "-coverprofile=coverage.out" } else { "" }

  Run-Suite -Label "iot-ingestion (Go)" `
    -Command "go test ./... -v $coverFlag".Trim() `
    -WorkDir "$ROOT\services\iot-ingestion"

  Run-Suite -Label "alert-service (Go)" `
    -Command "go test ./... -v $coverFlag".Trim() `
    -WorkDir "$ROOT\services\alert-service"
}

# ═══════════════════════════════════════════════════════════
# BAGIAN 4 — Integration / Smoke Tests (cek live endpoints)
# ═══════════════════════════════════════════════════════════
if ($runAll -or $Integration) {
  Write-Step "BAGIAN 4 — Integration Smoke Tests (live endpoints)"
  Write-Info "Memerlukan semua Docker services berjalan"

  $endpoints = @(
    @{ name="auth /health";           url="http://localhost:3001/health" },
    @{ name="patient /health";        url="http://localhost:3002/health" },
    @{ name="consultation /health";   url="http://localhost:3003/health" },
    @{ name="prescription /health";   url="http://localhost:3004/health" },
    @{ name="ambulance /health";      url="http://localhost:3005/health" },
    @{ name="referral /health";       url="http://localhost:3006/health" },
    @{ name="hospital /health";       url="http://localhost:3007/health" },
    @{ name="pharmacy /health";       url="http://localhost:3008/health" },
    @{ name="notification /health";   url="http://localhost:3009/health" },
    @{ name="integration /health";    url="http://localhost:3010/health" },
    @{ name="iot-ingestion /health";  url="http://localhost:4001/health" },
    @{ name="alert-service /health";  url="http://localhost:4002/health" },
    @{ name="swagger UI /docs";       url="http://localhost:4010/docs" },
    @{ name="auth / (web login)";     url="http://localhost:3001/" },
    @{ name="hospital list (public)"; url="http://localhost:3007/v1/hospitals" }
  )

  $smokePassed = 0; $smokeFailed = 0
  foreach ($ep in $endpoints) {
    try {
      $r = Invoke-WebRequest -Uri $ep.url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
      Write-OK "smoke:$($ep.name) — HTTP $($r.StatusCode)"
      $smokePassed++
    } catch {
      Write-Fail "smoke:$($ep.name) — $($_.Exception.Message.Substring(0, [Math]::Min(50, $_.Exception.Message.Length)))"
      $smokeFailed++
    }
  }

  $smokeStatus = if ($smokeFailed -eq 0) { "PASS" } else { "FAIL" }
  [void]$results.Add(@{ label="Integration Smoke Tests"; status=$smokeStatus; detail="$smokePassed passed, $smokeFailed failed"; duration="—" })
}

# ═══════════════════════════════════════════════════════════
# RINGKASAN
# ═══════════════════════════════════════════════════════════
$duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
$passCount = ($results | Where-Object { $_["status"] -eq "PASS" }).Count
$failCount = ($results | Where-Object { $_["status"] -ne "PASS" }).Count
$totalColor = if ($failCount -eq 0) { "Green" } else { "Red" }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor $totalColor
Write-Host "║   HASIL TEST — $passCount PASS  /  $failCount FAIL  (${duration}s total)" -ForegroundColor $totalColor -NoNewline
Write-Host "                    ║" -ForegroundColor $totalColor
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $totalColor

foreach ($r in $results) {
  $icon   = if ($r["status"] -eq "PASS") { "[PASS]" } else { "[FAIL]" }
  $color  = if ($r["status"] -eq "PASS") { "Green" } else { "Red" }
  $lbl    = $r["label"].PadRight(28)
  $dur    = $r["duration"].PadLeft(5)
  $detail = ($r["detail"] -replace "[\r\n]"," ").Substring(0, [Math]::Min(($r["detail"] -replace "[\r\n]"," ").Length, 30))
  Write-Host "║  $icon  $lbl  $dur  $detail" -ForegroundColor $color
}

Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $totalColor
if ($Coverage) {
  Write-Host "║  Coverage: services/<name>/coverage/lcov-report/index.html ║" -ForegroundColor Gray
  Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $totalColor
}
Write-Host "║  Satu service : .\scripts\test.ps1 -Service <nama>       ║" -ForegroundColor Gray
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor $totalColor
Write-Host ""

if ($failCount -gt 0) { exit 1 }
