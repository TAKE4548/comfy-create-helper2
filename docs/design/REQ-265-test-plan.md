---
id: REQ-265-test-plan
pbi_id: REQ-265
title: "REQ-265 テスト計画書: スナップショットからのプリセット復元導線分離とプレビューモーダル"
status: draft
verification_profile: V1
---

# REQ-265 テスト計画書

## 1. 検証プロファイルとリスク評価

- **適用プロファイル**: V1 Baseline（`.agents/verification.json`、`endpoint: source-only`）
- **変更リスク分類**: **low**（純粋なフロントエンド UI・状態導線変更であり、インフラ・DB スキーマ・公開 API 契約・認証権限・共有テストハーネスを変更しない）
  - ※ V1 Baseline 運用のため、Gate 1〜3 を独立環境で全件実行する。
- **Mandatory Full-Suite Fallback トリガー**:
  - 以下のいずれか（OR 条件）に該当した場合は局所実行結果のみでの判定を禁止し、フルスイート（`scripts/run_full_suite.py`）の再実行を必須とする:
    1. 共有フィクスチャ・公開契約・テスト基盤への波及が判明した場合
    2. テストコレクション数の不一致、予期しないスキップ、フレーキーテストが検出された場合
    3. モック欠陥・未検証スコープが残存した場合

---

## 2. テスト配置計画 (`[W-DD-PLACE]` / SPEC-TESTING v2.1)

- テストファイル名にチケット番号（`req\d+`, `REQ-\d+`）を含めない（`verify_test_naming.py --strict` 準拠）。
- 全テストケース名（`it(...)` / `test(...)`）に `[REQ-265/AC-n]` プレフィックスを付与する。

