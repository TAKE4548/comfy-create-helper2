# REQ-418 受入検証報告書 (Walkthrough Report)

## 1. 検証概要

- **PBI ID**: REQ-418
- **PBI 名**: プリセット・スナップショット・同期グループの role 参照から variant_id 参照への移行
- **リスク区分**: high (DB スキーマ変更・マイグレーション・公開 API 契約変更を含むため、V1 Baseline フルスイート検証を厳格適用)
- **検証者**: 	ester-reviewer (dev-verify プロトコルに基づく独立検証)
- **総合判定**: **PASS (全ゲート・全受入基準合格、リワーク完了確認)**

本検証は、REQ-418 のリワーク対応（ackend/tests/integration/legacy/test_generation_integration.py へのバリアントシードおよび expand_stored_params 適用）後のフリーズ候補に対し、独立した検証者として Baseline 3-Gate 検証（Gate 1: 静的型検査・UI不変量・単体テスト、Gate 2: フルスイートテスト、Gate 3: シナリオ・Red Teaming 検証）、設計整合性・エンジニア自律権レビュー（[W-DV-AUTONOMY]）、およびローカルモデル QA 監査・VRAM リソース解放を実施した。

前回の検証で Gate 2 において検知された回帰欠陥（	est_generation_integration.py のスナップショットパラメータ直接比較アサーション失敗）は、Class B 編集により適切に修正され、Gate 1、Gate 2、Gate 3、ローカルモデル QA 監査の全段階で 100% の PASS を確認した。

---

## 2. Baseline 3-Gate 検証結果サマリ

| Gate | 検証内容 / コマンド | 結果 | 詳細・エビデンス |
| :--- | :--- | :---: | :--- |
| **Gate 1** | バックエンド静的型チェック:<br>ackend\.venv\Scripts\python.exe -m mypy backend | **PASS** | 0 errors (Success: no issues found in 180 source files)<br>Record: docs/logs/verification/cf908ab6591f4a10971edec70c036c3c.record.json<br>sha256: 4d4a91ca5c006fcf171000a385ab8b367561b03944557d7b23986667ac511ba2 |
| **Gate 1** | バックエンド単体テスト:<br>ackend\.venv\Scripts\python.exe -m pytest backend/tests/unit | **PASS** | 47 passed in 0.82s (	est_variant_keys.py 含む)<br>Record: docs/logs/verification/8929e922c11e440e8c8cbc31dc94dc84.record.json<br>sha256: 2469bad73dae6b38218b7c61f47bc9711e85d47a9b874a8a22059ebc58f1936a |
| **Gate 1** | フロントエンド単体テスト:<br>scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__ | **PASS** | 24 ファイル 336 passed in 4.31s<br>Record: docs/logs/verification/d296993968c74da9bb4928903c82bd17.record.json<br>sha256: 2d9d6985a85cbd7e3d8d54a0043d30cbef88d2f9994d89cdf62c7d12e26e4303 |
| **Gate 1** | UI 不変量検証:<br>ackend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py | **PASS** | 0 violations across 558 files<br>Record: docs/logs/verification/ac06ba0ec3d34dfc8c4e0c69ac545394.record.json<br>sha256: 22ffc77cb69d4472720feedbb340f065a4a026c057afb65eb846e62bd0021311 |
| **Gate 1** | フロントエンド型チェック:<br>
pm.cmd --prefix frontend run typecheck | **PASS** | 0 errors (	sc -b --noEmit)<br>Record: docs/logs/verification/afbf8cb566ed4b60b4085f7e527eb77f.record.json<br>sha256: f6f19ad68ee9faf2d1b9559df08075242272fbab697ad4b7c5d3695ca486078a |
| **Gate 2** | フルテストスイートベースライン:<br>ackend\.venv\Scripts\python.exe scripts/run_full_suite.py | **PASS** | Backend: 845 passed, 0 failed<br>Frontend: 249 files / 2746 passed, 0 failed<br>Record: docs/logs/verification/63f153cf50c24deeb7bd686c8e675cac.record.json<br>sha256: 1132a6b072499ff32dad484d001a4c1807cdf5a87d2306f515265c19555f5f90<br>テスト衛生性 (workflow_validator.py test-hygiene REQ-418): PASS (0 violations) |
| **Gate 3** | シナリオ・Red Teaming 検証:<br>AC-1 〜 AC-4 バックエンド全ケース | **PASS** | 37 passed in 4.85s (Hypothesis PBT, ロールバック, 異常系含む)<br>Record: docs/logs/verification/45866a6eeba64e3e9f2c76f22343a7e5.record.json<br>sha256: 2490ec1eb870d66031a6541fa481889279e1e93c92bf7dc7b82908923120e49c |
| **Gate 3** | シナリオ検証:<br>AC-3 フロントエンド (ParamSyncModal.test.tsx) | **PASS** | 3 passed ([REQ-418/AC-3] 全ケース PASS)<br>Record: docs/logs/verification/fc04f44b87be443d946f885618498972.record.json<br>sha256: 3a92a7129ba1f26c77b1c2d9a99f09097cdfb1e185006e7e78cb9a07aee17f18 |
| **Gate 3** | E2E フルスイート:<br>ackend\.venv\Scripts\python.exe scripts/run_e2e.py | **PASS** | Playwright E2E: 308 passed, 30 skipped in 1.9m<br>Record: docs/logs/verification/04e304a7eab1406f80a3731d0065d0f0.record.json<br>sha256: 30d0b3afdfcaceb4ee2a22bd3c2e7dd41c52430b3f2843527acd8f07bfcc4c6a |

