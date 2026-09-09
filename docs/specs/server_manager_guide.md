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

## 2. 前提環境・ネットワーク設定 (WSL2 Mirrored Mode)

WindowsとWSL2間でのポート通信（`localhost:8188` など）をシームレスに行うため、WSL2の **mirrored ネットワークモード** を推奨します。

### 設定方法
Windowsのユーザーディレクトリ（`%USERPROFILE%\.wslconfig`）に以下を記述してください：

```ini
[wsl2]
networkingMode=mirrored
```

設定後、PowerShell等で `wsl --shutdown` を実行し、WSL2を再起動してください。

---

## 3. 利用方法

### 3.1 ワンクリックバッチファイル
`tools/server-manager/` 内の各バッチファイルをダブルクリックまたはショートカット作成して利用します。

- **`start_servers.bat`**: 全サービス（ComfyUI, Backend, Frontend）を一括起動します。フロントエンド起動前には `.vite` の属性解除と破損キャッシュの先行クリーンアップが自動実行されます。各サービスは独立したコマンドプロンプトウィンドウで起動するため、リアルタイムログが視認できます。
- **`stop_servers.bat`**: 稼働中の全サービスを一括停止します（ポートリッスンPIDおよびその子プロセスツリー `taskkill /T /F` を自動検出して安全・確実に解放）。
- **`toggle_servers.bat`**: サービスが稼働中の場合は停止、停止中の場合は起動をトグル切り替えします。
- **`server_menu.bat`**: 対話型のコンソールダッシュボード（CLIメニュー）を起動します。

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
ブラウザから直感的に操作できる軽量Webサーバーです。

1. **`tools/server-manager/start_web_manager.bat`** を実行します。
2. 自動的にブラウザで `http://localhost:8899` が開きます。
3. 機能：
   - リアルタイム稼働状況（5秒間隔自動更新、LISTEN/STOPPEDバッジ、PID表示）
   - 全体起動・停止・再起動ボタン
   - 各サービス（ComfyUI, Backend, Frontend）ごとの個別起動・停止・再起動
   - `config.json` のオンライン閲覧・編集・即時保存
   - 実行ログコンソール

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

- `wsl.distro`: 対象の WSL ディストリビューション名（例: `"Ubuntu-24.04"`）。空文字 `""` に指定した場合は、WSL の既定（デフォルト）ディストリビューションが自動的に使用されます。
- `wait_timeout_sec`: 1回あたりのポート開放待機タイムアウト秒数（サービスごと）。
- `retry_count`: タイムアウト後の最大再試行（リトライ）回数（0で再試行なし）。
- `retry_interval_sec`: 再試行前の待機インターバル秒数。
- `port_wait`: 個別サービスで未設定の場合のグローバル待機フォールバック設定。

※ Web管理画面上のエディタから編集・保存した場合、自動的に `config.json.bak` バックアップが作成されます。

---

## 5. Windows 自動常駐化 (タスクスケジューラ連携)

PC起動（ログオン）時に全サービスをバックグラウンドで自動起動したい場合、`register_startup_task.ps1` を管理者権限で実行します。

### 登録
```powershell
powershell -ExecutionPolicy Bypass -File tools/server-manager/register_startup_task.ps1 -Action register
```
※ ログオンから15秒遅延してサイレント起動（非表示ウィンドウ）します。

### 解除
```powershell
powershell -ExecutionPolicy Bypass -File tools/server-manager/register_startup_task.ps1 -Action unregister
```

### 状態確認
```powershell
powershell -ExecutionPolicy Bypass -File tools/server-manager/register_startup_task.ps1 -Action status
```

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
- ComfyUI ログ: WSL内の `~/comfyui.log`
