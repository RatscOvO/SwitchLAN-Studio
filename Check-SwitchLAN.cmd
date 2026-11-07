@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Check-SwitchLAN-Startup.ps1"
echo.
echo Read-only check completed. Review %%TEMP%%\SwitchLAN-Check.txt before sharing.
pause
