# InspectPro · One-click setup script (Windows / PowerShell)
#
# What this does:
#   1. Verifies Node.js + npm are installed (helps you install them if missing).
#   2. Downloads the matching PocketBase binary into apps/pocketbase/.
#   3. Runs `npm install` at the project root (installs both workspaces).
#   4. Prints next steps for starting the servers.
#
# Usage (from the project root, in PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Optional flags:
#   -PocketBaseVersion 0.26.9   # pin a specific PB version
#   -SkipInstall                # skip npm install
#   -Force                      # re-download PocketBase even if it exists

[CmdletBinding()]
param(
  [string]$PocketBaseVersion = "0.26.9",
  [switch]$SkipInstall,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"   # faster Invoke-WebRequest

function Write-Step($n, $msg) {
  Write-Host ""
  Write-Host "==[ Step $n ]== $msg" -ForegroundColor Cyan
}
function Write-OK($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Warn2($m)  { Write-Host "  [WARN] $m"   -ForegroundColor Yellow }
function Write-Fail($m)   { Write-Host "  [FAIL] $m"   -ForegroundColor Red }

# ─── 0. Sanity check: we're at the project root ───────────────────────────────
if (-not (Test-Path ".\package.json") -or -not (Test-Path ".\apps\pocketbase")) {
  Write-Fail "Run this from the project root (the folder that contains package.json and apps\)."
  exit 1
}
$Root = (Get-Location).Path
Write-Host "InspectPro setup starting in $Root" -ForegroundColor Magenta

# ─── 1. Check Node.js + npm ───────────────────────────────────────────────────
Write-Step 1 "Checking Node.js & npm"
try {
  $nodeVer = (node -v) 2>$null
  $npmVer  = (npm -v) 2>$null
} catch { $nodeVer = $null; $npmVer = $null }

if (-not $nodeVer) {
  Write-Fail "Node.js is not installed (or not on PATH)."
  Write-Host  "        Install Node.js 20 LTS from: https://nodejs.org/en/download"
  Write-Host  "        Then re-run this script."
  exit 1
}
Write-OK "node $nodeVer / npm $npmVer"

$nodeMajor = [int]($nodeVer.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) {
  Write-Warn2 "Node $nodeVer is older than recommended. Please install Node 20 LTS."
}

# ─── 2. Download PocketBase binary ────────────────────────────────────────────
Write-Step 2 "Installing PocketBase $PocketBaseVersion"
$pbDir  = Join-Path $Root "apps\pocketbase"
$pbExe  = Join-Path $pbDir "pocketbase.exe"

if ((Test-Path $pbExe) -and (-not $Force)) {
  Write-OK  "pocketbase.exe already exists. Use -Force to re-download."
} else {
  # Detect OS / arch (this script targets Windows but supports others too).
  $os   = "windows"; $arch = "amd64"; $ext = "zip"
  if ($IsLinux)   { $os = "linux";  $ext = "zip" }
  if ($IsMacOS)   { $os = "darwin"; $ext = "zip"; if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "arm64" } }

  $fileName = "pocketbase_${PocketBaseVersion}_${os}_${arch}.${ext}"
  $url      = "https://github.com/pocketbase/pocketbase/releases/download/v$PocketBaseVersion/$fileName"
  $tmpZip   = Join-Path $env:TEMP $fileName
  $tmpDir   = Join-Path $env:TEMP "pb_extract_$([guid]::NewGuid())"

  Write-Host "  Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $tmpZip
  Write-OK "Downloaded $(Split-Path $tmpZip -Leaf)"

  New-Item -ItemType Directory -Path $tmpDir | Out-Null
  Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force

  $binSrc = Get-ChildItem -Path $tmpDir -Filter "pocketbase*" -File | Select-Object -First 1
  if (-not $binSrc) { Write-Fail "Could not find pocketbase binary in extracted zip."; exit 1 }
  Copy-Item $binSrc.FullName -Destination $pbExe -Force

  Remove-Item $tmpZip,$tmpDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-OK "Installed $pbExe"
}

# ─── 3. npm install ───────────────────────────────────────────────────────────
if ($SkipInstall) {
  Write-Step 3 "Skipping npm install (--SkipInstall)"
} else {
  Write-Step 3 "Running npm install (this may take a few minutes)"
  Push-Location $Root
  try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
    Write-OK "Dependencies installed"
  } finally {
    Pop-Location
  }
}

# ─── 4. Friendly "what's next" summary ───────────────────────────────────────
Write-Step 4 "All set!"
Write-Host ""
Write-Host "  To start the BACKEND  (terminal 1):"            -ForegroundColor Cyan
Write-Host "    cd apps\pocketbase"                            -ForegroundColor Gray
Write-Host "    .\pocketbase.exe serve --http=127.0.0.1:8090"  -ForegroundColor Gray
Write-Host ""
Write-Host "  To start the FRONTEND (terminal 2):"            -ForegroundColor Cyan
Write-Host "    cd apps\web"                                   -ForegroundColor Gray
Write-Host "    npm run dev"                                   -ForegroundColor Gray
Write-Host ""
Write-Host "  Or run BOTH from the project root:"             -ForegroundColor Cyan
Write-Host "    npm run dev"                                   -ForegroundColor Gray
Write-Host ""
Write-Host "  Open:  http://localhost:3000      <- web app"   -ForegroundColor Yellow
Write-Host "         http://127.0.0.1:8090/_/   <- DB admin"  -ForegroundColor Yellow
Write-Host ""
Write-Host "  If pb_data\ is empty, follow SETUP.md > Step 7 to create the first admin." -ForegroundColor DarkGray
Write-Host ""
