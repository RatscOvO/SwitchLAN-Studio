@echo off
setlocal
cd /d "%~dp0"
where dotnet.exe >nul 2>&1
if errorlevel 1 (
 echo [ERROR] .NET 8 SDK not found. Install .NET 8 SDK x64 first.
 pause
 exit /b 1
)
echo [1/2] Building SwitchLAN Studio from CURRENT source...
dotnet build ".\desktop\SwitchLAN.Desktop\SwitchLAN.Desktop.csproj" -c Release --nologo
if errorlevel 1 (
 echo [ERROR] Build failed. Check build output and internet access for first NuGet restore.
 pause
 exit /b 1
)
echo [2/2] Launching SwitchLAN Studio...
dotnet ".\desktop\SwitchLAN.Desktop\bin\Release\net8.0-windows\SwitchLAN.Desktop.dll"
if errorlevel 1 (
 echo [ERROR] Desktop exited with error. Check %%TEMP%%\SwitchLAN.Desktop.log
 pause
 exit /b 1
)
