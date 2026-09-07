# REQ-214 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **対象テストファイル**: 
  - `tests/test_deprecation_clean.py` (新規追加)
  - `tests/test_presets.py`
  - `tests/test_llm_models.py`
  - `tests/test_req_087.py`
  - `tests/test_base_models_migration.py`
- **個別検証コマンド**:
  ```bash
  pytest -W error::DeprecationWarning tests/test_deprecation_clean.py tests/test_presets.py tests/test_llm_models.py tests/test_req_087.py
  ```
- **判定基準**:
  - `DeprecationWarning` が 1 件も発生せず、全テストが `PASSED`（終了コード `0`）。
- **全体リグレッション検証コマンド**:
  ```bash
  pytest
  ```
- **判定基準**:
  - 全 212 件以上のテストケースがすべて `PASSED`、終了コード `0`。
  - テスト終了時の warnings summary において `DeprecationWarning` および `PydanticDeprecatedSince20` が **0 件**。

## 2. 結合・シナリオ検証 (Integration & Scenario Verification)
1. **Pydantic V2 Settings 起動整合性検証**:
   - `from app.config import settings` を実行し、環境変数 `.env` の読み込みおよびプロパティ `cors_origins_list`, `snapshot_path` が正常に評価されること。
2. **モデル作成・更新時の UTC タイムゾーン整合性検証**:
   - `ParamTypeMaster`, `WorkflowPreset`, `Snapshot` などの各モデルを作成・コミットした際、`created_at` / `updated_at` に正しい UTC 現在時刻が設定されること。
3. **OCC（楽観的排他制御）整合性検証**:
   - `test_preset_update_with_valid_base_updated_at` および `test_preset_update_with_submillisecond_tolerance` が警告なしで `PASSED` すること。

## 3. Red Team テスト (境界値・異常系シナリオ)
1. **旧作法混入検知テスト (Red Team Fallback)**:
   - `-W error::DeprecationWarning` オプション下で `datetime.utcnow()` を呼び出した場合に確実に例外（`DeprecationWarning` as Error）として検知・捕捉されることを確認。
2. **未知の環境変数注入テスト (Pydantic Extra Fields)**:
   - `.env` や環境変数に未知のキー（`UNKNOWN_CUSTOM_SETTING=123`）が存在する場合でも、`extra="ignore"` 設定により `ValidationError` を起こさず安全に無視されること。
3. **Naive vs Aware 比較互換性テスト**:
   - 既存 DB から取得した Naive Datetime と、新規に生成された Aware Datetime の比較において、TypeError（`can't compare offset-naive and offset-aware datetimes`）が発生しないこと。

## 4. ツール主導監査 (Tool-Driven Audit)
> [!NOTE]
> `${GLOBAL_SCRIPTS}` は `.agents/context.md` で定義された変数を指す。

- **タスク・テスト計画品質監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-214-T1.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-214-test-plan.md
  ```
- **ガバナンス成果物監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\artifact_linter.py .
  ```
  - **判定基準**: `<status>PASS</status>` が出力され、終了コード `0` で完了すること。
- **ワークフロー整合性検証**:
  ```bash
  python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-214
  ```
  - **判定基準**: `[PASS]` が全設計・タスク成果物に対して出力され、終了コード `0` で完了すること。
