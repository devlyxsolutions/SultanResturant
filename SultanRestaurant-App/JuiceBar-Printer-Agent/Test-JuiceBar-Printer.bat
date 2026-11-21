@echo off
title Test Sultan Juice Bar Printer
set "APPDIR=%~dp0"
cd /d "%APPDIR%"

if not exist "%APPDIR%SultanPrintAgent.ps1" (
  echo ERROR: Please EXTRACT the ZIP file first!
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%SultanPrintAgent.ps1" -Test
exit /b 0
