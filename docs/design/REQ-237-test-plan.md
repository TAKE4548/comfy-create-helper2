# REQ-237 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. フロントエンド各スライス単体テスト
- **コマンド**:
  - `npm --prefix frontend test -- src/store/__tests__/slices/connectionSlice.test.ts --run`
  - `npm --prefix frontend test -- src/store/__tests__/slices/bypassSlice.test.ts --run`
  - `npm --prefix frontend test -- src/store/__tests__/slices/jobQueueSlice.test.ts --run`
  - `npm --prefix frontend test -- src/store/__tests__/slices/multiSetSlice.test.ts --run`
- **判定基準**:
  - 終了コード: `0` (Success)
  - 失敗件数: `0 failures`
  - 各アサーションが正常に通過すること。

### 1-2. フロントエンド全スイート連続実行 & 隔離性検証
- **コマンド**:
  - `npm --prefix frontend test -- --run`
- **判定基準**:
  - 終了コード: `0` (Success)
  - 全 67+ テストファイル、全テストケースにおいて `0 failed` であること。
  - テスト間のモジュール変数・WebSocketインスタンスリーク、未処理例外（Uncaught Exception）がゼロであること。

### 1-3. バックエンド順序依存性解消検証 (pytest-randomly)
- **コマンド**:
  - `pytest --randomly-seed=12345`
  - `pytest --randomly-seed=54321`
  - `pytest --randomly-seed=auto`
- **判定基準**:
  - 終了コード: `0` (Success)
  - テスト結果: `235 passed, 0 failed`
  - `verify_db_pool_clean` による SQLAlchemy DB コネクションリーク例外（AssertionError: DB session/connection leak detected）が 0 件であること。

---

## 2. 構造検証・整合性確認 (Structural & Integrity Verification)
- **ファイル削除確認コマンド**:
  - PowerShell: `Test-Path "frontend/src/store/__tests/useGenerationStore.test.ts"`
    - **期待値**: `False`
  - PowerShell: `Test-Path "frontend/src/store/__tests"`
    - **期待値**: `False`
  - PowerShell: `Test-Path "frontend/src/store/__tests__/slices"`
    - **期待値**: `True`
- **Red Teaming (境界値・異常系)**:
  - `bypassSlice.test.ts`: API通信失敗（`bypassProfilesApi.list` が `Rejected(new Error('Network error'))`）時にストアがクラッシュせず、終了コード 0 で例外ハンドリングが行われ `console.error` を記録すること。
  - `connectionSlice.test.ts`: 不正なノードID（`'99'`）や `workflow = null` に対して `resolveNodeTitle` が例外を投げずに安全に `null` を返却すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **Task / QA 監査**:
  - `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-237-T1.md`
  - `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-237-test-plan.md`
- **ガバナンス検証**:
  - `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design/REQ-237.md`
  - `python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-237`
  - **判定基準**: すべて `PASS` / `Validation successful.` で終了すること。
