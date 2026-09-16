param (
    [ValidateSet("start", "stop", "restart", "status", "toggle", "menu", "reboot-service", "logs", "none")]
    [string]$Action = "menu",
    [string]$Service = "",
    [switch]$Background,
    [switch]$Json
)

$SCRIPT_DIR = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { Split-Path -Parent (Resolve-Path $MyInvocation.MyCommand.Definition).Path }
$CONFIG_PATH = Join-Path $SCRIPT_DIR "config.json"
if (-not (Test-Path $CONFIG_PATH)) { Write-Error "Config file not found: $CONFIG_PATH"; return }

$cfg = Get-Content $CONFIG_PATH -Raw -Encoding UTF8 | ConvertFrom-Json
$LOGS_DIR = Join-Path $SCRIPT_DIR $cfg.logs_dir
if (-not (Test-Path $LOGS_DIR)) { New-Item -ItemType Directory -Path $LOGS_DIR | Out-Null }

$script:lastWslTimedOut = $false

function Get-WslDistroPrefix {
    if ($cfg.wsl.distro -and ($cfg.wsl.distro.ToString().Trim() -ne "")) { return "-d $($cfg.wsl.distro.ToString().Trim()) " }
    return ""
}

# REQ-257: Process timeout defense (3s force-kill)
function Invoke-ProcessWithTimeout ([string]$filePath, [string]$arguments, [int]$timeoutSec = 3) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $filePath
    $psi.Arguments = $arguments
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    try {
        if (-not $proc.Start()) {
            return [PSCustomObject]@{
                ExitCode = -1; StdOut = ""; StdErr = "Failed to start process"; TimedOut = $false
            }
        }
        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()
        if ($proc.WaitForExit($timeoutSec * 1000)) {
            $stdoutTask.Wait(); $stderrTask.Wait()
            return [PSCustomObject]@{
                ExitCode = $proc.ExitCode; StdOut = $stdoutTask.Result; StdErr = $stderrTask.Result; TimedOut = $false
            }
        } else {
            try {
                & taskkill.exe /PID $proc.Id /T /F 2>$null
                $proc.Kill()
            } catch {}
            return [PSCustomObject]@{
                ExitCode = -1; StdOut = ""; StdErr = "Command timed out after ${timeoutSec}s"; TimedOut = $true
            }
        }
    } catch {
        return [PSCustomObject]@{
            ExitCode = -1; StdOut = ""; StdErr = $_.Exception.Message; TimedOut = $false
        }
    } finally {
        $proc.Dispose()
    }
}

