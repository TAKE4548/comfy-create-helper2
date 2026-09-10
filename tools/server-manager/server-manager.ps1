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

function Start-ProcessNoWindow ([string]$filePath, [string]$arguments, [string]$workingDirectory = "") {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $filePath
    $psi.Arguments = $arguments
    if ($workingDirectory) {
        $psi.WorkingDirectory = $workingDirectory
    }
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    return [System.Diagnostics.Process]::Start($psi)
}

function Test-PortConnect ([string]$targetHost = "127.0.0.1", [int]$port, [int]$timeoutMs = 500) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $tcp.BeginConnect($targetHost, $port, $null, $null)
        $wait = $ar.AsyncWaitHandle.WaitOne($timeoutMs, $false)
        if (-not $wait) {
            return $false
        }
        $tcp.EndConnect($ar)
        return $true
    } catch {
        return $false
    } finally {
        $tcp.Close()
        $tcp.Dispose()
    }
}

function Test-PortOpen ([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    if ($null -ne $conn) {
        return $true
    }
    return (Test-PortConnect -targetHost "127.0.0.1" -port $port -timeoutMs 500)
}



function Get-PidsFromPort ([int]$port) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    if ($conns) {
        $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
        return ,@($pids)
    }
    return ,@()
}

function Get-ServiceWaitConfig ([string]$serviceKey) {
    $defaultTimeout = 15
    $defaultRetryCount = 2
    $defaultRetryInterval = 1

    if ($cfg.port_wait) {
        if ($null -ne $cfg.port_wait.default_timeout_sec) { $defaultTimeout = [int]$cfg.port_wait.default_timeout_sec }
        if ($null -ne $cfg.port_wait.default_retry_count) { $defaultRetryCount = [int]$cfg.port_wait.default_retry_count }
        if ($null -ne $cfg.port_wait.default_retry_interval_sec) { $defaultRetryInterval = [int]$cfg.port_wait.default_retry_interval_sec }
    }

    if ($serviceKey.ToLower() -eq "comfy" -or $serviceKey.ToLower() -eq "wsl") {
        $svc = $cfg.wsl
        $fallbackTimeout = 30
        $fallbackRetry = 3
        $fallbackInterval = 2
    } elseif ($serviceKey.ToLower() -eq "backend") {
        $svc = $cfg.backend
        $fallbackTimeout = $defaultTimeout
        $fallbackRetry = $defaultRetryCount
        $fallbackInterval = $defaultRetryInterval
    } elseif ($serviceKey.ToLower() -eq "frontend") {
        $svc = $cfg.frontend
        $fallbackTimeout = $defaultTimeout
        $fallbackRetry = $defaultRetryCount
        $fallbackInterval = $defaultRetryInterval
    } else {
        $svc = $null
        $fallbackTimeout = $defaultTimeout
        $fallbackRetry = $defaultRetryCount
        $fallbackInterval = $defaultRetryInterval
    }

    $timeout = $fallbackTimeout
    $retry = $fallbackRetry
    $interval = $fallbackInterval

    if ($svc) {
        if ($null -ne $svc.wait_timeout_sec) { $timeout = [int]$svc.wait_timeout_sec }
        if ($null -ne $svc.retry_count) { $retry = [int]$svc.retry_count }
        if ($null -ne $svc.retry_interval_sec) { $interval = [int]$svc.retry_interval_sec }
    }

    return [PSCustomObject]@{
        timeoutSec = $timeout
        retryCount = $retry
        retryIntervalSec = $interval
    }
}

function Wait-For-Port ([int]$port, [int]$timeoutSec = 15, [int]$retryCount = 0, [int]$retryIntervalSec = 1, [string]$serviceName = "") {
    $totalAttempts = 1 + [Math]::Max(0, $retryCount)
    $namePrefix = if ($serviceName) { "[$serviceName] " } else { "" }

    for ($attempt = 1; $attempt -le $totalAttempts; $attempt++) {
        $elapsed = 0
        while ($elapsed -lt $timeoutSec) {
            if (Test-PortOpen $port) {
                return $true
            }
            Start-Sleep -Seconds 1
            $elapsed++
        }

        if (Test-PortOpen $port) {
            return $true
        }

        if ($attempt -lt $totalAttempts) {
            Write-Host "${namePrefix}Port $port not open yet after ${timeoutSec}s. Retrying ($attempt/$retryCount) in ${retryIntervalSec}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $retryIntervalSec
        }
    }

    Write-Host "${namePrefix}Failed to open port $port after $totalAttempts attempt(s) (timeout: ${timeoutSec}s each)." -ForegroundColor Red
    return $false
}