---

## 3. 設計整合性 & エンジニア自律権レビュー ([W-DV-AUTONOMY])

| 観点 | チェック項目 | 結果 | 判定内容・根拠 |
| :--- | :--- | :---: | :--- |
| **設計整合性 (DC)** | DC-1: 依存関係の完全性 | **PASS** | T1 (基盤) → T2 (DB/マイグレーション) → T3, T5 (API) / T4 (スナップショット) / T6 (フロントエンド) の DAG 整合性を確認。不足・余剰依存なし。 |
| | DC-2: 共有契約の一貫性 | **PASS** | VariantIndex, VariantRef, encode_variant_key, decode_variant_key, expand_stored_params, 	o_storage_params, ワイヤ形式 :<id>[:<sub>] が全タスク間で完全に一致。 |
| | DC-3: AC とタスク・検証の対応 | **PASS** | AC-1 (T1, T2), AC-2 (T1, T4), AC-3 (T2, T5, T6), AC-4 (T3, T5) に漏れなくマッピング。 |
| | DC-4: ファイル所有権の非重複 | **PASS** | 6 タスク間でファイルの重複所有なし。各タスクが許可された範囲のみを変更。 |
| | DC-5: 前提条件の維持 | **PASS** | REQ-417 による MappingVariant 永続化を前提とし、前提未達時の安全弁も含めて維持されている。 |
| **自律権レビュー (AR)** | AR-1〜AR-6: Class B 編集・自律判断の妥当性 | **PASS** | ackend/tests/integration/legacy/test_generation_integration.py の Class B 編集を精査。<br>・AR-1 (B1〜B6): SnapshotService の :<id> 永続化に伴うレガシーテスト修正であり、付随的・最小限の修正。<br>・AR-2: 修正箇所は 1 テスト関数内のバリアントシードと expand_stored_params アサーションのみ。<br>・AR-3: 共有契約・他タスク前提の変更なし。<br>・AR-4: 設計契約に基づく明確な変更であり推測なし。<br>・AR-5: エスカレーション契機 (E1〜E5) の違反なし。<br>・AR-6: AC・設計書・Task Card・PBI・DAG の変更なし。 |

---

## 4. 受入基準 (AC) 適合性対照マトリクス (100% 検証)

