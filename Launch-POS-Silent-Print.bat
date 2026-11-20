@echo off
title Sultan POS Billing - Direct Silent Thermal Print
cd /d "%~dp0"

echo ======================================================================
echo   🏰 SULTAN RESTAURANT - POS BILLING DIRECT SILENT PRINT
echo ======================================================================
echo.
echo Launching Google Chrome in Kiosk Printing Mode...
echo -> Zero Clicks: Print Preview dialog is completely suppressed!
echo -> Customer receipts print instantly and directly to thermal printer.
echo.

set CHROME_EXE=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME_EXE="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_EXE="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
    start "" %CHROME_EXE% --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Google\Chrome\SultanPosProfile" --app="http://localhost:5050/pos"
) else (
    echo Chrome not found, attempting Microsoft Edge...
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\SultanPosProfile" --app="http://localhost:5050/pos"
)

exit
