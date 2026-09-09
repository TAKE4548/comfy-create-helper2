@echo off
title Prompt Surgeon Task Status
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0register_startup_task.ps1" -Action status
echo.
pause
