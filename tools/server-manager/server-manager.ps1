param (
    [ValidateSet("start", "stop", "restart", "status", "toggle", "menu", "reboot-service", "logs")]
    [string]$Action = "menu",
    [string]$Service = "",
    [switch]$Background,
    [switch]$Json
)

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$CONFIG_PATH = Join-Path $SCRIPT_DIR "config.json"
if (-not (Test-Path $CONFIG_PATH)) {
    Write-Error "Config file not found: $CONFIG_PATH"
    exit 1
}

$cfg = Get-Content $CONFIG_PATH -Raw -Encoding UTF8 | ConvertFrom-Json
$LOGS_DIR = Join-Path $SCRIPT_DIR $cfg.logs_dir
if (-not (Test-Path $LOGS_DIR)) {
    New-Item -ItemType Directory -Path $LOGS_DIR | Out-Null
}

function Test-PortOpen ([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    return ($null -ne $conn)
}

function Get-PidsFromPort ([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    if ($conns) {
        $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
        return ,@($pids)
    }
    return ,@()
}

function Wait-For-Port ([int]$port, [int]$timeoutSec = 10) {
    $elapsed = 0
    while ($elapsed -lt $timeoutSec) {
        if (Test-PortOpen $port) { return $true }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    return (Test-PortOpen $port)
}

function Stop-PortProcesses ([int]$port, [string]$name) {
    $pids = Get-PidsFromPort $port
    foreach ($p in $pids) {
        try {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

function Get-StatusObject {
    $fePids = Get-PidsFromPort $cfg.frontend.port
    $bePids = Get-PidsFromPort $cfg.backend.port
    $comfyPids = Get-PidsFromPort $cfg.wsl.port

    $feRunning = ($fePids.Count -gt 0)
    $beRunning = ($bePids.Count -gt 0)
    $comfyRunning = ($comfyPids.Count -gt 0)

    return [PSCustomObject]@{
        fe = [PSCustomObject]@{
            name = "React FE"
            port = $cfg.frontend.port
            running = $feRunning
            status = if ($feRunning) { "LISTEN" } else { "STOPPED" }
            pids = $fePids
        }
        be = [PSCustomObject]@{
            name = "Win BE"
            port = $cfg.backend.port
            running = $beRunning
            status = if ($beRunning) { "LISTEN" } else { "STOPPED" }
            pids = $bePids
        }
        comfy = [PSCustomObject]@{
            name = "WSL ComfyUI"
            port = $cfg.wsl.port
            running = $comfyRunning
            status = if ($comfyRunning) { "LISTEN" } else { "STOPPED" }
            pids = $comfyPids
        }
    }
}

function Show-Status {
    $statusObj = Get-StatusObject
    if ($Json) {
        $statusObj | ConvertTo-Json -Depth 5
    } else {
        Write-Host "=================================================" -ForegroundColor Cyan
        Write-Host "  Prompt Surgeon & ComfyUI Server Status" -ForegroundColor Cyan
        Write-Host "=================================================" -ForegroundColor Cyan
        foreach ($prop in $statusObj.PSObject.Properties) {
            $item = $prop.Value
            $col = if ($item.running) { "Green" } else { "Red" }
            $pidsStr = if ($item.pids.Count -gt 0) { " (PID: $($item.pids -join ', '))" } else { "" }
            Write-Host ("  [{0,-7}] {1,-15} : Port {2}{3}" -f $item.status, $item.name, $item.port, $pidsStr) -ForegroundColor $col
        }
        Write-Host "=================================================" -ForegroundColor Cyan
    }
}

function Start-ComfyUIProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.wsl.port) {
        Write-Host "ComfyUI is already running on port $($cfg.wsl.port)." -ForegroundColor Yellow
        return
    }
    $distro = if ($cfg.wsl.distro) { $cfg.wsl.distro } else { "Ubuntu" }
    $cmdStr = "cd $($cfg.wsl.project_dir) && if [ -f '$($cfg.wsl.venv_activate)' ]; then source $($cfg.wsl.venv_activate); fi && cd $($cfg.wsl.comfy_dir) && export PYTORCH_HIP_ALLOC_CONF='$($cfg.wsl.env_vars.PYTORCH_HIP_ALLOC_CONF)' && $($cfg.wsl.start_command)"

    if ($asBackground) {
        wsl -d $distro bash -c "nohup bash -c `"$cmdStr`" > ~/comfyui.log 2>&1 &"
    } else {
        Start-Process "cmd.exe" -ArgumentList "/k title ComfyUI (WSL2) && wsl -d $distro bash -c `"$cmdStr`""
    }
}

function Stop-ComfyUIProcess {
    $distro = if ($cfg.wsl.distro) { $cfg.wsl.distro } else { "Ubuntu" }
    try {
        wsl -d $distro bash -c "pkill -f 'python.*main.py.*8188' || pkill -f 'python.*main.py'" 2>$null
    } catch {}
    Stop-PortProcesses $cfg.wsl.port "ComfyUI"
}

function Start-BackendProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.backend.port) {
        Write-Host "Backend is already running on port $($cfg.backend.port)." -ForegroundColor Yellow
        return
    }
    $beDir = (Resolve-Path (Join-Path $SCRIPT_DIR $cfg.backend.relative_dir)).Path
    $pyExe = Join-Path $beDir $cfg.backend.venv_python
    if (-not (Test-Path $pyExe)) { $pyExe = "python.exe" }

    if ($asBackground) {
        $logFile = Join-Path $LOGS_DIR "backend.log"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$pyExe`" $($cfg.backend.start_args) > `"$logFile`" 2>&1" -WorkingDirectory $beDir -WindowStyle Hidden
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title PromptSurgeon Backend && `"$pyExe`" $($cfg.backend.start_args)" -WorkingDirectory $beDir
    }
}

function Stop-BackendProcess {
    Stop-PortProcesses $cfg.backend.port "Backend"
}

function Start-FrontendProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.frontend.port) {
        Write-Host "Frontend is already running on port $($cfg.frontend.port)." -ForegroundColor Yellow
        return
    }
    $feDir = (Resolve-Path (Join-Path $SCRIPT_DIR $cfg.frontend.relative_dir)).Path

    if ($asBackground) {
        $logFile = Join-Path $LOGS_DIR "frontend.log"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c $($cfg.frontend.start_cmd) > `"$logFile`" 2>&1" -WorkingDirectory $feDir -WindowStyle Hidden
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title PromptSurgeon Frontend && $($cfg.frontend.start_cmd)" -WorkingDirectory $feDir
    }
}

