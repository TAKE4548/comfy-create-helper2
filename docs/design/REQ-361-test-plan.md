# REQ-361 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend && npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)。移動後の全44テストファイルおよび全ソースコードで相対インポート等の型不整合が一切ないこと。

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **Backend pytest & SAVEPOINT 検証**:
  - **コマンド**: `pytest backend/tests/governance/test_openapi_contract.py backend/tests/integration/legacy/test_prompt_metadata.py`
  - **期待値**: 全テスト PASS、DB コネクションリーク 0 件 (`verify_db_pool_clean` 合格)、`dependency_overrides` リーク 0 件、終了コード 0。
- **命名・構造規約検証**: `python scripts/verify_test_naming.py --strict`
  - **期待値**: ファイルパス違反 0 件、テスト名規約違反 0 件、終了コード 0。
- **ワークフロー規約検証**: `python scripts/workflow_validator.py test-hygiene`
  - **期待値**: 違反 0 件、終了コード 0。
- **Frontend フルテストスイート**: `cd frontend && npm test`
  - **期待値**: テスト欠落ゼロで全 2,182 件以上のテストが PASS すること (Exit code 0)。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### テスト配置・隔離計画 (Test Placement & State Isolation) [MUST [W-DD-PLACE]]
- **チケット名ファイルの完全廃止**: `req\d+` や `REQ-\d+` をファイルパスに含むテストを 0 件にする。
- **配置先**:
  - `frontend/src/test/e2e_req*.test.ts*` (15件) -> `pages/**/__tests__/` または `components/**/__tests__/` へ再配置。
  - 各モーダル・パーツテスト (29件) -> コンポーネント・API・Hook 直下の `__tests__/` に機能名で配置。
- **ケース名タグ**: 全テストケースに `[REQ-xxx/AC-n]` プレフィックスを付与。
- **Seam Map & 隔離規約準拠 [MUST [W-DD-SEAM]]**:
  - **Backend**: `unittest.TestCase` を全廃し、pytest + `db_session` (SAVEPOINT rollback) + `clean_dependency_overrides` に完全統合。
  - **Frontend**: `cleanupAllTestState({ queryClient })` を各テストスイートの `beforeEach` / `afterEach` で適用し、Zustand、Storage、fake-indexeddb、WebSocket、React Query の 5 層ステートを完全隔離。

### 主要受入基準 (AC) 検証シナリオ
- **シナリオ 1 (AC-1 / ファイル名チケット番号全廃)**:
  - 手順: `python scripts/verify_test_naming.py --strict` を実行。
  - 期待結果: ファイルパス違反が 0 件であること。
- **シナリオ 2 (AC-2 / 旧e2eテスト15件の再配置)**:
  - 手順: `frontend/src/test/` を走査し、`e2e_req*` ファイルが存在しないことを確認。
  - 期待結果: 各テストが `pages/GeneratePage`, `pages/DatasetStudioPage`, `pages/SettingsPage`, `components/common` に配置されていること。
- **シナリオ 3 (AC-3 / モーダル・パーツテストの配置)**:
  - 手順: `LoraDetailModal.test.tsx`, `AppShell.test.tsx`, `JobManagementModal.test.tsx`, `TagSetFormFields.test.tsx` の所在を確認。
  - 期待結果: 各コンポーネントディレクトリ直下の `__tests__/` に存在すること。
- **シナリオ 4 (AC-4 / テスト名規約化 89件完了)**:
  - 手順: `python scripts/verify_test_naming.py --strict` を実行。
  - 期待結果: テスト命名違反が 0 件、PBI紐づけありテスト数が 297 + 89 = 386 件以上として検出されること。
- **シナリオ 5 (AC-5 / 全テスト PASS・欠落ゼロ)**:
  - 手順: `cd frontend && npm test` を実行。
  - 期待結果: 231ファイル / 2,182テスト以上が 100% PASS すること。
- **シナリオ 6 (Backend Fixture & SAVEPOINT Rollback 検証)**:
  - 手順: `pytest backend/tests/integration/legacy/test_prompt_metadata.py` を実行。
  - 期待結果: `unittest.TestCase` なしの純粋 pytest 形式で動作し、DB への物理書き込みを残さず SAVEPOINT ロールバックで 4 テストすべてが PASS すること。
- **シナリオ 7 (Frontend 5層ステート隔離検証)**:
  - 手順: 再配置された `storageUsageIntegration.test.tsx`, `queryCacheRecovery.test.tsx`, `apiCacheStorage.test.tsx`, `vramGuardIntegration.test.ts` を連続実行。
  - 期待結果: 各テスト間の `cleanupAllTestState()` により副作用漏洩・フレーキー化が一切発生せず、全テストが決定論的に PASS すること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

- **Red Team 1: 偽陽性・規約抜けの検知**:
  - 手順: テストファイル名に一時的に `test_req999_dummy.test.ts` を作成して `python scripts/verify_test_naming.py --strict` を実行。
  - 期待結果: Exit code 1 で検知・拒絶され、偽陰性（見逃し）が発生しないこと。検証後即座に削除。
- **Red Team 2: 未規約テストケース名の検知**:
  - 手順: 一時的に `it("does something (REQ-999)", ...)` を追加して `python scripts/verify_test_naming.py --strict` を実行。
  - 期待結果: `[REQ-999/AC-n]` プレフィックスのないケースが厳格に検出され、Exit code 1 となること。検証後即座に元に戻す。
- **Red Team 3: 相対インポート破損の検出**:
  - 手順: 移動先ファイルでのインポートミス（存在しないモジュールへの参照等）がないかを `npm run typecheck` で検証。
  - 期待結果: TypeScript 型コンパイラが 0 errors でパスし、実行時エラーが発生しないこと。
- **Red Team 4: ステート漏洩・コネクションリークの検知**:
  - 手順: Backend テストで意図的にコミットまたは dependency_overrides 残存、または Frontend テストで Zustand / localStorage の初期化をスキップ。
  - 期待結果: `verify_db_pool_clean` または後続テストのアサーションで確実に FAIL が検知され、暗黙の成功を許容しないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py --context-length 32768 ba-audit docs/design/REQ-361.md docs/design/REQ-361-test-plan.md docs/backlog/task/active/REQ-361-T1.md docs/backlog/task/active/REQ-361-T2.md docs/backlog/task/active/REQ-361-T3.md docs/backlog/task/active/REQ-361-T4.md docs/backlog/task/active/REQ-361-T5.md docs/backlog/task/active/REQ-361-T6.md docs/backlog/task/active/REQ-361-T7.md docs/backlog/task/active/REQ-361-T8.md docs/backlog/task/active/REQ-361-T9.md docs/backlog/task/active/REQ-361-T10.md docs/backlog/task/active/REQ-361-T11.md docs/backlog/task/active/REQ-361-T12.md docs/backlog/task/active/REQ-361-T13.md docs/backlog/task/active/REQ-361-T14.md docs/backlog/task/active/REQ-361-T15.md docs/backlog/task/active/REQ-361-T16.md docs/backlog/task/active/REQ-361-T17.md docs/backlog/task/active/REQ-361-T18.md docs/backlog/task/active/REQ-361-T19.md docs/backlog/task/active/REQ-361-T20.md docs/backlog/task/active/REQ-361-T21.md docs/backlog/task/active/REQ-361-T22.md docs/backlog/task/active/REQ-361-T23.md`
- **実行権限**: Codexでは監査にLM Studio localhost/APIと`lms` CLIが必要なため、最初から昇格sandbox実行を使用する（`sandbox_permissions=require_escalated`）。
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`
