@echo off
title Sultan Restaurant - Server Firewall Configuration
cd /d "%~dp0"

echo ======================================================================
echo   🏰 SULTAN RESTAURANT - SERVER FIREWALL CONFIGURATION
echo ======================================================================
echo.
echo Opening ports 5050, 5000, 8081, 80 in Windows Firewall...
echo This allows all restaurant terminals (Juice Bar, KDS, Mobile Waiters)
echo to connect smoothly to this Master Server (192.168.1.10).
echo.
echo Requesting Administrator permission...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall add rule name=\"Sultan POS Server Hub\" dir=in action=allow protocol=TCP localport=5050,5000,8081,80 & echo. & echo ======================================================= & echo [OK] Windows Firewall rules added successfully! & echo ======================================================= & echo. & pause' -Verb RunAs"

exit /b 0
