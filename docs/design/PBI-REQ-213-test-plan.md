# PBI-REQ-213 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **対象テストファイル**: `tests/test_migrations.py`, `tests/test_speech_bubble_presets.py`, `tests/test_migrate_images_to_webp.py`
- **個別検証コマンド**:
  ```bash
  pytest tests/test_migrations.py tests/test_speech_bubble_presets.py tests/test_migrate_images_to_webp.py
  ```
- **判定基準**:
  - `test_migrations.py` の 3 テストケースすべてが `PASSED`
  - `test_speech_bubble_presets.py` の 19 テストケースすべてが `PASSED`
  - `test_migrate_images_to_webp.py` の 1 テストケースが `PASSED`
- **リグレッション検証コマンド**:
  ```bash
  pytest
  ```
- **判定基準**:
  - 全 211 件（既存 208 件 + 新規 3 件）以上のテストケースがすべて `PASSED`、終了コード `0`。

## 2. ツール主導監査 (Tool-Driven Audit)
- **ガバナンス成果物監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\artifact_linter.py .
  ```
  - **判定基準**: `<status>PASS</status>` が出力され、終了コード `0` で完了すること。
- **ワークフロー整合性検証**:
  ```bash
  python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-213
  ```
  - **判定基準**: `[PASS]` が全設計・タスク成果物に対して出力され、終了コード `0` で完了すること。

## 3. マイグレーションシナリオ検証 (Deterministic Migration Scenarios)
1. **新規DB作成シナリオ (`test_run_migrations_on_empty_db_is_idempotent`)**:
   - `sqlite:///:memory:` に `Base.metadata.create_all` 実行後、`run_migrations()` を 2 回連続実行。
   - `param_type_masters`, `speech_bubble_presets`, `speech_tone_presets` を含む全テーブルが存在し、重複列追加エラー（`OperationalError`）が発生しないこと。
2. **レガシーDBデータ保持・制約移行シナリオ (`test_legacy_database_full_migration`)**:
   - 旧スキーマ（`role` 列なし、旧ユニーク制約）に 7 テーブルの既存データを投入。
   - `run_migrations()` を実行。
   - レガシーレコード件数が完全一致（データ欠損 0 件）、`sort_order` が `0, 1` に採番されること、および新ユニーク制約（同名で別 orientation / 同一 lora で別 role）での INSERT が成功すること。
3. **スキーマ完全一致シナリオ (`test_schema_parity_between_fresh_and_migrated_db`)**:
   - `fresh_engine` と `migrated_engine` の全テーブル名および各テーブルの全カラム名・型定義の辞書比較が `==` となること。
