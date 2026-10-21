$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$taskRoot = $PSScriptRoot
$releaseExe = Join-Path $taskRoot 'dist\OfflinePatch\PBudgetManager\PBudgetManager.exe'
$oldFolder = Join-Path $taskRoot 'dist\PBudgetManager-Updated-20260923-160109-a6b858f5'
$resultFile = Join-Path $taskRoot '.offline-update-install.json'
try {
    if (Test-Path -LiteralPath $resultFile) {
        $result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $installedExe = Join-Path $result.applicationFolder 'PBudgetManager.exe'
        if (!(Test-Path -LiteralPath $installedExe)) { throw 'Installed EXE is missing. Contact the application maintainer.' }
        Start-Process -FilePath $installedExe -WorkingDirectory $result.applicationFolder -WindowStyle Hidden
        Write-Host "Opened installed version: $($result.applicationFolder)"
        exit 0
    }
    Write-Host 'Save your work and close the OLD PBudgetManager server window first.'
    Write-Host 'The installer preserves the old folder and backs up the database.'
    $output = & $releaseExe --prepare-update $oldFolder
    if ($LASTEXITCODE -ne 0) { throw 'Installation stopped. Close the old EXE and try again. Your old program and database are unchanged.' }
    $result = ($output -join "`n") | ConvertFrom-Json
    $result | ConvertTo-Json | Set-Content -LiteralPath $resultFile -Encoding UTF8
    Start-Process -FilePath (Join-Path $result.applicationFolder 'PBudgetManager.exe') -WorkingDirectory $result.applicationFolder -WindowStyle Hidden
    Write-Host "Installed and opened: $($result.applicationFolder)"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
