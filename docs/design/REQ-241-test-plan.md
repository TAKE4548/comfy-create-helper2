# REQ-241 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 PowerShell 側ロジック検証
- **コマンド**: `powershell.exe -ExecutionPolicy Bypass -File tests/unit/test_server_manager_dispatch.ps1`
- **検証項目**:
  - `Get-NormalizedServiceName`: `fe` -> `frontend`, `be` -> `backend`, `comfy` -> `comfy`, `wsl` -> `comfy` の変換検証
  - 不正なサービス名（`unknown` 等）で空文字が返り、適切にエラーハンドリングされること
  - `Stop-AllServices` が各ポートの `Wait-For-Port-Closed` を呼び出していることのモック検証
  - `Stop-ComfyUIProcess` が Windows 側の `Stop-PortProcesses` を呼び出さないことの確認

### 1.2 Python Web サーバー検証
- **コマンド**: `pytest tests/unit/test_server_api.py -v`
- **検証項目**:
  - `ThreadedTCPServer` が `ThreadingMixIn` を継承し `daemon_threads = True` であること
  - `do_POST` で `start`, `restart`, `reboot-service` のコマンド組み立て時に `-Background` スイッチが付与されること
  - HTML テンプレート内に `disabled` ロック処理およびボタン制御関数が存在すること
  - `get_local_ip()` が有効な IPv4 アドレス（または `127.0.0.1`）を返却すること
  - HTML テンプレート内に LAN URL バッジ表示領域が存在すること

---

## 2. 結合・手動検証 (Integration & Manual Verification)

- **対象 URL**: `http://localhost:8899` および `http://<local_ip>:8899`
- **手順**:
  1. `tools/server-manager/start_web_manager.bat` または `python tools/server-manager/server_api.py` を起動。
     - **期待値**: コンソールに `Local: http://localhost:8899` と `Network: http://<local_ip>:8899` の双方が正しく表示されること。
  2. PC ブラウザで `http://localhost:8899` にアクセス。
     - **期待値**: ヘッダー右上に同一 LAN アクセス用 URL（`LAN: http://192.168.x.x:8899`）が表示されること。
  3. 各カード（React FE, Win BE）の「再起動」または「停止」ボタンを押下する。
     - **期待値**: 押下直後にすべてのボタンが `disabled` 状態となり、コンソールログに実行中表示が出ること。
     - **期待値**: 対象サービスのみが正しく停止・再起動され、完了後にボタンのロックが解除されること。
  4. 「全サービス再起動」ボタンを押下する。
     - **期待値**: 全サービスが停止し、ポート解放待機を経て順次起動され、全サービスが `[LISTEN]` 状態で復帰すること。
  5. モバイル端末（同一 WiFi 接続）のブラウザから `http://<local_ip>:8899` を開く。
     - **期待値**: PC と同様にダッシュボードが表示され、ステータス取得・各操作が実行可能であること（ファイアウォール開放済み環境）。

---

## 3. Red Teaming (境界値・異常系検証)

- **シナリオ 1 (連打・競合耐性)**:
  - アクションボタン押下中にすばやく他のボタンを連打・クリックし、ボタンが `disabled` であるため多重リクエストが送信されないことを確認。
- **シナリオ 2 (不正サービス名)**:
  - `POST /api/action` に対して `{"action": "start", "service": "invalid_svc"}` を送信し、サーバーがクラッシュせず `Unknown service` のエラーメッセージを返却して正常終了すること。
- **シナリオ 3 (ポート未開放状態での停止)**:
  - サービスが既に停止している状態で「停止」アクションを実行しても、例外や無限ループが発生せず安全に完了すること。
- **シナリオ 4 (オフライン環境での IP 取得)**:
  - 外部インターネット接続がない（ルーターローカルのみ、あるいは完全オフライン）環境でも `get_local_ip()` が例外落ちせず、フォールバック（`127.0.0.1` 等）でサーバーが起動すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)

- **コード監査**: `artifact_linter.py` および `workflow_validator.py` を実行し、検証品質の担保を行う。
