# REQ-242 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 Python Web サーバーログ API & 非表示化検証
- **コマンド**: `pytest tests/unit/test_server_manager_logs.py -v`
- **判定基準 (Exit Code & Assertions)**:
  - pytest プロセス終了コード: `0`
  - テスト実行数: 5件以上、失敗数: 0件
  - **個別検証要件**:
    1. `GET /api/logs?service=backend&tail=50`: `status_code == 200`、JSON フィールド `service == "backend"`, `filename == "backend.log"`, `exists == True`, `isinstance(content, str) == True` をアサート。
    2. `GET /api/logs?service=../../etc/passwd`: パストラバーサル試行に対して `status_code == 400`、`"error"` フィールドが含まれることをアサート。
    3. `GET /api/logs?service=comfy` (ファイル未存在時): `status_code == 200`、`exists == False`、`"ログファイルはまだ生成されていません"` が返ることをアサート。
    4. `server_api.py` の AST / ソース検査: すべての `subprocess.run` 呼び出し引数に `creationflags=CREATE_NO_WINDOW`（または `0x08000000`）が含まれていることをアサート。
    5. CP932 / UTF-8 混在ログファイルの読み込みで `UnicodeDecodeError` が発生せず文字列として返却されることをアサート。

### 1.2 PowerShell プロセス起動ヘルパー検証
- **コマンド**: `powershell.exe -ExecutionPolicy Bypass -File tests/unit/test_server_manager_nowindow.ps1`
- **判定基準 (Exit Code & Output)**:
  - PowerShell プロセス終了コード: `0`
  - **個別検証要件**:
    1. `server-manager.ps1` 内に `function Start-ProcessNoWindow` が定義されており、`CreateNoWindow = $true` および `UseShellExecute = $false` が含まれていること。
    2. `Start-BackendProcess`、`Start-FrontendProcess`、`Start-ComfyUIProcess` のコード内で `Start-ProcessNoWindow` が呼び出され、`conhost.exe` への依存が完全に排除されていること。
    3. `Start-ProcessNoWindow` により起動されたプロセスの `MainWindowHandle` が `0`（ウィンドウ未作成）であることを実機アサート。
    4. `Start-ComfyUIProcess` 内で `$logFile = Join-Path $LOGS_DIR "comfy.log"` および `> "$logFile" 2>&1` が指定されていること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **対象 URL**: `http://localhost:8899`
- **手順と定量的合格条件**:
  1. `tools/server-manager/start_web_manager.bat` を実行し Web Manager を起動。
     - 合格基準: HTTP GET `http://localhost:8899` でステータスコード `200`、HTML 内に `id="log-output"` および 4 つのタブ要素（`data-service="backend"`, `"frontend"`, `"comfy"`, `"manager"`）が存在すること。
  2. [Win BE] タブを選択：
     - 合格基準: HTTP GET `/api/logs?service=backend` が `200` で返り、コンソール領域にログが表示されること。
  3. 「全サービス起動」ボタンをクリック：
     - **合格基準（ターミナル残存防止の最重要検証）**:
       - 実行中にボタン要素がすべて `disabled == true` になること。
       - **画面上・タスクバーに 3 つのターミナルウィンドウ（`cmd.exe` や `conhost.exe`）が前面にポップアップせず、かつ残り続けないこと**。
       - `Get-Process cmd, conhost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.MainWindowTitle -like "*PromptSurgeon*" -or $_.MainWindowTitle -like "*ComfyUI*") }` の結果が 0 件であること。
       - アクション完了後、HTTP GET `/api/status` で全サービスの状態が `LISTEN`（またはポート疎通 `true`）になること。
  4. ログ追従とスクロール動作：
     - コンソール領域でスクロールバーを上へ 50px 以上移動した状態で、2 秒待機（ポーリング発生）。
     - 合格基準: スクロール位置が強制的に最下部へリセットされず、ユーザーの閲覧位置が保持されること。
     - 「最新へスクロール」チェック時に自動的に最下部（`scrollTop == scrollHeight - clientHeight`）へ移動すること。

---

## 3. Red Teaming (境界値・異常系検証)

| シナリオ | 入力・条件 | 期待される定量的挙動 |
|---|---|---|
| **シナリオ 1: 巨大ログ** | 10MB のダミーログファイル | `/api/logs?service=backend&tail=100` の応答時間が 500ms 未満、メモリ消費スパイク 50MB 未満、レスポンス行数が 100 行以下 |
| **シナリオ 2: 文字コード混在** | Shift-JIS 日本語と UTF-8 記号が混在したログ | レスポンスステータス 200、JSON デコード成功、例外未送出 |
| **シナリオ 3: 未知のサービス名** | `/api/logs?service=invalid_daemon` | ステータスコード 400、JSON エラーメッセージ返却、サーバー継続稼働 |
| **シナリオ 4: 未生成ファイル** | 存在しないログファイル名 | ステータスコード 200、`exists: false`、エラーでなくプレースホルダー文字列返却 |

---

## 4. ツール主導監査 (Tool-Driven Audit)

- **ガバナンス監査**:
  - `python ${GLOBAL_SCRIPTS}\artifact_linter.py <task_dir>` -> `PASS`
  - `python ${GLOBAL_SCRIPTS}\workflow_validator.py dev-design REQ-242` -> `Validation successful.`
