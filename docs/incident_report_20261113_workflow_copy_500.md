# Incident Triage Report: ワークフロー複製時の 500 Internal Server Error（step_035 マイグレーション失敗による param_sync_groups.master_variant_id 欠落）

<incident_metadata>
- Created_At: 2026-11-13 19:11:40
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ワークフローの複製保存（POST /api/workflows/75/copy）を実行すると API error 500: {'detail':'Internal Server Error','request_id':'req-ba3208fb2b9f'} が発生する。logs/app.jsonl には sqlite3.OperationalError: no such column: param_sync_groups.master_variant_id が記録されている。
- Reproducibility: 100% (Confirmed via logs/app.jsonl req-ba3208fb2b9f and read-only DB inspection)
- Impact_Scope: ワークフロー複製 (POST /api/workflows/{id}/copy) および ParamSyncGroup を参照する全 ORM クエリ（db/prompt_surgeon.db の param_sync_groups テーブルに master_variant_id 列が存在しない状態）
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: 1) REQ-418 の仕様により step_035_variant_id_references (backend/app/migrations/steps.py:1284-1389) は audit_role_references() で未解決 role キー（ゴーストキー）を 1 件でも検出すると ValueError を送出してトランザクション全体をロールバックする。2) 実DB (db/prompt_surgeon.db) の workflow_presets (1431行) および param_sync_groups (123行) には mapping_variants (286行) に存在しない旧/未登録キー（LoraStack_*, UpscaleSampler_cfg, SamplerName, Scheduler 等）が多数残存しているため、起動時の step_035 が毎回失敗し、param_sync_groups.master_variant_id 列の追加 (steps.py:1329) と param_sync_group_members へのデータ移行が未適用のままロールバックされる。3) backend/app/main.py:63-66 が run_migrations() の例外を握りつぶしてサーバ起動を続行するため、ORM モデル (backend/app/models.py:569) と実DB スキーマが不整合な状態で稼働し、copy_workflow (backend/app/routers/workflows.py:122) が src.param_sync_groups を参照した際に OperationalError (500) となる。REQ-418 仕様はスナップショットには後方互換リゾルバ（警告ログ＋除外）を定めたが、既存の workflow_presets / param_sync_groups に残存するゴーストキーの救済・クリーンアップ方針およびマイグレーション失敗時の起動制御が仕様上欠落している。
- Failure_Location: `backend/app/migrations/steps.py:1284-1331, backend/app/main.py:63-66, backend/app/models.py:569, backend/app/routers/workflows.py:122`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. SSoT (REQ-418 / 運用マイグレーション仕様) を補完し、既存の workflow_presets および param_sync_groups に残存する未解決 role キー（ゴーストキー）の扱い（事前クリーンアップ手順、または警告ログ出力のうえスキップ/隔離してスキーマ移行を完了させる救済仕様等）を明確化する。2. マイグレーション失敗時に不整合なスキーマのまま API サーバを起動し続けないよう lifespan (backend/app/main.py:63-66) の失敗時挙動を見直す。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
