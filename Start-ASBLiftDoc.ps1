$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$PortFile = Join-Path $PSScriptRoot ".liftdoc-port"
if (-not (Test-Path -LiteralPath $PortFile)) { throw ".liftdoc-port file not found." }
$Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
$Url = "http://localhost:$Port"
$Existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Existing) {
    Write-Host "Port $Port is already in use. Opening $Url" -ForegroundColor Yellow
    Start-Process $Url
    exit 0
}
Write-Host ""
Write-Host "Starting ASB LiftDoc..." -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Green
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit","-Command","npm run dev -- -p $Port"
Start-Sleep -Seconds 5
$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
$ChromeX86 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
if (Test-Path -LiteralPath $Chrome) {
    Start-Process $Chrome $Url
} elseif (Test-Path -LiteralPath $ChromeX86) {
    Start-Process $ChromeX86 $Url
} else {
    Start-Process $Url
}
