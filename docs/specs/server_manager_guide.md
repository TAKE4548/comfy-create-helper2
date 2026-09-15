# Prompt Surgeon & ComfyUI サービスマネージャー利用ガイド

本ガイドは、WSL2上のComfyUI、Windows上のFastAPIバックエンド、Reactフロントエンドの一括ライフサイクル管理ツール（`tools/server-manager/`）の使い方および設定手順をまとめたドキュメントです。

---

## 1. 概要

Prompt Surgeon システムを起動・運用する際、以下の3つのサービスを協調動作させる必要があります。

| サービス | 実行環境 | ポート | 役割 |
|---|---|---|---|
| **WSL2 ComfyUI** | WSL2 (Ubuntu) | `8188` | 画像生成・ワークフロー推論エンジン |
| **Prompt Surgeon Backend** | Windows (Python venv) | `8000` | コアAPIサーバー・プロンプト解析・DB管理 |
| **Prompt Surgeon Frontend** | Windows (Node.js) | `5173` | React Webダッシュボード UI |

本ツールにより、ワンクリックまたはWeb/CLIダッシュボードからこれら3つのサービスを一括・個別に制御できます。

---

## 2. 前提環境・ネットワーク設定 (WSL2 Mirrored Mode & Firewall)

### 2.1 WSL2 ネットワーク設定 (Mirrored Mode)
WindowsとWSL2間でのポート通信（`localhost:8188` など）をシームレスに行うため、WSL2の **mirrored ネットワークモード** を推奨します。

#### 設定方法
Windowsのユーザーディレクトリ（`%USERPROFILE%\.wslconfig`）に以下を記述してください：

```ini
[wsl2]
networkingMode=mirrored
```

設定後、PowerShell等で `wsl --shutdown` を実行し、WSL2を再起動してください。

### 2.2 外部アクセス・ファイアウォール設定 (Port 8000 / 8188 / 8899)
LAN 内の他端末やスマートフォン等から Web UI（Port 8000）、WSL2 ComfyUI（Port 8188）、Web Manager（Port 8899）へアクセスする場合、Windows ファイアウォールで受信接続を許可する必要があります。
`tools/server-manager/` に管理者権限昇格対応の専用バッチファイルが用意されています：

- **`allow_firewall_all.bat`**: バックエンド・Web UI (`8000`)、WSL2 ComfyUI (`8188`)、Web Manager (`8899`) の 3 つのポート受信許可ルールを一括登録・確認します。モバイル端末等から画像生成・進捗受信を行う場合は本スクリプトを実行してください。
- **`allow_firewall_8000.bat`**: バックエンドおよび内包 Web UI 向けポート `8000`（TCP）の受信を許可します。ダブルクリックすると UAC 昇格確認が表示され、安全にファイアウォールルールが追加されます。
- **`allow_firewall_8899.bat`**: サーバーマネージャー（Web Dashboard）向けポート `8899`（TCP）の受信を許可します。

> [!NOTE]
> ファイアウォールの開放は、家庭内 LAN や信頼できるプライベートネットワーク環境下でのみ行ってください。また、モバイル等の外部端末からアクセスした際、バックエンド（`/api/config`）およびフロントエンド（`useComfyWebSocket`）がアクセス元ホスト名に基づき ComfyUI URL（`http://<SERVER_LAN_IP>:8188`）を自動的に動的解決します。

### 2.3 配布・内包モード（Bundled Mode）での運用
フロントエンドがビルド済み（`frontend/dist/index.html` が存在）の場合、バックエンド（FastAPI / Uvicorn）が Web UI と API の両方をポート 8000 でホスティングします。
この状態ではサーバーマネージャーの全体起動（`Start-AllServices`）時に不要な Vite（Port 5173）の起動が自動スキップされ、**ComfyUI と Backend の 2 プロセス構成**で軽量に運用可能です。
必要に応じて、Web Manager 上の「▶ Vite 起動（開発用）」ボタンまたは `server-manager.ps1 -Action start -Service frontend` からいつでも Vite 開発サーバーを追加起動できます。

---

## 3. 利用方法

### 3.1 ワンクリックバッチファイル
`tools/server-manager/` 内の各バッチファイルをダブルクリックまたはショートカット作成して利用します。

