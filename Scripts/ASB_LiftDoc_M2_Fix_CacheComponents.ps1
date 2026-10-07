$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$ScriptsRoot = Join-Path $ProjectRoot "Scripts"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M2 CacheComponents Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project not found: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

$RouteFiles = @(
    "src\app\api\clients\route.ts",
    "src\app\api\projects\route.ts",
    "src\app\api\search\route.ts",
    "src\app\api\stats\route.ts"
)

foreach ($RelativePath in $RouteFiles) {
    $FullPath = Join-Path $ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $FullPath)) {
        throw "Required M2 file not found: $RelativePath"
    }
}

Write-Host "Creating safety backup..." -ForegroundColor Yellow

$BackupRoot = Join-Path $ProjectRoot "Backups\M2_Before_CacheComponents_Fix"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($RelativePath in $RouteFiles) {
    $Source = Join-Path $ProjectRoot $RelativePath
    $SafeName = ($RelativePath -replace '[\\/:*?"<>|]', '_')
    Copy-Item -LiteralPath $Source -Destination (Join-Path $BackupRoot $SafeName) -Force
}

$M2ScriptPath = Join-Path $ScriptsRoot "ASB_LiftDoc_M2_Data_Workspace.ps1"
if (Test-Path -LiteralPath $M2ScriptPath) {
    Copy-Item -LiteralPath $M2ScriptPath -Destination (Join-Path $BackupRoot "ASB_LiftDoc_M2_Data_Workspace.ps1.bak") -Force
}

Write-Host "[OK] Backup created: $BackupRoot" -ForegroundColor Green

Write-Host ""
Write-Host "Removing incompatible Next.js route segment config..." -ForegroundColor Yellow

$Patterns = @(
    '(?m)^\s*export const runtime\s*=\s*["'']nodejs["''];?\s*\r?\n?',
    '(?m)^\s*export const dynamic\s*=\s*["'']force-dynamic["''];?\s*\r?\n?'
)

foreach ($RelativePath in $RouteFiles) {
    $FullPath = Join-Path $ProjectRoot $RelativePath
    $Content = Get-Content -LiteralPath $FullPath -Raw

    foreach ($Pattern in $Patterns) {
        $Content = [regex]::Replace($Content, $Pattern, "")
    }

    Set-Content -LiteralPath $FullPath -Value $Content -Encoding UTF8
    Write-Host "[FIXED] $RelativePath" -ForegroundColor Green
}

Write-Host ""
Write-Host "Patching the M2 generator script so reruns stay compatible..." -ForegroundColor Yellow

if (Test-Path -LiteralPath $M2ScriptPath) {
    $ScriptContent = Get-Content -LiteralPath $M2ScriptPath -Raw

    foreach ($Pattern in $Patterns) {
        $ScriptContent = [regex]::Replace($ScriptContent, $Pattern, "")
    }

    Set-Content -LiteralPath $M2ScriptPath -Value $ScriptContent -Encoding UTF8
    Write-Host "[FIXED] Scripts\ASB_LiftDoc_M2_Data_Workspace.ps1" -ForegroundColor Green
}
else {
    Write-Host "[INFO] M2 generator script not found in Scripts folder. Route files are still fixed." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Verifying incompatible declarations are gone..." -ForegroundColor Yellow

$Remaining = @()

foreach ($RelativePath in $RouteFiles) {
    $FullPath = Join-Path $ProjectRoot $RelativePath
    $Matches = Select-String -LiteralPath $FullPath -Pattern 'export const runtime|export const dynamic'

    if ($Matches) {
        $Remaining += $RelativePath
    }
}

if ($Remaining.Count -gt 0) {
    Write-Host "These files still contain incompatible declarations:" -ForegroundColor Red
    $Remaining | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "Verification failed."
}

Write-Host "[OK] API route declarations are compatible with cacheComponents" -ForegroundColor Green

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build still has an error. Do not rollback." -ForegroundColor Red
    Write-Host "Send me the new complete build error for the next consolidated fix." -ForegroundColor Yellow
    throw "M2 build failed after CacheComponents fix."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving completed M2 Git checkpoint..." -ForegroundColor Yellow

git add .

if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Complete M2 clients projects and global search"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed, but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m2-data-workspace HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m2-data-workspace" -ForegroundColor Green
    }
}
else {
    Write-Host "No Git changes remained to commit." -ForegroundColor DarkGray
    git tag -f checkpoint-m2-data-workspace HEAD | Out-Null
}

$Port = 3010
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"

if (Test-Path -LiteralPath $PortFile) {
    $Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M2 FIX + BUILD COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($Running) {
    Write-Host "Localhost is already running. Opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:$Port"
}
else {
    Write-Host "Starting ASB LiftDoc..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")
}

Write-Host ""
Write-Host "Now test:" -ForegroundColor Yellow
Write-Host "1. Add Client" -ForegroundColor Yellow
Write-Host "2. Add Project" -ForegroundColor Yellow
Write-Host "3. Refresh browser and confirm data remains" -ForegroundColor Yellow
Write-Host "4. Ctrl+K search by client/project data" -ForegroundColor Yellow
Write-Host "5. Confirm dashboard counts update" -ForegroundColor Yellow
Write-Host ""
Write-Host "If all work, send: M2 confirmed" -ForegroundColor Green
