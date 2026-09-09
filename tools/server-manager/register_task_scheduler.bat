@echo off
title Prompt Surgeon - Register Task Scheduler
cd /d "%~dp0"

:: Check Admin privileges
openfiles >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell.exe -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: Run with Admin privileges
echo ========================================================
echo  Prompt Surgeon - Registering Task Scheduler
echo ========================================================
powershell.exe -ExecutionPolicy Bypass -File "%~dp0register_startup_task.ps1" -Action register
