# REQ-336 実行可能テスト計画 (Prompt Surgeon ワークフローマッピング新アーキテクチャ統合)

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **Backend 型チェック**: `mypy backend`
  - **期待値**: エラー 0 件 (Exit code 0)
- **Frontend 型チェック**: `cd frontend; npm run typecheck`
  - **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **Backend ユニット/結合テスト**:
  - `backend\.venv\Scripts\python -m pytest backend/tests/test_req336_models_migration.py backend/tests/test_req336_cascade_service.py backend/tests/test_req336_stage_api.py backend/tests/test_req336_mapping_masters_api.py backend/tests/test_workflow_scanner.py`
  - **期待値**: 全テスト PASS (Exit code 0)
- **Frontend ユニット/結合テスト**:
  - `cd frontend; npx vitest run src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx src/api/__tests__/mappingApi.test.ts`
  - **期待値**: 全テスト PASS (Exit code 0)
- **Full Suite 回帰確認**:
  - `backend\.venv\Scripts\python -m pytest backend/tests/`
  - `cd frontend; npm test`
  - **期待値**: 全既存テストを含むスイート全体が PASS (Exit code 0)

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: 既存データからの冪等DBマイグレーションと生成互換性維持 (AC-1)
- **対象**: `test_req336_models_migration.py`
- **検証手順**:
  1. 既存の `mapping_master` (フラット構造) および `workflow_mappings` が存在するSQLite DB環境を用意。
  2. `MigrationStep` 029 を実行。
  3. グループ（Prompt, Sampler等）、親マスター、ステージ（Main, Rough, Detail）、バリアント、および `variant_id` で結合された配線データへの正規化を確認。
  4. 再度マイグレーションを実行してもデータ重複や例外が発生しない（冪等性）ことを検証。
  5. 既存ワークフローの物理ノード解決および画像生成パラメータ抽出が移行前と同一であることを検証。

### シナリオ 2: 設定画面での大カテゴリタブ絞り込みと統合テーブル表示 (AC-2)
- **対象**: `SettingsPage` / `MappingMasterSection`
- **検証手順**:
  1. 設定画面のマッピングマスタ管理セクションを開く。
  2. 大カテゴリタブ「サンプラー系」をクリックする。
  3. steps, cfg, sampler_name, scheduler などのサンプラー系親設定のみが表示され、同一行内に「通常」「Rough」「Detail」のバリアントバッジが集約表示されることを確認。

### シナリオ 3: 親マスター共通設定変更のバリアント一元反映とリアルタイムプレビュー (AC-3)
- **対象**: `MappingMasterEditModal`
- **検証手順**:
  1. `steps` の編集モーダルを開き、期待Class Typesにチップ入力または候補パレットクリックで `KSamplerCustom` を追加。
  2. 保存を実行。
  3. 配下の通常、Rough、Detail の全有効バリアントに共通設定が一元反映されることを確認。
  4. 画面内のマッチング検証ボックスにおいて、ワークフローノードとの合致状態がリアルタイムに更新されることを確認。

### シナリオ 4: 動的Role導出の単方向算出と一意性確認 (AC-4)
- **対象**: `mapping_variants.computed_role`
- **検証手順**:
  1. 親 `base_key = "denoise"`、ステージ `suffix = "_rough"` のバリアントを作成。
  2. `computed_role` が `"denoise_rough"` として導出されることを確認。
  3. `custom_role_override = "custom_denoise_override"` を設定した場合、オーバーライド値が優先されることを確認。

### シナリオ 5: ステージ接尾辞変更時のプレビューと排他ロック下一括置換 (AC-5)
- **対象**: Cascade Rename API & Confirmation Dialog
- **検証手順**:
  1. ステージ `rough` の接尾辞を `_rough` から `_draft` へ変更要求。
  2. `GET /api/stage-masters/{id}/cascade-preview` で影響件数（バリアント件数、プリセット件数、スナップショット件数）と差分プレビューが表示されることを確認。
  3. トランザクション一括置換を実行。
  4. `workflow_presets.param_values` および `snapshots.params` 内の Role キーが一括置換され、`workflow_mappings.variant_id` の配線は維持されることを確認。

