# REQ-369 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **Backend コマンド**: `backend\.venv\Scripts\python -m pytest --collect-only`
- **Frontend コマンド**: `npm --prefix frontend run typecheck`
- **期待値**: 収集・型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **Backend コマンド**: `backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py`
- **Frontend コマンド**: `npx --prefix frontend vitest run src/hooks/__tests__/useMasterMappingRows.test.ts src/components/__tests__/WorkflowModalMultiStage.test.tsx`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 テスト配置計画 (Test Placement Plan)
- チケット番号付きテストファイル（`*req369*` 等）の新規作成は禁止（SPEC-TESTING v2.1 準拠）。以下の既存テストファイルを拡張する。

| AC | 追記先既存テストファイル | ケース名タグ・フィルタ |
| :--- | :--- | :--- |
| `AC-1` | `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts`<br>`frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | `[REQ-369/AC-1]`<br>`npx --prefix frontend vitest run -t "REQ-369/AC-1"` |
| `AC-2` | `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts`<br>`frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | `[REQ-369/AC-2]`<br>`npx --prefix frontend vitest run -t "REQ-369/AC-2"` |
| `AC-3` | `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts`<br>`frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | `[REQ-369/AC-3]`<br>`npx --prefix frontend vitest run -t "REQ-369/AC-3"` |
| `AC-4` | `backend/tests/integration/api/test_workflows.py` | `[REQ-369/AC-4]`<br>`backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ_369 and AC_4"` |
| `AC-5` | `backend/tests/integration/api/test_workflows.py` | `[REQ-369/AC-5]`<br>`backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ_369 and AC_5"` |

### 2.2 Seam Map (結合境界定義)
1. **Integrated (本物のコードとして結合実行する層)**:
   - **Frontend**: `RescanModal` / `UploadWorkflowModal` ⇄ `useMasterMappingRows` ⇄ `workflowMappingState` (`mappingSlotKey`, `hydrateSlotStates`) ⇄ `WorkflowMappingEditor`。
   - **Backend**: FastAPI Router (`workflows.py`: `create_workflow`, `update_workflow`, `copy_workflow`, `rollback_workflow`, `get_workflow`) ⇄ SQLAlchemy Models (`Workflow`, `WorkflowMapping`, `MappingMaster`, `MappingVariant`) ⇄ Migration Step (`steps.py`: `step_031_cleanup_orphaned_workflow_mappings`) ⇄ インメモリ SQLite DB。
2. **Severed (外部 I/O 切断境界)**:
   - **Frontend**: HTTP API クライアント境界 (`workflowsApi`, `mappingMastersApi`)。
   - **Backend**: ComfyUI 外部 HTTP 通信 (`http://localhost:8188/queue` 等を `respx` でモック)。本番 `db/prompt_surgeon.db` への書き込みは行わず、テスト用インメモリ SQLite セッション (`db_session`) で検証する。
3. **Mock Level**:
   - 内部ビジネスロジック（`useMasterMappingRows`, `mappingSlotKey`, `_filter_valid_mappings`, `step_031_cleanup_orphaned_workflow_mappings`）のモンキーパッチは厳禁。
4. **PBT Decision**:
   - 対象はマスタ ID / バリアント ID の集合所属判定とマイグレーション SQL であり、自由形式パーサや数値計算式を含まないため Property-Based Testing は不要（決定論的な境界値ケースで網羅）。
5. **Fault Injection**:
   - 存在しない `master_id`（例: `999`, `37`）、存在しない `variant_id`（例: `9999`）、別マスタに属する不整合な `variant_id` を混入させた状態で `getMappings()`・`PUT /api/workflows/{id}`・`step_031` マイグレーションを実行し、孤立・不整合レコードが確実に排除され `role == null` が発生しないことを検証する。

### 2.3 受入シナリオ詳細
- **シナリオ 1 (`[REQ-369/AC-1]`)**:
  - `existingMappings` に削除済み旧マスタ（`master_id: 999`）の孤立レコードと、現在の `masters` に存在する非活性バリアント（`is_enabled: false`）の有効レコードの両方を含めて `useMasterMappingRows` / `RescanModal` を初期化・保存した際、孤立レコード（`master_id: 999`）は除外され、実在する非活性バリアントの保存済みレコードは保持されることを確認する。
  - **検証アサーション**: `expect(mappings).not.toContainEqual(expect.objectContaining({ master_id: 999 }))`、および `expect(mappings).toContainEqual(expect.objectContaining({ master_id: 1, variant_id: 101 }))`。
