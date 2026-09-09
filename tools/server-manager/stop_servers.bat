@echo off
title Prompt Surgeon - Stop Servers
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0server-manager.ps1" -Action stop
echo.
pause
