$ErrorActionPreference = "Stop"

param(
    [string]$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
)

$LockPath = Join-Path $ProjectRoot "docs\VISUAL_BASELINE_LOCK.json"

if (-not (Test-Path -LiteralPath $LockPath)) {
    throw "Visual lock file missing: $LockPath"
}

$Lock = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json

foreach ($Property in $Lock.files.PSObject.Properties) {
    $RelativePath = $Property.Name
    $ExpectedHash = [string]$Property.Value
    $FullPath = Join-Path $ProjectRoot $RelativePath

    if (-not (Test-Path -LiteralPath $FullPath)) {
        throw "VISUAL LOCK FAILED: missing protected file: $RelativePath"
    }

    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $FullPath).Hash

    if ($ActualHash -ne $ExpectedHash) {
        throw "VISUAL LOCK FAILED: protected file changed: $RelativePath"
    }
}

Write-Host "[OK] ASB LiftDoc visual lock verified" -ForegroundColor Green