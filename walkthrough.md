# REQ-336 検証 Walkthrough (Prompt Surgeon ワークフローマッピング新アーキテクチャ統合)

## 検証結果サマリー

- **PBI**: REQ-336 (Prompt Surgeon: ワークフローマッピング新アーキテクチャ統合（2軸正規化・動的Role・拡張可能適応型UI）)
- **総合判定**: **PASS**
- **Gate 1 (静的型チェック)**: **PASS** (Backend mypy: 0 errors / Frontend tsc -b: 0 errors)
- **Gate 2 (フルテストスイート)**: **PASS** (Backend pytest: 714 passed, 0 failures / Frontend vitest: 1749 passed across 183 files, 0 failures)
- **Gate 3 (シナリオ & Red Teaming)**: **PASS** (AC 100% 準拠確認、異常系・境界値 4 シナリオ完全合格)
- **ローカルモデル QA 監査**: **COMPLIANT** (推論特化モデルによる客観監査完了、VRAM 100% 解放確認済)

---

## 1. 受入基準 (AC) 検証マトリクス

| AC番号 | 受入基準 (Given-When-Then) | 検証テスト / 対象実装 | 判定 | 実行エビデンス概要 |
| :--- | :--- | :--- | :--- | :--- |
| **AC-1** | **Given** 既存のマッピングマスタと配線データが存在する環境<br>**When** 冪等なDBマイグレーションを実行したとき<br>**Then** 既存データがグループ・親マスター・ステージ・バリアントへ欠損なく2軸正規化され、既存ワークフローの物理配線および生成機能が同一挙動を維持し、失敗時は安全にロールバックされること。 | `backend/tests/test_req336_models_migration.py`<br>`backend/tests/test_req336_e2e_integration.py`<br>`backend/app/migrations/steps.py` (Step 029) | **PASS** | `test_step_029_idempotency`、`test_legacy_data_migration_step_029`、`test_step_029_atomic_rollback_on_failure` が全件合格。既存フラットマスターからのバリアント正規化、ワークフロー配線の variant_id 結合、冪等再実行、障害時アトミックロールバックを実証。 |
| **AC-2** | **Given** 設定ページのマッピングマスタ管理画面を表示したとき<br>**When** 大カテゴリタブ（プロンプト系、サンプラー系など）を切り替える<br>**Then** 該当カテゴリの親設定のみが絞り込まれ、同一行内に紐づくステージバリアント群（通常、Rough、Detail、カスタムステージ等）が集約表示されること。 | `frontend/src/pages/SettingsPage/components/MappingMasterSection.tsx`<br>`frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx`<br>`backend/tests/test_req336_mapping_masters_api.py` | **PASS** | `test_mapping_master_filter_by_group` 合格。UI テスト `renders master rows with aggregated stage variants and respects group tab filtering` にてタブ切替時の行フィルタリングと各バリアントバッジの集約表示を確認。 |
| **AC-3** | **Given** マッピングマスタ編集モーダルを開いたとき<br>**When** 期待Class Typesまたは基本検索パターンをチップ入力で追加・削除して保存する<br>**Then** 配下の全有効バリアントに共通設定が一元反映され、ワークフローノードとの自動合致プレビューがリアルタイムに更新されること。 | `frontend/src/components/MappingMasterEditModal.tsx`<br>`frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx`<br>`backend/tests/test_req336_mapping_masters_api.py` | **PASS** | `test_mapping_master_update_with_variants` 合格。モーダルテストにてチップ入力、候補パレットクリック（+ KSampler等）、バリアントトグル、保存時の一元反映およびノード合致プレビューの更新を確認。 |
| **AC-4** | **Given** 親定義に対してバリアントを追加・変更するとき<br>**When** 対象ステージを選択する<br>**Then** `computed_role`（base_key + suffix、またはcustom_role_override）が単方向で動的に導出され、一意なRoleキーとして利用可能となること。 | `backend/app/models.py` (`MappingVariant`)<br>`backend/tests/test_req336_models_migration.py`<br>`backend/tests/test_req336_mapping_masters_api.py` | **PASS** | `test_models_definitions_and_computed_role` において base_key + suffix (`denoise_rough`) の単方向導出および `custom_role_override` の優先適用を確認。 |
| **AC-5** | **Given** ステージマスタ管理でステージの接尾辞（suffix）を変更・保存するとき<br>**When** 排他ロック下の一括置換確認ダイアログで実行を承認する<br>**Then** 影響を受けるバリアントのオーバーライド、保存済みプリセット、スナップショット内のRoleキーが単一トランザクションで一括置換され、ノード配線ID（variant_id）は維持されること。 | `backend/app/services/mapping_service.py` (`CascadeService`)<br>`backend/tests/test_req336_cascade_service.py`<br>`backend/tests/test_req336_stage_api.py`<br>`frontend/src/components/StageManagerModal.tsx` | **PASS** | `test_preview_cascade`、`test_execute_cascade_rename`、`test_cascade_preview_and_rename_endpoints` 合格。影響件数プレビュー提示後、トランザクション内で param_values / snapshots の一括置換と variant_id 配線維持を確認。 |
| **AC-6** | **Given** 参照中のマスタまたはシステム既定（is_builtin=True）のステージ/グループを削除しようとしたとき<br>**When** 削除を実行する<br>**Then** 削除ガードにより操作がブロックされ、警告理由が表示されるか論理非表示（is_active=False）に案内され、非活性化時は配下のバリアントも連動して非表示化されること。 | `backend/app/services/mapping_service.py`<br>`backend/tests/test_req336_stage_api.py`<br>`frontend/src/components/StageManagerModal.tsx` | **PASS** | `test_deletion_guards_api`、`test_update_and_deactivate_cascade_to_variants` 合格。is_builtin 削除試行時の 400 ブロック、usages > 0 の削除ブロック、および is_active=False による連動非活性化とUIからの非表示化を確認。 |
| **AC-7** | **Given** ユーザーがステージ管理画面で新しいステージ（例: 3段目サンプラ、リージョン別プロンプト等）を追加・編集しバリアントを登録したとき<br>**When** そのステージに対応するノード群を含むワークフローを読み込む<br>**Then** コードの変更なしに該当ステージが動的に展開され、適切なノードが自動マッチングされること。 | `frontend/src/utils/workflowAdaptiveStageDetector.ts`<br>`frontend/src/components/AdaptiveWorkflowWiring.tsx`<br>`frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | **PASS** | `3段サンプラ構成: 新ステージ(Detail/Refiner)が合致ノードにより動的に展開される`、`test_list_and_create_stage` 合格。ハードコードなしにキーワード走査によりカスタムステージタブが動的展開され、ノード割り当てが行われることを実証。 |
| **AC-8** | **Given** 読み込んだワークフローにおいて合致するノードが0件のステージがあるとき<br>**When** ワークフロー配線ビューを表示する<br>**Then** システム必須ステージを除き該当ステージは自動的に非表示化され、空欄行や不要な未割当警告が発生しないこと。 | `frontend/src/utils/workflowAdaptiveStageDetector.ts`<br>`frontend/src/components/AdaptiveWorkflowWiring.tsx`<br>`frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | **PASS** | `1段サンプラ構成: RoughやDetailが非表示となり、Main(is_builtin)のみ展開される`、`各ステージタブ内に、該当ステージのバリアントスロットのみを表示（空スロット・無関係な警告を排除）` 合格。未合致ステージのクリーンな非表示化を確認。 |
| **AC-9** | **Given** 外部PNG画像（DB外）から過去のRoleキーが読み込まれたとき<br>**When** StageMasterに過去の旧接尾辞履歴（previous_suffixes配列）が記録されている場合<br>**Then** 履歴チェーン（最大10件）から最新のRoleキーへとフォールバック解決され、履歴チェーン外の場合もbase_keyによりグレイスフル解決されること。 | `frontend/src/utils/workflowParamInjector.ts`<br>`frontend/src/test/e2e_req336_workflow_mapping.test.tsx`<br>`backend/tests/test_req336_e2e_integration.py` | **PASS** | `resolves external PNG metadata using previous_suffixes history chain`、`gracefully resolves unknown suffix to base_key match in knownRoles`、`test_req336_full_lifecycle` 合格。旧サフィックス（例: _rouhg タイポ）の連鎖解決と未知サフィックス時の base_key フォールバックを確認。 |

