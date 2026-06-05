# Prompt Surgeon — プロジェクト固有 SKILL.md

<agent_identity>
You are an engineer working on the **Prompt Surgeon** project — a React + FastAPI monorepo for AI image generation workflow management with ComfyUI.
</agent_identity>

<core_responsibilities>
- Implement features per the design specifications in `docs/`
- Maintain the FastAPI backend (SQLite CRUD + LLM audit relay)
- Maintain the React frontend (Vite + shadcn/ui + Tailwind)
- Ensure OpenAPI contract (`docs/openapi.yaml`) is kept in sync
</core_responsibilities>

## プロジェクト構成

```
comfy-create-helper2/
  ├─ frontend/          # React + Vite + shadcn/ui
  ├─ backend/           # FastAPI + SQLAlchemy + Alembic
  ├─ db/
  │   ├─ prompt_surgeon.db
  │   └─ snapshots/
  ├─ docs/              # 仕様書・openapi.yaml
  └─ SKILL.md
```

## 技術スタック

### Frontend
- React 18 + Vite + TypeScript
- shadcn/ui + Tailwind CSS
- React Query (TanStack Query v5)
- dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`)
- Zustand (グローバル状態)
- React Router v6

### Backend
- FastAPI + Uvicorn
- SQLAlchemy 2.0 + Alembic
- Pydantic v2
- SQLite (`db/prompt_surgeon.db`)
- httpx (LLM中継)

## デザインシステム（カラートークン）

| トークン | 値 |
|---------|-----|
| background | `#0F0F11` |
| surface | `#18181C` |
| surface-2 | `#1F1F25` |
| accent-green | `#3ecf8e` |
| accent-purple | `#7C6FDD` |
| border | `rgba(255,255,255,0.08)` |
| text-primary | `#E4E4E7` (zinc-200) |
| text-muted | `#A1A1AA` (zinc-400) |

## 開発コマンド

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## API エンドポイント概要

- ベースパス: `http://localhost:8000/api`
- Swagger UI: `http://localhost:8000/docs`
- ComfyUI: `http://localhost:8188`（直接アクセス）

## 重要な設計方針

1. **ComfyUI へのアクセスは React から直接**（プロキシ不要）
2. **LLM 監査は FastAPI 経由**（システムプロンプトは DB 管理）
3. **スナップショット画像は `db/snapshots/` にファイル保存**（base64 禁止）
4. **openapi.yaml は BE 起動後に `/openapi.json` を取得して生成**

<prohibited_actions>
- base64 でスナップショット画像を DB に保存することは禁止
- ComfyUI への接続を FastAPI でプロキシすることは禁止
- LLM サーバーへ React から直接アクセスすることは禁止
</prohibited_actions>

<linguistic_policy>
- Internal instructions (this file): English
- Chat responses and artifacts: Japanese
</linguistic_policy>
