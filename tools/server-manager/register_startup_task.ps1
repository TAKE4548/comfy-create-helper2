param (
    [ValidateSet("register", "unregister", "status")]
    [string]$Action = "register"
)

$TaskName = "PromptSurgeon_AutoStart"
$ScriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "server-manager.ps1"

if ($Action -eq "register") {
    $actionCmd = "powershell.exe"
    $actionArg = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -Action start -Background"
    # Windowsログオン後15秒遅延起動、管理者特権でバックグラウンド実行
    schtasks.exe /Create /TN $TaskName /TR "$actionCmd $actionArg" /SC ONLOGON /DELAY 0000:15 /RL HIGHEST /F
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Task '$TaskName' registered successfully (Trigger: ONLOGON, Delay: 15s)." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to register task '$TaskName'. Make sure to run as Administrator." -ForegroundColor Red
    }
} elseif ($Action -eq "unregister") {
    schtasks.exe /Delete /TN $TaskName /F
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Task '$TaskName' unregistered successfully." -ForegroundColor Yellow
    } else {
        Write-Host "[WARN] Task '$TaskName' was not found or could not be removed." -ForegroundColor Gray
    }
} elseif ($Action -eq "status") {
    schtasks.exe /Query /TN $TaskName /FO LIST
}
