# test_server_manager_wsl_timeout.ps1
# REQ-257-T1: WSL/Process timeout protection and TIMEOUT status propagation unit tests

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$serverManagerScript = Join-Path $projectRoot "tools\server-manager\server-manager.ps1"

Write-Host "=== Running test_server_manager_wsl_timeout.ps1 ===" -ForegroundColor Cyan
Write-Host "Target script path: $serverManagerScript"

. "$serverManagerScript" -Action "none"

$allPassed = $true

function Assert-Condition($condition, $testName) {
    if ($condition) {
        Write-Host "  [PASS] $testName" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $testName" -ForegroundColor Red
        $script:allPassed = $false
    }
}

# --- Test 1: Normal Process Execution ---
Write-Host "`nTest 1: Normal Process Execution" -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$res1 = Invoke-ProcessWithTimeout "cmd.exe" "/c exit 0" 3
$sw.Stop()

Assert-Condition ($null -ne $res1) "Result is not null"
Assert-Condition (-not $res1.TimedOut) "TimedOut is False"
Assert-Condition ($res1.ExitCode -eq 0) "ExitCode is 0"
Assert-Condition ($sw.ElapsedMilliseconds -le 2000) "Execution time <= 2000ms (took $($sw.ElapsedMilliseconds)ms)"

# --- Test 2: Process Timeout Enforcement (2000ms) ---
Write-Host "`nTest 2: Process Timeout Enforcement (2000ms)" -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$res2 = Invoke-ProcessWithTimeout "powershell.exe" "-NoProfile -Command Start-Sleep -Seconds 10" 2
$sw.Stop()

Assert-Condition ($null -ne $res2) "Result is not null"
Assert-Condition ($res2.TimedOut) "TimedOut is True"
Assert-Condition ($res2.ExitCode -eq -1) "ExitCode is -1"
Assert-Condition ($sw.ElapsedMilliseconds -ge 1800 -and $sw.ElapsedMilliseconds -le 3500) "Execution duration is within expected timeout range (took $($sw.ElapsedMilliseconds)ms)"

# Check no lingering process
$lingering = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*Start-Sleep -Seconds 10*" }
Assert-Condition ($null -eq $lingering -or $lingering.Count -eq 0) "No lingering sleep process found"

# --- Test 3: Get-StatusObject WSL Timeout Status Handling ---
Write-Host "`nTest 3: Get-StatusObject WSL Timeout Status Handling" -ForegroundColor Yellow
$script:lastWslTimedOut = $true
$status = Get-StatusObject
Assert-Condition ($null -ne $status.fe) "Status has FE object"
Assert-Condition ($null -ne $status.be) "Status has BE object"
Assert-Condition ($null -ne $status.comfy) "Status has ComfyUI object"
Assert-Condition ($status.comfy.status -eq "TIMEOUT") "ComfyUI status is TIMEOUT when WSL timed out"
Assert-Condition ($status.comfy.error -like "*timeout*" -or $status.comfy.error -like "*TIMEOUT*" -or $status.comfy.error -like "*タイムアウト*") "ComfyUI error indicates timeout"
$script:lastWslTimedOut = $false

if ($allPassed) {
    Write-Host "`nAll tests passed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSome tests failed." -ForegroundColor Red
    exit 1
}

