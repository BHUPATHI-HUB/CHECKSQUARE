# backup-pb.ps1
# Creates a portable backup of the entire PocketBase database + uploaded files.
# Produces a single .zip you can move to another laptop and restore.
#
# Usage:
#   .\backup-pb.ps1                              # default: backups\pb_backup_<timestamp>.zip
#   .\backup-pb.ps1 -Destination D:\my-backup.zip
#   .\backup-pb.ps1 -KeepRunning                 # don't stop PocketBase (best-effort, requires SQLite WAL)
#
# What's included:
#   - data.db        (users, inspections, all collection rows)
#   - data.db-shm    (SQLite shared memory)
#   - data.db-wal    (SQLite write-ahead log)
#   - logs.db        (server logs)
#   - storage/       (every uploaded photo / avatar / file)
#   - types.d.ts     (PB type hints)
#
# What's NOT included:
#   - pocketbase.exe (the binary itself — comes from the repo)
#   - pb_migrations/ (in git, comes from the repo)
#   - pb_hooks/      (in git, comes from the repo)

param(
    [string]$Destination = "",
    [switch]$KeepRunning = $false
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path .\apps\pocketbase\pb_data)) {
    Write-Host "ERROR: Run from project root (apps\pocketbase\pb_data must exist)." -ForegroundColor Red
    exit 1
}

if (-not $Destination) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    if (-not (Test-Path .\backups)) { New-Item -ItemType Directory -Path .\backups | Out-Null }
    $Destination = ".\backups\pb_backup_$stamp.zip"
}

# Stop PocketBase first (unless caller insists)
$pbProc = Get-Process pocketbase -ErrorAction SilentlyContinue
$wasRunning = $false
if ($pbProc) {
    if ($KeepRunning) {
        Write-Host "⚠️  PocketBase is running — taking a HOT backup. SQLite WAL makes this usually safe but not guaranteed." -ForegroundColor Yellow
    } else {
        Write-Host "Stopping PocketBase (PID $($pbProc.Id)) to take a clean backup..." -ForegroundColor Cyan
        Stop-Process -Id $pbProc.Id
        Start-Sleep -Seconds 2
        $wasRunning = $true
    }
}

Write-Host "Creating backup: $Destination" -ForegroundColor Cyan
if (Test-Path $Destination) { Remove-Item $Destination -Force }
Compress-Archive -Path .\apps\pocketbase\pb_data\* -DestinationPath $Destination -CompressionLevel Optimal

$sizeMB = [math]::Round((Get-Item $Destination).Length / 1MB, 2)
Write-Host ""
Write-Host "✅ Backup complete: $Destination  ($sizeMB MB)" -ForegroundColor Green
Write-Host ""

if ($wasRunning) {
    Write-Host "ℹ️  PocketBase was stopped. Restart it with:" -ForegroundColor Yellow
    Write-Host "    cd apps\pocketbase ; .\pocketbase.exe serve --http=127.0.0.1:8090" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "To RESTORE on another laptop:" -ForegroundColor Cyan
Write-Host "  1. Clone the repo + run setup.ps1"
Write-Host "  2. Make sure PocketBase is NOT running"
Write-Host "  3. Run: .\restore-pb.ps1 -Source <path-to-this-zip>"
Write-Host "  4. Start PocketBase — your data + users + photos are back"