---

## 2. Red Teaming (境界値・異常系シナリオ) 検証

| 失敗 / 異常系シナリオ | 検証内容と注入した障害 | 期待される防御動作 | 検証結果 |
| :--- | :--- | :--- | :--- |
| **Red Team 1: DBマイグレーション途中の強制エラーとアトミックロールバック** | Step 029 マイグレーション処理の最中に一意制約違反エラーを強制注入 (`test_step_029_atomic_rollback_on_failure`, `test_red_teaming_1_migration_rollback_on_failure`) | トランザクションが即座に ROLLBACK され、既存テーブルのスキーマおよびデータが1件の欠損・破損もなく以前の状態を完全に維持すること。 | **PASS** (整合性担保、スキーマおよびデータが完全ロールバックされることを確認) |
| **Red Team 2: Cascade Rename 実行中の並行競合制御** | ステージ接尾辞の一括置換トランザクション実行中の排他制御と不整合防止 (`test_red_teaming_2_concurrent_transaction_locking`) | 行ロックおよび分離レベルにより一部キーのみ更新される中途半端な不整合状態を防止し、アトミックに完了するか排他エラーとして安全にリジェクトされること。 | **PASS** (アトミックトランザクションにより不整合の発生が皆無であることを実証) |
| **Red Team 3: previous_suffixes 履歴配列の肥大化・汚染ガード** | 15回連続のサフィックス変更、破損したJSON文字列や空文字列の投入 (`test_previous_suffixes_cap_at_10`, `test_red_teaming_3_previous_suffixes_trim_limit_and_corrupted_json`, frontend E2E) | 履歴が直近10件 (`slice(0, 10)`) に確実に制限され、最古の履歴が切り捨てられること。不正・破損JSONに対しても例外をスローせず安全に処理すること。 | **PASS** (10件クリップおよび破損JSON耐性をバックエンド・フロントエンド双方で確認) |
| **Red Team 4: 不正なワークフローJSON投入時のアダプティブ判定耐性** | `_meta` が不正な型（文字列・配列・null）であるノードや欠損ノードを含む不正JSONグラフを走査エンジンに投入 (`WorkflowAdaptiveStaging.test.tsx`) | アダプティブ判定エンジンが例外クラッシュせず、安全にフォールバックして処理を継続すること。 | **PASS** (`汚染ノード・不正JSON・nullノードに対してクラッシュせず安全にガードする` テスト合格) |