function Stop-FrontendProcess {
    Stop-PortProcesses $cfg.frontend.port "Frontend"
}

function Stop-AllServices {
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    Stop-ComfyUIProcess
    Stop-BackendProcess
    Stop-FrontendProcess
}

function Start-AllServices ([bool]$asBackground) {
    Write-Host "[1/3] Starting WSL2 ComfyUI..." -ForegroundColor Yellow
    Start-ComfyUIProcess $asBackground
    Write-Host "[2/3] Starting Windows Backend..." -ForegroundColor Yellow
    Start-BackendProcess $asBackground
    Write-Host "[3/3] Starting Windows Frontend..." -ForegroundColor Yellow
    Start-FrontendProcess $asBackground

    Write-Host "`nWaiting for ports to open (up to 10s)..." -ForegroundColor Gray
    Wait-For-Port $cfg.wsl.port 10 | Out-Null
    Wait-For-Port $cfg.backend.port 10 | Out-Null
    Wait-For-Port $cfg.frontend.port 10 | Out-Null

    Show-Status
}

function Restart-ServiceByName ([string]$name, [bool]$asBackground) {
    switch ($name.ToLower()) {
        "comfy" {
            Write-Host "Restarting WSL2 ComfyUI..." -ForegroundColor Yellow
            Stop-ComfyUIProcess
            Start-Sleep -Seconds 1
            Start-ComfyUIProcess $asBackground
            Wait-For-Port $cfg.wsl.port 10 | Out-Null
        }
        "backend" {
            Write-Host "Restarting Backend..." -ForegroundColor Yellow
            Stop-BackendProcess
            Start-Sleep -Seconds 1
            Start-BackendProcess $asBackground
            Wait-For-Port $cfg.backend.port 10 | Out-Null
        }
        "frontend" {
            Write-Host "Restarting Frontend..." -ForegroundColor Yellow
            Stop-FrontendProcess
            Start-Sleep -Seconds 1
            Start-FrontendProcess $asBackground
            Wait-For-Port $cfg.frontend.port 10 | Out-Null
        }
        default {
            Write-Host "Unknown service: $name (choose: comfy, backend, frontend)" -ForegroundColor Red
        }
    }
    Show-Status
}

function Toggle-Services ([bool]$asBackground) {
    $st = Get-StatusObject
    if ($st.fe.running -or $st.be.running -or $st.comfy.running) {
        Write-Host "Services are running. Stopping all services..." -ForegroundColor Yellow
        Stop-AllServices
    } else {
        Write-Host "Services are stopped. Starting all services..." -ForegroundColor Green
        Start-AllServices $asBackground
    }
    Show-Status
}