- **シナリオ 2 (`[REQ-369/AC-2]`)**:
  - 既存の有効なマッピング（例: Main ステージの `v:101` のみ割当済み、Rough ステージの `v:102` は未割当）を持つワークフローで `RescanModal` を開き、スキャン結果（`scanResult.matched`）に `v:102` の候補が含まれていても、ユーザーが `v:102` を操作せずに保存したとき、`v:102` が空欄（未割当）のまま維持され `mappings` ペイロードに自動追加されないことを確認する。
  - **検証アサーション**: `expect(inputs[1].value).toBe('')`、および `expect(workflowsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({ mappings: [{ master_id: 1, variant_id: 101, node_id: '10' }] }))`。
- **シナリオ 3 (`[REQ-369/AC-3]`)**:
  - 新規ワークフロー登録（`UploadWorkflowModal` / `existingMappings: []`）では、スキャン結果（`scanResult.matched`）のノード ID が各スロットの初期値として自動設定され、そのまま登録・保存できることを確認する。
  - **検証アサーション**: `expect(result.current.getMappings(result.current.rows, [])).toEqual([{ master_id: 10, variant_id: 101, node_id: 'node-101' }, { master_id: 10, variant_id: 102, node_id: 'node-102' }])`。
- **シナリオ 4 (`[REQ-369/AC-4]`)**:
  - `POST /api/workflows` および `PUT /api/workflows/{id}` に、実在する `(master_id, variant_id)` と、存在しない `master_id: 9999`・存在しない `variant_id: 8888` を混在させて送信したとき、実在かつ整合するマッピングのみが `workflow_mappings` に永続化され、`GET /api/workflows/{id}` で `role: null` のレコードが 0 件であることを確認する。
  - **検証アサーション**: `assert len(mappings) == 1`、`assert mappings[0]["master_id"] == master.id`、`assert mappings[0]["role"] is not None`。
- **シナリオ 5 (`[REQ-369/AC-5]`)**:
  - 外部キー制約無効下で `mapping_masters` に存在しない `master_id: 9999` や不整合な `variant_id: 8888` を持つ孤立レコードが `workflow_mappings` に存在する状態を作成し、`step_031_cleanup_orphaned_workflow_mappings` を実行したとき、孤立・不整合レコードのみが削除され、有効なマッピングレコードが保持されることを確認する。
  - **検証アサーション**: `assert len(remaining) == 1`、`assert remaining[0].master_id == master.id`、および 2 回目実行後も `assert len(remaining_idempotent) == 1`（冪等性）。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]
- **手順 1 (全件孤立レコードの既存ワークフロー再スキャン)**:
  - `existingMappings` が削除済み `master_id: 999` のみで構成されるワークフローを `RescanModal` で開き保存する。
  - **期待結果**: `master_id: 999` は孤立レコードとして破棄され、保存ペイロードに `master_id: 999` が一切含まれないこと（`expect(savedMappings.some(m => m.master_id === 999)).toBe(false)`）。
- **手順 2 (クロス Master の Variant ID 偽装)**:
  - Master A (`id=m1`) と Master B (`id=m2`, `variant_id=v2`) が実在する状態で、`{"master_id": m1, "variant_id": v2, "node_id": "10"}` のように別マスタの `variant_id` を指定して `PUT /api/workflows/{id}` および `useMasterMappingRows.getMappings()` を実行する。
  - **期待結果**: `master_id` と `variant_id` の親子不整合が検知され、不正レコードが除外されること。
- **手順 3 (`step_031` マイグレーションのべき等性)**:
  - `step_031_cleanup_orphaned_workflow_mappings` を連続して 2 回実行する。
  - **期待結果**: 1 回目で孤立レコードが削除され、2 回目もエラーなく完了し有効なマッピングが一切損なわれないこと（$N_1 == N_2 == 1$）。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `backend\.venv\Scripts\python C:\Users\audih\.agent-tooling\releases\f93fa85ae12d940a605d9b389d6b17d8511159f14123c61c020807b1243dc830\helpers\local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-369-test-plan.md`
- **アンロード**: `backend\.venv\Scripts\python C:\Users\audih\.agent-tooling\releases\f93fa85ae12d940a605d9b389d6b17d8511159f14123c61c020807b1243dc830\helpers\local_model_adapter.py unload`