function Invoke-WslWithTimeout ([string]$bashCommand, [int]$timeoutSec = 3) {
    $prefix = Get-WslDistroPrefix
    $res = Invoke-ProcessWithTimeout "wsl.exe" "$($prefix)bash -c `"$bashCommand`"" $timeoutSec
    if ($res.TimedOut) { $script:lastWslTimedOut = $true }
    return $res
}

function Test-WslAvailability {
    $res = Invoke-WslWithTimeout "echo OK" 3
    if ($res.TimedOut -or $res.ExitCode -ne 0 -or ($res.StdOut -notmatch "OK")) {
        $prefix = Get-WslDistroPrefix
        $target = if ($prefix -ne "") { "WSL distribution '$($cfg.wsl.distro)'" } else { "Default WSL distribution" }
        Write-Host "[ERROR] $target was not found, timed out, or is unavailable." -ForegroundColor Red
        Write-Host "        Hint: Run 'wsl -l -v' to check installed distributions." -ForegroundColor Yellow
        return $false
    }
    return $true
}

function Start-ProcessNoWindow ([string]$filePath, [string]$arguments, [string]$workingDirectory = "") {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $filePath
    $psi.Arguments = $arguments
    if ($workingDirectory) { $psi.WorkingDirectory = $workingDirectory }
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false
    return [System.Diagnostics.Process]::Start($psi)
}

function Test-PortOpen ([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    if ($null -ne $conn) { return $true }
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $ar = $tcp.BeginConnect("127.0.0.1", $port, $null, $null)
        $ok = $ar.AsyncWaitHandle.WaitOne(500, $false)
        if ($ok) { $tcp.EndConnect($ar) }
        return $ok
    } catch { return $false } finally { $tcp.Close(); $tcp.Dispose() }
}

function Stop-PortProcesses ([int]$port, [string]$name) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
    foreach ($p in @($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
        try { & taskkill.exe /PID $p /T /F 2>$null; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# REQ-262: BUNDLED mode detection (frontend/dist/index.html exists)
function Test-FrontendBundled {
    $feDistIndex = Join-Path $SCRIPT_DIR "../../frontend/dist/index.html"
    return (Test-Path $feDistIndex)
}

# Get server status - delegates to server_status.py (Python-native), fallback to local port check
function Get-StatusObject {
    $pyScript = Join-Path $SCRIPT_DIR "server_status.py"
    if (Test-Path $pyScript) {
        try {
            $res = Invoke-ProcessWithTimeout "python" "`"$pyScript`" --json" 5
            if ($res.ExitCode -eq 0 -and $res.StdOut.Trim()) { return ($res.StdOut | ConvertFrom-Json) }
        } catch {}
    }
    # Fallback: local port check
    $feOpen = Test-PortOpen $cfg.frontend.port
    $beOpen = Test-PortOpen $cfg.backend.port
    $comfyOpen = Test-PortOpen $cfg.wsl.port
    $isBundled = Test-FrontendBundled
    $feStatus = if ($feOpen) { "LISTEN" } elseif ($isBundled) { "BUNDLED" } else { "STOPPED" }
    $feName = if ($feOpen) { "React FE (Dev: 5173)" } elseif ($isBundled) { "React FE (Bundled on 8000)" } else { "React FE" }
    return [PSCustomObject]@{
        fe    = [PSCustomObject]@{ name = $feName; port = $cfg.frontend.port; running = ($feOpen -or ($isBundled -and $beOpen)); status = $feStatus; pids = @() }
        be    = [PSCustomObject]@{ name = "Win BE"; port = $cfg.backend.port; running = $beOpen; status = if ($beOpen) { "LISTEN" } else { "STOPPED" }; pids = @() }
        comfy = [PSCustomObject]@{ name = "WSL ComfyUI"; port = $cfg.wsl.port; running = $comfyOpen; status = if ($comfyOpen) { "LISTEN" } else { "STOPPED" }; pids = @() }
    }
}

function Show-Status {
    $st = Get-StatusObject
    if ($Json) {
        $st | ConvertTo-Json -Depth 5
    } else {
        Write-Host "=================================================" -ForegroundColor Cyan
        Write-Host "  Prompt Surgeon & ComfyUI Server Status" -ForegroundColor Cyan
        Write-Host "=================================================" -ForegroundColor Cyan
        foreach ($prop in $st.PSObject.Properties) {
            $item = $prop.Value
            $col = if ($item.running) { "Green" } else { "Red" }
            Write-Host ("  [{0,-7}] {1,-30} : Port {2}" -f $item.status, $item.name, $item.port) -ForegroundColor $col
        }
        Write-Host "=================================================" -ForegroundColor Cyan
    }
}

function Wait-For-Port ([int]$port, [int]$timeoutSec = 15, [string]$serviceName = "") {
    $elapsed = 0
    $prefix = if ($serviceName) { "[$serviceName] " } else { "" }
    while ($elapsed -lt $timeoutSec) {
        if (Test-PortOpen $port) { return $true }
        Start-Sleep -Seconds 1; $elapsed++
    }
    Write-Host "${prefix}Port $port not open after ${timeoutSec}s." -ForegroundColor Red
    return $false
}