| AC ID | ケース ID | 検証ファイル / テスト関数 | Tier | 結果 | 検証内容・エビデンス |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **AC-1** | A1-1 | 	est_variant_keys.py::test_variant_ref_ac1_classify_priority_order | unit | **PASS** | RESERVED > VARIANT > ROLE > DERIVED_ROLE > UNRESOLVED の固定順判定を確認 |
| | A1-2 | 	est_variant_keys.py::test_variant_ref_ac1_exact_role_beats_derived_suffix | unit | **PASS** | role 自体が _lora_count 等で終わる場合の完全一致優先を確認 |
| | A1-3 | 	est_variant_keys.py::test_variant_ref_ac1_encode_decode_roundtrip_pbt | unit (PBT) | **PASS** | Hypothesis による任意 ID/sub のエンコード・デコード往復等価性を検証 |
| | A1-4 | 	est_variant_keys.py::test_variant_ref_ac1_classify_never_raises_pbt | unit (PBT) | **PASS** | Hypothesis による任意 Unicode/空文字入力での非例外性を検証 |
| | A1-5 | 	est_variant_keys.py::test_variant_ref_ac1_normalize_params_values_and_unresolved | unit | **PASS** | 非 str 値の json.dumps、未解決リスト分離、予約キー透過を確認 |
| | A1-6 | 	est_migrations.py::test_variant_ref_ac1_missing_mapping_variants_aborts_unchanged | integration | **PASS** | [Red Team] mapping_variants 欠如時にマイグレーションが中断され DB が一切変更されないことを確認 |
| | A1-7 | 	est_migrations.py::test_variant_ref_ac1_empty_tables_create_schema_only | integration | **PASS** | 空テーブル時のスキーマ作成・FK 付与のみのコミット成功を確認 |
| | A1-8 | 	est_migrations.py::test_variant_ref_ac1_all_resolved_populates_values_and_clears_legacy_json | integration | **PASS** | 全解決時に値テーブル (workflow_preset_values) が作成され旧 JSON が予約キーのみになることを確認 |
| | A1-9 | 	est_migrations.py::test_variant_ref_ac1_unresolved_row_rolls_back_all_unchanged | integration | **PASS** | [Red Team] 1件でも未解決 role が存在する場合に全体ロールバックされ旧データが不変であることを確認 |
| | A1-10 | 	est_migrations.py::test_variant_ref_ac1_unresolved_error_lists_all_keys | integration | **PASS** | 未解決エラー時に全未解決キーが例外メッセージに含まれることを確認 |
| | A1-11 | 	est_migrations.py::test_variant_ref_ac1_step_is_idempotent_on_rerun | integration | **PASS** | マイグレーションステップの再実行による冪等性を確認 |
| | A1-12 | 	est_migrations.py::test_variant_ref_ac1_step_schema_matches_models | integration | **PASS** | create_all と steps.py のスキーマ定義・FK・UNIQUE の完全一致を確認 |
| | A1-13 | 	est_migrations.py::test_variant_ref_ac1_variant_delete_cascades_children | integration | **PASS** | MappingVariant 削除時のカスケード削除を確認 |
| **AC-2** | A2-1 | 	est_variant_keys.py::test_variant_ref_ac2_expand_legacy_role_keys_maps_and_reports_missing | unit | **PASS** | 旧 role キーから variant_id 解決、欠落キーの抽出を確認 |
| | A2-2 | 	est_variant_keys.py::test_variant_ref_ac2_expand_warns_with_owner_label | unit | **PASS** | caplog による WARNING ログ出力（owner_label と欠落キー包含）を確認 |
| | A2-3 | 	est_variant_keys.py::test_variant_ref_ac2_to_storage_params_variant_keys_and_reserved_passthrough | unit | **PASS** | 保存形式が :<id> および予約キー透過になることを確認 |
| | A2-4 | 	est_snapshot_service.py::test_variant_ref_ac2_create_persists_variant_keys | integration | **PASS** | DB 生 JSON に : キーで保存され、未登録キーが除外+警告されることを確認 |
| | A2-5 | 	est_snapshot_service.py::test_variant_ref_ac2_legacy_snapshot_expands_mapped_only | integration | **PASS** | 旧 role キー行直接投入時、解決可能値のみ展開されることを確認 |
| | A2-6 | 	est_snapshots.py::test_variant_ref_ac2_get_missing_variant_key_warns_and_leaves_field_unset | integration | **PASS** | [Red Team] GET /api/snapshots/{id} で未解決キーが警告出力されレスポンスから除外（未設定維持）されることを確認 |
| | A2-7 | 	est_snapshots.py::test_variant_ref_ac2_stored_variant_snapshot_follows_role_rename | integration | **PASS** | ariant.role リネーム後に GET すると新 role キーで返却されることを確認 |
| | A2-8 | 	est_snapshots.py::test_variant_ref_ac2_list_uses_same_resolver | integration | **PASS** | スナップショット一覧 API でも同一の後方互換リゾルバが適用されることを確認 |
| | A2-9 | 	est_snapshots.py::test_variant_ref_ac2_patch_params_normalized | integration | **PASS** | PATCH API の params も : 形式で正規化保存されることを確認 |
| **AC-3** | A3-1 | 	est_migrations.py::test_variant_ref_ac3_sync_group_migration_sets_master_and_members | integration | **PASS** | 旧 master_role/slave_roles から master_variant_id + param_sync_group_members への移行を確認 |
| | A3-2 | 	est_migrations.py::test_variant_ref_ac3_sync_group_unresolved_role_aborts_unchanged | integration | **PASS** | [Red Team] 同期グループに未解決 role がある場合の中断・ロールバックを確認 |
| | A3-3 | 	est_param_sync_groups.py::test_variant_ref_ac3_create_with_variant_ids_persists_master_and_members | integration | **PASS** | POST ペイロードの variant_id 組による永続化を確認 |
| | A3-4 | 	est_param_sync_groups.py::test_variant_ref_ac3_create_with_roles_fallback_resolves_ids | integration | **PASS** | role 文字列指定時のフォールバック解決と variant_id 永続化を確認 |
| | A3-5 | 	est_param_sync_groups.py::test_variant_ref_ac3_invalid_payload_returns_422 | integration | **PASS** | [Red Team] 未知 ID、未知 role、両方未指定時の 422 拒否を確認 |
| | A3-6 | 	est_param_sync_groups.py::test_variant_ref_ac3_update_replaces_members_and_dedupes | integration | **PASS** | PUT によるメンバー全置換・重複排除・ID優先動作を確認 |
| | A3-7 | 	est_param_sync_groups.py::test_variant_ref_ac3_delete_group_removes_members | integration | **PASS** | グループ削除時のメンバー行連動削除を確認 |
| | A3-8 | ParamSyncModal.test.tsx | frontend | **PASS** | グループ作成時に master_variant_id が送信されることを確認 |
| | A3-9 | ParamSyncModal.test.tsx | frontend | **PASS** | スレーブ切替・マスター変更で slave_variant_ids が送信されることを確認 |
| | A3-10 | ParamSyncModal.test.tsx | frontend | **PASS** | ariant_id が無いマッピングに対する role フィールドフォールバックを確認 |
| **AC-4** | A4-1 | 	est_presets.py::test_variant_ref_ac4_list_reflects_renamed_variant_role | integration | **PASS** | ariant.role 更新後、プリセット一覧が新 role キーで返却されることを確認 |
| | A4-2 | 	est_presets.py::test_variant_ref_ac4_list_includes_latest_variant_refs | integration | **PASS** | プリセット一覧の ariants に最新の display_name 等が含まれることを確認 |
| | A4-3 | 	est_presets.py::test_variant_ref_ac4_post_put_role_and_v_keys_roundtrip | integration | **PASS** | role キーと : キーの往復・派生キー・予約キー保持を確認 |
| | A4-4 | 	est_presets.py::test_variant_ref_ac4_write_drops_unresolved_key_with_warning | integration | **PASS** | プリセット保存時のゴーストキー除外と警告ログ出力を確認 |
| | A4-5 | 	est_presets.py::test_variant_ref_ac4_put_bumps_updated_at_and_keeps_conflict_detection | integration | **PASS** | [Red Team] 値テーブルのみの更新でも updated_at が更新され 409 競合検知が維持されることを確認 |
| | A4-6 | 	est_presets.py::test_variant_ref_ac4_read_skips_orphan_value_row | integration | **PASS** | 親 Variant が削除された孤立値行が安全にスキップされることを確認 (200 OK) |
| | A4-7 | 	est_presets.py::test_variant_ref_ac4_workflow_copy_duplicates_values_and_sync_groups | integration | **PASS** | ワークフロー複製時に値テーブルと同期グループが同一 ariant_id で複製されることを確認 |
| | A4-8 | 	est_param_sync_groups.py::test_variant_ref_ac4_list_reflects_renamed_role_and_display_name | integration | **PASS** | 同期グループ一覧が更新後の最新 
ole および display_name を返すことを確認 |

