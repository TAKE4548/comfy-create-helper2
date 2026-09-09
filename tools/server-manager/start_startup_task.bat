@echo off
cd /d "%~dp0"
if not exist "logs" mkdir logs

:: 1. Start Web Manager (Port 8899)
powershell.exe -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue)) { Start-Process -FilePath '%~dp0..\..\backend\.venv\Scripts\python.exe' -ArgumentList '%~dp0server_api.py' -WindowStyle Hidden }"

:: 2. Start All Services (WSL ComfyUI, Backend, Frontend)
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0server-manager.ps1" -Action start -Background
