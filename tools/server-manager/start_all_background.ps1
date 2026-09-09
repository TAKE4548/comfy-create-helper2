$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $SCRIPT_DIR

$LOGS_DIR = Join-Path $SCRIPT_DIR "logs"
if (-not (Test-Path $LOGS_DIR)) {
    New-Item -ItemType Directory -Path $LOGS_DIR | Out-Null
}

# 1. Web Manager (Port 8899)
$conn = Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
if (-not $conn) {
    $webLog = Join-Path $LOGS_DIR "web_manager.log"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c run_web_manager.bat > `"$webLog`" 2>&1" -WorkingDirectory $SCRIPT_DIR -WindowStyle Hidden
}

# 2. All Services (ComfyUI, Backend, Frontend)
$smPath = Join-Path $SCRIPT_DIR "server-manager.ps1"
Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$smPath`" -Action start -Background" -WorkingDirectory $SCRIPT_DIR -WindowStyle Hidden
