# REQ-437 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification / V1 Baseline)

`.agents/verification.json` に基づき、V1 Baseline（全 3 Gate の独立・新規実行）を適用する。

### Gate 1: 静的型チェック・ユニット・規約チェック
- **Backend 型チェック**: `backend\.venv\Scripts\python.exe -m mypy backend`
- **Backend ユニットテスト**: `backend\.venv\Scripts\python.exe -m pytest backend/tests/unit`
- **テスト命名規約チェック**: `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
- **Frontend 型チェック・ユニット・UI不変条件**:
  - `npm.cmd --prefix frontend run typecheck`
  - `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__`
  - `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
- **期待値**: 全コマンド Exit code 0、型エラー・規約違反 0 件。

### Gate 2: 全統合テストスイート (Full Suite Discovery Without File Filters)
- **公式フルスイートコマンド**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`（内部で `pytest -n auto` 相当のバックエンド全体 + フロントエンド全体を実行）
- **期待値**: 全テスト PASS（Exit code 0）、予期せぬ skip やコレクション不整合 0 件。局所テストのみでの PASS 判定は厳禁。

### Gate 3: E2E スイートおよび境界値・Red Teaming シナリオ
- **公式 E2E スイート**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`
- **期待値**: 既存ブラウザ E2E シナリオに回帰なし（Exit code 0）。

---

## 2. テスト階層と AC マッピング (Execution Tier & AC-to-Case Mapping)

### 2.1 Execution Tier & Case Hierarchy
| Tier | 対象層 | 実行環境・分離方式 | 対象ケース |
| --- | --- | --- | --- |
| Tier 1 (`unit` / static) | 型整合・OpenAPI 契約・命名規約 | 静的解析・インメモリ | `mypy backend`, `backend/tests/unit`, `verify_test_naming.py --strict` |
| Tier 2 (`integration`) | Router + ORM + SQLite / MigrationRunner | `db_session` SAVEPOINT 分離、または独立 `sqlite:///:memory:` エンジン + `respx` 外部 HTTP 遮断 | `test_presets.py`（AC-1, AC-2, AC-4）, `test_migrations.py`（AC-3, AC-4） |
| Tier 3 (`e2e` / `scenario`) | 実ブラウザ E2E・異常系・境界値・Red Teaming | Playwright (`run_e2e.py`) および API/Migration 異常系シナリオ | `run_e2e.py`（回帰保全）、下記 Red Teaming ケース（空/非存在/混在/重複 ID、テーブル欠損、再実行冪等性） |

### 2.2 AC-to-Case Mapping & Metadata
各 Python テスト関数は docstring に `[REQ-437/AC-n]` を記載し、`@getattr(pytest.mark, "REQ-437")` / `@getattr(pytest.mark, "AC-n")` マーカーおよび `@pytest.mark.parametrize` の `id="[REQ-437/AC-n]-..."` により展開後ノード ID へ明示メタデータを付与する。