---

## 3. 実行エビデンス (<execution_evidence>)

<execution_evidence>

### Gate 1: 静的型チェック (Typecheck Baseline)

#### Backend Typecheck (`mypy backend`)
```text
C:\Users\audih\ws\comfy-create-helper2> backend\.venv\Scripts\mypy backend
Success: no issues found in 186 source files
Exit Code: 0
```

#### Frontend Typecheck (`tsc -b --noEmit`)
```text
frontend> npm run typecheck
> frontend@0.0.0 typecheck
> tsc -b --noEmit
Exit Code: 0 (0 errors)
```

---

### Gate 2: フルテストスイート (Full Discovery Test Suite)

#### Backend Discovery Suite (`pytest`)
```text
C:\Users\audih\ws\comfy-create-helper2> backend\.venv\Scripts\python -m pytest
collected 714 items

================= 714 passed, 3 warnings in 85.29s (0:01:25) ==================
Exit Code: 0 (0 failures)
```

#### Frontend Discovery Suite (`npm test`)
```text
frontend> npm test
Test Files  183 passed (183)
Tests       1749 passed (1749)
Duration    46.48s
Exit Code: 0 (0 failures)
```

---

### Gate 3: シナリオ & Red Teaming 詳細ログ

#### Backend REQ-336 テストスイート実行
```text
backend\.venv\Scripts\python -m pytest backend/tests/test_req336_models_migration.py backend/tests/test_req336_cascade_service.py backend/tests/test_req336_stage_api.py backend/tests/test_req336_mapping_masters_api.py backend/tests/test_req336_e2e_integration.py -v

backend/tests/test_req336_cascade_service.py::TestReq336CascadeService::test_preview_cascade PASSED [  4%]
backend/tests/test_req336_cascade_service.py::TestReq336CascadeService::test_previous_suffixes_cap_at_10 PASSED [  8%]
backend/tests/test_req336_cascade_service.py::TestReq336CascadeService::test_validate_stage_deletion_guards PASSED [ 13%]
backend/tests/test_req336_cascade_service.py::TestReq336CascadeService::test_execute_cascade_rename PASSED [ 17%]
backend/tests/test_req336_models_migration.py::TestReq336ModelsAndMigration::test_step_029_atomic_rollback_on_failure PASSED [ 21%]
backend/tests/test_req336_models_migration.py::TestReq336ModelsAndMigration::test_step_029_idempotency PASSED [ 26%]
backend/tests/test_req336_models_migration.py::TestReq336ModelsAndMigration::test_models_definitions_and_computed_role PASSED [ 30%]
backend/tests/test_req336_models_migration.py::TestReq336ModelsAndMigration::test_legacy_data_migration_step_029 PASSED [ 34%]
backend/tests/test_req336_models_migration.py::TestReq336ModelsAndMigration::test_seeder_initial_data_creates_groups_stages_masters_variants PASSED [ 39%]
backend/tests/test_req336_e2e_integration.py::TestReq336E2EIntegration::test_red_teaming_2_concurrent_transaction_locking PASSED [ 43%]
backend/tests/test_req336_e2e_integration.py::TestReq336E2EIntegration::test_red_teaming_3_previous_suffixes_trim_limit_and_corrupted_json PASSED [ 47%]
backend/tests/test_req336_e2e_integration.py::TestReq336E2EIntegration::test_req336_full_lifecycle PASSED [ 52%]
backend/tests/test_req336_e2e_integration.py::TestReq336E2EIntegration::test_red_teaming_1_migration_rollback_on_failure PASSED [ 56%]
backend/tests/test_req336_stage_api.py::TestReq336StageAPI::test_deletion_guards_api PASSED [ 60%]
backend/tests/test_req336_stage_api.py::TestReq336StageAPI::test_reorder_stages PASSED [ 65%]
backend/tests/test_req336_stage_api.py::TestReq336StageAPI::test_list_and_create_stage PASSED [ 69%]
backend/tests/test_req336_stage_api.py::TestReq336StageAPI::test_update_and_deactivate_cascade_to_variants PASSED [ 73%]
backend/tests/test_req336_stage_api.py::TestReq336StageAPI::test_cascade_preview_and_rename_endpoints PASSED [ 78%]
backend/tests/test_req336_mapping_masters_api.py::TestReq336MappingMastersAPI::test_mapping_master_update_with_variants PASSED [ 82%]
backend/tests/test_req336_mapping_masters_api.py::TestReq336MappingMastersAPI::test_mapping_master_filter_by_group PASSED [ 86%]
backend/tests/test_req336_mapping_masters_api.py::TestReq336MappingMastersAPI::test_mapping_groups_crud_and_deletion_guard PASSED [ 91%]
backend/tests/test_req336_mapping_masters_api.py::TestReq336MappingMastersAPI::test_mapping_master_create_legacy_and_v2 PASSED [ 95%]
backend/tests/test_req336_mapping_masters_api.py::TestReq336MappingMastersAPI::test_mapping_groups_reorder PASSED [100%]
======================== 23 passed, 1 warning in 1.10s ========================
```