function Wait-For-Port-Closed ([int]$port, [int]$timeoutSec = 10, [string]$serviceName = "") {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $prefix = if ($serviceName) { "[$serviceName] " } else { "" }
    while ($sw.ElapsedMilliseconds -lt ($timeoutSec * 1000)) {
        if (-not (Test-PortOpen $port)) { $sw.Stop(); return $true }
        Start-Sleep -Milliseconds 500
    }
    $sw.Stop()
    Write-Host "${prefix}Port $port did not close within ${timeoutSec}s." -ForegroundColor Yellow
    return $false
}

function Start-ComfyUIProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.wsl.port) { Write-Host "ComfyUI is already running on port $($cfg.wsl.port)." -ForegroundColor Yellow; return }
    if (-not (Test-WslAvailability)) { return }
    $wslPrefix = Get-WslDistroPrefix
    $cmdStr = "cd $($cfg.wsl.project_dir) && if [ -f '$($cfg.wsl.venv_activate)' ]; then source $($cfg.wsl.venv_activate); fi && cd $($cfg.wsl.comfy_dir) && export PYTORCH_HIP_ALLOC_CONF='$($cfg.wsl.env_vars.PYTORCH_HIP_ALLOC_CONF)' && $($cfg.wsl.start_command)"
    if ($asBackground) {
        Start-ProcessNoWindow "cmd.exe" "/c wsl $($wslPrefix)bash -c `"$cmdStr`" > `"$(Join-Path $LOGS_DIR 'comfy.log')`" 2>&1"
    } else {
        Start-Process "cmd.exe" -ArgumentList "/k title ComfyUI (WSL2) && wsl $($wslPrefix)bash -c `"$cmdStr`""
    }
}

# WSL2-Bridge protection: Do NOT call Stop-PortProcesses on port 8188
# (killing the Windows-side WSL2 Mirrored proxy would break the WSL2 communication bridge)
function Stop-ComfyUIProcess {
    try { Invoke-WslWithTimeout "pkill -f 'python.*main.py'" 3 | Out-Null } catch {}
    $closed = Wait-For-Port-Closed -port $cfg.wsl.port -timeoutSec 5 -serviceName "WSL ComfyUI"
    if (-not $closed) {
        try { Invoke-WslWithTimeout "pkill -9 -f 'python.*main.py'" 3 | Out-Null; Start-Sleep -Seconds 2 } catch {}
    }
    try {
        Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*ComfyUI (WSL2)*" } | ForEach-Object {
            & taskkill.exe /PID $_.Id /T /F 2>$null
        }
    } catch {}
}

function Start-BackendProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.backend.port) { Write-Host "Backend is already running on port $($cfg.backend.port)." -ForegroundColor Yellow; return }
    $beDir = (Resolve-Path (Join-Path $SCRIPT_DIR $cfg.backend.relative_dir)).Path
    $beArgs = "--host 0.0.0.0 --port $($cfg.backend.port)"
    if ($asBackground) {
        Start-ProcessNoWindow "cmd.exe" "/c run_server.bat $beArgs > `"$(Join-Path $LOGS_DIR 'backend.log')`" 2>&1" $beDir
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title PromptSurgeon Backend && run_server.bat $beArgs" -WorkingDirectory $beDir
    }
}

function Stop-BackendProcess { Stop-PortProcesses $cfg.backend.port "Backend" }

