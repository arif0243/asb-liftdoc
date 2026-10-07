$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$M5Script = Join-Path $ProjectRoot "Scripts\ASB_LiftDoc_M5_Advanced_Layout.ps1"
$TsConfig = Join-Path $ProjectRoot "tsconfig.json"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M5 Backup Typecheck Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project not found: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath $TsConfig)) {
    throw "tsconfig.json not found."
}

Write-Host "Fixing TypeScript backup scanning..." -ForegroundColor Yellow

$Raw = Get-Content -LiteralPath $TsConfig -Raw

if ($Raw -notmatch '"Backups"') {
    if ($Raw -match '"exclude"\s*:\s*\[') {
        $Raw = [regex]::Replace(
            $Raw,
            '"exclude"\s*:\s*\[',
            '"exclude": ["Backups",',
            1
        )
    }
    else {
        $Trimmed = $Raw.TrimEnd()
        if (-not $Trimmed.EndsWith("}")) {
            throw "Unexpected tsconfig.json format."
        }

        $WithoutLastBrace = $Trimmed.Substring(0, $Trimmed.Length - 1).TrimEnd()

        if ($WithoutLastBrace.EndsWith(",")) {
            $Raw = $WithoutLastBrace + "`r`n  `"exclude`": [`"Backups`"]`r`n}"
        }
        else {
            $Raw = $WithoutLastBrace + ",`r`n  `"exclude`": [`"Backups`"]`r`n}"
        }
    }

    [System.IO.File]::WriteAllText($TsConfig, $Raw, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[OK] Added Backups to tsconfig exclude" -ForegroundColor Green
}
else {
    Write-Host "[OK] Backups is already excluded in tsconfig" -ForegroundColor Green
}

Write-Host "Renaming source-like backup files to .bak..." -ForegroundColor Yellow

$BackupRoot = Join-Path $ProjectRoot "Backups"
if (Test-Path -LiteralPath $BackupRoot) {
    Get-ChildItem -LiteralPath $BackupRoot -Recurse -File |
        Where-Object { $_.Extension -in @(".ts", ".tsx", ".js", ".jsx", ".mts", ".cts") } |
        ForEach-Object {
            $NewPath = $_.FullName + ".bak"
            Move-Item -LiteralPath $_.FullName -Destination $NewPath -Force
            Write-Host "[RENAMED] $($_.Name) -> $($_.Name).bak" -ForegroundColor DarkGray
        }
}

if (Test-Path -LiteralPath $M5Script) {
    Write-Host "Patching M5 script so future backups use .bak..." -ForegroundColor Yellow

    $Content = Get-Content -LiteralPath $M5Script -Raw
    $Old = 'Copy-Item $File "Backups\M5_Before_Advanced_Layout\$Safe" -Force'
    $New = 'Copy-Item $File "Backups\M5_Before_Advanced_Layout\$Safe.bak" -Force'

    if ($Content.Contains($Old)) {
        $Content = $Content.Replace($Old, $New)
        Set-Content -LiteralPath $M5Script -Value $Content -Encoding UTF8
        Write-Host "[OK] M5 generator backup naming patched" -ForegroundColor Green
    }
    else {
        Write-Host "[INFO] M5 backup copy line already changed or not found" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build still has an error. Do not rollback." -ForegroundColor Red
    Write-Host "Send me the new complete build error." -ForegroundColor Yellow
    throw "M5 build failed after backup typecheck fix."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M5 checkpoint..." -ForegroundColor Yellow

git add .

if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Fix backup exclusion and complete M5 advanced layout"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m5-advanced-layout HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m5-advanced-layout" -ForegroundColor Green
    }
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
