---
id: REQ-418-test-plan
tags:
  - test-plan
  - migration
related_paths:
  - docs/backlog/pbi/active/REQ-418.md
  - docs/design/REQ-418.md
---

# REQ-418 テスト計画

設計書: `docs/design/REQ-418.md`。リスク区分: **high** (DB スキーマ/マイグレーション、公開 API 契約)。全テストは CPU/RAM のみ (Zero-GPU)。

### 1. 実行ティア・テスト配置 [W-DD-PLACE]・環境収集設計

| Tier | 内容 | 対象 |
|------|------|------|
| unit | 純粋ロジック (DB 不要) | `variant_keys` の分類・正規化・展開 (example + Hypothesis PBT) |
| integration | 実 SQLite in-memory + 実ルータ/サービス/マイグレーション。外部 I/O のみ遮断 (`respx`, `isolated_snapshot_dir`) | `step_035`、プリセット/スナップショット/同期グループ API、workflow copy |
| frontend unit | jsdom + Vitest。API 層を `vi.mock` で遮断 | `ParamSyncModal` |
| scenario / e2e | 層をまたぐ正常・異常・保全フロー (§3) + 既存 Playwright E2E 回帰 | AC-1〜AC-4 通し |

- **テスト配置**: 既存テストファイルを拡張する (チケット番号付き新規テストファイルは作成禁止)。唯一の新規ファイルはモジュール名由来の `backend/tests/unit/test_variant_keys.py`。
- **タグと Runner ID**: 各ケースの docstring 1 行目に `[REQ-418/AC-n]` を付与。関数名は `test_variant_ref_ac<n>_<内容>` (安定 ID、パラメータ展開なし)。Vitest はケース名に `[REQ-418/AC-3]` を含める。
- **ランタイム・収集・スキップ**: `backend\.venv\Scripts\python` (Python 3.12.0、Hypothesis 6.168.1 導入済み)。`backend/pytest.ini` で全件収集し、新規ケースに `skip`/`xfail` は使用禁止。

### 2. AC → ケース対応 (Runner ID はすべて `<file>::<function>`)

### AC-1 マイグレーション (REQ-418-T1 unit / REQ-418-T2 integration)

| ID | ファイル | 関数 | Tier | 検証内容 |
|----|----------|------|------|----------|
| A1-1 | `backend/tests/unit/test_variant_keys.py` | `test_variant_ref_ac1_classify_priority_order` | unit | RESERVED > VARIANT > ROLE > DERIVED_ROLE > UNRESOLVED の固定順 |
| A1-2 | 同上 | `test_variant_ref_ac1_exact_role_beats_derived_suffix` | unit | role 自体が `_lora_count` で終わる場合は ROLE が勝つ |
| A1-3 | 同上 | `test_variant_ref_ac1_encode_decode_roundtrip_pbt` | unit (PBT) | 任意の id/sub で `decode(encode(x)) == x` |
| A1-4 | 同上 | `test_variant_ref_ac1_classify_never_raises_pbt` | unit (PBT) | 任意文字列 (空文字・Unicode 含む) で例外なし・種別が必ず 1 つ |
| A1-5 | 同上 | `test_variant_ref_ac1_normalize_params_values_and_unresolved` | unit | 非 str 値の `json.dumps`、未解決リスト、予約キー素通し |
| A1-6 | `backend/tests/integration/models/test_migrations.py` | `test_variant_ref_ac1_missing_mapping_variants_aborts_unchanged` | integration | 前提テーブル欠如 → `ValueError`、DB 無変更 |
| A1-7 | 同上 | `test_variant_ref_ac1_empty_tables_create_schema_only` | integration | 空テーブル → スキーマ変更と FK 制約付与のみコミット・成功 |
| A1-8 | 同上 | `test_variant_ref_ac1_all_resolved_populates_values_and_clears_legacy_json` | integration | 全解決 → 値行 (本体・派生) 作成、FK 付与、旧 JSON は予約キーのみ |
| A1-9 | 同上 | `test_variant_ref_ac1_unresolved_row_rolls_back_all_unchanged` | integration | 1 件でも未解決 → 例外、全体ロールバック、既存 role 参照データ無変更 |
| A1-10 | 同上 | `test_variant_ref_ac1_unresolved_error_lists_all_keys` | integration | 例外メッセージと `audit_role_references` が全未解決を列挙 |
| A1-11 | 同上 | `test_variant_ref_ac1_step_is_idempotent_on_rerun` | integration | 2 回実行で値行・メンバー行が増えず結果同一 |
| A1-12 | 同上 | `test_variant_ref_ac1_step_schema_matches_models` | integration | `create_all` 由来と step 由来で列・UNIQUE・FK が一致 |
| A1-13 | 同上 | `test_variant_ref_ac1_variant_delete_cascades_children` | integration | ORM 経由の variant 削除で値行・メンバー行・master 一致グループが消える |

