# Local Context Overrides

This file defines repository-specific variables used by the AntiGravity agent system.

## Variables
- **PROJECT_ROOT**: `C:\Users\audih\ws\comfy-create-helper2`
- **GLOBAL_ROOT**: `<USER_HOME>\.gemini\antigravity`
- **GLOBAL_SCRIPTS**: `${GLOBAL_ROOT}\scripts`
- **GLOBAL_SKILLS**: `${GLOBAL_ROOT}\skills`
- **GLOBAL_WORKFLOWS**: `${GLOBAL_ROOT}\global_workflows`
- **GLOBAL_GOVERNANCE**: `${GLOBAL_ROOT}\governance`

## Subsystems & Verification Commands (3-Gate Architecture)
### Gate 1: Static Typecheck & Unit Logic (高速即時検出 / 3〜5秒)
- Frontend Typecheck: `cd frontend; npm run typecheck`
- Backend Typecheck: `mypy backend`
- Backend Unit Tests: `backend\.venv\Scripts\python -m pytest backend/tests/unit`
- Frontend Unit Tests: `cd frontend; npx vitest run src/utils src/components/**/__tests__`

### Gate 2: Full Integration Test Suite (状態遷移・API・DB統合 / ~30秒)
- Frontend Full Suite: `cd frontend; npm test` (局所実行: `npx vitest run <path_to_test>`)
- Backend Full Suite (Parallel): `backend\.venv\Scripts\python -m pytest -n auto` (逐次: `backend\.venv\Scripts\python -m pytest`)
- Single Backend Test (TDD): `backend\.venv\Scripts\python -m pytest <path_to_test>`

### Gate 3: End-to-End Browser Verification (実ブラウザ描画・スクロール / ~1.2秒)
- Playwright E2E Suite: `cd frontend; npx playwright test`

## Test Architecture & Governance Conventions (SPEC-TESTING v2.1 / REQ-356)
- **禁止事項**: テストファイル名・ディレクトリパスにチケット番号（`req\d+` や `REQ-\d+`）を含めることは厳禁（MUST [REQ-356/AC-1], [REQ-356/AC-2]）。
- **テスト配置**:
  - Frontend: 単体・パーツテストは隣接 `__tests__/` にコロケーション、画面統合は `pages/**/__tests__/`、共通ヘルパーは `src/test/utils/`、実ブラウザE2Eは `frontend/e2e/`。
  - Backend: `backend/tests/` 直下は `conftest.py`、`unit/`、`integration/`、`governance/` のみ。
- **命名規則**: テストケース名（`it` / `def test_*`）には必ず `[REQ-xxx/AC-n]` プレフィックスを付与してPBIトレーサビリティを確保する（MUST [REQ-356/AC-9], [REQ-356/AC-15]）。
- **規約検証**: `backend\.venv\Scripts\python scripts/verify_test_naming.py` (CI/コミット前は `--strict`)
