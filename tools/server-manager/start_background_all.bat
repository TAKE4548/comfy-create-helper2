@echo off
cd /d "%~dp0"
if not exist "logs" mkdir logs

:: 1. Web Manager (Port 8899) via conhost
powershell.exe -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue)) { Start-Process -FilePath 'conhost.exe' -ArgumentList 'cmd.exe /c run_web_manager.bat' -WorkingDirectory '%~dp0' -WindowStyle Hidden }"

:: 2. Services (WSL ComfyUI, Backend, Frontend) via conhost
powershell.exe -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'conhost.exe' -ArgumentList 'powershell.exe -ExecutionPolicy Bypass -File ""%~dp0server-manager.ps1"" -Action start -Background' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
