# REQ-379 検証ウォークスルー報告書

## 総合判定: **PASS (Gate 1 / Gate 2 / Gate 3 全件合格)**

### 概要
REQ-379「ComfyUIへの原画確認処理の完全廃止とBE自立キャッシュへの仕様整合」における全タスク（REQ-379-T1, T2, T3）の実装および3-Gate Baseline検証が完了し、全受入基準（AC-1 〜 AC-4）が充足されたことを確認した。

---

## 1. 受入基準 (AC) トレーサビリティマトリクス

| AC番号 | 受入基準 | 検証テスト / 証跡 | 判定 |
| :--- | :--- | :--- | :---: |
| **AC-1** | Galleryサムネイル描画時にComfyUIへの原画確認プローブが一切発生しないこと（ゼロプローブ）。 | `GenerationGallerySection.probing.test.tsx`<br>`GenerationGallerySection.cache.test.tsx`<br>`trialAvailabilityIntegration.test.tsx` | **PASS** |
| **AC-2** | ComfyUI側で元画像PNGが削除（404）されても、BEキャッシュが存在する限りギャラリー履歴から除外されないこと。 | `useGenerateDisplayState.availability.test.tsx`<br>`residualHistoryRestore.test.tsx` | **PASS** |
| **AC-3** | `backend/app/routers/comfy.py` のデッドコード `_check_comfy_exists` を完全除去すること。 | `test_comfy_proxy.py::test_comfy_router_dead_code_eliminated_req379_ac3` | **PASS** |
| **AC-4** | `SPEC_COMMON.md`, `SPEC_GENERATE.md`, `SPEC_HISTORY.md` の原画プローブ規定を削除し、BE自立キャッシュを正本とする規定へ整合更新すること。 | `docs/specs/SPEC_COMMON.md`<br>`docs/specs/SPEC_GENERATE.md`<br>`docs/specs/SPEC_HISTORY.md` | **PASS** |

---

## 2. Automated Baseline 3-Gate 検証結果

### Gate 1: 静的型チェック & 単体テスト (Typecheck & Unit Baseline)
- **結果**: **PASS (0 errors, 0 failures)**
- **実行証跡**:
  - UI Invariants Check: `python scripts/verify_ui_invariants.py` -> **PASS (0 violations across 535 files)**
  - Frontend Typecheck: `cd frontend; npm run typecheck` (`tsc -b --noEmit`) -> **PASS (0 errors)**
  - Backend Typecheck: `mypy backend` -> **PASS (Success: no issues found in 174 source files)**
  - Frontend 局所テスト: `npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.probing.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.availability.test.tsx` -> **PASS (7 passed)**
  - Backend 局所テスト: `backend\.venv\Scripts\pytest backend/tests/integration/legacy/test_comfy_proxy.py -k "379"` -> **PASS (1 passed)**

### Gate 2: フルテストスイート Baseline (Full Discovery Suite & Test Hygiene)
- **結果**: **PASS (全件合格)**
- **実行証跡**:
  - Test Naming Verification: `python scripts/verify_test_naming.py` -> **PASS (File path violations: 0)**
  - Backend Full Suite: `backend\.venv\Scripts\pytest -n auto` -> **PASS (652 passed, 32 warnings in 40.88s)**
  - Frontend Full Suite: `npm --prefix frontend test -- --run` -> **PASS (239 test files passed, 2429 tests passed in 79.35s)**

### Gate 3: シナリオ・フォールトインジェクション (Boundary & Fault Verification)
- **結果**: **PASS**
- **実行証跡**:
  - ComfyUI 404時保持テスト: 上流ComfyUIが404を返してもBEにWebPキャッシュが存在する限り、ギャラリーから画像が消えずに正常表示されることを検証。
  - サムネイルロード失敗時保持テスト: ネットワークエラー等でサムネイルが読み込めなかった場合、再試行バッジが表示されるのみで、試行履歴から項目が勝手に削除されないことを検証。