#### Frontend REQ-336 テストスイート実行
```text
npx vitest run src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx src/api/__tests__/mappingApi.test.ts src/test/e2e_req336_workflow_mapping.test.tsx --reporter=verbose

 ✓ src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx (8 tests)
 ✓ src/api/__tests__/mappingApi.test.ts (7 tests)
 ✓ src/test/e2e_req336_workflow_mapping.test.tsx (11 tests)
 ✓ src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx (26 tests)

Test Files  4 passed (4)
Tests       52 passed (52)
Duration    2.65s
```

---

### ローカルモデル QA 監査証跡 (Step 2)

```text
<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->
Model Auto-Router: Action 'qa-audit' executed with 'qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored'
Exit Code: 0
Result: COMPLIANT (AI Escape Risk: Low, Edge Case Coverage: 82%, Command Clarity & Executability confirmed)

GPU Cleanup Verification:
Command: python local_model_adapter.py unload
Output: [Model Auto-Router] All models unloaded from LM Studio. VRAM freed.
Exit Code: 0 (100% GPU VRAM released)
```

</execution_evidence>

---

## 4. 結論

PBI **REQ-336** の全改修項目（Backend 2軸正規化データモデル、動的Role算出、Step 029 マイグレーション、Cascade Rename トランザクション置換、3重削除ガード、Frontend カテゴリタブ統合テーブル、チップ入力・候補パレット、動的アダプティブ配線UI、旧サフィックス履歴フォールバック解決）について、**Gate 1（型チェック）**、**Gate 2（フルリグレッションテスト）**、**Gate 3（受入基準全件および4つのRed Teaming境界値・異常系検証）**、ならびにローカル推論モデルによる第三者監査のすべてにおいて、厳格な基準をクリアして **PASS** を確認いたしました。