# REQ-275 実行可能テスト計画: Web Manager経由のサービス再起動(reboot-service)におけるタイムアウト(504)および起動失敗の解消

## 0. 前提・受け入れ基準マッピング

| AC | 検証項目 | テスト種別 | 判定基準（機械的検証条件） |
|---|---|---|---|
| **AC-1** | Web Manager API（`server_api.py`）の `/api/action` に対し、`reboot-service`（backend）を POST した際に HTTP 504 タイムアウトとならず、正常（200 OK）にレスポンスが返却されること | 単体・結合テスト | `pytest tests/unit/test_server_manager_timeout.py -k "test_action_timeout_reboot or test_get_action_timeout"` が PASS すること。`reboot-service` のタイムアウト値が 35s 以上に設定され、正常完了時に 200 OK が返却されること。 |
| **AC-2** | `server-manager.ps1 -Action reboot-service -Service backend -Background` の実行後、バックエンドが停止状態から自動的に再起動し、ポート 8000 が LISTEN 状態に復帰すること | スクリプト検証 / 結合テスト | `powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action reboot-service -Service backend -Background` 実行後、ポート 8000 が LISTEN となり、ステータスが `[RUNNING]` になること。 |
| **AC-3** | バックエンド起動・再起動時に `tools/server-manager/logs/` においてセッション世代管理（`Rotate-LogFile`）が行われ、最新ログが `backend.log` に反映され、Web Manager（`/api/logs?service=backend`）から最新ログが取得できること | 単体・結合テスト | `pytest tests/unit/test_server_manager_logs.py -v` が全件 PASS すること。起動時に既存ログが世代退避され、最新セッションヘッダーが記録され、`read_log_file` の末尾シーク読込で最新行が取得できること。 |
| **AC-4** | 既存の `server_status.py` および Web Manager からのステータス取得（`/api/status`）において、再起動後のバックエンドが正常に `[RUNNING]` (status: `LISTEN`) として認識されること | 自動テスト (CLI) | `python tools/server-manager/server_status.py --json` において `be.running == True` かつ `be.status == "LISTEN"` であること。 |
| **AC-5** | 回帰テスト（既存の `tests/unit/test_server_manager_*.py` 等）がすべて PASS すること | 回帰テスト (Gate 2) | `pytest tests/unit/test_server_manager_*.py tests/unit/test_server_status.py -v` が全件 PASS すること。 |

---

## 1. 自動テスト (CLI Verification)

### 1-1. `test_server_manager_timeout.py` の拡張
- **テストファイル**: `tests/unit/test_server_manager_timeout.py`
- **実行コマンド**: `pytest tests/unit/test_server_manager_timeout.py -v`
- **テストケース**:
  1. `test_get_action_timeout_matrix`: `get_action_timeout` が各アクションとサービスに応じて正しいタイムアウト秒数（`reboot-service` backend: 35s, comfy: 50s, all: 90s, `stop`: 15s/25s 等）を返却すること。
  2. `test_api_action_reboot_service_backend_timeout_applied`: `/api/action` に `reboot-service` / `backend` をリクエストした際、`subprocess.run` に渡される `timeout` 引数が 35 であること。
  3. `test_api_action_timeout_response`: `subprocess.TimeoutExpired` 発生時に正しくステータス 504 と該当秒数のエラーメッセージが返却されること。

### 1-2. `test_server_manager_logs.py` の拡張
- **テストファイル**: `tests/unit/test_server_manager_logs.py`
- **実行コマンド**: `pytest tests/unit/test_server_manager_logs.py -v`
- **テストケース**:
  1. `test_read_log_file_tail_seek`: 巨大なログファイル（例: 数MB）において、`read_log_file` が末尾シークにより正確に最新 N 行を取得できること。
  2. `test_read_log_file_empty_or_new`: 新規作成されたログファイルが正常に認識されること。
  3. `test_web_manager_rotating_file_handler`: `server_api.py` の `web_manager.log` 用ロガーが `RotatingFileHandler`（5MB/5世代）として構成され、ログ書き込みができること。

### 1-3. 既存サーバーマネージャー回帰テスト
- **実行コマンド**: `pytest tests/unit/test_server_manager_*.py tests/unit/test_server_status.py -v`
- **期待値**: 全件 PASS（0 failures）。

---

## 2. 結合・E2E検証 (Integration Verification)

### 2-1. `run_server.bat` 設定検証
- **検証コマンド**:
  ```powershell
  python -c "content = open('backend/run_server.bat', encoding='utf-8').read(); assert 'set PYTHONUNBUFFERED=1' in content; assert 'python -u' in content; print('[PASS] run_server.bat unbuffered flag verified')"
  ```
- **期待値**: `[PASS] run_server.bat unbuffered flag verified` 出力と終了コード 0。

### 2-2. `server-manager.ps1` ログローテーション構文検証
- **検証コマンド**:
  ```powershell
  python -c "content = open('tools/server-manager/server-manager.ps1', encoding='utf-8').read(); assert 'Rotate-LogFile' in content; print('[PASS] server-manager.ps1 Rotate-LogFile verified')"
  ```
- **期待値**: `[PASS] server-manager.ps1 Rotate-LogFile verified` 出力と終了コード 0。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 巨大ログファイルに対する末尾シーク耐性 (Large File Tail Seek)
- **テストケース**: `test_large_file_tail_seek_performance`
- **手順**: テスト用一時ディレクトリに 10MB のダミーログファイルを生成し、`read_log_file` で 50 行を読み出す。
- **判定基準**: 読み出し時間が 50ms 未満で完了し、正確に末尾 50 行が取得できること。

### 3-2. サブプロセス極限タイムアウト時のエラーハンドリング (Extreme Timeout Simulation)
- **テストケース**: `test_action_extreme_timeout_handling`
- **手順**: 指定秒数を意図的に超過するモックプロセスを起動し、タイムアウト時の挙動を検証。
- **判定基準**: 504 ステータスコードが返却され、エラーメッセージに設定されたタイムアウト秒数が正確に含まれ、Web サーバー自体がクラッシュせず後続リクエストを受け付けられること。
