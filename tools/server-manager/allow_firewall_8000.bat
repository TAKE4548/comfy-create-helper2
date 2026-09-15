@echo off
title Prompt Surgeon - Allow Port 8000 in Firewall
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Administrator privileges required. Requesting elevation...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
powershell -Command "New-NetFirewallRule -DisplayName 'Prompt Surgeon Backend & UI (8000)' -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue"
echo Firewall rule added for Port 8000.
pause
