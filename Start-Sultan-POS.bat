@echo off
title Sultan Restaurant - Central POS Hub & Fast Web Server
cd /d "%~dp0"
echo ============================================================
echo   🏰 SULTAN RESTAURANT - CENTRAL POS & FAST WEB SERVER
echo ============================================================
echo.
echo Starting Instant Fast Hub on Ports 8081, 5050, 5000, 80...
echo Opening browser in 2 seconds...
echo.

start "" "http://localhost:8081/admin/dashboard"

node server.js
pause

