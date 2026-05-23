# restore-pb.ps1
# Restores a PocketBase backup zip created by backup-pb.ps1.
# Replaces the current apps\pocketbase\pb_data\ entirely.
#
# Usage:
#   .\restore-pb.ps1 -Source .\backups\pb_backup_20260524_120000.zip
#   .\restore-pb.ps1 -Source D:\transferred-backup.zip -Force

param(
    [Parameter(Mandatory=$true)]
    [string]$Source,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Source)) {
    Write-Host "ERROR: Backup file not found: $Source" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path .\apps\pocketbase)) {
    Write-Host "ERROR: Run from project root (apps\pocketbase must exist — run setup.ps1 first)." -ForegroundColor Red
    exit 1
}

# Refuse if PocketBase is running — SQLite corruption risk
$pbProc = Get-Process pocketbase -ErrorAction SilentlyContinue
if ($pbProc) {
    Write-Host "ERROR: PocketBase is running (PID $($pbProc.Id)). Stop it first (Ctrl+C in its terminal)." -ForegroundColor Red
    exit 1
}

$existing = ".\apps\pocketbase\pb_data"
if (Test-Path $existing) {
    if (-not $Force) {
        $reply = Read-Host "⚠️  This will DELETE the existing pb_data\ and replace it with the backup. Type 'yes' to continue"
        if ($reply -ne "yes") {
            Write-Host "Aborted." -ForegroundColor Yellow
            exit 0
        }
    }
    # Safety: rename the old one rather than delete outright
    $bakName = ".\apps\pocketbase\pb_data.replaced_$(Get-Date -Format yyyyMMdd_HHmmss)"
    Write-Host "Renaming existing pb_data → $bakName (kept as safety net)" -ForegroundColor Yellow
    Rename-Item -Path $existing -NewName $bakName
}

Write-Host "Restoring from: $Source" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $existing | Out-Null
Expand-Archive -Path $Source -DestinationPath $existing -Force

$dbFile = Join-Path $existing "data.db"
if (-not (Test-Path $dbFile)) {
    Write-Host "❌ Restored archive has no data.db — backup is corrupt or wrong format." -ForegroundColor Red
    exit 1
}

$dbMB = [math]::Round((Get-Item $dbFile).Length / 1MB, 2)
Write-Host ""
Write-Host "✅ Restore complete. data.db = $dbMB MB" -ForegroundColor Green
Write-Host ""
Write-Host "Start PocketBase:" -ForegroundColor Cyan
Write-Host "  cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090"
Write-Host ""
Write-Host "Your original superuser email + password from the source laptop now work." -ForegroundColor Green