- **`start_servers.bat`**: 全サービスを一括起動します。フロントエンドのビルド成果物（`frontend/dist`）が存在する場合は、自動的に Vite 開発サーバーの起動をスキップし、ComfyUI + Backend（内包 Web UI 提供）の **2 プロセスのみを軽量起動** します。`frontend/dist` がない場合は Vite（Port 5173）も起動します。バックグラウンドモード（ウィンドウ非表示、ログファイル出力）で起動され、外部ターミナルウィンドウの前面出現を防止します。リアルタイムログは Web Manager Dashboard（http://localhost:8899）から確認できます。
- **`stop_servers.bat`**: 稼働中の全サービスを一括停止します（ポートリッスンPIDおよびその子プロセスツリー `taskkill /T /F` を自動検出して安全・確実に解放）。
- **`toggle_servers.bat`**: サービスが稼働中の場合は停止、停止中の場合はバックグラウンドで起動をトグル切り替えします。
- **`restart_web_manager.bat`**: Web Manager（ポート 8899）自体の再起動を行います。既存の Web Manager プロセスを検知して確実に終了（必要に応じて特権停止）し、ポート解放を確認後に新規プロセスをバックグラウンドで起動してブラウザ（`http://localhost:8899`）を自動で開きます。旧プロセスの停止に失敗した場合は処理を安全に中断します。
- **`server_menu.bat`**: 対話型のコンソールダッシュボード（CLIメニュー）を起動します。
- **`allow_firewall_8000.bat`**: Port 8000（Web UI / API）の Windows ファイアウォール受信を許可します。
- **`allow_firewall_8899.bat`**: Port 8899（Web Manager）の Windows ファイアウォール受信を許可します。

### 3.2 対話型メニュー (`server_menu.bat`)
コンソール上でキー入力（1〜8, R, Q）により各操作をインタラクティブに実行できます：

```text
=================================================
  Prompt Surgeon & ComfyUI Server Status
=================================================
  [LISTEN ] React FE        : Port 5173 (PID: 1234)
  [LISTEN ] Win BE          : Port 8000 (PID: 5678)
  [LISTEN ] WSL ComfyUI     : Port 8188 (PID: 9012)
=================================================

 [1] Start All Services (Windowed)
 [2] Start All Services (Background)
 [3] Stop All Services
 [4] Restart All Services
 [5] Restart ComfyUI
 [6] Restart Backend
 [7] Restart Frontend
 [8] View Logs
 [R] Refresh Status
 [Q] Exit
```

### 3.3 ブラウザ管理画面 (Web Manager Dashboard)
ブラウザから直感的に操作できる軽量Webサーバーです。マルチスレッド対応（`ThreadedTCPServer`）により、サービスの起動・再起動処理中であってもステータスの自動取得（ポーリング）がブロックされずにスムーズに動作します。

1. **`tools/server-manager/start_web_manager.bat`** を実行します。
2. 自動的にブラウザで `http://localhost:8899` が開きます。
3. 機能：
   - リアルタイム稼働状況（5秒間隔自動更新、LISTEN/STOPPEDバッジ、PID表示）
   - 全体起動・停止・再起動ボタン
   - 各サービス（ComfyUI, Backend, Frontend）ごとの個別起動・停止・再起動
   - 連打防止ロック：アクション実行中は画面上の全操作ボタンが一時的に無効化（disabled）され、二重送信やレースコンディションを防止
   - 同一 LAN 内アクセス：ヘッダー部に `LAN: http://<LAN-IP>:8899` バッジを表示。`tools/server-manager/allow_firewall_8899.bat` を実行（管理者権限）して Windows Defender ファイアウォールを開放することで、LAN 内の他端末（スマホやタブレット）からブラウザで一元管理可能
   - `config.json` のオンライン閲覧・編集・即時保存
   - タブ別コンソール出力エリア：
     - **[Win BE]** / **[React FE]** / **[WSL ComfyUI]** / **[Manager 操作]** の 4 つのタブで各サービスの標準出力/エラーログを切り替え表示
     - 2秒ごとの自動更新、最新ログへの自動追従（スクロール位置が上部の場合は追従を維持）、表示行数（100 / 200 / 500行）の切り替え、今すぐ更新ボタンを完備

---

## 4. 設定ファイル (`config.json`)

`tools/server-manager/config.json` にて、各サービスの実行コマンドやポート番号を一元管理できます。

