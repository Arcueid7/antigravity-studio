param(
    [string]$Version = "v1.0.0",
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $repoRoot "dist"
$exePath = Join-Path $repoRoot "AntigravityStudio.exe"

if ($Rebuild -or -not (Test-Path -LiteralPath $exePath)) {
    Write-Host "[1/3] Building AntigravityStudio.exe..."
    $buildBat = Join-Path $repoRoot "desktop\build_desktop_app.bat"
    & cmd /c "`"$buildBat`""
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) {
        throw "Failed to build AntigravityStudio.exe"
    }
} else {
    Write-Host "[1/3] Using existing AntigravityStudio.exe (pass -Rebuild to recompile)."
}

$safeVer = ($Version -replace '[^A-Za-z0-9._-]', '')
if (-not $safeVer) { $safeVer = "v1.0.0" }

$bundleName = "AntigravityStudio-$safeVer-win-x64"
$stageRoot = Join-Path $distDir "_stage"
$stageApp = Join-Path $stageRoot $bundleName
$zipPath = Join-Path $distDir "$bundleName.zip"
$sumPath = Join-Path $distDir "SHA256SUMS.txt"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
if (Test-Path -LiteralPath $stageRoot) { Remove-Item -Recurse -Force -LiteralPath $stageRoot }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -Force -LiteralPath $zipPath }
New-Item -ItemType Directory -Force -Path $stageApp | Out-Null

Write-Host "[2/3] Staging clean release files into $stageApp..."

$includeFiles = @(
    "AntigravityStudio.exe",
    "AntigravityStudio.exe.config",
    "server.py",
    "custom.css",
    "start.bat",
    "create-desktop-shortcut.bat",
    "README.md",
    "README_ZH.md",
    "LICENSE",
    "THIRD_PARTY_LICENSES.md",
    "SECURITY.md"
)

foreach ($rel in $includeFiles) {
    $src = Join-Path $repoRoot $rel
    if (-not (Test-Path -LiteralPath $src) -and $rel -eq "AntigravityStudio.exe.config") {
        $src = Join-Path $repoRoot "desktop\AntigravityStudio.exe.config"
    }
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $stageApp $rel) -Force
    }
}

$includeDirs = @("backend", "static", "desktop")
foreach ($dirName in $includeDirs) {
    $srcDir = Join-Path $repoRoot $dirName
    $dstDir = Join-Path $stageApp $dirName
    New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
    Get-ChildItem -LiteralPath $srcDir -Recurse -File | Where-Object {
        $_.FullName -notmatch '\\__pycache__\\' -and
        $_.Extension -notin '.pyc', '.pyo' -and
        $_.Name -notmatch '^(GenerateIcons|_verify_.*|.*\.new)\.exe$'
    } | ForEach-Object {
        $relPath = $_.FullName.Substring($srcDir.Length + 1)
        $targetFile = Join-Path $dstDir $relPath
        $targetParent = Split-Path -Parent $targetFile
        if (-not (Test-Path -LiteralPath $targetParent)) {
            New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $targetFile -Force
    }
}

Write-Host "[3/3] Creating zip archive and SHA256SUMS.txt..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageRoot,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)
Remove-Item -Recurse -Force -LiteralPath $stageRoot

$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$exeHash = (Get-FileHash -LiteralPath $exePath -Algorithm SHA256).Hash.ToLowerInvariant()
$sumContent = @(
    "$zipHash  $bundleName.zip",
    "$exeHash  AntigravityStudio.exe"
) -join "`n"
[System.IO.File]::WriteAllText($sumPath, $sumContent + "`n", (New-Object System.Text.UTF8Encoding($false)))

$sizeMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Release package ready:"
Write-Host "  ZIP : $zipPath ($sizeMb MB)"
Write-Host "  SHA : $sumPath"
