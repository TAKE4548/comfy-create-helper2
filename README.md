# Prompt Surgeon

ComfyUI をバックエンドとした画像生成ワークフロー管理ツール。  
React（Vite）+ FastAPI のモノレポ構成。

## 構成

```
comfy-create-helper2/
  ├─ frontend/          # React + Vite + shadcn/ui
  ├─ backend/           # FastAPI + SQLAlchemy + Alembic
  ├─ db/
  │   ├─ prompt_surgeon.db
  │   └─ snapshots/     # スナップショット画像
  └─ docs/              # 仕様書・openapi.yaml
```

## 開発環境セットアップ

### バックエンド

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

アプリ: http://localhost:5173

### ComfyUI

React からポート `8188` に直接アクセス。別途起動しておくこと。

## サービスの一括起動・管理 (Server Manager)

WSL2 ComfyUI、FastAPI バックエンド、React フロントエンドを一括起動・管理するためのツールを用意しています。
詳細は [docs/specs/server_manager_guide.md](docs/specs/server_manager_guide.md) を参照してください。

- **一括起動**: `tools/server-manager/start_servers.bat` をダブルクリック
- **一括停止**: `tools/server-manager/stop_servers.bat` をダブルクリック
- **対話型コンソール**: `tools/server-manager/server_menu.bat` をダブルクリック
- **Web 管理ダッシュボード**: `tools/server-manager/start_web_manager.bat` を実行し、ブラウザで `http://localhost:8899` にアクセス


## 依存サービス

| サービス | デフォルトポート | アクセス元 |
|---------|-----------------|-----------|
| FastAPI | 8000 | React |
| ComfyUI | 8188 | React（直接） |
| LLM サーバー（LMStudio） | 1234 | FastAPI 経由 |

## 環境変数（backend/.env）

```env
DATABASE_URL=sqlite:///../db/prompt_surgeon.db
SNAPSHOT_DIR=../db/snapshots
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=qwen3.5-9b-sushi-coder-rl
COMFY_URL=http://localhost:8188
```
