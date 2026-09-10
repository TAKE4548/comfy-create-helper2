# REQ-244 実行可能テスト計画（監査対応版）

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest tests/unit/test_req244_scripts.py -v`
- **期待値**: exit_code = 0, passed = 2, failed = 0。
- **検証項目**: 
  - `restart_web_manager.bat` 内の `$oldPids` 追跡、`-Verb RunAs` 昇格フォールバック、`exit 1` 中断、`$newPid` 照合ロジック
  - `start_servers.bat` / `toggle_servers.bat` の `-Background` 付与、`start_background_all.bat` からの `conhost.exe` 排除

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ**:
  1. `tools/server-manager/restart_web_manager.bat` を実行し、既存プロセスを正常終了した上で新規 PID で Web Manager (ポート 8899) が起動すること。
  2. `GET http://localhost:8899/api/logs?service=comfy` が HTTP 200 を返し、JSON レスポンス (`{"service": "comfy", ...}`) が返ること。
  3. `GET http://localhost:8899/` の HTML レスポンス内にタブ別コンソール出力 (`tab-btn active`, `WSL ComfyUI`, `Win BE`, `React FE`) が存在すること。
  4. `start_servers.bat` / `toggle_servers.bat` で起動したサービス群（ComfyUI: 8188, Backend: 8000, Frontend: 5173）のプロセスの `MainWindowHandle` が 0（完全バックグラウンド）であること。
- **Red Teaming (境界値・異常系)**:
  - **手順**: 管理者権限または別特権でポート 8899 を占有したプロセスが存在し、通常停止・昇格停止の両方に失敗した状況をシミュレート。
  - **期待結果**: ポート未解放時に新規プロセスの二重起動を強行せず、`[ERROR] Port 8899 could not be released.` を出力して即時 `exit 1` で中断すること。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-244-test-plan.md`
- **ログ整合性チェック**: `python scripts/inspect_logs.py --clean-check 10`
- **セキュリティ監査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`

