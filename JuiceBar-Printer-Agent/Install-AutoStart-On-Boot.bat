@echo off
title Install Sultan Juice Bar Printer Auto-Start
cd /d "%~dp0"

powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%~dp0' -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\Sultan-JuiceBar-Printer.lnk"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LNK%'); $s.TargetPath = 'powershell.exe'; $s.Arguments = '-STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0SultanPrintAgent.ps1\"'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"

echo.
echo =================================================================
echo   [OK] Sultan Juice Bar Printer Auto-Start Installed!
echo   Opening Juice Bar Printer Agent Desktop Window now...
echo =================================================================
echo.
start "" powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0SultanPrintAgent.ps1"
timeout /t 2 >nul
exit /b 0
