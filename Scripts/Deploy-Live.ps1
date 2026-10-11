$ErrorActionPreference = "Stop"

$Repo = "E:\ASB LiftDoc\asb-liftdoc"
Set-Location -LiteralPath $Repo

function Assert-LastExitCode([string]$Message) {
    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

Write-Host "=== ASB LiftDoc - Verified Release Push ===" -ForegroundColor Cyan

$Guard = Join-Path $Repo "Scripts\Assert-ASBLiftDocVisualLock.ps1"
if (-not (Test-Path -LiteralPath $Guard)) {
    throw "Visual lock guard is missing: $Guard"
}

powershell -ExecutionPolicy Bypass -File $Guard
Assert-LastExitCode "Visual lock failed before build."

Write-Host ""
Write-Host "=== TypeScript validation ===" -ForegroundColor Cyan
npx tsc --noEmit
Assert-LastExitCode "TypeScript validation failed. Nothing pushed."

Write-Host ""
Write-Host "=== Local Webpack production build ===" -ForegroundColor Cyan
npx next build --webpack
Assert-LastExitCode "Local Webpack build failed. Nothing pushed."

powershell -ExecutionPolicy Bypass -File $Guard
Assert-LastExitCode "Visual lock failed after build. Nothing pushed."

Write-Host ""
Write-Host "=== Stage safe release files ===" -ForegroundColor Cyan

$SafePaths = @(
    ".gitignore",
    ".cpanel.yml",
    ".github",
    "src",
    "public",
    "package.json",
    "package-lock.json",
    "server.js",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "Scripts\Deploy-Live.ps1",
    "Scripts\Server"
)

$Existing = @()
foreach ($Path in $SafePaths) {
    if (Test-Path -LiteralPath (Join-Path $Repo $Path)) {
        $Existing += $Path
    }
}

if ($Existing.Count -eq 0) {
    throw "No release files found to stage."
}

git add -- $Existing
Assert-LastExitCode "git add failed."

# Never stage mutable/private runtime files.
git reset -- data .env .env.local .env.production 2>$null

$Staged = git diff --cached --name-only

if ($Staged) {
    $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    git commit -m "Deploy ASB LiftDoc $Stamp"
    Assert-LastExitCode "Git commit failed."
}
else {
    Write-Host "[INFO] No new commit required." -ForegroundColor Yellow
}

$Branch = (git branch --show-current).Trim()
if (-not $Branch) {
    throw "Could not determine current Git branch."
}

git push origin $Branch
Assert-LastExitCode "Git push failed."

powershell -ExecutionPolicy Bypass -File $Guard
Assert-LastExitCode "Visual lock failed after push."

$Commit = (git rev-parse HEAD).Trim()

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " ASB LIFTDOC PUSH SUCCESSFUL" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "Commit : $Commit"
Write-Host "Branch : $Branch"
Write-Host "Next   : GitHub Actions builds the Linux release."
Write-Host "Server : cPanel deploys only the verified prebuilt release."
Write-Host "==============================================" -ForegroundColor Green
