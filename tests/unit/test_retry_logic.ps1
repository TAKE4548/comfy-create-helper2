
function Test-PortOpen ([int]$port) {
    return $false
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

Write-Host "=== TEST 1: RETRY ON UNOPENED PORT ==="
$res = Wait-For-Port -port 59999 -timeoutSec 1 -retryCount 2 -retryIntervalSec 1 -serviceName 'MockTest'
Write-Host "RETURN_VALUE: $res"

Write-Host "`n=== TEST 2: SUCCESS ON SECOND ATTEMPT ==="
$script:callCount = 0
function Test-PortOpenMock ([int]$port) {
    $script:callCount++
    if ($script:callCount -ge 2) { return $true }
    return $false
}

function Wait-For-PortMock ([int]$port, [int]$timeoutSec = 15, [int]$retryCount = 0, [int]$retryIntervalSec = 1, [string]$serviceName = "") {
    $totalAttempts = 1 + [Math]::Max(0, $retryCount)
    $namePrefix = if ($serviceName) { "[$serviceName] " } else { "" }

    for ($attempt = 1; $attempt -le $totalAttempts; $attempt++) {
        $elapsed = 0
        while ($elapsed -lt $timeoutSec) {
            if (Test-PortOpenMock $port) {
                return $true
            }
            Start-Sleep -Seconds 1
            $elapsed++
        }

        if (Test-PortOpenMock $port) {
            return $true
        }

        if ($attempt -lt $totalAttempts) {
            Write-Host "${namePrefix}Port $port not open yet after ${timeoutSec}s. Retrying ($attempt/$retryCount) in ${retryIntervalSec}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $retryIntervalSec
        }
    }
    return $false
}

$resSuccess = Wait-For-PortMock -port 59998 -timeoutSec 1 -retryCount 2 -retryIntervalSec 1 -serviceName 'MockSuccess'
Write-Host "RETURN_SUCCESS: $resSuccess"
