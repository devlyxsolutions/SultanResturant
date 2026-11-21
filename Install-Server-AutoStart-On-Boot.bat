@echo off
title Sultan Restaurant - Install Server AutoStart On Windows Boot
cd /d "%~dp0"

echo ======================================================================
echo   🏰 SULTAN RESTAURANT - INSTALL MASTER SERVER AUTOSTART
echo ======================================================================
echo.
echo Installing background Central Hub auto-start on Windows Boot...
echo This ensures server.js runs 24/7 whenever this computer turns on.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; ^
   $startup = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup); ^
   $shortcut = $WshShell.CreateShortcut(\"$startup\SultanCentralServerHub.lnk\"); ^
   $shortcut.TargetPath = 'wscript.exe'; ^
   $shortcut.Arguments = '\"' + (Join-Path (Get-Location) 'Start-Sultan-Server-Silent.vbs') + '\"'; ^
   $shortcut.WorkingDirectory = (Get-Location).Path; ^
   $shortcut.Description = 'Sultan Restaurant Central Hub Background Server'; ^
   $shortcut.Save(); ^
   Write-Host 'Installed successfully in Windows Startup folder:' -ForegroundColor Green; ^
   Write-Host \"$startup\SultanCentralServerHub.lnk\" -ForegroundColor Yellow;"

echo.
echo ======================================================================
echo   SUCCESS: Central Hub will now automatically start on every boot!
echo ======================================================================
echo.
pause
