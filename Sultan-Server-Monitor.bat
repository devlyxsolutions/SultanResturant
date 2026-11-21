@echo off
title Sultan Restaurant - Central Server Status & Monitor
color 0E
mode con: cols=85 lines=30
cd /d "%~dp0"

:loop
cls
echo ====================================================================================
echo   🏰 SULTAN RESTAURANT & CAFE - CENTRAL MASTER SERVER MONITOR
echo ====================================================================================
echo.
echo  MASTER SERVER IP (LAN):
echo  -> http://192.168.1.10:5050
echo  -> WebSocket: ws://192.168.1.10:5050
echo.
echo ------------------------------------------------------------------------------------
echo  SERVER PORT STATUS:
powershell.exe -NoProfile -Command ^
  "$t5050 = Test-NetConnection -ComputerName 127.0.0.1 -Port 5050 -InformationLevel Quiet; ^
   if ($t5050) { Write-Host '  [OK] Port 5050 (Primary Central Hub): ONLINE' -ForegroundColor Green } else { Write-Host '  [OFFLINE] Port 5050: NOT RUNNING' -ForegroundColor Red }; ^
   $t5000 = Test-NetConnection -ComputerName 127.0.0.1 -Port 5000 -InformationLevel Quiet; ^
   if ($t5000) { Write-Host '  [OK] Port 5000 (Auxiliary LAN Hub):   ONLINE' -ForegroundColor Green } else { Write-Host '  [--] Port 5000: Idle' -ForegroundColor Yellow }; ^
   $t8081 = Test-NetConnection -ComputerName 127.0.0.1 -Port 8081 -InformationLevel Quiet; ^
   if ($t8081) { Write-Host '  [OK] Port 8081 (Fast Web Portal):     ONLINE' -ForegroundColor Green } else { Write-Host '  [--] Port 8081: Idle' -ForegroundColor Yellow };"

echo.
echo ------------------------------------------------------------------------------------
echo  DATABASE & BACKUP INTEGRITY:
powershell.exe -NoProfile -Command ^
  "if (Test-Path 'server-data.json') { ^
     $f = Get-Item 'server-data.json'; ^
     $b = (Get-ChildItem -Path 'backups' -Filter 'server-data*.json' -ErrorAction SilentlyContinue).Count; ^
     Write-Host ('  Database File:  server-data.json (' + [math]::Round($f.Length/1KB, 1) + ' KB)') -ForegroundColor White; ^
     Write-Host ('  Last Modified:  ' + $f.LastWriteTime) -ForegroundColor White; ^
     Write-Host ('  Total Backups:  ' + $b + ' daily snapshots archived in backups/') -ForegroundColor White; ^
   } else { Write-Host '  Database file not found!' -ForegroundColor Red }"

echo.
echo ------------------------------------------------------------------------------------
echo  CLIENT CONNECTIVITY SUMMARY:
echo  All client stations (Juice Bar, KDS Kitchen Display, Mobile Waiters, Cashier 2)
echo  must connect to: http://192.168.1.10:5050
echo.
echo ====================================================================================
echo  [1] Open Admin Dashboard    [2] Open POS Billing      [3] Open Kitchen KDS
echo  [4] Open Firewall Rules     [5] Restart Server Hub    [R] Refresh Status
echo ====================================================================================
echo.
set /p choice="Select an option (1-5, R to refresh): "

if /i "%choice%"=="1" start "" "http://localhost:5050/admin/dashboard" & goto loop
if /i "%choice%"=="2" start "" "http://localhost:5050/pos" & goto loop
if /i "%choice%"=="3" start "" "http://localhost:5050/kitchen/kds" & goto loop
if /i "%choice%"=="4" call "%~dp0Configure-Server-Firewall.bat" & goto loop
if /i "%choice%"=="5" (
  echo Restarting Central Hub...
  taskkill /F /IM node.exe >nul 2>&1
  start "" wscript.exe "%~dp0Start-Sultan-Server-Silent.vbs"
  timeout /t 2 >nul
  goto loop
)
if /i "%choice%"=="r" goto loop
goto loop
