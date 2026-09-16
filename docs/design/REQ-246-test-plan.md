# REQ-246 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **実行コマンド**:
  ```bash
  pytest tests/unit/test_server_manager_timeout.py tests/unit/test_server_manager_logs.py tests/unit/test_server_status.py -v --tb=short
  ```
- **機械的判定基準 (Strict Assertion)**:
  - **Pass Rate**: 100% (Fail/Error = 0 件であること。脳内推論や例外スキップは不合格)
  - **実行完了時間**: 全テストが 10 秒以内に完了すること
  - **対象検証内容**:
    1. `test_server_status.py`:
       - ポート接続判定（8000 オープン時 True、未使用ポートで False）
       - BUNDLED モード判定（`index.html` 存在時 `fe.status == "BUNDLED"` かつ `fe.running == be.running`）
       - Dev モード判定（5173 オープン時 `fe.status == "LISTEN"`, `fe.running == True`）
       - Standalone モード判定（5173 クローズかつ非 BUNDLED 時 `fe.status == "STOPPED"`, `fe.running == False`）
    2. `test_server_manager_timeout.py`:
       - タイムアウト発生時の ComfyUI 504 / TIMEOUT ステータス返却
       - アクションタイムアウト（504）
       - 並行ロック制御（同時5リクエスト時に排他実行され最大並行数 <= 1）
    3. `test_server_manager_logs.py`:
       - ログローテーション・末尾 tail 取得が正常動作すること

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1 (Web Manager 稼働・ステータス高速応答検証)
- **検証手順**:
  ```bash
  # 1. バックグラウンドで Web Manager 起動（またはテストプロセス起動）
  # 2. レスポンス時間とスキーマ検証
  python -c "
  import urllib.request, time, json
  t0 = time.time()
  with urllib.request.urlopen('http://localhost:8899/api/status', timeout=2) as r:
      elapsed_ms = (time.time() - t0) * 1000
      data = json.loads(r.read().decode('utf-8'))
  print(f'ELAPSED: {elapsed_ms:.2f}ms')
  assert elapsed_ms < 50.0, f'Response time SLA violation: {elapsed_ms:.2f}ms >= 50ms'
  assert set(data.keys()) >= {'fe', 'be', 'comfy'}, 'Missing required top-level keys'
  for key in ['fe', 'be', 'comfy']:
      assert set(data[key].keys()) >= {'name', 'port', 'running', 'status', 'pids'}, f'Missing keys in {key}'
  print('STATUS_SLA_AND_SCHEMA_PASS')
  "
  ```
- **判定基準**:
  - レスポンス時間が **50ms 未満** であること（PowerShell spawn 排除の定量的証明）。
  - JSON スキーマが `fe`, `be`, `comfy` の必須属性（`name`, `port`, `running`, `status`, `pids`）を 100% 保持していること。

### シナリオ 2 (CUI メニュー互換性検証)
- **検証手順**:
  ```powershell
  $out = .\tools\server-manager\server-manager.ps1 -Action status
  $out | Out-String | Write-Host
  # 期待される出力パターンマッチング
  assert ($out -match "\[(LISTEN|STOPPED|BUNDLED)\]") "Status badge not found"
  ```
- **判定基準**:
  - `server-manager.ps1 -Action status` の出力に `[LISTEN ]`, `[STOPPED]`, `[BUNDLED]` のいずれかのバッジ文字列が含まれること。
  - `server-manager.ps1 -Action status -Json` を実行し、有効な JSON としてパース可能（ExitCode 0）であること。

---

## 3. Red Teaming (境界値・異常系検証)

| 検証項目 | 具体的検証手順 | 機械的合否判定基準 |
| :--- | :--- | :--- |
| **疑似ハング検証** | PowerShell 上でタイムアウト検証用プロセス（5秒スリープコマンド）を `Invoke-ProcessWithTimeout "cmd.exe" "/c timeout 5" 3` で実行。 | 実行時間が **3.0秒〜3.8秒以内** に強制終了（`taskkill /T /F`）され、戻り値の `TimedOut` が `$true` であること。 |
| **フロントエンド未ビルド時フォールバック** | `frontend/dist/index.html` を一時退避（`index.html.bak`）した状態で `get_server_status()` を実行。 | `data["fe"]["status"]` が `"BUNDLED"` にならず、`"STOPPED"`（ポート5173非稼働時）となること。検証後直ちに復元。 |
| **Mirrored ポート保護確認** | `tools/server-manager/server-manager.ps1` 内の `Stop-ComfyUIProcess` 実装をコード検査。 | `Stop-PortProcesses $cfg.wsl.port` が呼び出されていないこと（WSL2 ホストプロキシ 8188 の誤爆終了抑止）。 |

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **監査コマンド**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-246-test-plan.md
  ```
- **合否基準**:
  - スコア 80 点以上、かつ「AI エージェントの解釈余地・主観的判断」が指摘されないこと。


