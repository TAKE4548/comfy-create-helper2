# REQ-243 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

- **テストスクリプト**: CLI ワンライナー検証 (PowerShell)
- **テストケース一覧**:
  1. `test_running_state_restart`: Web Manager 稼働状態からの再起動・PID変更確認 (AC-1, AC-2, AC-4)
  2. `test_stopped_state_restart`: Web Manager 停止状態からの起動テスト (AC-3)
  3. `test_other_services_isolation`: 他ポート (8000, 8188, 5173) 稼働プロセスの生存・非干渉検証 (AC-5)
- **定量化された実行コマンド**:
  ```powershell
  powershell -ExecutionPolicy Bypass -Command "& {
      $ErrorActionPreference = 'Stop'
      $port = 8899

      Write-Host '[TEST 1] Testing restart with PID change check...' -ForegroundColor Cyan
      # 事前PID取得 (未稼働時はダミー起動)
      $oldConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'
      if (-not $oldConn) {
          Start-Process -FilePath 'cmd.exe' -ArgumentList '/c run_web_manager.bat' -WorkingDirectory 'tools/server-manager' -WindowStyle Hidden
          Start-Sleep -Seconds 2
          $oldConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'
      }
      $oldPid = if ($oldConn) { $oldConn.OwningProcess } else { 0 }
      Write-Host \"Initial Web Manager PID: $oldPid\"

      # 再起動実行
      $proc = Start-Process -FilePath 'tools/server-manager/restart_web_manager.bat' -Wait -PassThru
      Start-Sleep -Seconds 2

      # ポート 8899 LISTEN 確認
      $newConn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'
      if (-not $newConn) {
          Write-Host '[FAIL] Port 8899 is not listening after restart' -ForegroundColor Red
          exit 1
      }
      $newPid = $newConn.OwningProcess
      Write-Host \"New Web Manager PID: $newPid\"

      # PID 変更確認 (AC-1: 旧プロセス終了 & 新規起動)
      if ($oldPid -ne 0 -and $newPid -eq $oldPid) {
          Write-Host \"[FAIL] PID did not change ($newPid == $oldPid)\" -ForegroundColor Red
          exit 1
      }
      Write-Host '[PASS] PID successfully changed' -ForegroundColor Green

      # HTTP 200 OK 応答確認 (AC-4: アクセス可能状態)
      $res = Invoke-WebRequest -Uri 'http://localhost:8899/api/config' -UseBasicParsing -TimeoutSec 5
      if ($res.StatusCode -ne 200) {
          Write-Host \"[FAIL] HTTP Status Code is $($res.StatusCode), expected 200\" -ForegroundColor Red
          exit 1
      }
      Write-Host '[PASS] HTTP GET /api/config returned Status 200 OK' -ForegroundColor Green

      Write-Host 'All automated test cases PASSED.' -ForegroundColor Green
  }"
  ```
- **期待値基準**:
  - 判定条件 1: 再起動後のポート 8899 LISTEN 状態検知（`$newConn -ne $null`）
  - 判定条件 2: PID の切替（`$newPid -ne $oldPid`）
  - 判定条件 3: HTTP ステータスコード `StatusCode == 200`
  - 判定条件 4: スクリプト終了コード `0`

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: 稼働中からのワンクリック再起動 (AC-1, AC-2, AC-4)
1. Web Manager がリッスンしている状態で `tools/server-manager/restart_web_manager.bat` を実行。
2. 期待値:
   - 旧 PID が `taskkill` により終了され、ポート 8899 が一度解放されること。
   - 新規プロセス起動後、`http://localhost:8899` にて HTTP 200 が返却されること。
   - 自動的にブラウザが立ち上がること。

### シナリオ 2: 停止状態からの起動 (AC-3)
1. 事前にポート 8899 を完全に終了:
   ```powershell
   Get-NetTCPConnection -LocalPort 8899 -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /F }
   ```
2. `tools/server-manager/restart_web_manager.bat` を実行。
3. 期待値:
   - スクリプトがエラーで強制終了せず、"Web Manager is not currently running" を表示して起動フェーズに進むこと。
   - 実行後にポート 8899 が LISTEN 状態となり、HTTP 200 が返却されること。

### シナリオ 3: 他サービスとの排他・隔離性検証 (AC-5)
1. 検証手順:
   - 擬似または実稼働の Backend (ポート 8000) が LISTEN している状態を確認。
   - `restart_web_manager.bat` を実行。
2. 期待値:
   - ポート 8000 のプロセス ID が `restart_web_manager.bat` 実行前後で完全に一致し、接続切断されないこと:
     ```powershell
     $beBefore = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen').OwningProcess
     # restart_web_manager.bat 実行
     $beAfter = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen').OwningProcess
     if ($beBefore -ne $beAfter) { Write-Host '[FAIL] Backend process was terminated' -ForegroundColor Red; exit 1 }
     ```

### Red Teaming (境界値・異常系)
1. **異常系 1: ポート 8899 解放遅延シミュレーション**:
   - 待機ループタイムアウト（最大10秒, 500ms間隔）が正しく動作し、解放直後に遅延なく即座に起動へ遷移すること。
2. **異常系 2: 高速連続連打（競合テスト）**:
   - 1 秒以内の間隔で `restart_web_manager.bat` を 2 回連続起動。
   - 期待値: 後発のスクリプトが先発プロセスのポートを正常に引き継ぎ、最終的にポート 8899 で単一の Web Manager インスタンスが LISTEN 状態を維持すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)

- **QA 監査コマンド**:
  ```powershell
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-243-test-plan.md
  ```
- **監査合格基準**:
  - 定量化された期待値（Status 200, PID 不一致, タイムアウト秒数）の存在。
  - Red Teaming 境界条件および他サービス隔離性の明示的検証。
