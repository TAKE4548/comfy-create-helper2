@echo off
title Prompt Surgeon - Start Servers
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0server-manager.ps1" -Action start
echo.
pause