```json
{
  "wsl": {
    "distro": "",
    "project_dir": "~/comfy",
    "venv_activate": ".venv/bin/activate",
    "comfy_dir": "ComfyUI",
    "env_vars": {
      "PYTORCH_HIP_ALLOC_CONF": "garbage_collection_threshold:0.8,max_split_size_mb:512"
    },
    "start_command": "python main.py --bf16-vae --fp8_e4m3fn-unet --fast --disable-smart-memory --enable-cors-header --listen 0.0.0.0 --use-split-cross-attention",
    "port": 8188,
    "wait_timeout_sec": 30,
    "retry_count": 3,
    "retry_interval_sec": 2
  },
  "backend": {
    "relative_dir": "../../backend",
    "venv_python": ".venv\\Scripts\\python.exe",
    "start_args": "-m uvicorn app.main:app --host 127.0.0.1 --port 8000",
    "port": 8000,
    "wait_timeout_sec": 15,
    "retry_count": 2,
    "retry_interval_sec": 1
  },
  "frontend": {
    "relative_dir": "../../frontend",
    "start_cmd": "npm run dev",
    "port": 5173,
    "wait_timeout_sec": 15,
    "retry_count": 2,
    "retry_interval_sec": 1
  },
  "port_wait": {
    "default_timeout_sec": 15,
    "default_retry_count": 2,
    "default_retry_interval_sec": 1
  },
  "logs_dir": "logs"
}
```

> [!TIP]
> **内包モード（Bundled Mode）での 2 プロセス運用**:
> フロントエンドの静的ビルド（`npx vite build` またはチャットから `/build`）を実行して `frontend/dist` が存在する場合、一括起動時は自動的にフロントエンドが Uvicorn 内包配信（Port 8000）として扱われ、Vite（Port 5173）のプロセス起動がスキップされます。
> 開発時にホットリロードが必要になった場合は、Web Manager の「▶ Vite 起動（開発用）」ボタンまたは対話型メニューからいつでもワンクリックで Vite を個別起動できます。

- `wsl.distro`: 対象の WSL ディストリビューション名（例: `"Ubuntu-24.04"`）。空文字 `""` に指定した場合は、WSL の既定（デフォルト）ディストリビューションが自動的に使用されます。
- `wait_timeout_sec`: 1回あたりのポート開放待機タイムアウト秒数（サービスごと）。
- `retry_count`: タイムアウト後の最大再試行（リトライ）回数（0で再試行なし）。
- `retry_interval_sec`: 再試行前の待機インターバル秒数。
- `port_wait`: 個別サービスで未設定の場合のグローバル待機フォールバック設定。

※ Web管理画面上のエディタから編集・保存した場合、自動的に `config.json.bak` バックアップが作成されます。

---

## 5. Windows 自動常駐化 (タスクスケジューラ連携)

PC起動（ログオン）時に全サービス（WSL ComfyUI, Backend, Frontend）および Web Manager（ポート8899）をバックグラウンドで自動起動・常駐化できます。

### 5.1 ワンクリック登録・解除・状態確認
WindowsのUAC（管理者権限昇格）ダイアログを自動表示して安全にタスクスケジューラへ登録できます。

- **登録**: `tools/server-manager/register_task_scheduler.bat` をダブルクリック（UAC「はい」をクリック）
- **解除**: `tools/server-manager/unregister_task_scheduler.bat` をダブルクリック
- **状態確認**: `tools/server-manager/check_task_status.bat` をダブルクリック

### 5.2 動作仕様
- **タスク名**: `PromptSurgeon_AutoStart`
- **トリガー**: Windows ログオン時（15秒遅延起動 `/DELAY 0000:15`）
- **権限**: 最高特権（`HIGHEST` / 管理者権限）
- **実行内容**: `tools/server-manager/start_startup_task.bat` が呼び出され、Web Manager（http://localhost:8899）および各サーバー群（ComfyUI, Backend, Frontend）が一括してサイレント常駐起動します。
- **停止・再起動**: 通常通り `stop_servers.bat` や Web Manager 画面（http://localhost:8899）から制御できます。

---

## 6. トラブルシューティング

### Q1. ポートが既に使用されている / 停止できない
`server-manager.ps1` は該当ポート（5173, 8000, 8188）をリッスンしているPIDを探索し、`taskkill.exe /PID $p /T /F` により子プロセスツリーごと強制終了した上でポートを解放します。これにより、esbuild や cmd.exe がバックグラウンドに残存してファイルロックやポート競合を引き起こすのを防ぎます。
手動で解放したい場合は以下を実行してください：
```powershell
powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action stop
```

### Q2. ComfyUI への接続が拒否される (WSL2)
1. ComfyUI の起動引数に `--listen 0.0.0.0` が含まれていることを確認してください（`config.json` の既定値）。
2. Mirrored ネットワークモードが有効になっているか（`%USERPROFILE%\.wslconfig`）確認し、WSLを再起動（`wsl --shutdown`）してください。

