# Local Context Overrides

This file defines repository-specific variables used by the AntiGravity agent system.

## Variables
- **PROJECT_ROOT**: `C:\Users\audih\ws\comfy-create-helper2`
- **GLOBAL_ROOT**: `<USER_HOME>\.gemini\antigravity`
- **GLOBAL_SCRIPTS**: `${GLOBAL_ROOT}\scripts`
- **GLOBAL_HELPERS**: `C:\Users\audih\.claude\skills\agent-tooling-maintenance\helpers`
- **GLOBAL_SKILLS**: `${GLOBAL_ROOT}\skills`
- **GLOBAL_WORKFLOWS**: `${GLOBAL_ROOT}\global_workflows`
- **GLOBAL_GOVERNANCE**: `${GLOBAL_ROOT}\governance`

## Subsystems & Verification Commands (3-Gate Architecture)
### Gate 1: Static Typecheck & Unit Logic (高速即時検出 / 3〜5秒)
- UI Invariant Check: `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
- Frontend Typecheck: `cd frontend; npm run typecheck`
- Backend Typecheck: `mypy backend`
- Backend Unit Tests: `backend\.venv\Scripts\python -m pytest backend/tests/unit`
- Frontend Unit Tests: `cd frontend; npx vitest run src/utils src/components/**/__tests__`

### Gate 2: Full Integration Test Suite (状態遷移・API・DB統合 / BE並列 中央値 29.4秒 / FE全体 中央値 111.7秒。予算は SPEC §8)
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

## UI 6大ハード不変条件 (UI 6 Invariants / REQ-366)
※詳細根拠・コード例・4大コンポーネントプリセットは SSoT: docs/specs/SPEC_COMMON.md#1-5 を参照
1. **No Global Font Floor**: グローバルセレクタ（`html`, `body`, `*`, `[class~='text-[...']`）で文字サイズを一括底上げ（`font-size: 11px` 等）してはならない。コンポーネント個別のユーティリティ（`text-[11px]`, `text-xs`）で定義すること。
2. **Viewport Units**: モバイルでのアドレスバー変動による突き破りを防ぐため、コンテナ高さに生の `100vh` を使用してはならない。`100dvh` または `calc(100dvh - env(...))` を使用すること。[Shell Preset]
3. **Mobile Modals**: 画面幅 768px 未満での画面中央モーダルを禁止する。下部ボトムシート（`modal-backdrop` + sheet, `overscroll-contain`）に統一し、Escape/backdrop/キーボード退避を担保すること。[Modals Preset]
4. **Strict Input Guard**: タップ判定は Hit-Slop (`before:absolute before:-inset-2`) を活用して 44x44px を確保しつつ、label による不要な広域クリック判定を避ける。`touch-action: pan-y / manipulation` を適用。[Forms Preset]
5. **Flex Truncate**: flex コンテナ内のテキスト省略には必ず `min-w-0` を併用する (`min-w-0 flex-1 truncate`)。横並びチップには `shrink-0 whitespace-nowrap` を指定。エラーメッセージ、ID、ステータス等の重要情報を安易に `truncate` してはならない。[Tabs/Chips Preset]
6. **Desktop Container**: Ultra-Wide画面で全幅引き伸ばしを放置せず、`max-w-7xl` 等の上限を設ける。Windows 125%/150% 拡大表示に備え、固定 px ではなく `max-h` とスクロール領域を確保すること。[Shell Preset]