| AC | 階層 | 安定ランナー ID（展開後） | メタデータ / タグ |
| --- | --- | --- | --- |
| AC-1 | integration | `backend/tests/integration/api/test_presets.py::test_bulk_delete_presets_removes_child_values_without_orphans[[REQ-437/AC-1]-delete-all]` | `@REQ-437`, `@AC-1`, `id="[REQ-437/AC-1]-delete-all"` |
| AC-1 (境界) | scenario | `backend/tests/integration/api/test_presets.py::test_bulk_delete_presets_boundary_ids[[REQ-437/AC-1]-empty]` 等（empty / missing / mixed / duplicate） | `@REQ-437`, `@AC-1`, `id="[REQ-437/AC-1]-..."` |
| AC-2 | integration / scenario | `backend/tests/integration/api/test_presets.py::test_create_preset_after_bulk_delete_max_id_succeeds[[REQ-437/AC-2]-max-id-reuse]` | `@REQ-437`, `@AC-2`, `id="[REQ-437/AC-2]-max-id-reuse"` |
| AC-3 | integration | `backend/tests/integration/models/test_migrations.py::test_step_037_cleanup_orphaned_workflow_preset_values_and_idempotency[[REQ-437/AC-3]-orphan-cleanup]` | `@REQ-437`, `@AC-3`, `id="[REQ-437/AC-3]-orphan-cleanup"` |
| AC-3 (境界) | scenario | `backend/tests/integration/models/test_migrations.py::test_step_037_skips_safely_when_tables_missing[[REQ-437/AC-3]-missing-tables]` | `@REQ-437`, `@AC-3`, `id="[REQ-437/AC-3]-missing-tables"` |
| AC-4 | integration / e2e | `backend/tests/integration/api/test_presets.py` 既存全テスト + `backend/tests/integration/models/test_migrations.py` 既存全テスト + `scripts/run_full_suite.py` | 既存 AC タグ群（`REQ-356`, `REQ-350`, `REQ-418`, `REQ-427` 等） |

---

## 3. リスク分類と全スイートフォールバック方針 (Risk & Fallback Analysis)

- **リスク分類**: **`high`**
  - **根拠**: 起動時 DB マイグレーション（`backend/app/migrations/steps.py`）および永続化層のバルク削除ロジック（`backend/app/routers/presets.py`）を変更するため、共通ガバナンスの High-Risk Scope（schemas / migrations / persistence）に該当する。
- **適用プロファイル**: **V1 Baseline（デフォルト強制）**。V2 オプトインは禁止する。
- **Mandatory Full-Suite Fallback Triggers（OR 条件）**:
  1. High-risk scope（`migrations/steps.py` または永続化変更）に該当する（本 PBI で常に発火 → Gate 2 全件実行必須）
  2. `pytest --collect-only` でのコレクション不整合・0 件収集・予期せぬ skip の増加
  3. 追跡対象入力（`backend/`, `frontend/`, `scripts/`, `tests/`）や実行環境・引数の変更
  4. フレーキーテスト、モック不備、または未検証の影響領域の検出

---

## 4. 実行環境・コレクション設計 (Environment & Collection Design)

- **ランタイム**: `backend\.venv\Scripts\python.exe`（CPU/RAM のみ・Zero-GPU）。`PYTHONDONTWRITEBYTECODE=1` を設定。
- **コレクション設計**: ルート `pytest.ini` に従い `testpaths = backend/tests tests`、`norecursedirs = docs/logs ...` を適用する。`db/prompt_surgeon.db` はテストから一切参照・変更しない。
- **Seam Map 要約**: Router / ORM / MigrationRunner / インメモリ SQLite は実コード結合。ComfyUI HTTP（`:8188`）のみ `respx` で遮断。PBT 不要。
- **Frozen Candidate 再実行**: 最終レビュー対象候補のハッシュ／コミット確定後、フィルタなしの Gate 1・Gate 2・Gate 3 を新規実行して証跡を凍結する。

---

## 5. テスト配置計画 (`[W-DD-PLACE]`)

