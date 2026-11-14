# REQ-430 実行可能テスト計画

## 0. リスク分類・検証プロファイル・フォールバック条件
- **検証プロファイル**: **V1 Baseline (Default)**（`.agents/verification.json` 準拠、V2 オプトインなし）
- **変更リスク分類**: **low**（UI レイアウト CSS/TSX、仕様書 §3-1-1、フロントエンドテストの局所変更であり、インフラ・認証・DB マイグレーション・公開 API 契約を変更しない。ただし V1 Baseline に従い Gate 1〜3 は全件独立実行する）
- **必須フルスイート・フォールバック条件 (OR 条件)**:
  1. 高リスク領域（インフラ、認証、共有フィクスチャ、公開契約）への予期せぬ波及が判明した場合
  2. テスト収集件数の不一致、空収集、または予期せぬ skip が発生した場合
  3. フレーキーテストやモック不備・カバレッジ欠陥が検出された場合
  -> 上記いずれかに該当する場合、部分実行結果での代用を禁止し、必ず `backend\.venv\Scripts\python.exe scripts/run_full_suite.py` および `scripts/run_e2e.py` をフレッシュ実行する。
- **実行環境・依存制約**: Zero-GPU（CPU/RAM のみで完結）。Playwright E2E は `scripts/run_e2e.py` が Vite dev server (`5173`) を自律起動・終了する。

---

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック & UI不変条件 & ユニットテスト
- **UI Invariant Check**: `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
- **Test Naming Check**: `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
- **Frontend Typecheck**: `npm.cmd --prefix frontend run typecheck`
- **Frontend Unit Tests**: `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/__tests__`
- **期待値**: すべて Exit code 0（型エラー・規約違反 0 件）

### Gate 2: 全統合テストスイート (Full Suite Baseline)
- **コマンド**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
- **期待値**: フロントエンド・バックエンド全テスト PASS (Exit code 0)

---

## 2. 結合・E2E検証 & AC-to-Case マッピング (Integration & E2E Verification)

- **テスト配置 (Test Placement)**:
  - Unit/Component: `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx`
  - Integration: `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx`
  - E2E: `frontend/e2e/settingsResponsive.spec.ts`
  - ※チケット番号入り新規テストファイル作成は厳禁（`[REQ-356/AC-1]`）。
- **Seam Map**:
  - **Integrated**: `SettingsPage`, `WorkflowConnectionSection`, `MappingMasterSection`, `SettingsResponsive.css`
  - **Severed**: API 通信（Vitest モジュールモック / Playwright `page.route('/api/...')` スタブ）、JSDOM 未実装の `ResizeObserver` / `matchMedia`
  - **PBT**: 不要 / **Fault Injection**: `ResizeObserver` 不在・片側折り畳み最小床（240px）・`<1280px` 解除

| AC | Tier | テストファイル | テストケース ID (安定名) | 検証内容 |
|---|---|---|---|---|
| AC-1 | unit | `MappingMasterSection.test.tsx` | `[REQ-430/AC-1] separates title and actions from stage badges across viewports and applies listScrollMaxHeight` | 複数ステージ Variant を持つ Master 行で `__title` / `__actions` / `__badges` 構造と `listScrollMaxHeight` が適用されること |
| AC-1 | e2e | `settingsResponsive.spec.ts` | `[REQ-430/AC-1] 1280px and 375px: mapping master title stays visible above stage badges` | 1280px（2カラム）および 375px（モバイル）でタイトルがバッジに圧迫されず（`title.y < badges.y`、十分なタイトル幅確保、右端アクション固定）表示されること |
| AC-2 | integration | `SettingsPage.test.tsx` | `[REQ-430/AC-2] syncs workflow and mapping scroll maxHeight to shorter pane at xl and clears below xl` | `xl`（1280px+）で長い側リストに短い側基準の `maxHeight`（最小床 240px）が設定され、`<1280px` で解除されること |
| AC-2 | e2e | `settingsResponsive.spec.ts` | `[REQ-430/AC-2] 1280px: long workflow list scrolls internally to match shorter mapping pane` | 1280px で多数ワークフロー（15件）登録時に `workflow-list-scroll` が内部スクロール（`scrollHeight > clientHeight`, `overflowY === 'auto'`）し、左ペインが右ペインを大きく超えて肥大化しないこと |
| AC-3 | e2e / gate | `scripts/run_full_suite.py` & `scripts/run_e2e.py` | 全既存 + 新規スイート | `SPEC_SETTINGS.md` §3-1-1 更新後の全 Gate PASS |

- **Playwright E2E 実行コマンド**:
  - 局所確認: `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/settingsResponsive.spec.ts`
  - Gate 3 全体: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]
1. **極端なステージ数・長大名称の Boundary**:
   - **手順**: 375px / 1280px で長大な日本語マスタ名 + 6個以上のステージ Variant を持つ Master 行を描画する。
   - **期待結果**: タイトルが1文字〜数文字に潰れず 1行目に表示され、2行目のバッジ群が横はみ出し（`documentElement.scrollWidth > innerWidth`）を起こさず折り返すこと。
2. **片側ペイン折り畳み時の最小床保護**:
   - **手順**: `xl`（1280px）で右ペイン（MappingMaster）を折り畳んだ状態、かつ左ペインに多数ワークフローがある状態を確認する。
   - **期待結果**: `workflow-list-scroll` の `maxHeight` が `240px` 未満に潰れず、一覧の閲覧・操作が可能であること。
3. **1279px 境界でのスクロール解除**:
   - **手順**: 1280px から 1279px にリサイズする。
   - **期待結果**: 単一カラム化に伴い `workflow-list-scroll` / `mapping-master-list-scroll` の `maxHeight` 制限が解除され、ページ縦スクロールに戻ること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_HELPERS}/local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-430-test-plan.md`
- **アンロード**: `python ${GLOBAL_HELPERS}/local_model_adapter.py unload`
