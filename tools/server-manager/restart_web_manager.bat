@echo off
title Prompt Surgeon - Restart Web Manager
cd /d "%~dp0"

powershell.exe -ExecutionPolicy Bypass -NoProfile -Command ^
  "$port = 8899;" ^
  "$windowed = '%*' -match '-Windowed|--windowed';" ^
  "Write-Host '========================================================' -ForegroundColor Cyan;" ^
  "Write-Host '  Prompt Surgeon - Restart Web Manager (Port 8899)' -ForegroundColor Cyan;" ^
  "Write-Host '========================================================' -ForegroundColor Cyan;" ^
  "" ^
  "Write-Host '[1/4] Checking for existing Web Manager process on port ' -NoNewline; Write-Host $port -ForegroundColor Yellow;" ^
  "$conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen';" ^
  "$oldPids = @();" ^
  "if ($conns) {" ^
  "    $oldPids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "    foreach ($p in $oldPids) {" ^
  "        Write-Host ('      Stopping PID ' + $p + '...') -ForegroundColor Yellow;" ^
  "        & taskkill.exe /PID $p /T /F 2>$null;" ^
  "        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue;" ^
  "    }" ^
  "} else {" ^
  "    Write-Host '      Web Manager is not currently running.' -ForegroundColor Gray;" ^
  "}" ^
  "" ^
  "Write-Host '[2/4] Waiting for port ' -NoNewline; Write-Host $port -NoNewline -ForegroundColor Yellow; Write-Host ' to be released...';" ^
  "$sw = [System.Diagnostics.Stopwatch]::StartNew();" ^
  "$freed = $false;" ^
  "while ($sw.ElapsedMilliseconds -lt 4000) {" ^
  "    $check = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen';" ^
  "    if (-not $check) { $freed = $true; break; }" ^
  "    Start-Sleep -Milliseconds 500;" ^
  "};" ^
  "if (-not $freed -and $oldPids.Count -gt 0) {" ^
  "    Write-Host '      Standard kill failed (Process may be elevated). Requesting admin elevation...' -ForegroundColor Yellow;" ^
  "    $pidArgs = ($oldPids | ForEach-Object { '/PID ' + $_ }) -join ' ';" ^
  "    $elevateCmd = 'taskkill.exe ' + $pidArgs + ' /T /F';" ^
  "    Start-Process -FilePath 'powershell.exe' -ArgumentList ('-Command ' + [char]34 + $elevateCmd + [char]34) -Verb RunAs -Wait -WindowStyle Hidden;" ^
  "    Start-Sleep -Seconds 1;" ^
  "    $check = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen';" ^
  "    if (-not $check) { $freed = $true; }" ^
  "};" ^
  "$sw.Stop();" ^
  "if (-not $freed) {" ^
  "    Write-Host ('      [ERROR] Port ' + $port + ' could not be released. Existing PID(s): ' + ($oldPids -join ', ')) -ForegroundColor Red;" ^
  "    Write-Host '      Please close the process manually or run this batch as Administrator.' -ForegroundColor Yellow;" ^
  "    pause;" ^
  "    exit 1;" ^
  "}" ^
  "Write-Host '      Port is free.' -ForegroundColor Green;" ^
  "" ^
  "Write-Host '[3/4] Starting new Web Manager process...';" ^
  "$logsDir = Join-Path (Get-Location).Path 'logs';" ^
  "if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null };" ^
  "$webLog = Join-Path $logsDir 'web_manager.log';" ^
  "if ($windowed) {" ^
  "    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k title Prompt Surgeon - Web Manager ^&^& run_web_manager.bat' -WorkingDirectory (Get-Location).Path;" ^
  "} else {" ^
  "    Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c run_web_manager.bat > ' + [char]34 + $webLog + [char]34 + ' 2>&1') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden;" ^
  "}" ^
  "" ^
  "Write-Host '[4/4] Verifying Web Manager startup on port ' -NoNewline; Write-Host $port -NoNewline -ForegroundColor Yellow; Write-Host '...';" ^
  "$sw = [System.Diagnostics.Stopwatch]::StartNew();" ^
  "$newPid = $null;" ^
  "while ($sw.ElapsedMilliseconds -lt 15000) {" ^
  "    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen';" ^
  "    if ($conn) {" ^
  "        $candidatePids = @($conn | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "        foreach ($cp in $candidatePids) {" ^
  "            if ($oldPids -notcontains $cp) {" ^
  "                $newPid = $cp;" ^
  "                break;" ^
  "            } ^" ^
  "        }" ^
  "        if ($newPid) { break; }" ^
  "    }" ^
  "    Start-Sleep -Milliseconds 500;" ^
  "};" ^
  "$sw.Stop();" ^
  "if ($newPid) {" ^
  "    Write-Host ('      Web Manager is successfully running (PID: ' + $newPid + ')!') -ForegroundColor Green;" ^
  "    Write-Host '      Opening http://localhost:8899 in default browser...' -ForegroundColor Cyan;" ^
  "    Start-Process 'http://localhost:8899';" ^
  "    Write-Host 'Restart completed successfully.' -ForegroundColor Green;" ^
  "    Start-Sleep -Seconds 2;" ^
  "} else {" ^
  "    Write-Host ('      [ERROR] Web Manager failed to bind to port ' + $port) -ForegroundColor Red;" ^
  "    Write-Host ('      Check error log: ' + $webLog) -ForegroundColor Yellow;" ^
  "    pause;" ^
  "    exit 1;" ^
  "}"
