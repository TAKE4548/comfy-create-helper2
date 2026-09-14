# REQ-257 実行可能テスト計画: Server Manager の WSL / サブプロセス呼び出しタイムアウト保護と耐障害性の向上

## 0. 前提環境・標準タイムアウト規約 (Standardized Timeout Matrix)

| 対象レイヤー | 設定値 | 判定基準 | 備考 |
|---|---|---|---|
| **PowerShell WSL 実行** | `3000ms` | 実行時間 $\le 3000\text{ms} \pm 200\text{ms}$ | 超過時は `taskkill /T /F` および `Kill()` |
| **Python `/api/status`** | `6000ms` | レスポンス時間 $\le 6500\text{ms}$ | 超過時は即時ソケット直接検査フォールバック |
| **Python ソケット検査** | `500ms` | 検査時間 $\le 50\text{ms}$ (ローカルポート) | `127.0.0.1` への TCP Connect |
| **Python `/api/action`** | `15000ms` | レスポンス時間 $\le 15500\text{ms}$ | 超過時は HTTP 504 返却 |
| **フロントエンド fetch** | `7000ms` | `AbortController` タイムアウト | ブラウザ側ハング物理遮断 |

---

## 1. 自動テスト (CLI Verification)

### 1-1. Python レイヤーのタイムアウト・フォールバック単体テスト
- **コマンド**: `pytest tests/unit/test_server_manager_timeout.py -v`
- **合格判定基準 (Explicit Pass Criteria)**:
  - 終了コード: `ExitCode = 0`
  - `test_check_port_listening`: ローカル指定ポートに対する疎通判定が $\le 50\text{ms}$ で完了し、ブール値を正しく返すこと。
  - `test_api_status_powershell_timeout`: `subprocess.run` の `TimeoutExpired`（6000ms）シミュレーション時、HTTP ステータス 200 かつ JSON 内に `fe`, `be`, `comfy` が存在し、`comfy["status"] == "TIMEOUT"` であること。
  - `test_api_action_timeout`: `subprocess.run` の `TimeoutExpired`（15000ms）シミュレーション時、HTTP ステータス 504 かつ JSON 内に `"status": "timeout"` が含まれること。
  - `test_status_concurrency_lock`: 5 スレッド同時の `/api/status` 呼び出しに対し、排他ロックにより `powershell.exe` の多重起動が発生せず全スレッドが正常終了すること。

### 1-2. PowerShell レイヤーのタイムアウト・プロセス制御単体テスト
- **コマンド**: `powershell.exe -ExecutionPolicy Bypass -File tests/unit/test_server_manager_wsl_timeout.ps1`
- **合格判定基準 (Explicit Pass Criteria)**:
  - 終了コード: `ExitCode = 0`
  - テスト 1: 通常終了コマンド (`cmd.exe /c exit 0`, timeout 3000ms) -> `TimedOut = False`, `ExitCode = 0`, 所要時間 $\le 1000\text{ms}$。
  - テスト 2: 無応答シミュレーション (`powershell.exe -Command "Start-Sleep -Seconds 10"`, timeout 2000ms) -> 所要時間 $2000\text{ms} \le t \le 2500\text{ms}$ で強制中断され、`TimedOut = True`、子プロセスが残留しないこと。
  - テスト 3: `Get-StatusObject` の WSL 応答不能時挙動 -> 所要時間 $\le 3500\text{ms}$ で処理完了し、ComfyUI の status が `TIMEOUT`、error にメッセージが格納されること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. CLI 正常系ステータス取得検証
- **コマンド**: `powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json`
- **合格判定基準**:
  - 終了コード: `ExitCode = 0`
  - 実行時間: $\le 3000\text{ms}$
  - 出力検証: JSON 解析により `fe`, `be`, `comfy` オブジェクトおよび `name`, `port`, `running`, `status` フィールドが存在すること。

### 2-2. Web Manager API 疎通および HTML 要素検証 (機械的自動検証)
- **コマンド**: `python -c "import urllib.request, json; res = urllib.request.urlopen('http://localhost:8899/api/status', timeout=10); data = json.loads(res.read()); assert 'fe' in data and 'be' in data and 'comfy' in data; print('API_STATUS_OK')"`
- **合格判定基準**:
  - 出力文字列に `API_STATUS_OK` が含まれ、例外なく終了すること（所要時間 $\le 6500\text{ms}$）。
- **Web UI DOM 検証コマンド**: `python -c "import urllib.request; html = urllib.request.urlopen('http://localhost:8899/', timeout=5).read().decode('utf-8'); assert '.badge-timeout' in html and 'isFetchingStatus' in html; print('HTML_ELEMENTS_OK')"`
- **合格判定基準**:
  - 出力文字列に `HTML_ELEMENTS_OK` が含まれること（タイムアウト用 CSS クラスおよび再帰的ポーリングガードの存在を機械的検証）。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. WSL 完全無応答シミュレーション (AC-1, AC-3 検証)
- **テスト手順**:
  - `tools/server-manager/config.json` の WSL コマンド呼び出しに一時的に遅延コマンドを挿入、または WSL が停止した状態で `server-manager.ps1 -Action status -Json` を実行。
- **合格判定基準**:
  - 実行時間: $\le 3500\text{ms}$ で安全に終了（永久ブロックの完全阻止）。
  - ComfyUI の status が `TIMEOUT` であり、FE および BE の LISTEN/STOPPED 判定が正しく取得できること。

### 3-2. Web API 多重ポーリング高負荷ストレステスト (AC-2 検証)
- **テスト手順**:
  - Python スクリプトより `http://localhost:8899/api/status` へ 10 並行で高速リクエストを一斉発行する。
- **合格判定基準**:
  - 10 リクエスト全てが HTTP 200 で応答すること。
  - テスト実行中および終了後の `Get-Process powershell -ErrorAction SilentlyContinue` において、`server-manager.ps1` 実行中の `powershell.exe` プロセス数が最大 1 個であり、残骸が累積 0 個であること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-257-test-plan.md`
- **期待値**: 客観的監査スコア PASS、脳内推論テストゼロの証明。