### シナリオ 6: 3重削除ガードと論理非表示（アーカイブ）連動 (AC-6)
- **対象**: 削除ガードハンドラ
- **検証手順**:
  1. `is_builtin = True` のシステム既定ステージ（Main等）の削除を試行 -> HTTP 400 でブロック。
  2. `usage_count > 0`（配線中）のカスタムステージの削除を試行 -> HTTP 400 でブロック。
  3. 当該ステージの `is_active = False`（論理非表示）を実行 -> 正常更新され、配下のバリアントも連動して配線ビュー・生成ビューから非表示化されることを確認。

### シナリオ 7: 新規ステージ追加と未知ワークフローの動的適応 (AC-7)
- **対象**: アダプティブ・ステージング配線UI
- **検証手順**:
  1. ステージ管理画面で新規カスタムステージ（`key="stage3"`, `suffix="_stage3"`, `search_keywords=["3rd", "refiner_final"]`）を追加。
  2. `refiner_final` ノードを含むワークフローを読み込む。
  3. ソースコードの変更なしに、該当ステージのタブが動的に展開され、ノードが自動マッチングされることを確認。

### シナリオ 8: 合致ノード0件のステージ自動非表示 (AC-8)
- **対象**: アダプティブ・ステージング配線UI
- **検証手順**:
  1. Rough ノードが存在しない 1段サンプラ構成（Mainのみ）のワークフローを読み込む。
  2. Rough および Detail ステージが自動的に非表示化され、空欄行や不要な未割当警告が一切表示されないことを確認。

### シナリオ 9: 外部PNG画像メタデータの履歴チェーン解決とフォールバック (AC-9)
- **対象**: `workflowParamInjector` / `stage_masters.previous_suffixes`
- **検証手順**:
  1. 過去の接尾辞 `_rouhg` (タイポ) が `previous_suffixes` に記録された状態で、外部PNG画像のメタデータ `{ "steps_rouhg": 20 }` を読み込む。
  2. 履歴チェーンにより最新の `steps_rough` へフォールバック解決されることを確認。
  3. 履歴チェーン外の未知キー `{ "steps_unknown": 20 }` の場合も、`base_key = "steps"` によりメインバリアントへグレイスフルに解決されることを確認。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 失敗/異常系シナリオ 1: DBマイグレーション途中の強制エラーとアトミックロールバック
- **手順**: マイグレーション処理の途中で意図的なSQL制約違反（重複キーなど）を発生させるテストを実行。
- **期待結果**: トランザクションが即座に ROLLBACK され、既存テーブルのスキーマおよびデータが 100% 破損せず以前の状態を保つこと。

### 失敗/異常系シナリオ 2: Cascade Rename 実行中の並行更新競合
- **手順**: ステージ接尾辞の一括置換トランザクション実行中に、同一プリセットへの書き込み競合を発生させる。
- **期待結果**: 行ロックまたは分離レベルにより不整合（一部キーのみ更新される事態）を防止し、アトミックに完了するか排他エラーとして安全に拒絶されること。

### 失敗/異常系シナリオ 3: previous_suffixes の履歴肥大化ガード
- **手順**: ステージの接尾辞変更を15回連続で実行する。
- **期待結果**: `previous_suffixes` 配列の長さが上限（最大10件）に保たれ、最も古い履歴が安全に切り捨てられること。

### 失敗/異常系シナリオ 4: 不正なワークフローJSON投入時のアダプティブ判定耐性
- **手順**: `_meta` が辞書ではなく不正な型（文字列・配列・null）であるノードや、循環参照を含むノードグラフを投入する。
- **期待結果**: アダプティブ判定エンジンが例外クラッシュせず、安全に空の候補またはMainステージへフォールバックすること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit`
- **アンロード**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py unload`

