# REQ-426 実行可能テスト計画

- **リスク区分**: `high`（DB マイグレーション `step_035` およびアプリ起動制御 `lifespan` の変更のため、V1 ベースライン・フルスイート検証必須）

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック & 規約チェック
- `mypy backend`
- `backend\.venv\Scripts\python scripts/verify_openapi_sync.py`
- `backend\.venv\Scripts\python scripts/verify_test_naming.py`
- `backend\.venv\Scripts\python -m pytest backend/tests/unit`

### Gate 2: フルスイート検証（フィルタなし）
- `backend\.venv\Scripts\python -m pytest -n auto`

### Gate 3: シナリオ / Red Team 境界テスト
- `backend\.venv\Scripts\python -m pytest backend/tests/integration/models/test_migrations.py -k "REQ-426 or REQ-418"`
- `backend\.venv\Scripts\python -m pytest backend/tests/integration/api/test_workflows.py -k "REQ-426"`
- `backend\.venv\Scripts\python -m pytest backend/tests/unit/test_helpers.py -k "REQ-426"`

---

## 2. 結合・シナリオ検証 (Integration & Scenario Verification)
- **テスト配置 (Test Placement)**:
  - `backend/tests/integration/models/test_migrations.py` (`AC-1`)
  - `backend/tests/integration/api/test_workflows.py` (`AC-2`)
  - `backend/tests/unit/test_helpers.py` (`AC-3`)
- **ケース名タグ**: `[REQ-426/AC-1]`, `[REQ-426/AC-2]`, `[REQ-426/AC-3]`
- **シナリオ**:
  1. `AC-1` (`integration`): `workflow_presets` と `param_sync_groups` に未解決ゴーストキーと解決可能キーが混在する SQLite DB に `step_035_variant_id_references` を適用し、警告ログ出力＋解決可能分移行＋`master_variant_id` 列追加＋再実行冪等性を確認する。
  2. `AC-2` (`integration`): `master_variant_id` が設定済みの `ParamSyncGroup` と `None` の `ParamSyncGroup` を持つワークフローを `POST /api/workflows/{id}/copy` で複製し、201 Created で複製先へ引き継がれることを確認する。
  3. `AC-3` (`unit`): `lifespan` 実行時に `run_migrations()` が例外を送出した場合、握りつぶさずエラーログ出力後に例外が再送出されることを確認する。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]
- **前提テーブル欠如**: `mapping_variants` テーブルが存在しない状態で `step_035_variant_id_references` を実行した場合、引き続き `MissingMappingVariantsError` で中断し DB を変更しないこと。
- **不正 JSON / 空値**: `workflow_presets.param_values` や `param_sync_groups.slave_roles` に不正 JSON や `null` が含まれていても `step_035` がクラッシュせず警告ログを出して他行の移行を完了すること。
