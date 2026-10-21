$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$pythonExe = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) {
    throw 'Python 3.13 is missing. Install Python.Python.3.13 before running this script.'
}

& $pythonExe -m venv .venv-build
if ($LASTEXITCODE -ne 0) { throw 'Could not create the build environment.' }
$buildPython = Join-Path $PSScriptRoot '.venv-build\Scripts\python.exe'
& $buildPython -m pip install -r requirements.txt pyinstaller
if ($LASTEXITCODE -ne 0) { throw 'Could not install build dependencies.' }

# Isolate each build so PyInstaller never removes a previous distribution.
$buildId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$distPath = Join-Path $PSScriptRoot "dist\Build-$buildId"
$workPath = Join-Path $PSScriptRoot "build\Build-$buildId"
& $buildPython -m PyInstaller --noconfirm --distpath $distPath --workpath $workPath PBudgetManager.spec
if ($LASTEXITCODE -ne 0) { throw 'EXE build failed.' }
Write-Host "Build ready: $distPath\PBudgetManager\PBudgetManager.exe"