### AC-2 スナップショット復元 (REQ-418-T1 unit / REQ-418-T4 integration)

| ID | ファイル | 関数 | Tier | 検証内容 |
|----|----------|------|------|----------|
| A2-1 | `backend/tests/unit/test_variant_keys.py` | `test_variant_ref_ac2_expand_legacy_role_keys_maps_and_reports_missing` | unit | 旧 role キー → variant 解決、欠落は `missing` |
| A2-2 | 同上 | `test_variant_ref_ac2_expand_warns_with_owner_label` | unit | `caplog` で WARNING、`owner_label` と欠落キーを含む |
| A2-3 | 同上 | `test_variant_ref_ac2_to_storage_params_variant_keys_and_reserved_passthrough` | unit | 保存形式は `v:<id>` + 予約キー |
| A2-4 | `backend/tests/integration/services/test_snapshot_service.py` | `test_variant_ref_ac2_create_persists_variant_keys` | integration | DB 生 JSON が `v:` キー、予約キー保持、未解決は破棄+警告 |
| A2-5 | 同上 | `test_variant_ref_ac2_legacy_snapshot_expands_mapped_only` | integration | 旧 role キー行を直接投入 → 解決可能な値のみ展開 |
| A2-6 | `backend/tests/integration/api/test_snapshots.py` | `test_variant_ref_ac2_get_missing_variant_key_warns_and_leaves_field_unset` | integration | `GET /api/snapshots/{id}`: `logger.warning` 出力、応答に欠落キー無し (初期値維持)、有効パラメータのみ展開 |
| A2-7 | 同上 | `test_variant_ref_ac2_stored_variant_snapshot_follows_role_rename` | integration | `variant.role` 更新後の GET が新 role キーで返る |
| A2-8 | 同上 | `test_variant_ref_ac2_list_uses_same_resolver` | integration | 一覧 `params` も同一規則 |
| A2-9 | 同上 | `test_variant_ref_ac2_patch_params_normalized` | integration | `PATCH` の `params` も `v:` 形式で保存 |

### AC-3 同期グループ (REQ-418-T2 / REQ-418-T5 integration, REQ-418-T6 frontend)

