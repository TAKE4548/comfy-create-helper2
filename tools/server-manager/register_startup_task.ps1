param (
    [ValidateSet("register", "unregister", "status")]
    [string]$Action = "register",

    [ValidateSet("TaskScheduler", "Startup")]
    [string]$Method = "TaskScheduler"
)

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "PromptSurgeon_AutoStart"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "PromptSurgeon_AutoStart.lnk"
$TaskBatPath = Join-Path $SCRIPT_DIR "start_startup_task.bat"
$ServerManagerPs1 = Join-Path $SCRIPT_DIR "server-manager.ps1"

function Register-TaskScheduler {
    if (Test-Path $ShortcutPath) {
        Remove-Item -Path $ShortcutPath -Force -ErrorAction SilentlyContinue
    }

    $actionCmd = "cmd.exe /c `"$TaskBatPath`""
    schtasks.exe /Create /TN $TaskName /TR "$actionCmd" /SC ONLOGON /DELAY 0000:15 /RL HIGHEST /F
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "=================================================" -ForegroundColor Green
        Write-Host " [OK] Task '$TaskName' registered successfully!" -ForegroundColor Green
        Write-Host "=================================================" -ForegroundColor Green
        Write-Host " Trigger: Windows Sign-in (Auto start after 15s)" -ForegroundColor Gray
        Write-Host " Action : $TaskBatPath" -ForegroundColor Gray
        Write-Host " Level  : HIGHEST (Admin privileges)" -ForegroundColor Gray
        Write-Host ""

        # 常駐登録と同時に、今すぐ全サービスとWeb Managerをバックグラウンド起動
        Write-Host "Starting services now in background..." -ForegroundColor Yellow
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$TaskBatPath`"" -WorkingDirectory $SCRIPT_DIR -WindowStyle Hidden
        Write-Host "Waiting 5 seconds for services to initialize..." -ForegroundColor Gray
        Start-Sleep -Seconds 5

        # 現在のステータスを表示
        & powershell.exe -ExecutionPolicy Bypass -File $ServerManagerPs1 -Action status
    } else {
        Write-Host ""
        Write-Host "[ERROR] Failed to register task '$TaskName'." -ForegroundColor Red
        Write-Host "        Make sure to run as Administrator." -ForegroundColor Yellow
        Write-Host ""
    }
    Read-Host "Press Enter to finish"
}

function Unregister-TaskScheduler {
    schtasks.exe /Delete /TN $TaskName /F 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Task '$TaskName' unregistered successfully from Task Scheduler." -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] Task '$TaskName' was not found in Task Scheduler." -ForegroundColor Gray
    }

    if (Test-Path $ShortcutPath) {
        Remove-Item -Path $ShortcutPath -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Startup shortcut removed." -ForegroundColor Yellow
    }
    Read-Host "Press Enter to finish"
}

if ($Action -eq "register") {
    Register-TaskScheduler
} elseif ($Action -eq "unregister") {
    Unregister-TaskScheduler
} elseif ($Action -eq "status") {
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host "  Prompt Surgeon AutoStart Status" -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Cyan

    $taskQuery = schtasks.exe /Query /TN $TaskName 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [ACTIVE ] Windows Task Scheduler ('$TaskName')" -ForegroundColor Green
        Write-Host "            Action: $TaskBatPath" -ForegroundColor Gray
        Write-Host "            Delay : 15s after logon" -ForegroundColor Gray
    } else {
        Write-Host "  [NOT SET] Windows Task Scheduler ('$TaskName')" -ForegroundColor Red
    }

    if (Test-Path $ShortcutPath) {
        Write-Host "  [ACTIVE ] Legacy Startup Shortcut (recommend unregister)" -ForegroundColor Yellow
    }
    Write-Host "=================================================" -ForegroundColor Cyan
}
