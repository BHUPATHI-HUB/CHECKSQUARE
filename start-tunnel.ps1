# start-tunnel.ps1
# Starts PocketBase + Cloudflare Tunnel so the local backend is reachable on the public Internet.
# Usage:
#   .\start-tunnel.ps1               # Quick Tunnel (free, URL changes on restart)
#   .\start-tunnel.ps1 -Named <name> # Named Tunnel (permanent URL, requires prior setup)
#
# See DEPLOY-FREE.md for full instructions.

param(
    [string]$Named = "",
    [int]$Port = 8090
)

$ErrorActionPreference = "Stop"

# --- Sanity checks ---------------------------------------------------------
if (-not (Test-Path .\apps\pocketbase)) {
    Write-Host "ERROR: Run from project root (folder must contain apps\pocketbase)." -ForegroundColor Red
    exit 1
}

$pbExe = ".\apps\pocketbase\pocketbase.exe"
if (-not (Test-Path $pbExe)) {
    Write-Host "ERROR: $pbExe not found. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: cloudflared not installed." -ForegroundColor Red
    Write-Host "Install it with: winget install --id Cloudflare.cloudflared -e" -ForegroundColor Yellow
    exit 1
}

# --- Start PocketBase in a new window -------------------------------------
Write-Host "Starting PocketBase on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
$pbCmd = "cd '$PWD\apps\pocketbase'; .\pocketbase.exe serve --http=127.0.0.1:$Port"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $pbCmd

# Give PB a moment to boot
Start-Sleep -Seconds 3

# --- Start the tunnel ------------------------------------------------------
if ($Named) {
    Write-Host "Starting Named Tunnel '$Named' ..." -ForegroundColor Cyan
    cloudflared tunnel run $Named
} else {
    Write-Host "Starting Quick Tunnel (URL will change on each restart) ..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Copy the https://*.trycloudflare.com URL printed below and paste it into" -ForegroundColor Yellow
    Write-Host "Cloudflare Pages -> Settings -> Environment Variables -> VITE_PB_URL," -ForegroundColor Yellow
    Write-Host "then trigger a redeploy." -ForegroundColor Yellow
    Write-Host ""
    cloudflared tunnel --url "http://127.0.0.1:$Port"
}
