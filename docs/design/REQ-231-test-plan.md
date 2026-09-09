# REQ-231 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

PowerShell CLI から各ライフサイクルコマンドを実行し、ステータス判定およびプロセス制御を機械的・定量的に検証する。

### 1-1. 構文・ヘルプ・引数テスト
```powershell
powershell.exe -Command "Get-Command -Syntax tools/server-manager/server-manager.ps1"
```
- **期待値**: 
  - stdout に `[-Action <string>]` および `[-Service <string>]`, `[-Background]`, `[-Json]` が出力されること。

### 1-2. 設定ファイル整合性テスト
```powershell
powershell.exe -Command "$valid = (Test-Path tools/server-manager/config.json) -and ((Get-Content tools/server-manager/config.json | ConvertFrom-Json) -ne $null); Write-Output $valid; if (-not $valid) { exit 1 }"
```
- **期待値**: 
  - Exit Code: `0`
  - stdout: `True`

### 1-3. JSON 出力テスト (-Json flag)
```powershell
powershell.exe -Command "$res = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json | ConvertFrom-Json; Write-Output ($res.fe.port -eq 5173 -and $res.be.port -eq 8000 -and $res.comfy.port -eq 8188)"
```
- **期待値**:
  - Exit Code: `0`
  - stdout: `True`（`fe.port === 5173`, `be.port === 8000`, `comfy.port === 8188` の型と値が厳密に検証されること）

---

## 2. 結合・ライフサイクル検証 (Integration Verification)

### シナリオ 1: ワンクリック起動・停止テスト
1. **起動実行**:
   ```powershell
   cmd.exe /c "tools\server-manager\start_servers.bat"
   Start-Sleep -Seconds 5
   ```
   - **検証コマンド**:
     ```powershell
     powershell.exe -Command "$res = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json | ConvertFrom-Json; Write-Output ($res.fe.running -or $res.be.running -or $res.comfy.running)"
     ```
   - **期待値**:
     - stdout: `True`（少なくともいずれかのサービスが起動シーケンスを開始し、プロセスまたはポートが検出されること）

2. **一括停止実行**:
   ```powershell
   cmd.exe /c "tools\server-manager\stop_servers.bat"
   Start-Sleep -Seconds 3
   ```
   - **検証コマンド**:
     ```powershell
     powershell.exe -Command "$res = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json | ConvertFrom-Json; Write-Output ($res.fe.status -eq 'STOPPED' -and $res.be.status -eq 'STOPPED' -and $res.comfy.status -eq 'STOPPED')"
     ```
   - **期待値**:
     - stdout: `True`（全3サービスの `status` 文字列が完全一致で `'STOPPED'` であること）

### シナリオ 2: Web 管理マイクロサービス検証 (ブラウザ操作基盤)
1. **Web サービス起動**:
   ```powershell
   $webProc = Start-Process python -ArgumentList "tools/server-manager/server_api.py" -PassThru
   Start-Sleep -Seconds 2
   ```
2. **HTTP API 応答検証**:
   ```powershell
   $statusRes = Invoke-RestMethod -Uri "http://localhost:8899/api/status" -Method Get
   $configRes = Invoke-RestMethod -Uri "http://localhost:8899/api/config" -Method Get
   Write-Output ($statusRes.fe.port -eq 5173 -and $configRes.wsl.port -eq 8188)
   ```
   - **期待値**:
     - stdout: `True`（API から取得したポート番号が設定値と完全一致すること）
3. **Web サービス終了**:
   ```powershell
   Stop-Process -Id $webProc.Id -Force
   ```

### シナリオ 3: Red Teaming (ポート占有・強制解放テスト)
- **3-1. 疑似ポート占有**:
  ```powershell
  $dummyProc = Start-Process powershell.exe -ArgumentList "-Command `"`$l = [System.Net.Sockets.TcpListener]8000; `$l.Start(); Start-Sleep -Seconds 60`"" -PassThru
  Start-Sleep -Seconds 1
  ```
- **3-2. 解放検証**:
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action stop
  $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
  Write-Output ($null -eq $conn)
  ```
  - **期待値**:
    - stdout: `True`（ポート 8000 が確実に強制解放されたこと）

---

## 3. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design/REQ-231-test-plan.md` を実行し、PASS を確認。
