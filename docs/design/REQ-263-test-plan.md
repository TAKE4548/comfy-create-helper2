# REQ-263 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド単体テスト
- **コマンド**: `pytest backend/tests/test_api_config_network.py -v`
- **期待値**:
  - `test_get_config_localhost`:
    - Request: `GET /api/config` with `Host: localhost:8000`
    - Response: HTTP 200, JSON body: `{"comfy_url": "http://localhost:8188"}` [PASS]
  - `test_get_config_lan_ip`:
    - Request: `GET /api/config` with `Host: 192.168.1.50:8000`
    - Response: HTTP 200, JSON body: `{"comfy_url": "http://192.168.1.50:8188"}` [PASS]
  - `test_cors_lan_origin`:
    - Request: `OPTIONS /api/workflows` with `Origin: http://192.168.1.20:8000`
    - Response: HTTP 200, `Access-Control-Allow-Origin: *` または `http://192.168.1.20:8000` [PASS]

### 1.2 フロントエンド単体テスト
- **コマンド**: `npm --prefix frontend test -- src/hooks/__tests__/useComfyWebSocket.test.ts`
- **期待値**:
  - `resolveComfyUrl`:
    - `window.location.hostname === 'localhost'`:
      - Port 5173 (Dev): `${window.location.origin}/comfy` を返却 [PASS]
      - Port 8000 (Bundled): `http://127.0.0.1:8188` を直接返却 [PASS]
    - `window.location.hostname === '192.168.1.20'`:
      - `resolveComfyUrl('http://localhost:8188')` -> `http://192.168.1.20:8188` [PASS]
      - `resolveComfyUrl(null)` -> `http://192.168.1.20:8188` [PASS]

### 1.3 起動スクリプト・設定連携テスト
- **コマンド**: `powershell -ExecutionPolicy Bypass -Command "powershell -File tests/unit/test_server_manager_config_pass.ps1"`
- **期待値**:
  - `server-manager.ps1` が `config.json` の `backend.start_args`（`--host 0.0.0.0 --port 8000`）を引数として `run_server.bat` に渡すこと [PASS]

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 サーバーマネージャー起動・ホスト待受検証
- **コマンド**: `powershell -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen' | Select-Object LocalAddress, LocalPort, State"`
- **期待値**:
  - `LocalAddress`: `0.0.0.0`
  - `LocalPort`: `8000`
  - `State`: `Listen`

### 2.2 ファイアウォール一括設定スクリプト検証
- **コマンド**: `powershell -Command "Get-NetFirewallRule -DisplayName 'Prompt Surgeon*' | Select-Object DisplayName, Enabled, Direction, Action"`
- **期待値**:
  - 以下の 3 ルールがすべて `Enabled = True`, `Direction = Inbound`, `Action = Allow`:
    1. `Prompt Surgeon Backend & UI (8000)`
    2. `Prompt Surgeon WSL2 ComfyUI (8188)`
    3. `Prompt Surgeon Web Manager (8899)`

### 2.3 モバイル・LAN端末からの HTTP / API 疎通検証
- **コマンド (CLI検証)**:
  - `curl -I -s http://<SERVER_LAN_IP>:8000/` -> HTTP 200 OK
  - `curl -s -H "Host: <SERVER_LAN_IP>:8000" http://<SERVER_LAN_IP>:8000/api/config` -> `{"comfy_url":"http://<SERVER_LAN_IP>:8188"}`
  - `powershell -Command "Test-NetConnection -ComputerName <SERVER_LAN_IP> -Port 8188"` -> `TcpTestSucceeded : True`
- **ブラウザ手動確認**:
  - スマートフォンのブラウザから `http://<SERVER_LAN_IP>:8000/` を開き、ヘッダー右上の接続状態が `Connected`（緑）となり、プロンプト生成が正常終了すること。

### 2.4 Red Teaming (境界値・異常系・障害シナリオ)
- **シナリオ 1: 異常な Host ヘッダー（IPv6 ループバック / 不正文字）**:
  - コマンド: `curl -s -H "Host: [::1]:8000" http://localhost:8000/api/config`
  - 判定基準: 500 Internal Server Error にならず、HTTP 200 かつ安全なフォールバック `{"comfy_url": "http://localhost:8188"}` が返却されること。
- **シナリオ 2: ComfyUI (Port 8188) ファイアウォール遮断時の振る舞い**:
  - ポート 8188 へのアクセスを一時遮断した状態で UI を開く。
  - 判定基準: フロントエンドがハング（フリーズ）せず、WebSocket エラーハンドラにより再接続タイマーが作動し、接続切断（Disconnected）トースト/バッジが表示されること。
- **シナリオ 3: ゾンビプロセス防止**:
  - `server-manager.ps1 -Action stop` を実行後、`Get-NetTCPConnection -LocalPort 8000,8188,8899` でプロセスが 5 秒以内に完全終了すること。
