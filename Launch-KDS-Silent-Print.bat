@echo off
title Sultan Kitchen KDS - Direct Silent Thermal Print
cd /d "%~dp0"

echo ======================================================================
echo   🏰 SULTAN RESTAURANT - KITCHEN KDS DIRECT SILENT PRINT
echo ======================================================================
echo.
echo Launching Google Chrome in Kiosk Printing Mode...
echo -> Zero Clicks: Print Preview dialog is completely suppressed!
echo -> Slips print instantly and directly to the default thermal printer.
echo.

set CHROME_EXE=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME_EXE="C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_EXE="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
    start "" %CHROME_EXE% --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Google\Chrome\SultanKdsProfile" --app="http://localhost:5050/kitchen/kds"
) else (
    echo Chrome not found, attempting Microsoft Edge...
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\SultanKdsProfile" --app="http://localhost:5050/kitchen/kds"
)

exit
