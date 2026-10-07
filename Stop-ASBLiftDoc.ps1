$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$PortFile = Join-Path $PSScriptRoot ".liftdoc-port"
if (-not (Test-Path -LiteralPath $PortFile)) { throw ".liftdoc-port file not found." }
$Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
$Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $Connections) {
    Write-Host "ASB LiftDoc is not running on port $Port." -ForegroundColor Yellow
    exit 0
}
$ProcessIds = $Connections.OwningProcess | Sort-Object -Unique
foreach ($ProcId in $ProcessIds) {
    Write-Host "Stopping process $ProcId on port $Port..." -ForegroundColor Yellow
    Stop-Process -Id $ProcId -Force
}
Write-Host "ASB LiftDoc stopped." -ForegroundColor Green
