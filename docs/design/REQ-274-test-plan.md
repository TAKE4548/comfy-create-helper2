# REQ-274 実行可能テスト計画: Windows環境におけるWeb Managerポーリングによるバックエンド(WinError 64)クラッシュの防止

## 0. 前提・受け入れ基準マッピング

| AC | 検証項目 | テスト種別 | 判定基準（機械的検証条件） |
|---|---|---|---|
| **AC-1** | Windows起動時のイベントループポリシー設定および例外防御 | 単体テスト | `pytest tests/unit/test_windows_loop_defense.py -v` が全件 PASS すること。`_start_serving` で `[WinError 64]` 発生時に `sock.close()` が呼ばれず、ソケットが Listen 状態を維持すること。 |
| **AC-2** | Web Manager ポーリング監視下のバックエンド安定稼働 | 結合テスト | `pytest tests/unit/test_server_status.py -v` が全件 PASS すること。実ソケット接続・連続ポーリング時に `s.shutdown(socket.SHUT_RDWR)` が呼ばれ RST が発生しないこと。 |
| **AC-3** | `run_server.bat` および直接実行双方での有効性 | スクリプト検証 / 単体テスト | `run_server.bat` に `--loop asyncio:SelectorEventLoop` が含まれていること、および `app.main` インポート時に `apply_windows_loop_defense()` が例外なく適用されること。 |
| **AC-4** | 既存回帰テストの全件パス | 自動回帰テスト (CLI) | `pytest tests/unit/test_server_status.py tests/unit/test_server_manager_*.py -v` の全14件が 100% PASS すること。 |

---

## 1. 自動テスト (CLI Verification)

### 1-1. 新規 `test_windows_loop_defense.py` 単体テスト
- **テストファイル**: `tests/unit/test_windows_loop_defense.py`
- **実行コマンド**: `pytest tests/unit/test_windows_loop_defense.py -v`
- **テストケース**:
  1. `test_apply_windows_loop_defense_policy`: Windows環境において `asyncio.WindowsSelectorEventLoopPolicy` が適用されること（非Windowsではスキップまたはクラッシュしないこと）。
  2. `test_proactor_patch_suppresses_winerror_64`: `ProactorEventLoop` の `_start_serving` 内部ループで `[WinError 64]` (ERROR_NETNAME_DELETED) が発生した際、リスナーソケットが `close()` されずに再 accept が試みられること。
  3. `test_proactor_patch_suppresses_transient_winerrors`: `WinError 1236` (ERROR_CONNECTION_ABORTED), `WinError 10054` (WSAECONNRESET) に対しても同様にリスナーソケットが保護されること。
  4. `test_proactor_patch_propagates_fatal_oserror`: 一時的切断ではない致命的な `OSError`（権限不足やリソース枯渇等）では通常のエラーハンドラが呼ばれること。

### 1-2. `test_server_status.py` 改修・検証
- **テストファイル**: `tests/unit/test_server_status.py`
- **実行コマンド**: `pytest tests/unit/test_server_status.py -v`
- **テストケース**:
  1. `test_check_port_listening_graceful_shutdown`: 接続成功時に `s.shutdown(socket.SHUT_RDWR)` が呼ばれてからクローズされること（モックまたは実ソケットで検証）。
  2. `test_check_port_listening_closed_port`: 未稼働ポートに対して `ConnectionRefusedError` を正しく処理し、False を返すこと。
  3. `test_get_server_status_bundled`: 既存の BUNDLED モード判定が引き続き 100% 成功すること。
  4. `test_get_server_status_dev`: 既存の Dev モード判定が引き続き 100% 成功すること。

### 1-3. 既存サーバーマネージャー回帰テスト
- **実行コマンド**: `pytest tests/unit/test_server_manager_logs.py tests/unit/test_server_manager_timeout.py tests/unit/test_server_status.py -v`
- **期待値**: 14 items 全件 PASS。

---

## 2. 結合・E2E検証 (Integration Verification)

### 2-1. 急速連続接続切断（ポートスキャン・擬似ポーリング）耐性検証
- **自動検証スクリプト**: `tests/unit/test_windows_loop_defense.py` 内に統合テストケース `test_rapid_disconnect_resilience` を実装。
- **検証手順**:
  1. ローカルテストサーバーを一時起動。
  2. クライアントソケットから 50回連続で `connect(("127.0.0.1", port))` → `close()` を実行。
  3. 切断完了後、HTTP GET `/health` を実行し、ステータスコード 200 かつレスポンスボディ `{"status": "ok", "version": "2.0.0"}` が返却されることをアサート。

### 2-2. `run_server.bat` 静的構文・引数自動検証
- **検証コマンド**:
  ```powershell
  python -c "content = open('backend/run_server.bat', encoding='utf-8').read(); assert '--loop asyncio:SelectorEventLoop' in content; print('[PASS] run_server.bat loop flag verified')"
  ```
- **期待値**: `[PASS] run_server.bat loop flag verified` 出力と終了コード 0。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 強制 RST パケット送信（SO_LINGER onoff=1, linger=0）
- **テストケース**: `test_proactor_patch_rst_packet`
- **手順**: クライアント側で `s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack('ii', 1, 0))` を設定して即座にクローズし、明示的な TCP RST を送出。
- **判定基準**: バックエンドのリスナーソケットが破棄されず、後続の正規リクエストが HTTP 200 を返却すること。

### 3-2. 致命的エラー伝播の検証（Non-Transient OSError）
- **テストケース**: `test_fatal_oserror_propagation`
- **手順**: `WinError 64` 以外の致命的システムエラー（例: `EMFILE`, `EACCES`）をシミュレート。
- **判定基準**: 例外が握りつぶされず、適切なエラーハンドラが呼ばれること（無限ループや無言停止に陥らないこと）。