| ID | ファイル | 関数 / ケース名 | Tier | 検証内容 |
|----|----------|-----------------|------|----------|
| A3-1 | `backend/tests/integration/models/test_migrations.py` | `test_variant_ref_ac3_sync_group_migration_sets_master_and_members` | integration | 旧 `master_role`/`slave_roles` → `master_variant_id` + members |
| A3-2 | 同上 | `test_variant_ref_ac3_sync_group_unresolved_role_aborts_unchanged` | integration | 未解決 role → 例外、グループ行無変更 |
| A3-3 | `backend/tests/integration/legacy/test_param_sync_groups.py` | `test_variant_ref_ac3_create_with_variant_ids_persists_master_and_members` | integration | `POST` ids → `variant_id` の組として永続化 |
| A3-4 | 同上 | `test_variant_ref_ac3_create_with_roles_fallback_resolves_ids` | integration | role 指定でも `variant_id` で永続化 |
| A3-5 | 同上 | `test_variant_ref_ac3_invalid_payload_returns_422` | integration | 未知 id / 未知 role / どちらも無し / 空 name → 422 |
| A3-6 | 同上 | `test_variant_ref_ac3_update_replaces_members_and_dedupes` | integration | `PUT` で members 置換・重複除去・ids 優先 |
| A3-7 | 同上 | `test_variant_ref_ac3_delete_group_removes_members` | integration | `DELETE` で members も消える |
| A3-8 | `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | `it('[REQ-418/AC-3] sends master_variant_id when creating a group')` | frontend | 作成ペイロードが `master_variant_id` |
| A3-9 | 同上 | `it('[REQ-418/AC-3] slave toggle and master change send variant ids')` | frontend | `slave_variant_ids` 送信、同一グループ内同期設定の保持 |
| A3-10 | 同上 | `it('[REQ-418/AC-3] falls back to role fields when mapping has no variant_id')` | frontend | 保全/異常系フォールバック |

### AC-4 最新 Variant 情報 (REQ-418-T3 / REQ-418-T5 integration)

| ID | ファイル | 関数 | Tier | 検証内容 |
|----|----------|------|------|----------|
| A4-1 | `backend/tests/integration/api/test_presets.py` | `test_variant_ref_ac4_list_reflects_renamed_variant_role` | integration | `variant.role` 更新後の `GET /api/workflow-presets` が新 role キーで値を返す |
| A4-2 | 同上 | `test_variant_ref_ac4_list_includes_latest_variant_refs` | integration | `variants[].role/display_name` が更新後の最新値 |
| A4-3 | 同上 | `test_variant_ref_ac4_post_put_role_and_v_keys_roundtrip` | integration | role キーと `v:` キーの往復、派生キー・予約キー保持 |
| A4-4 | 同上 | `test_variant_ref_ac4_write_drops_unresolved_key_with_warning` | integration | ゴーストキーは破棄 + WARNING |
| A4-5 | 同上 | `test_variant_ref_ac4_put_bumps_updated_at_and_keeps_conflict_detection` | integration | 値のみ変更の PUT でも `updated_at` が進み、古い `base_updated_at` は 409 |
| A4-6 | 同上 | `test_variant_ref_ac4_read_skips_orphan_value_row` | integration | 親 variant 行が消えた値行は応答から除外 (HTTP 200) |
| A4-7 | 同上 | `test_variant_ref_ac4_workflow_copy_duplicates_values_and_sync_groups` | integration | `POST /api/workflows/{id}/copy` が値行と同期グループを同一 `variant_id` で複製 |
| A4-8 | `backend/tests/integration/legacy/test_param_sync_groups.py` | `test_variant_ref_ac4_list_reflects_renamed_role_and_display_name` | integration | 同期グループ一覧が更新後の最新 `role`/`display_name` を返す |

### 3. シナリオ・Red Team (Gate 3) とフルスイート Fallback 検証コマンド

- **S-1 通しフロー (AC-1〜AC-4 正常系)**: 旧 `role` 形式のプリセット・スナップショット・同期グループを持つ DB で `run_migrations` 実行 → API GET で展開確認 → `MappingVariant.role` と `MappingMaster.display_name` を更新 → プリセット一覧・同期グループ一覧・スナップショット GET が最新 Variant 情報を返すことを確認 → 新規保存データが DB 上 `variant_id` 形式であることを確認。
- **S-2 異常・境界 (Red Teaming)**: ① `mapping_variants` 欠如やゴーストキー (`Resolution Selecto`) 混入時のマイグレーション中断・ロールバック (AC-1)、② 削除済み `v:999` や未登録旧 `role` キーを含むスナップショット GET の `logger.warning` 出力と未設定維持 (AC-2)、③ 未知 `variant_id` による同期グループ 422 拒否 (AC-3)、④ 古い `base_updated_at` による 409 競合維持・カスケードリネーム (`applied_assets`) 保全 (AC-4)。
- **フルスイート Fallback (リスク区分: high のため V1 Baseline 強制適用)**:
  - **Gate 1**: `backend\.venv\Scripts\python scripts/verify_ui_invariants.py` / `mypy backend` / `cd frontend; npm run typecheck` / `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`
  - **Gate 2**: `backend\.venv\Scripts\python -m pytest -n auto` / `cd frontend; npm test`
  - **Gate 3**: S-1〜S-2 シナリオ実行 + `cd frontend; npx playwright test`

| AC | ケース ID | Gate 2 結果 | Gate 3 シナリオ | 判定 |
|----|-----------|-------------|-----------------|------|
| AC-1 | A1-1〜A1-13 | (証拠) | S-1, S-2 (①) | (未判定) |
| AC-2 | A2-1〜A2-9 | (証拠) | S-1, S-2 (②) | (未判定) |
| AC-3 | A3-1〜A3-10 | (証拠) | S-1, S-2 (③) | (未判定) |
| AC-4 | A4-1〜A4-8 | (証拠) | S-1, S-2 (④) | (未判定) |

