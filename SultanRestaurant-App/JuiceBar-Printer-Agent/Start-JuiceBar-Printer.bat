@echo off
title Sultan Juice Bar Printer Agent
set "APPDIR=%~dp0"
cd /d "%APPDIR%"

if not exist "%APPDIR%SultanPrintAgent.ps1" (
  echo.
  echo ====================================================================
  echo   ERROR: Please EXTRACT the ZIP file first!
  echo   Right-click the downloaded ZIP -^> click "Extract All..."
  echo   Then open the extracted folder and run Start-JuiceBar-Printer.bat
  echo ====================================================================
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
start "" powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%APPDIR%SultanPrintAgent.ps1"
exit /b 0
