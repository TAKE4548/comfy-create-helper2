@echo off
title Unregister Prompt Surgeon AutoStart
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File register_startup_task.ps1 -Action unregister
echo.
pause
