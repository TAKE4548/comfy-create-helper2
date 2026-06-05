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

## 依存サービス

| サービス | デフォルトポート | アクセス元 |
|---------|-----------------|-----------|
| FastAPI | 8000 | React |
| ComfyUI | 8188 | React（直接） |
| LLM サーバー（Ollama 等） | 11434 | FastAPI 経由 |

## 環境変数（backend/.env）

```env
DATABASE_URL=sqlite:///../db/prompt_surgeon.db
SNAPSHOT_DIR=../db/snapshots
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen2.5:7b
COMFY_URL=http://localhost:8188
```
