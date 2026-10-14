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

### 配布・単一プロセス運用（本番モード）

フロントエンドをビルドして FastAPI バックエンドに内包させることで、単一プロセス（ポート 8000）で Web UI と API の両方を運用可能です。

1. **フロントエンドのビルド**:
   ```bash
   tools\build_dist.bat
   # またはチャットからエージェント向け /build コマンドを実行
   ```
2. **バックエンド単一プロセスの起動**:
   ```bash
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --port 8000
   ```
3. **アクセス**:
   - Web UI & API: `http://localhost:8000`
   - Swagger UI: `http://localhost:8000/docs`

> ※開発時は引き続き `npm run dev`（ポート 5173）でホットリロードを利用可能です。

### ComfyUI

React からポート `8188` に直接アクセス。別途起動しておくこと。

## テスト実行 (3-Gate Architecture)

本プロジェクトは [テストアーキテクチャ設計仕様書](docs/specs/SPEC_TEST_ARCHITECTURE.md) (SPEC-TESTING v2.1) に準拠した 3段階ゲート構成を採用しています。

### Gate 1: 静的検証・高速単体テスト (3〜5秒)
型整合性と純粋ロジックの即時検出を行います。
```bash
# Frontend 型チェック & 単体
cd frontend
npm run typecheck
npx vitest run src/utils src/components/**/__tests__

# Backend 型チェック & 単体 (DB非接続)
cd backend
mypy backend
.venv\Scripts\python -m pytest backend/tests/unit
```

### Gate 2: 統合テストスイート (~30秒)
APIルーター、SQLAlchemy (SAVEPOINT インメモリDB自動ロールバック)、Zustand/React Query 結合状態の網羅検証を行います。
```bash
# Frontend 統合
cd frontend
npm test

# Backend 統合 (並列高速実行)
cd backend
.venv\Scripts\python -m pytest -n auto
```

### Gate 3: ブラウザ E2E テスト (~1.2秒)
Playwright による実ブラウザでの描画・物理スクロール・sticky追従の検証を行います。
```bash
cd frontend
npx playwright test
```

### テスト作成規約 (PBI トレーサビリティ)
- **ファイル名規約**: テストファイル名・ディレクトリ名へのチケット番号（`req\d+`）の含入は禁止です。
- **ケース命名規約**: 各テストケース名（`it` / `def test_*`）には `[REQ-xxx/AC-n]` プレフィックスを必ず付与してください。
- **命名検証**: `python scripts/verify_test_naming.py`


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