| AC | 新規 test() | 理由 | 相乗り先のファイル | 親の test() | 挿入位置 | 追加する test.step |
| --- | --- | --- | --- | --- | --- | --- |
| AC-1 | あり | 既存の `test_preset_delete_and_bulk_delete` は `param_values: {}` のみで `WorkflowPresetValue` 行を作成せず、混在・非存在・重複 ID の境界条件も検証しないため専用パラメータ化テストを新設する | `backend/tests/integration/api/test_presets.py` | `test_bulk_delete_presets_removes_child_values_without_orphans` | `test_preset_delete_and_bulk_delete` の直後 | `-` |
| AC-2 | あり | 最大 ID プリセット一括削除直後に同一バリアントキーで `POST /api/workflow-presets` を再作成する連続シーケンス検証が既存テストに存在しないため | `backend/tests/integration/api/test_presets.py` | `test_create_preset_after_bulk_delete_max_id_succeeds` | `test_bulk_delete_presets_removes_child_values_without_orphans` の直後 | `-` |
| AC-3 | あり | 新設マイグレーション `step_037_cleanup_orphaned_workflow_preset_values` に対する単体・統合・テーブル欠損ガードの検証が存在しないため | `backend/tests/integration/models/test_migrations.py` | `test_step_037_cleanup_orphaned_workflow_preset_values_and_idempotency` | ファイル末尾（`test_step_036_migration_idempotent` の直後） | `-` |
| AC-4 | なし | 既存のプリセット CRUD・単件削除・並び替え・楽観ロック(409)・ワークフロー複製・マイグレーション回帰テストをそのまま実行するため | `backend/tests/integration/api/test_presets.py` | `test_preset_delete_and_bulk_delete` | 既存ケースのまま | `-` |

---

## 6. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

1. **一括削除の異常・境界入力 (`[REQ-437/AC-1]`)**:
   - **手順**: `ids: []`（空配列）、`ids: [999999]`（存在しない ID のみ）、`ids: [existing_id, 999999, existing_id]`（実在・非実在・重複混在）で `DELETE /api/workflow-presets/bulk` を実行し、非対象プリセットおよびその `WorkflowPresetValue` 行が誤って削除されないことを確認する。
   - **期待結果**: 全パターンで HTTP 204、対象外プリセットと子行は 100% 保持され、削除対象の子行のみ 0 件になる。
2. **最大 ID 再利用と UNIQUE 衝突再現 (`[REQ-437/AC-2]`)**:
   - **手順**: 既存プリセット群のうち最大 ID を持つプリセット（複数 `WorkflowPresetValue` 行を含む）を作成し、`DELETE /api/workflow-presets/bulk` で削除した直後に同一 `workflow_id` と同一バリアントキーで `POST /api/workflow-presets` を実行する。
   - **期待結果**: SQLite が同一 `id` を再利用しても `IntegrityError`（HTTP 500）が発生せず HTTP 201 で作成成功し、DB 内の `WorkflowPresetValue` が新しい値のみで構成される。
3. **マイグレーション前提欠損・再実行冪等性 (`[REQ-437/AC-3]`)**:
   - **手順**: (a) `workflow_presets` と `workflow_preset_values` に有効行と複数の孤立行を混在させた状態で `run_migrations` を 2 回連続実行する。(b) `workflow_preset_values` テーブルが存在しない古いスキーマ状態で `step_037` を実行する。
   - **期待結果**: (a) 初回で孤立行のみ全削除・有効行 100% 保持、2 回目は例外なく 0 件削除で完了。(b) 例外なく安全にスキップされる。

---

## 7. 第三者監査 (Subagent Audit)
- **監査役**: qa-auditor（`subagent-audit` Skill。読み取り専用の軽量サブエージェント）
- **機械チェック**: Gate 1〜3 がすべて PASS で、`python ${GLOBAL_HELPERS}/workflow_validator.py test-hygiene REQ-437` が終了コード 0 のときだけ監査役を起動する。失敗したら起動せずに止める。
- **入力**: (1) PBI とテスト計画のパス、(2) 変更差分 `docs/logs/REQ-437/audit/diff.patch` と変更ファイル一覧 `docs/logs/REQ-437/audit/changed-files.txt`、(3) Gate 1〜3 の記録とログのパス。親の会話履歴は渡さない。
- **再監査**: 1 回まで。2 回目も FAIL なら INCONCLUSIVE として利用者に判断を求める。起動できなければ INCONCLUSIVE。
- **記録**: `subagent_audit_result` を `docs/logs/REQ-437/audit/dev-verify-<attempt>.md` に保存し、`python ${GLOBAL_HELPERS}/workflow_validator.py audit-evidence REQ-437 --file docs/logs/REQ-437/audit/dev-verify-<attempt>.md` で確認する。