function Show-Logs ([string]$name) {
    switch ($name.ToLower()) {
        "comfy" {
            $distro = if ($cfg.wsl.distro) { $cfg.wsl.distro } else { "Ubuntu" }
            wsl -d $distro tail -n 50 ~/comfyui.log
        }
        "backend" {
            $logFile = Join-Path $LOGS_DIR "backend.log"
            if (Test-Path $logFile) { Get-Content $logFile -Tail 50 } else { Write-Host "No backend.log found" }
        }
        "frontend" {
            $logFile = Join-Path $LOGS_DIR "frontend.log"
            if (Test-Path $logFile) { Get-Content $logFile -Tail 50 } else { Write-Host "No frontend.log found" }
        }
        default {
            Write-Host "=== Backend Log ===" -ForegroundColor Cyan
            $bLog = Join-Path $LOGS_DIR "backend.log"
            if (Test-Path $bLog) { Get-Content $bLog -Tail 20 }
            Write-Host "=== Frontend Log ===" -ForegroundColor Cyan
            $fLog = Join-Path $LOGS_DIR "frontend.log"
            if (Test-Path $fLog) { Get-Content $fLog -Tail 20 }
        }
    }
}

function Show-InteractiveMenu {
    do {
        Clear-Host
        Show-Status
        Write-Host ""
        Write-Host " [1] Start All Services (Windowed)"
        Write-Host " [2] Start All Services (Background)"
        Write-Host " [3] Stop All Services"
        Write-Host " [4] Restart All Services"
        Write-Host " [5] Restart ComfyUI"
        Write-Host " [6] Restart Backend"
        Write-Host " [7] Restart Frontend"
        Write-Host " [8] View Logs"
        Write-Host " [R] Refresh Status"
        Write-Host " [Q] Exit"
        Write-Host ""
        $key = (Read-Host "Select option").Trim().ToUpper()
        switch ($key) {
            "1" { Start-AllServices $false; Read-Host "Press Enter to continue..." }
            "2" { Start-AllServices $true; Read-Host "Press Enter to continue..." }
            "3" { Stop-AllServices; Show-Status; Read-Host "Press Enter to continue..." }
            "4" { Stop-AllServices; Start-Sleep -Seconds 1; Start-AllServices $false; Read-Host "Press Enter to continue..." }
            "5" { Restart-ServiceByName "comfy" $false; Read-Host "Press Enter to continue..." }
            "6" { Restart-ServiceByName "backend" $false; Read-Host "Press Enter to continue..." }
            "7" { Restart-ServiceByName "frontend" $false; Read-Host "Press Enter to continue..." }
            "8" { Show-Logs ""; Read-Host "Press Enter to continue..." }
            "R" { }
            "Q" { break }
        }
    } while ($key -ne "Q")
}

# Main Execution Dispatch
switch ($Action.ToLower()) {
    "start" {
        if ($Service) {
            switch ($Service.ToLower()) {
                "comfy" { Start-ComfyUIProcess $Background; Wait-For-Port $cfg.wsl.port 10 | Out-Null; Show-Status }
                "backend" { Start-BackendProcess $Background; Wait-For-Port $cfg.backend.port 10 | Out-Null; Show-Status }
                "frontend" { Start-FrontendProcess $Background; Wait-For-Port $cfg.frontend.port 10 | Out-Null; Show-Status }
            }
        } else {
            Start-AllServices $Background
        }
    }
    "stop" {
        if ($Service) {
            switch ($Service.ToLower()) {
                "comfy" { Stop-ComfyUIProcess; Show-Status }
                "backend" { Stop-BackendProcess; Show-Status }
                "frontend" { Stop-FrontendProcess; Show-Status }
            }
        } else {
            Stop-AllServices
            Show-Status
        }
    }
    "restart" {
        if ($Service) {
            Restart-ServiceByName $Service $Background
        } else {
            Stop-AllServices
            Start-Sleep -Seconds 1
            Start-AllServices $Background
        }
    }
    "reboot-service" {
        if ($Service) {
            Restart-ServiceByName $Service $Background
        } else {
            Write-Host "Please specify -Service (comfy, backend, frontend)" -ForegroundColor Red
        }
    }
    "status" {
        Show-Status
    }
    "toggle" {
        Toggle-Services $Background
    }
    "logs" {
        Show-Logs $Service
    }
    "menu" {
        Show-InteractiveMenu
    }
}