### Q3. バックグラウンド起動時のログを確認したい
- バックエンドログ: `tools/server-manager/logs/backend.log`
- フロントエンドログ: `tools/server-manager/logs/frontend.log`
- ComfyUI ログ: `tools/server-manager/logs/comfy.log`（フォールバック: WSL内の `~/comfyui.log`）

Web Manager（http://localhost:8899）上のタブ別コンソール出力エリアからもリアルタイムに確認できます。

### Q4. WSL2 ComfyUI の状態判定・停止・再起動仕様
- **ポート疎通判定 (`Test-PortOpen`)**:
  WSL2 Mirrored モードや仮想ネットワーク環境下では Windows の `Get-NetTCPConnection` に LISTEN ソケットが直接現れない場合があります。`server-manager.ps1` は `Get-NetTCPConnection` に加え、`TcpClient` による 127.0.0.1 への接続試行フォールバックを備えており、WSL2 上で LISTEN 中の ComfyUI を確実に検出します。
- **PID 補完 (`Get-WslComfyPids`)**:
  Windows 側ポート所有者 PID が取得できない場合でも、WSL 内部で `pgrep -f 'python.*main.py'` を実行して Linux 側 PID を取得し、ステータス画面・JSON 出力に反映します。
- **確実な停止・SIGKILL フォールバックと Windows 側プロキシ保護**:
  `Stop-ComfyUIProcess` は WSL 内部で `pkill` による正常終了要求を送信した後、最大 5 秒間ポート解放（閉鎖）を監視します。時間内に閉鎖しない場合は `pkill -9`（SIGKILL）を自動送出して強制解放します。さらに、対話ウィンドウ起動時に生成された `cmd.exe`（ウィンドウタイトル `ComfyUI (WSL2)`）の残骸プロセスも一括クリーンアップします。
  なお、WSL2 Mirrored モード環境では Windows 側のポート 8188 は WSL ホストプロキシが LISTEN しているため、Windows 側ポートの強制終了（`taskkill`）は実行しません。これにより、ホストと WSL 間の通信プロキシ破損を防ぎ、再起動後も安定してポート 8188 への疎通を維持します。
- **安全な再起動 (`Restart-ServiceByName`)**:
  停止から即座に起動する際のポート競合・レースコンディションを回避するため、ポートが完全に閉じたことをポーリング確認（`Wait-For-Port-Closed`）してから新規プロセスの起動を実行します。

### Q5. WSL / サブプロセス呼び出しタイムアウト保護と耐障害性 (REQ-257)
- **PowerShell レイヤー (`server-manager.ps1`)**:
  - `Invoke-ProcessWithTimeout` / `Invoke-WslWithTimeout` を導入。WSL 呼び出し（`pgrep`, `echo OK`, `pkill`, `tail` 等）に既定 3 秒のタイムアウトを設定。
  - WSL がフリーズ・無応答の場合でも 3 秒で強制中断（`taskkill /PID ... /T /F`）し、ComfyUI の status を `TIMEOUT`、error にメッセージを設定して返却。Frontend や Backend の判定を一切ブロックしません。
- **Python Web API レイヤー (`server_api.py`)**:
  - `/api/status`: `subprocess.run` に 6 秒のタイムアウトおよびスレッド排他ロック（`status_lock`）を導入。PowerShell プロセスの多重スタック・累積を防止。
  - タイムアウト発生時は即座に `taskkill /T /F` で強制終了し、Python 側のソケット直接接続検査（`check_port_listening`）によるフォールバック状態（FE/BE は実疎通、ComfyUI は `status = "TIMEOUT"`）を HTTP 200 で返却。
  - `/api/action`: `subprocess.run` に 15 秒のタイムアウトを設定し、超過時は HTTP 504 Gateway Timeout を返却。
- **フロントエンド Web UI レイヤー**:
  - `fetch('/api/status')` に `AbortController`（タイムアウト 7 秒）を付与し、ブラウザ側でのリクエストハングを物理遮断。
  - `setInterval` を廃止し、先行リクエストの完了を待ってから次回ポーリングをスケジュールする再帰的 `setTimeout`（多重リクエストガード `isFetchingStatus`）に変更。
  - `renderServices`: `status === 'TIMEOUT'` の場合に `.badge-timeout`（アンバー色）を表示し、ComfyUI 障害時も Frontend や Backend の操作ボタンを引き続き利用可能。