# Vite Cache EPERM fix: clear ReadOnly bits and hollow deps before starting
function Start-FrontendProcess ([bool]$asBackground) {
    if (Test-PortOpen $cfg.frontend.port) { Write-Host "Frontend is already running on port $($cfg.frontend.port)." -ForegroundColor Yellow; return }
    $feDir = (Resolve-Path (Join-Path $SCRIPT_DIR $cfg.frontend.relative_dir)).Path
    $viteDir = Join-Path $feDir "node_modules\.vite"
    if (Test-Path $viteDir) {
        try {
            Get-ChildItem -Path $viteDir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_.Attributes -band [System.IO.FileAttributes]::ReadOnly) {
                    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
                }
            }
            $depsDir = Join-Path $viteDir "deps"
            if ((Test-Path $depsDir) -and (-not (Test-Path (Join-Path $depsDir "_metadata.json")))) {
                Remove-Item -Path $depsDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }
    if ($asBackground) {
        Start-ProcessNoWindow "cmd.exe" "/c $($cfg.frontend.start_cmd) > `"$(Join-Path $LOGS_DIR 'frontend.log')`" 2>&1" $feDir
    } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k title PromptSurgeon Frontend && $($cfg.frontend.start_cmd)" -WorkingDirectory $feDir
    }
}

function Stop-FrontendProcess { Stop-PortProcesses $cfg.frontend.port "Frontend" }

function Stop-AllServices {
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    Stop-ComfyUIProcess; Stop-BackendProcess; Stop-FrontendProcess
    Wait-For-Port-Closed -port $cfg.wsl.port -timeoutSec 5 -serviceName "WSL ComfyUI" | Out-Null
    Wait-For-Port-Closed -port $cfg.backend.port -timeoutSec 5 -serviceName "Backend" | Out-Null
    Wait-For-Port-Closed -port $cfg.frontend.port -timeoutSec 5 -serviceName "Frontend" | Out-Null
}

function Start-AllServices ([bool]$asBackground) {
    Write-Host "[1/3] Starting WSL2 ComfyUI..." -ForegroundColor Yellow; Start-ComfyUIProcess $asBackground
    Write-Host "[2/3] Starting Windows Backend..." -ForegroundColor Yellow; Start-BackendProcess $asBackground
    $isBundled = Test-FrontendBundled
    if ($isBundled) {
        Write-Host "[3/3] Frontend is bundled into Backend (Port $($cfg.backend.port)) - Skipping dev server" -ForegroundColor Green
    } else {
        Write-Host "[3/3] Starting Windows Frontend..." -ForegroundColor Yellow; Start-FrontendProcess $asBackground
    }
    Write-Host "`nWaiting for ports to open..." -ForegroundColor Gray
    Wait-For-Port -port $cfg.wsl.port -timeoutSec 30 -serviceName "WSL ComfyUI" | Out-Null
    Wait-For-Port -port $cfg.backend.port -timeoutSec 15 -serviceName "Backend" | Out-Null
    if (-not $isBundled) { Wait-For-Port -port $cfg.frontend.port -timeoutSec 15 -serviceName "Frontend" | Out-Null }
    Show-Status
}

function Show-Logs ([string]$name) {
    $logMap = @{
        "comfy" = "comfy.log"; "wsl" = "comfy.log"
        "backend" = "backend.log"; "be" = "backend.log"
        "frontend" = "frontend.log"; "fe" = "frontend.log"
        "manager" = "web_manager.log"
    }
    if ($name -and $logMap.ContainsKey($name.ToLower())) {
        $f = Join-Path $LOGS_DIR $logMap[$name.ToLower()]
        if (Test-Path $f) { Get-Content $f -Tail 50 } else { Write-Host "No log file found for '$name'" }
    } else {
        foreach ($key in @("comfy", "backend", "frontend")) {
            Write-Host "=== $($key.ToUpper()) Log ===" -ForegroundColor Cyan
            $f = Join-Path $LOGS_DIR $logMap[$key]
            if (Test-Path $f) { Get-Content $f -Tail 20 }
        }
    }
}

function Show-InteractiveMenu {
    do {
        Clear-Host; Show-Status; Write-Host ""
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
            "5" { Stop-ComfyUIProcess; Wait-For-Port-Closed $cfg.wsl.port 5 "WSL ComfyUI" | Out-Null; Start-ComfyUIProcess $false; Wait-For-Port $cfg.wsl.port 30 "WSL ComfyUI" | Out-Null; Show-Status; Read-Host "Press Enter..." }
            "6" { Stop-BackendProcess; Wait-For-Port-Closed $cfg.backend.port 5 "Backend" | Out-Null; Start-BackendProcess $false; Wait-For-Port $cfg.backend.port 15 "Backend" | Out-Null; Show-Status; Read-Host "Press Enter..." }
            "7" { Stop-FrontendProcess; Wait-For-Port-Closed $cfg.frontend.port 5 "Frontend" | Out-Null; Start-FrontendProcess $false; Wait-For-Port $cfg.frontend.port 15 "Frontend" | Out-Null; Show-Status; Read-Host "Press Enter..." }
            "8" { Show-Logs ""; Read-Host "Press Enter to continue..." }
            "R" { }
            "Q" { break }
        }
    } while ($key -ne "Q")
}