| Tier | 配置ファイル（既存拡張 / 新規） | 対象 |
|---|---|---|
| Tier 1 (Unit) | `frontend/src/pages/GeneratePage/hooks/__tests__/useGalleryInteraction.test.ts`（既存拡張） | `handleSnapshotClick` のプレビュー分離（即時復元しない） |
| Tier 1 (Unit) | `frontend/src/pages/GeneratePage/hooks/__tests__/useAssetSelectionState.test.ts`（既存拡張） | `handleLoadSnapshot` の成功 `true` / 失敗 `false` 返却と状態復元 |
| Tier 1/2 (Component) | `frontend/src/pages/GeneratePage/components/__tests__/SnapshotRestoreModal.test.tsx`（新規） | モーダル一覧表示、選択プレビュー、非破壊性、明示復元、キャンセル保護、エラー時保護 |
| Tier 2 (Integration) | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx`（既存拡張） | 専用復元導線ボタン、カードクリックからのモーダル起動、非破壊性 |
| Tier 3 (E2E) | `frontend/e2e/generateSnapshotRestore.spec.ts`（新規） | 実ブラウザ（Desktop / Mobile 390x844）での全フローとレスポンシブ・UI 6大不変条件検証 |

---

## 3. 実行階層・ACマッピング・テストケース設計

### 3-1. AC-to-Case マッピング表

| AC | 階層 (`layer`) | テストファイル | テストケース名（安定 ID） | 検証内容 |
|---|---|---|---|---|
| AC-1 | `unit` | `useGalleryInteraction.test.ts` | `[REQ-265/AC-1] handleSnapshotClick triggers onPreviewSnapshot without mutating preset state` | カードクリックが `onPreviewSnapshot(id)` のみを呼び、復元コールバックを持たないこと |
| AC-1 | `integration` | `GenerationGallerySection.cache.test.tsx` | `[REQ-265/AC-1] clicking snapshot card opens preview modal without overwriting active preset` | スナップショットカード押下で `openSnapshotRestoreModal(snap.id)` が呼ばれ、プロンプト等が不変であること |
| AC-1 | `unit` | `SnapshotRestoreModal.test.tsx` | `[REQ-265/AC-1] selecting thumbnails in modal previews details without calling onRestore` | モーダル内で複数サムネイルを切り替えても `onRestore` が呼ばれないこと |
| AC-2 | `integration` | `GenerationGallerySection.cache.test.tsx` | `[REQ-265/AC-2] renders dedicated restore trigger button in snapshots tab` | スナップショットタブに専用復元ボタンが表示され、押下でモーダルが開くこと |
| AC-3 | `unit` | `SnapshotRestoreModal.test.tsx` | `[REQ-265/AC-3] displays snapshot thumbnails grid and updates preview pane on selection` | サムネイル一覧表示、初期選択/選択切替で画像・プロンプト・パラメータ概要が更新されること |
| AC-4 | `unit` | `useAssetSelectionState.test.ts` | `[REQ-265/AC-4] handleLoadSnapshot returns true on success and false on API failure` | `handleLoadSnapshot` が成功時にパラメータ/アセットを適用し `true`、失敗時に `false` を返すこと |
| AC-4 | `unit` | `SnapshotRestoreModal.test.tsx` | `[REQ-265/AC-4] explicit restore button calls onRestore and closes on success` | 「アクティブプリセットに復元」押下でのみ `onRestore(id)` が実行され成功後に閉じること |
| AC-5 | `unit` | `SnapshotRestoreModal.test.tsx` | `[REQ-265/AC-5] cancel, close button, and Escape close modal without calling onRestore` | キャンセル・×ボタン・Esc で閉じても `onRestore` が呼ばれないこと |
| AC-6 | `e2e` | `generateSnapshotRestore.spec.ts` | `[REQ-265/AC-6] Desktop and Mobile end-to-end snapshot preview and explicit restore flow` | Desktop と Mobile(390x844ボトムシート) で一覧選択→簡易プレビュー→キャンセル保護→明示復元の一連フローが動作すること |

### 3-2. Red Team 境界・異常系テストケース (Gate 3 向け)

| 境界 / 異常ケース | 階層 | テストケース名 | 期待挙動 |
|---|---|---|---|
| 詳細取得 API 失敗（500/Network Error） | `unit` | `[REQ-265/AC-1] shows inline alert when snapshot detail fetch fails without altering active state` | モーダル内に `role="alert"` エラーを表示し、アクティブプリセット不変・復元ボタン無効または安全保護 |
| 復元処理失敗（`onRestore` が `false`） | `unit` | `[REQ-265/AC-5] keeps modal open with error message when restore fails` | モーダルを閉じずエラー通知を表示し、編集中状態が破損しないこと |
| 復元中の連打防止 | `unit` | `[REQ-265/AC-4] disables restore button while restoration is in flight` | 非同期復元中にボタンが `disabled` となり二重呼び出しされないこと |
| スナップショット 0 件時の専用導線 | `integration` | `[REQ-265/AC-2] disables dedicated restore button when no snapshots exist` | 0 件時は専用復元ボタンが `disabled`（または押下不可）で安全に案内されること |
| モバイル幅 (390px) ボトムシート & スクロール隔離 | `e2e` | `[REQ-265/AC-5] Mobile bottom sheet handles Escape/backdrop/cancel without horizontal overflow or preset mutation` | `modal-sheet-handle` 表示、横スクロール発生なし、キャンセル後の編集中プロンプト完全維持 |

---

## 4. 環境・収集・検証コマンド（3-Gate Baseline）

- **Runtime / Environment**:
  - Frontend: Node.js + Vitest (jsdom), TypeScript (`npm run typecheck`)
  - Backend/Scripts: `backend\.venv\Scripts\python.exe`
  - E2E: Playwright (`backend\.venv\Scripts\python.exe scripts/run_e2e.py`) ※ Vite dev server `5173` を自律起動
- **Gate 1 (Static & Unit)**:
  - `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
  - `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
  - `npm.cmd --prefix frontend run typecheck`
  - `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/__tests__`
- **Gate 2 (Full Integration Suite)**:
  - `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
- **Gate 3 (E2E Browser Verification)**:
  - `backend\.venv\Scripts\python.exe scripts/run_e2e.py frontend/e2e/generateSnapshotRestore.spec.ts`
  - 全 E2E スイート: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`