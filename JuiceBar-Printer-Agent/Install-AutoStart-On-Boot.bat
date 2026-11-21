@echo off
title Install Sultan Juice Bar Printer Auto-Start
cd /d "%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=%~dp0SultanPrintAgent.exe"
set "LNK=%STARTUP%\Sultan-JuiceBar-Printer.lnk"
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%LNK%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"
echo.
echo [OK] Sultan Juice Bar Printer Agent added to Windows Startup!
echo It will launch automatically every morning when this Juice Bar PC turns on.
echo Starting agent right now...
start /min "" "%TARGET%"
timeout /t 4 >nul