# Main Execution Dispatch
switch ($Action.ToLower()) {
    "start" {
        switch ($Service.ToLower()) {
            { $_ -in "comfy", "wsl" }  { Start-ComfyUIProcess $Background; Wait-For-Port $cfg.wsl.port 30 "WSL ComfyUI" | Out-Null; Show-Status }
            { $_ -in "backend", "be" } { Start-BackendProcess $Background; Wait-For-Port $cfg.backend.port 15 "Backend" | Out-Null; Show-Status }
            { $_ -in "frontend", "fe" }{ Start-FrontendProcess $Background; Wait-For-Port $cfg.frontend.port 15 "Frontend" | Out-Null; Show-Status }
            default                    { Start-AllServices $Background }
        }
    }
    "stop" {
        switch ($Service.ToLower()) {
            { $_ -in "comfy", "wsl" }  { Stop-ComfyUIProcess; Show-Status }
            { $_ -in "backend", "be" } { Stop-BackendProcess; Show-Status }
            { $_ -in "frontend", "fe" }{ Stop-FrontendProcess; Show-Status }
            default                    { Stop-AllServices; Show-Status }
        }
    }
    { $_ -in "restart", "reboot-service" } {
        if ($Service) {
            switch ($Service.ToLower()) {
                { $_ -in "comfy", "wsl" }  { Write-Host "Restarting WSL2 ComfyUI..." -ForegroundColor Yellow; Stop-ComfyUIProcess; Wait-For-Port-Closed $cfg.wsl.port 5 "WSL ComfyUI" | Out-Null; Start-ComfyUIProcess $Background; Wait-For-Port $cfg.wsl.port 30 "WSL ComfyUI" | Out-Null }
                { $_ -in "backend", "be" } { Write-Host "Restarting Backend..." -ForegroundColor Yellow; Stop-BackendProcess; Wait-For-Port-Closed $cfg.backend.port 5 "Backend" | Out-Null; Start-BackendProcess $Background; Wait-For-Port $cfg.backend.port 15 "Backend" | Out-Null }
                { $_ -in "frontend", "fe" }{ Write-Host "Restarting Frontend..." -ForegroundColor Yellow; Stop-FrontendProcess; Wait-For-Port-Closed $cfg.frontend.port 5 "Frontend" | Out-Null; Start-FrontendProcess $Background; Wait-For-Port $cfg.frontend.port 15 "Frontend" | Out-Null }
                default                    { Write-Host "Unknown service: $Service (choose: comfy/wsl, backend/be, frontend/fe)" -ForegroundColor Red }
            }
            Show-Status
        } else { Stop-AllServices; Start-Sleep -Seconds 1; Start-AllServices $Background }
    }
    "status" { Show-Status }
    "toggle" {
        $st = Get-StatusObject
        if ($st.fe.running -or $st.be.running -or $st.comfy.running) { Stop-AllServices } else { Start-AllServices $Background }
        Show-Status
    }
    "logs"   { Show-Logs $Service }
    "menu"   { Show-InteractiveMenu }
}
