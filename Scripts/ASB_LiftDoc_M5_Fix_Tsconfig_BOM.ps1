$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$TsConfig = Join-Path $ProjectRoot "tsconfig.json"
$PreviousFix = Join-Path $ProjectRoot "Scripts\ASB_LiftDoc_M5_Fix_Backup_Typecheck.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M5 tsconfig BOM Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project not found: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath $TsConfig)) {
    throw "tsconfig.json not found."
}

$BackupDir = Join-Path $ProjectRoot "Backups\M5_Tsconfig_BOM_Fix"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Copy-Item -LiteralPath $TsConfig -Destination (Join-Path $BackupDir "tsconfig.before.json.bak") -Force

Write-Host "Repairing tsconfig.json without UTF-8 BOM..." -ForegroundColor Yellow

$Bytes = [System.IO.File]::ReadAllBytes($TsConfig)
$Text = [System.Text.Encoding]::UTF8.GetString($Bytes)
$Text = $Text.TrimStart([char]0xFEFF)

if ($Text -notmatch '"Backups"') {
    if ($Text -match '"exclude"\s*:\s*\[') {
        $Text = [regex]::Replace(
            $Text,
            '"exclude"\s*:\s*\[',
            '"exclude": ["Backups", ',
            1
        )
    }
    else {
        $Trimmed = $Text.TrimEnd()

        if (-not $Trimmed.EndsWith("}")) {
            throw "Unexpected tsconfig.json structure."
        }

        $Body = $Trimmed.Substring(0, $Trimmed.Length - 1).TrimEnd()

        if ($Body.EndsWith(",")) {
            $Text = $Body + "`r`n  `"exclude`": [`"Backups`", `"node_modules`"]`r`n}"
        }
        else {
            $Text = $Body + ",`r`n  `"exclude`": [`"Backups`", `"node_modules`"]`r`n}"
        }
    }
}

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($TsConfig, $Text, $Utf8NoBom)

$AfterBytes = [System.IO.File]::ReadAllBytes($TsConfig)
$HasBom = (
    $AfterBytes.Length -ge 3 -and
    $AfterBytes[0] -eq 0xEF -and
    $AfterBytes[1] -eq 0xBB -and
    $AfterBytes[2] -eq 0xBF
)

if ($HasBom) {
    throw "BOM removal verification failed."
}

Write-Host "[OK] UTF-8 BOM removed from tsconfig.json" -ForegroundColor Green

Write-Host "Validating tsconfig JSON..." -ForegroundColor Yellow

node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('tsconfig.json','utf8')); console.log('[OK] tsconfig JSON parse successful');"

if ($LASTEXITCODE -ne 0) {
    throw "tsconfig.json is still not valid JSON. Send me the parser error."
}

$CriticalFiles = @(
    "src\components\app-shell.tsx",
    "src\components\module-placeholder.tsx",
    "src\components\workspace\clients-workspace.tsx",
    "src\components\workspace\dashboard-overview.tsx",
    "src\components\workspace\global-search-workspace.tsx",
    "src\components\workspace\projects-workspace.tsx",
    "src\components\workspace\quotations-workspace.tsx",
    "src\components\workspace\template-builder-workspace.tsx",
    "src\components\workspace\advanced-table-editor.tsx",
    "src\config\site.ts",
    "src\lib\workspace-store.ts",
    "src\lib\quotation-store.ts",
    "src\lib\template-store.ts"
)

$Missing = @(
    $CriticalFiles | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_))
    }
)

if ($Missing.Count -gt 0) {
    Write-Host ""
    Write-Host "These real source files are missing:" -ForegroundColor Red
    $Missing | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Source verification failed. Do not rollback. Send me the missing-file list above."
}

Write-Host "[OK] Critical source files are present" -ForegroundColor Green

if (Test-Path -LiteralPath $PreviousFix) {
    $FixText = Get-Content -LiteralPath $PreviousFix -Raw

    $OldLine = 'Set-Content -LiteralPath $TsConfig -Value $Raw -Encoding UTF8'
    $NewLine = '[System.IO.File]::WriteAllText($TsConfig, $Raw, (New-Object System.Text.UTF8Encoding($false)))'

    if ($FixText.Contains($OldLine)) {
        $FixText = $FixText.Replace($OldLine, $NewLine)
        [System.IO.File]::WriteAllText($PreviousFix, $FixText, $Utf8NoBom)
        Write-Host "[OK] Previous M5 fix script patched for no-BOM JSON writing" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build still has a different error. Do not rollback." -ForegroundColor Red
    Write-Host "Send me the complete NEW error only." -ForegroundColor Yellow
    throw "M5 build failed after tsconfig BOM repair."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M5 Git checkpoint..." -ForegroundColor Yellow

git add .

if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Complete M5 advanced layout and repair tsconfig encoding"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed, but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m5-advanced-layout HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m5-advanced-layout" -ForegroundColor Green
    }
}
else {
    git tag -f checkpoint-m5-advanced-layout HEAD | Out-Null
    Write-Host "[OK] No pending Git changes; M5 checkpoint refreshed" -ForegroundColor Green
}

$Port = 3010
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"

if (Test-Path -LiteralPath $PortFile) {
    $Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M5 FIX + BUILD COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port/templates" -ForegroundColor Cyan
Write-Host ""

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($Running) {
    Start-Process "http://localhost:$Port/templates"
}
else {
    powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")
}

Write-Host ""
Write-Host "If everything works, send: M5 confirmed" -ForegroundColor Green
