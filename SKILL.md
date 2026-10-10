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

# Distribution / Single-Process Build & Run
tools\build_dist.bat            # またはチャットから `/build` コマンド
cd backend && uvicorn app.main:app --port 8000  # http://localhost:8000 でフロント＆API単一ホスト
```

## API エンドポイント概要

- ベースパス: `http://localhost:8000/api`
- Swagger UI: `http://localhost:8000/docs`
- ComfyUI: `http://localhost:8188`（FastAPI が接続する上流サービス。React から直接接続しない）

## 重要な設計方針

1. **生成通信は React から同originの FastAPI 経由**（生成関連 HTTP/WebSocket・画像を含む）。FastAPI が ComfyUI へ接続し、ブラウザーは ComfyUI の `8188` へ直接接続しない
2. **Manager は生成通信から独立**（`8899`）。通常の管理UIはアプリの設定ページで使い、FastAPI の `8000` 停止時は PC ホスト上の `8899` 埋め込みFEを復旧用に使う
3. **LLM 監査は FastAPI 経由**（システムプロンプトは DB 管理）
4. **スナップショット画像は `db/snapshots/` にファイル保存**（base64 禁止）
5. **openapi.yaml は BE 起動後に `/openapi.json` を取得して生成**

## Logging Architecture & Log Inspection Protocols

### Architecture Overview
- **Unified Log File**: `logs/app.jsonl` (and daily rotated `logs/app.jsonl.YYYY-MM-DD`).
- **Format**: Single-line JSON objects (`JSONFormatter`) containing:
  - `timestamp`: ISO 8601 string with timezone
  - `level`: `INFO`, `WARNING`, `ERROR`, `CRITICAL`
  - `source`: `"backend"` or `"frontend"`
  - `logger`: Logger name (e.g., `app.middleware.request`, `app.client`)
  - `message`: Log message
  - `request_id`: Request ID (backend requests)
  - `http`: HTTP metadata (`method`, `path`, `status_code`, `duration_ms`)
  - `error`: Error details (`type`, `message`, `stack_trace`)
  - `extra`: Arbitrary extra context (component, URL, context)
- **Frontend Integration**: React frontend forwards uncaught errors and client logs via `POST /api/system/client-logs` (`source: "frontend"`).
- **Backend Integration**: FastAPI request logging middleware logs all requests, latency, and uncaught exceptions (`source: "backend"`).

### Inspection Tooling: `scripts/inspect_logs.py`
To avoid manual scanning or context bloat on large log files (Script-First Discovery [G-7-1]), use `python scripts/inspect_logs.py`:
- `python scripts/inspect_logs.py --tail 30`: Inspect the last 30 log lines.
- `python scripts/inspect_logs.py --errors`: Filter by level ERROR with stack traces.
- `python scripts/inspect_logs.py --source frontend`: Filter frontend client errors.
- `python scripts/inspect_logs.py --request-id <req_id>`: Trace specific API request.
- `python scripts/inspect_logs.py --summary`: Output entry counts and recent errors.
- `python scripts/inspect_logs.py --clean-check 10`: Verify 0 errors/warnings in last 10 mins.

### Workflow Protocols
1. **Triage (`/triage`) [Incident Analyst]**:
   - **MANDATORY**: Before formulating hypotheses or asking the user for logs, execute `python scripts/inspect_logs.py --summary` and `python scripts/inspect_logs.py --errors --tail 10`.
   - Cite log timestamps, request IDs, and stack traces directly in `<incident_report>`.
2. **E2E Debugging (`/e2e-debug`) [Tester/Reviewer]**:
   - Trace correlated frontend errors (`source: "frontend"`) and backend API calls (`http` / `request_id`) within `logs/app.jsonl` to isolate whether the failure originated in the UI or server.
3. **Task Implementation (`/dev-task`) [Engineer]**:
   - During TDD / implementation, if a test fails or an endpoint returns 500/422, run `python scripts/inspect_logs.py --errors --tail 5` to inspect the exact exception and stack trace.
   - Before completing the task, check `python scripts/inspect_logs.py --clean-check 5` to ensure no unexpected warnings were generated.
4. **Verification & QA (`/dev-verify`) [QA / Tester]**:
   - After executing automated regression or manual browser verification, run `python scripts/inspect_logs.py --clean-check 10`.
   - Record the clean log result as objective evidence in the `<execution_evidence>` block.

<prohibited_actions>
- base64 でスナップショット画像を DB に保存することは禁止
- React から ComfyUI（`8188`）へ直接接続することは禁止。生成関連HTTP/WebSocket・画像は同originの FastAPI を経由し、ComfyUI 上流接続は FastAPI が担当する
- LLM サーバーへ React から直接アクセスすることは禁止
- Concluding triage analysis without checking logs/app.jsonl via scripts/inspect_logs.py is PROHIBITED
- Closing /dev-verify with unresolved ERROR entries generated during the verification run is PROHIBITED
</prohibited_actions>

<linguistic_policy>
- Internal instructions (this file): English
- Chat responses and artifacts: Japanese
</linguistic_policy>
