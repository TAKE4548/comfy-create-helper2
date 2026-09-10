@echo off
cd /d "%~dp0"
if not exist "logs" mkdir logs

:: 1. Web Manager (Port 8899)
powershell.exe -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen')) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c run_web_manager.bat > ""%~dp0logs\web_manager.log"" 2>&1' -WorkingDirectory '%~dp0' -WindowStyle Hidden }"

:: 2. Services (WSL ComfyUI, Backend, Frontend)
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0server-manager.ps1" -Action start -Background
