@echo off
title Register Prompt Surgeon AutoStart
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File register_startup_task.ps1 -Action register
echo.
pause
