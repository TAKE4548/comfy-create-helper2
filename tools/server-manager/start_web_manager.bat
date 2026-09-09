@echo off
title Prompt Surgeon - Web Manager
cd /d "%~dp0"
echo ========================================================
echo Starting Prompt Surgeon Web Server Manager...
echo URL: http://localhost:8899
echo Press Ctrl+C to stop the Web Manager.
echo ========================================================
start "" http://localhost:8899
python server_api.py
pause