---

## 5. Red Teaming (異常系・境界値・破壊的シナリオ) 検証結果

本検証では、以下の 4 大異常系シナリオ（Red Teaming）を実コード・実 DB トランザクションで検証した。

1. **マイグレーション前提不備・データ不正ロールバック (AC-1 / A1-6, A1-9)**
   - mapping_variants テーブルが存在しない状態でマイグレーションを実行した際、即座に中断され DB スキーマが一切変更されないことを検証。
   - 既存プリセットにマスタ未登録のゴーストキー（例: Resolution Selecto）が 1 件でも含まれる場合、udit_role_references で検知され、トランザクション全体がロールバックされて旧データが 100% 保全されることを検証。
2. **破損・孤立スナップショット復元時のフォールバック保護 (AC-2 / A2-6)**
   - 削除された Variant ID（:999）や未登録の旧 role キーを持つスナップショットを GET した場合、欠落キーが logger.warning に出力され、レスポンスの辞書から安全に除外されることを検証。画面フォーム上では初期値が維持されクラッシュしない。
3. **同期グループ不正ペイロード拒否 (AC-3 / A3-5)**
   - 存在しない ariant_id や空文字列 name を送信した際、422 Unprocessable Entity が返却され、DB への不正永続化が防止されることを検証。
4. **プリセット更新時の楽観的ロック競合維持 (AC-4 / A4-5)**
   - 値テーブル（workflow_preset_values）のみの変更時にも親レコードの updated_at が確実に前進し、古い ase_updated_at による PUT 要求に対して HTTP 409 Conflict が返却されることを検証。

