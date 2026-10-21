$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

# Prefer an EXE beside this launcher when copied into a distribution folder.
$exePath = Join-Path $PSScriptRoot 'PBudgetManager.exe'
if (!(Test-Path -LiteralPath $exePath)) {
    $buildRoot = Join-Path $PSScriptRoot 'dist'
    $latestBuild = Get-ChildItem -LiteralPath $buildRoot -Directory -Filter 'Build-*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'PBudgetManager\PBudgetManager.exe') } |
        Select-Object -First 1
    if ($latestBuild) {
        $exePath = Join-Path $latestBuild.FullName 'PBudgetManager\PBudgetManager.exe'
    }
}

$startupLog = Join-Path $PSScriptRoot 'startup.log'
if (!(Test-Path -LiteralPath $exePath)) {
    Write-Host 'PBudgetManager.exe was not found. Run Build-Exe.ps1 first.' -ForegroundColor Red
    return
}

Write-Host "Opening: $exePath"
Write-Host 'Keep this window open while using the application.'
Write-Host "Startup messages are saved to: $startupLog"
try {
    & $exePath 2>&1 | Tee-Object -FilePath $startupLog
    $startupExitCode = $LASTEXITCODE
    Write-Host "Application exited. Exit code: $startupExitCode"
    Write-Host "If the website did not open, send the messages above or the contents of $startupLog."
} catch {
    $_ | Out-String | Tee-Object -FilePath $startupLog -Append | Write-Host
}
