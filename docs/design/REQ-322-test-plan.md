# REQ-322 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト (CLI Baseline Verification - Gate 1 & Gate 2)
- **Gate 1: 静的型検査 (Typecheck)**
  - コマンド: `npm run typecheck` (in `frontend/`)
  - 期待値: 終了コード 0、型エラー 0 件。
- **Gate 2: ユニットテスト (Unit Tests)**
  - 対象ファイルテストコマンド: `npx vitest run src/api/__tests__/client.test.ts` (in `frontend/`)
  - 期待値: `settingsApi`, `datasetApi`, `trainingApi`, `benchmarkApi` を含む全テストケースが PASS。
- **Gate 2: 全体回帰テスト (Full Test Suite)**
  - コマンド: `npm test` (in `frontend/`)
  - 期待値: 既存の全テストスイートおよび新規テストが 0 件の失敗で PASS。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ 1: `settingsApi` URL フォーマット検証**
  - `settingsApi.getVram()` が `fetch('/api/settings/vram')` を呼び出すこと。
  - `settingsApi.updateVram({ vram_min_free_gb: 4 })` が `fetch('/api/settings/vram', { method: 'PUT', ... })` を呼び出すこと。
- **シナリオ 2: `datasetApi` LoRA Studio 操作 URL 検証**
  - `getProjects`: `GET /api/dataset/projects`
  - `getProject(1)`: `GET /api/dataset/projects/1`
  - `createProject(...)`: `POST /api/dataset/projects`
  - `updateProject(1, ...)`: `PUT /api/dataset/projects/1`
  - `deleteProject(1)`: `DELETE /api/dataset/projects/1`
  - `getOutfitMasters()`: `GET /api/dataset/outfits`
  - `getOutfitMasters('swimsuit')`: `GET /api/dataset/outfits?category=swimsuit`
  - `calculateMatrix(1)`: `POST /api/dataset/projects/1/matrix` (障害報告対象: 直交マトリクス再計算)
  - `updateItem(10, ...)`: `PATCH /api/dataset/items/10`
  - `exportDataset(1)`: `POST /api/dataset/projects/1/export`
- **シナリオ 3: `trainingApi` LoRA 学習ジョブ制御 URL 検証**
  - `createJob(...)`: `POST /api/training/jobs`
  - `getJob(5)`: `GET /api/training/jobs/5`
  - `startJob(5)`: `POST /api/training/jobs/5/start`
  - `stopJob(5)`: `POST /api/training/jobs/5/stop`
  - `getJobStatus()`: `GET /api/training/status`
- **シナリオ 4: `benchmarkApi` ストレステスト URL 検証**
  - `generatePrompts(...)`: `POST /api/benchmark/generate-prompts`
  - `evaluate(...)`: `POST /api/benchmark/evaluate`
- **シナリオ 5: LoRA Studio E2E 回帰テスト**
  - コマンド: `npx vitest run src/test/e2e_req319_lora_studio.test.tsx` (in `frontend/`)
  - 期待値: 既存のLoRA Studio E2Eテストがパスすること。

## 3. Red Teaming (境界値・異常系検証 - Gate 3)
- **Red Team 1: 405 Method Not Allowed 抑止・二重プレフィックス防止検証 (Anomaly / Bug Prevention)**
  - 手順: `mockFetch` の引数 URL を検査し、正規表現 `/\/api\/api\//` にマッチする呼び出しが 1 件も存在しないことをアサート。
  - 期待値: すべてのリクエスト先が `/api/` 単一プレフィックスで始まっており、FastAPI が 405 Method Not Allowed (SPA フォールバック) にルーティングされる事象が 100% 抑止されていること。
- **Red Team 2: HTTP エラー時のフォールバック例外送出 (Anomaly Error Handling)**
  - 手順: `mockFetch` が 404 Not Found や 500 Internal Server Error を返却した際、`datasetApi.getProject(999)` や `trainingApi.getJob(999)` が適切に `API error 404: ...` エラーをスローすること。
  - 期待値: 未補足の例外や黙殺が発生せず、期待される型・メッセージの Error オブジェクトが拒絶 (reject) されること。
- **Red Team 3: クエリ文字列境界値テスト (Boundary Value Verification)**
  - 手順: `datasetApi.getOutfitMasters(undefined)` を呼んだ場合、末尾に余分な `?` が付与されず `/api/dataset/outfits` となること。また、特殊文字を含むカテゴリ（例: `'casual wear & sports'`）を渡した場合に正しく `encodeURIComponent` 処理され `/api/dataset/outfits?category=casual%20wear%20%26%20sports` となること。

## 4. ツール主導監査 (Tool-Driven Audit)
- **ローカルモデル監査**:
  - コマンド: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit`
  - 期待値: 客観的なコード整合性およびテスト網羅性の証明が得られること。

