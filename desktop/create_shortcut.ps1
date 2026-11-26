param(
    [string]$TestOutputDir = ""
)

$ErrorActionPreference = "Stop"
$appDir = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $appDir "AntigravityStudio.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
    Write-Host "[ERROR] AntigravityStudio.exe not found at: $exePath"
    exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$iconLoc = "$exePath,0"

if ($TestOutputDir) {
    New-Item -ItemType Directory -Force -Path $TestOutputDir | Out-Null
    $lnkPath = Join-Path $TestOutputDir "Antigravity Studio.lnk"
    $sc = $wsh.CreateShortcut($lnkPath)
    $sc.TargetPath = $exePath
    $sc.WorkingDirectory = $appDir
    $sc.IconLocation = $iconLoc
    $sc.Description = "Antigravity Studio"
    $sc.Save()
    Write-Host "TEST_SHORTCUT_OK: $lnkPath -> $($sc.TargetPath) [Icon: $($sc.IconLocation)]"
    exit 0
}

$desktopDir = [Environment]::GetFolderPath("Desktop")
$programsDir = [Environment]::GetFolderPath("Programs")

foreach ($targetDir in @($desktopDir, $programsDir)) {
    if ($targetDir -and (Test-Path -LiteralPath $targetDir)) {
        $lnk = Join-Path $targetDir "Antigravity Studio.lnk"
        $sc = $wsh.CreateShortcut($lnk)
        $sc.TargetPath = $exePath
        $sc.WorkingDirectory = $appDir
        $sc.IconLocation = $iconLoc
        $sc.Description = "Antigravity Studio"
        $sc.Save()
        Write-Host "Created shortcut: $lnk"
    }
}

Write-Host ""
Write-Host "Done! You can now launch Antigravity Studio from your Desktop or Start Menu."
