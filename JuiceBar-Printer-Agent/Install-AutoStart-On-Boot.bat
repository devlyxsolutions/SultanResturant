@echo off
title Install Sultan Juice Bar Printer Auto-Start
set "APPDIR=%~dp0"
cd /d "%APPDIR%"

if not exist "%APPDIR%SultanPrintAgent.ps1" (
  echo.
  echo ====================================================================
  echo   ERROR: Please EXTRACT the ZIP file to Desktop or C:\ first!
  echo   Do NOT run Install-AutoStart inside the ZIP preview window.
  echo ====================================================================
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath $env:APPDIR -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\Sultan-JuiceBar-Printer.lnk"
set "PSFILE=%APPDIR%SultanPrintAgent.ps1"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut($env:LNK); $s.TargetPath = 'powershell.exe'; $s.Arguments = '-STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + [char]34 + $env:PSFILE + [char]34; $s.WorkingDirectory = $env:APPDIR; $s.WindowStyle = 7; $s.Save()"

echo.
echo ====================================================================
echo   [OK] Sultan Juice Bar Printer Auto-Start Installed!
echo   Shortcut saved to: %LNK%
echo   Opening Juice Bar Printer Agent Desktop Window now...
echo ====================================================================
echo.
start "" powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PSFILE%"
timeout /t 3 >nul
exit /b 0
