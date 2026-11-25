@echo off
title Sultan Restaurant - Recover Lost Categories & Inventory from Browser Cache
cd /d "%~dp0"
node scripts\recover-browser-cache.js
echo.
pause