---

## 6. ローカルモデル QA 監査 & GPU リソース解放

- **監査モデル**: qwen/qwen3.5-9b
- **監査パッケージ**: docs/logs/REQ-418/qa-audit-package-v2.json
- **監査ステータス**: PASS_NO_FINDINGS
  - カバー率: [AC-1, AC-2, AC-3, AC-4] (100%)
  - 指摘事項 (findings): 0 件
  - 制約・限界 (limitations): 0 件
- **モデル解放確認**: local_model_adapter.py unload 実行完了（終了コード 0、LM Studio に残存モデルなし）

---

## 7. 総合結論

- **総合判定**: **PASS**
- **理由**:
  1. Gate 1（型検査・単体テスト・UI不変量）の 5 コマンドすべてが終了コード 0 で合格。
  2. Gate 2（フルスイートベースライン）において、リワーク後の修正により 845 件のバックエンド pytest および 2,746 件のフロントエンド Vitest テストが全件合格（失敗 0 件）。
  3. Gate 3（シナリオ・Red Teaming）において、AC-1〜AC-4 に対応する全 40 ケースおよび Playwright E2E（308 件 PASS）がすべて合格。
  4. エンジニア自律権レビュー（[W-DV-AUTONOMY]）において、報告された Class B 編集が規程（AR-1〜AR-6）に完全に適合していることを確認。
  5. ローカルモデル QA 監査において PASS_NO_FINDINGS を確認し、GPU VRAM も正常に解放済み。
- PBI ライフサイクル管理規程に基づき、アーカイブおよび Git コミットは行わず、dev-coordinator へ受入判定を返却する。
