# REQ-239 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

- **テスト 1: ポート導通判定関数の単体検証 (`Test-PortOpen`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; `$res = Test-PortOpen 8188; Write-Host `"COMFY_OPEN: `$res`" }"
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - ComfyUI 稼働中の場合、出力に `COMFY_OPEN: True` が含まれること。
    - 存在しないポート（例: 8189）に対するテストで `False` が返ること。

- **テスト 2: ポート閉鎖待機関数の単体検証 (`Wait-For-Port-Closed`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; `$res = Wait-For-Port-Closed 59998 2; Write-Host `"CLOSED_WAIT: `$res`" }"
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - 未使用ポートに対して即座（0.5秒以内）に `CLOSED_WAIT: True` が返ること。

- **テスト 3: ステータス取得の検証 (`Get-StatusObject` / `-Action status`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - ComfyUI 稼働中時: `comfy.running` が `true`、`comfy.status` が `"LISTEN"`、`comfy.pids` に WSL 側の PID（数値）が含まれること。
    - Backend (`be.running`) および Frontend (`fe.running`) の状態が正しく取得されていること。

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **シナリオ 1: ComfyUI 待機と起動判定の検証 (`Wait-For-Service`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; `$sw = [System.Diagnostics.Stopwatch]::StartNew(); `$res = Wait-For-Service 'comfy' 'WSL ComfyUI'; Write-Host `"WAIT_RESULT: `$res, TIME_MS: `$(`$sw.ElapsedMilliseconds)`" }"
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - 出力に `WAIT_RESULT: True` が含まれること。
    - 待機時間が 30 秒タイムアウトすることなく、数秒以内で完了すること。

- **シナリオ 2: 二重起動防止の検証 (`Start-ComfyUIProcess`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; Start-ComfyUIProcess `$false }"
    ```
  - **機械的判定基準**:
    - ComfyUI 稼働中の場合、「`ComfyUI is already running on port 8188.`」というメッセージが表示され、追加のプロセスが二重起動されないこと。

- **シナリオ 3: 停止および閉鎖確認の検証 (`Stop-ComfyUIProcess`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; Stop-ComfyUIProcess; `$status = Get-StatusObject; Write-Host `"STOP_COMFY_RUNNING: $($status.comfy.running), STATUS: $($status.comfy.status)`" }"
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - 出力に `STOP_COMFY_RUNNING: False, STATUS: STOPPED` が得られること。
    - タイトルに `*ComfyUI (WSL2)*` を含むウィンドウが残存していないこと。

- **シナリオ 4: レースコンディションのない再起動検証 (`Restart-ServiceByName`)**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; Restart-ServiceByName 'comfy' `$true; `$status = Get-StatusObject; Write-Host `"RESTART_COMFY_RUNNING: $($status.comfy.running), STATUS: $($status.comfy.status)`" }"
    ```
  - **機械的判定基準**:
    - 再起動完了後に `RESTART_COMFY_RUNNING: True, STATUS: LISTEN` が得られ、再起動が空振りせず正常に再立ち上げされていること。

- **シナリオ 5: Web Manager API 経由のステータス取得検証**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { python tools/server-manager/server_api.py & Start-Sleep -Seconds 2; try { `$res = Invoke-RestMethod -Uri 'http://localhost:8899/api/status'; Write-Host `"API_COMFY_STATUS: $($res.comfy.status), RUNNING: $($res.comfy.running)`" } finally { taskkill /IM python.exe /F 2>`$null } }"
    ```
  - **機械的判定基準**:
    - 出力に `API_COMFY_STATUS: LISTEN, RUNNING: True` が得られること。

## 3. Red Teaming (境界値・異常系検証)

- **シナリオ 1: WSL 停止時または未起動時のフォールバック検証**:
  - **コマンド**:
    ```powershell
    powershell -ExecutionPolicy Bypass -Command "& { . ./tools/server-manager/server-manager.ps1; `$fakePortRes = Test-PortOpen 59999; Write-Host `"FAKE_PORT_RESULT: `$fakePortRes`" }"
    ```
  - **機械的判定基準**:
    - Exit Code が `0`。
    - 出力に `FAKE_PORT_RESULT: False` が含まれ、例外でクラッシュしないこと。
    - 判定所要時間がタイムアウト値（500ms）近傍で終了すること。

- **シナリオ 2: ポート閉鎖タイムアウト時の強制停止フォールバック検証**:
  - ポートが指定秒数内に閉じない状況を想定し、`Wait-For-Port-Closed` が `$false` を返した際に `pkill -9` が実行される安全分岐をコード静的検証。

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード監査**:
  `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active/REQ-239.md` を実行し、`<status>PASS</status>` を得ること。
