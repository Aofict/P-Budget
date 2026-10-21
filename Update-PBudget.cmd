@echo off
setlocal
chcp 65001 >nul
echo P-Budget Manager update - creates a NEW folder and preserves the old one.
echo Close the old EXE before continuing.
set "PBUDGET_OLD_FOLDER=%~1"
if not defined PBUDGET_OLD_FOLDER set /p "PBUDGET_OLD_FOLDER=Old application folder (without quotes): "
if not defined PBUDGET_OLD_FOLDER exit /b 1
"%~dp0PBudgetManager.exe" --prepare-update "%PBUDGET_OLD_FOLDER%"
if errorlevel 1 (
  echo Update failed. Continue using the original program folder.
) else (
  echo Update ready. Open PBudgetManager.exe in the applicationFolder shown above.
  echo Use the new folder from now on; the old folder is retained for recovery.
)
pause
