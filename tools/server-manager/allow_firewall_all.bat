@echo off
title Prompt Surgeon - Allow Firewall Rules (8000, 8188, 8899)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Administrator privileges required. Requesting elevation...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Adding Windows Firewall Inbound rules...

powershell -Command "New-NetFirewallRule -DisplayName 'Prompt Surgeon Backend & UI (8000)' -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null"
powershell -Command "New-NetFirewallRule -DisplayName 'Prompt Surgeon WSL2 ComfyUI (8188)' -Direction Inbound -LocalPort 8188 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null"
powershell -Command "New-NetFirewallRule -DisplayName 'Prompt Surgeon Web Manager (8899)' -Direction Inbound -LocalPort 8899 -Protocol TCP -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null"

echo.
echo Firewall rules registered successfully. Current Status:
echo ------------------------------------------------------------
powershell -Command "Get-NetFirewallRule -DisplayName 'Prompt Surgeon*' | Get-NetFirewallPortFilter | Select-Object @{Name='DisplayName';Expression={($_ | Get-NetFirewallRule).DisplayName}}, LocalPort, Protocol, @{Name='Enabled';Expression={($_ | Get-NetFirewallRule).Enabled}} | Format-Table -AutoSize"

echo.
echo Setup completed.
pause