function Wait-For-Port-Closed ([int]$port, [int]$timeoutSec = 10, [string]$serviceName = "") {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $timeoutMs = $timeoutSec * 1000
    $namePrefix = if ($serviceName) { "[$serviceName] " } else { "" }

    while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
        if (-not (Test-PortOpen $port)) {
            $sw.Stop()
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    $sw.Stop()
    Write-Host "${namePrefix}Port $port did not close within ${timeoutSec}s." -ForegroundColor Yellow
    return $false
}


function Wait-For-Service ([string]$serviceKey, [string]$displayName = "") {
    $key = $serviceKey.ToLower()
    $port = 0
    $name = if ($displayName) { $displayName } else { $serviceKey }

    if ($key -eq "comfy" -or $key -eq "wsl") {
        $port = [int]$cfg.wsl.port
        if (-not $displayName) { $name = "WSL ComfyUI" }
    } elseif ($key -eq "backend") {
        $port = [int]$cfg.backend.port
        if (-not $displayName) { $name = "Backend" }
    } elseif ($key -eq "frontend") {
        $port = [int]$cfg.frontend.port
        if (-not $displayName) { $name = "Frontend" }
    } else {
        Write-Host "Unknown service for wait: $serviceKey" -ForegroundColor Red
        return $false
    }

    $waitCfg = Get-ServiceWaitConfig $key
    return Wait-For-Port -port $port -timeoutSec $waitCfg.timeoutSec -retryCount $waitCfg.retryCount -retryIntervalSec $waitCfg.retryIntervalSec -serviceName $name
}

function Stop-PortProcesses ([int]$port, [string]$name) {
    $pids = Get-PidsFromPort $port
    foreach ($p in $pids) {
        try {
            # taskkill /T /F によりプロセスおよび配下の子プロセスツリー（cmd, node, esbuild等）を一括強制終了
            & taskkill.exe /PID $p /T /F 2>$null
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

function Get-WslComfyPids {
    $wslPrefix = Get-WslDistroPrefix
    try {
        $pidsRaw = Invoke-Expression "wsl $($wslPrefix)bash -c `"pgrep -f 'python.*main.py'`" 2>`$null"
        if ($LASTEXITCODE -eq 0 -and $pidsRaw) {
            $pids = @()
            foreach ($line in ($pidsRaw -split "`r?`n")) {
                $trimmed = $line.Trim()
                if ($trimmed -match '^\d+$') {
                    $pids += [int]$trimmed
                }
            }
            if ($pids.Count -gt 0) {
                return ,@($pids)
            }
        }
    } catch {}
    return ,@()
}

function Get-StatusObject {
    $fePids = Get-PidsFromPort $cfg.frontend.port
    $bePids = Get-PidsFromPort $cfg.backend.port
    $comfyPids = Get-PidsFromPort $cfg.wsl.port

    $comfyOpen = Test-PortOpen $cfg.wsl.port
    if ($comfyPids.Count -eq 0 -and $comfyOpen) {
        $wslPids = Get-WslComfyPids
        if ($wslPids.Count -gt 0) {
            $comfyPids = $wslPids
        }
    }

    $feRunning = ($fePids.Count -gt 0)
    $beRunning = ($bePids.Count -gt 0)
    $comfyRunning = $comfyOpen -or ($comfyPids.Count -gt 0)

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

function Get-WslDistroPrefix {
    [CmdletBinding()]
    [OutputType([string])]
    param()

    # 空文字または未定義の場合は "" を返し、-d を付与せずWSLの既定ディストリビューションを使用する
    if ($cfg.wsl.distro -and ($cfg.wsl.distro.ToString().Trim() -ne "")) {
        return "-d $($cfg.wsl.distro.ToString().Trim()) "
    }
    return ""
}

function Test-WslAvailability {
    [CmdletBinding()]
    [OutputType([bool])]
    param()

    $prefix = Get-WslDistroPrefix
    $cmd = "wsl $($prefix)echo OK"
    $check = Invoke-Expression $cmd 2>$null
    if ($LASTEXITCODE -ne 0 -or ($check -notcontains "OK" -and $check -notmatch "OK")) {
        $target = if ($prefix -ne "") { "WSL distribution '$($cfg.wsl.distro)'" } else { "Default WSL distribution" }
        Write-Host "[ERROR] $target was not found or is unavailable." -ForegroundColor Red
        Write-Host "        Hint: Run 'wsl -l -v' to check installed distributions, or set distro to `"`" in config.json to use the default." -ForegroundColor Yellow
        return $false
    }
    return $true
}

function Start-ComfyUIProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.wsl.port) {
        Write-Host "ComfyUI is already running on port $($cfg.wsl.port)." -ForegroundColor Yellow
        return
    }

    if (-not (Test-WslAvailability)) {
        return
    }

    $wslPrefix = Get-WslDistroPrefix
    $cmdStr = "cd $($cfg.wsl.project_dir) && if [ -f '$($cfg.wsl.venv_activate)' ]; then source $($cfg.wsl.venv_activate); fi && cd $($cfg.wsl.comfy_dir) && export PYTORCH_HIP_ALLOC_CONF='$($cfg.wsl.env_vars.PYTORCH_HIP_ALLOC_CONF)' && $($cfg.wsl.start_command)"

    if ($asBackground) {
        $logFile = Join-Path $LOGS_DIR "comfy.log"
        Start-ProcessNoWindow "cmd.exe" "/c wsl $($wslPrefix)bash -c `"$cmdStr`" > `"$logFile`" 2>&1"
    } else {
        Start-Process "cmd.exe" -ArgumentList "/k title ComfyUI (WSL2) && wsl $($wslPrefix)bash -c `"$cmdStr`""
    }
}

# サービス識別子の正規化
function Get-NormalizedServiceName ([string]$name) {
    if (-not $name) { return "" }
    switch ($name.ToLower()) {
        { $_ -in "fe", "frontend" } { return "frontend" }
        { $_ -in "be", "backend" } { return "backend" }
        { $_ -in "comfy", "wsl" } { return "comfy" }
        default { return "" }
    }
}

function Stop-ComfyUIProcess {
    $wslPrefix = Get-WslDistroPrefix
    try {
        Invoke-Expression "wsl $($wslPrefix)bash -c `"pkill -f 'python.*main.py'`" 2>`$null"
    } catch {}

    $closed = Wait-For-Port-Closed -port $cfg.wsl.port -timeoutSec 5 -serviceName "WSL ComfyUI"
    if (-not $closed) {
        try {
            Invoke-Expression "wsl $($wslPrefix)bash -c `"pkill -9 -f 'python.*main.py'`" 2>`$null"
            Start-Sleep -Seconds 2
        } catch {}
    }

    # クリーンアップ: ウィンドウ起動時の残骸 cmd.exe プロセスを回収
    try {
        Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*ComfyUI (WSL2)*" } | ForEach-Object {
            & taskkill.exe /PID $_.Id /T /F 2>$null
        }
    } catch {}

    # 注意: Windows 側の Stop-PortProcesses $cfg.wsl.port は実行しない。
    # WSL2 Mirrored モードでは Windows 側の 8188 は WSL ホストプロキシが LISTEN しており、
    # それを taskkill すると WSL2 との通信ブリッジが破損するため。
}


function Start-BackendProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.backend.port) {
        Write-Host "Backend is already running on port $($cfg.backend.port)." -ForegroundColor Yellow
        return
    }
    $beDir = (Resolve-Path (Join-Path $SCRIPT_DIR $cfg.backend.relative_dir)).Path

    if ($asBackground) {
        $logFile = Join-Path $LOGS_DIR "backend.log"
        Start-ProcessNoWindow "cmd.exe" "/c run_server.bat > `"$logFile`" 2>&1" $beDir
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title PromptSurgeon Backend && run_server.bat" -WorkingDirectory $beDir
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

    # 起動前に .vite ディレクトリの ReadOnly 属性ビットを解除し、空洞化 deps を先行クリーンアップ
    $viteDir = Join-Path $feDir "node_modules\.vite"
    if (Test-Path $viteDir) {
        try {
            Get-ChildItem -Path $viteDir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
                    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
                }
            }
            $depsDir = Join-Path $viteDir "deps"
            $metaFile = Join-Path $depsDir "_metadata.json"
            if ((Test-Path $depsDir) -and (-not (Test-Path $metaFile))) {
                Remove-Item -Path $depsDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }

    if ($asBackground) {
        $logFile = Join-Path $LOGS_DIR "frontend.log"
        Start-ProcessNoWindow "cmd.exe" "/c $($cfg.frontend.start_cmd) > `"$logFile`" 2>&1" $feDir
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

    Write-Host "Waiting for ports to close..." -ForegroundColor Gray
    Wait-For-Port-Closed -port $cfg.wsl.port -timeoutSec 5 -serviceName "WSL ComfyUI" | Out-Null
    Wait-For-Port-Closed -port $cfg.backend.port -timeoutSec 5 -serviceName "Backend" | Out-Null
    Wait-For-Port-Closed -port $cfg.frontend.port -timeoutSec 5 -serviceName "Frontend" | Out-Null
}

function Start-AllServices ([bool]$asBackground) {
    Write-Host "[1/3] Starting WSL2 ComfyUI..." -ForegroundColor Yellow
    Start-ComfyUIProcess $asBackground
    Write-Host "[2/3] Starting Windows Backend..." -ForegroundColor Yellow
    Start-BackendProcess $asBackground
    Write-Host "[3/3] Starting Windows Frontend..." -ForegroundColor Yellow
    Start-FrontendProcess $asBackground

    Write-Host "`nWaiting for ports to open..." -ForegroundColor Gray
    Wait-For-Service "comfy" "WSL ComfyUI" | Out-Null
    Wait-For-Service "backend" "Backend" | Out-Null
    Wait-For-Service "frontend" "Frontend" | Out-Null

    Show-Status
}

function Restart-ServiceByName ([string]$name, [bool]$asBackground) {
    $normalized = Get-NormalizedServiceName $name
    switch ($normalized) {
        "comfy" {
            Write-Host "Restarting WSL2 ComfyUI..." -ForegroundColor Yellow
            Stop-ComfyUIProcess
            Wait-For-Port-Closed -port $cfg.wsl.port -timeoutSec 5 -serviceName "WSL ComfyUI" | Out-Null
            Start-ComfyUIProcess $asBackground
            Wait-For-Service "comfy" "WSL ComfyUI" | Out-Null
        }
        "backend" {
            Write-Host "Restarting Backend..." -ForegroundColor Yellow
            Stop-BackendProcess
            Wait-For-Port-Closed -port $cfg.backend.port -timeoutSec 5 -serviceName "Backend" | Out-Null
            Start-BackendProcess $asBackground
            Wait-For-Service "backend" "Backend" | Out-Null
        }
        "frontend" {
            Write-Host "Restarting Frontend..." -ForegroundColor Yellow
            Stop-FrontendProcess
            Wait-For-Port-Closed -port $cfg.frontend.port -timeoutSec 5 -serviceName "Frontend" | Out-Null
            Start-FrontendProcess $asBackground
            Wait-For-Service "frontend" "Frontend" | Out-Null
        }
        default {
            Write-Host "Unknown service: $name (choose: comfy/wsl, backend/be, frontend/fe)" -ForegroundColor Red
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
            $cLog = Join-Path $LOGS_DIR "comfy.log"
            if (Test-Path $cLog) {
                Get-Content $cLog -Tail 50
            } else {
                $wslPrefix = Get-WslDistroPrefix
                Invoke-Expression "wsl $($wslPrefix)tail -n 50 ~/comfyui.log"
            }
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
            Write-Host "=== ComfyUI Log ===" -ForegroundColor Cyan
            $cLog = Join-Path $LOGS_DIR "comfy.log"
            if (Test-Path $cLog) { Get-Content $cLog -Tail 20 }
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
            $normalized = Get-NormalizedServiceName $Service
            switch ($normalized) {
                "comfy" { Start-ComfyUIProcess $Background; Wait-For-Service "comfy" "WSL ComfyUI" | Out-Null; Show-Status }
                "backend" { Start-BackendProcess $Background; Wait-For-Service "backend" "Backend" | Out-Null; Show-Status }
                "frontend" { Start-FrontendProcess $Background; Wait-For-Service "frontend" "Frontend" | Out-Null; Show-Status }
                default { Write-Host "Unknown service: $Service (choose: comfy/wsl, backend/be, frontend/fe)" -ForegroundColor Red }
            }
        } else {
            Start-AllServices $Background
        }
    }
    "stop" {
        if ($Service) {
            $normalized = Get-NormalizedServiceName $Service
            switch ($normalized) {
                "comfy" { Stop-ComfyUIProcess; Show-Status }
                "backend" { Stop-BackendProcess; Show-Status }
                "frontend" { Stop-FrontendProcess; Show-Status }
                default { Write-Host "Unknown service: $Service (choose: comfy/wsl, backend/be, frontend/fe)" -ForegroundColor Red }
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
