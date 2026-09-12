# REQ-254 実行可能テスト計画 (QA 改訂版)

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンド単体テスト（トポロジー解析エンジン）
- **コマンド**: `pytest backend/tests/test_workflow_diff_engine.py -v`
- **対象ファイル**: `backend/app/services/workflow_diff_engine.py`
- **期待値**: 全テストケース (6/6) PASS。脳内推論での代用は厳禁。
- **定量検証項目**:
  1. `test_identical_workflow`: 同一 JSON 投入時、`confidence == 1.0` かつ `status == "ok"` が全マッピングロールで成立すること。
  2. `test_reindexed_nodes`: ノード ID 変更時（例: 6 → 12）、`confidence >= 0.85`、`status == "reindexed"`、`new_node_id == "12"` となること（AC-1）。
  3. `test_renamed_nodes`: タイトル変更時、クラス型および入出力一致により `confidence >= 0.85`、`status == "renamed"` となること（AC-1）。
  4. `test_false_reuse_detection`: 同一 ID でもクラス・入出力が乖離している場合、`score < 40.0`、`status == "false_reuse"`、`new_node_id is None`（誤自動マッピング抑止）となること（AC-2）。
  5. `test_symmetric_parallel_nodes`: 対称な並列 LoRA ローダーに対し、内部パラメータ類似度評価により `candidates[0]["node_id"] == "expected_node"` が一意に順位付けされること。
  6. `test_bypass_profile_warnings`: 旧ノード ID（例: "10"）を含むバイパスプロファイルに対し、`len(bypass_warnings) >= 1` かつ `missing_node_id == "10"` の警告辞書が出力されること。

### 1-2. バックエンド DB & マイグレーションテスト
- **コマンド**: `pytest backend/tests/test_workflow_history_migration.py -v`
- **対象ファイル**: `backend/app/migrations/steps.py`, `backend/app/models.py`
- **期待値**: 全テストケース (3/3) PASS。
- **定量検証項目**:
  1. `inspector.get_table_names()` に `"workflow_history"` が存在すること。
  2. カラム一覧に `['id', 'workflow_id', 'json_body', 'mappings', 'created_at']` が存在すること。
  3. `Workflow` レコードを削除した際、外部キー CASCADE により `WorkflowHistory` の該当レコード件数が 0 件になること。

### 1-3. バックエンド API 統合テスト
- **コマンド**: `pytest backend/tests/test_workflows_diff_api.py -v`
- **対象ファイル**: `backend/app/routers/workflows.py`
- **期待値**: 全テストケース (5/5) PASS。
- **定量検証項目**:
  1. `POST /api/workflows/{id}/diff-analyze` に対し HTTP 200 返却。レスポンスキーに `{"summary", "role_migrations", "bypass_warnings", "unmapped_new_nodes"}` を完全包含すること。
  2. `PUT /api/workflows/{id}` で置換実行時、HTTP 200 返却。置換前後の `db.query(WorkflowPreset).filter_by(workflow_id=id).count()` および `param_values` が不変（維持）であること（AC-4）。
  3. 置換直後に `db.query(WorkflowHistory).filter_by(workflow_id=id).count() >= 1` となり、旧 `json_body` が退避されていること（AC-6）。
  4. `POST /api/workflows/{id}/rollback` に対し HTTP 200 返却（`{"message": "Workflow successfully restored from snapshot", ...}`）。ワークフローの `json_body` が置換前の状態に完全一致すること（AC-6）。
  5. `GET /api/workflows/{id}/history-status` に対し HTTP 200 返却、`has_rollback == True` が確認できること。

### 1-4. フロントエンド単体テスト
- **コマンド**: `npm --prefix frontend test -- src/components/__tests__/WorkflowDiffReplaceModal.test.tsx src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx --run`
- **対象ファイル**: `frontend/src/components/WorkflowDiffReplaceModal.tsx`, `frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx`
- **期待値**: 全テストケース PASS。
- **定量検証項目**:
  1. モーダル表示時、上段テーブル（`data-testid="role-migration-table"`）および下段インスペクター（`data-testid="topology-inspector"`）が DOM に存在すること（AC-3）。
  2. 上段の2行目（例: Negative Prompt）をクリックした際、下段インスペクターのノード名表示が "Negative Prompt" に切り替わること（AC-3）。
  3. 必須ロール（`Positive_Prompt`）の割当が空（null）の時、`expect(submitButton).toBeDisabled()` かつ `expect(submitButton).toHaveAttribute('aria-disabled', 'true')` であること（AC-5）。
  4. 履歴が存在する時（`has_rollback === true`）、ロールバックボタンが活性表示され、クリック時に `workflowsApi.rollback` が呼び出されること（AC-6）。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. シナリオ検証（実ワークフロー差分置換）
1. **事前準備**:
   - バックエンド起動: `python -m uvicorn app.main:app --port 8000`
   - フロントエンド起動: `npm --prefix frontend run dev`
2. **操作フロー**:
   - ブラウザで `http://localhost:5173/settings` にアクセス。
   - 「ワークフロー管理」から既存ワークフローの「スマート置換」ボタンをクリック。
   - 改善版 ComfyUI JSON を投入。`WorkflowDiffReplaceModal` が開くことを確認。
   - 各行をクリックし、下段インスペクターで [旧接続] と [新接続] の配線ノード名が視覚的に表示されることを確認。
   - 「確定して置換」をクリック。HTTP 200 レスポンスとモーダルクローズを確認。
   - GeneratePage（`http://localhost:5173/`）に遷移し、既存プリセットからパラメータが正常に読み出せることを確認。
   - Settings 画面へ戻り「ロールバック」を実行。直前のワークフロー状態に復元されることを確認。

### 2-2. Red Teaming (境界値・異常系検証)
- **テストケース 1: 必須ロール（Positive Prompt）消失時の確定抑止 (AC-5)**
  - 手順: 新 JSON から CLIPTextEncode ノードを削除した不正 JSON を投入。
  - 判定基準: 上段で該当ロールが `not_found`（赤色バッジ）となり、ボタン DOM 属性 `disabled === true` かつクリック不可であること。
- **テストケース 2: False Reuse（ID再利用）の誤割当防止 (AC-2)**
  - 手順: 旧ノード ID "6" と同名だがクラス型が "SaveImage" である細工 JSON を投入。
  - 判定基準: スコアが 40 未満となり `false_reuse` と判定。ID "6" への自動マッピングが解除（`new_node_id === null`）されること。
- **テストケース 3: 履歴なし状態での不正ロールバック試行**
  - 手順: 退避履歴が 0 件のワークフローに対し `POST /api/workflows/{id}/rollback` を直接実行。
  - 判定基準: HTTP 400 Bad Request（`detail: "No rollback history available"`）が返却されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-254-test-plan.md`
- **判定基準**: 出力結果において重大な指摘（FAIL）がなく、客観的検証基準を満たすこと。
