# Incident Triage Report: プリセット一括削除時の孤立workflow_preset_values残存によるプリセット新規作成IntegrityError

<incident_metadata>
- Created_At: 2026-11-21 02:55:43
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 生成画面でプリセットを追加（POST /api/workflow-presets）しようとすると作成されず HTTP 500 となる。バックエンドログに sqlalchemy.exc.IntegrityError: (sqlite3.IntegrityError) UNIQUE constraint failed: workflow_preset_values.preset_id, workflow_preset_values.variant_id, workflow_preset_values.sub_key（parameters: (1900, 3, 空文字, ...)）が出力される。
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 3要因の複合による孤立レコード残存とID再利用の衝突。(1) backend/app/routers/presets.py:230-237 の bulk_delete_presets が db.query(models.WorkflowPreset).filter(...).delete(synchronize_session=False) で直接 SQL DELETE を実行するため、WorkflowPreset.values の ORM cascade (all, delete-orphan) が発火しない。(2) backend/app/database.py:9-22 の configure_sqlite_pragmas が PRAGMA foreign_keys=ON を設定していないため、SQLite 側の FOREIGN KEY(preset_id) REFERENCES workflow_presets(id) ON DELETE CASCADE も無効化されている。(3) workflow_presets.id は SQLite の AUTOINCREMENT なし INTEGER PRIMARY KEY であるため、最大IDのプリセットを一括削除すると次回 create_preset で同じ ID（実DBでは MAX(id)=1899 の次である 1900）が再利用され、残存していた孤立 workflow_preset_values 行と UNIQUE 制約衝突を起こす。実DB（db/prompt_surgeon.db）確認結果: workflow_presets に id=1900 は存在せず、workflow_preset_values には preset_id=1900 の孤立行が72件（id=47401, preset_id=1900, variant_id=3, sub_key=空文字 を含む）、全体で26プリセット分・1,872件の孤立行が存在。インメモリSQLiteでの再現テストでも 100% 再現を確認。
- Failure_Location: `backend/app/routers/presets.py:230-237, backend/app/database.py:9-22, backend/app/routers/presets.py:150-161`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. bulk_delete_presets（backend/app/routers/presets.py:230-237）で対象プリセットの workflow_preset_values を確実にカスケード削除する（ORM 経由削除、または WorkflowPresetValue の明示的先行削除）。2. 既存DBの孤立 workflow_preset_values 行（実DBで1,872件）を除去するマイグレーションステップを追加する。3. backend/app/database.py の configure_sqlite_pragmas で PRAGMA foreign_keys=ON を有効化するか検討する（ただし実DBでは dataset_projects.workflow_id にも4件の孤立FK違反が存在するため、有効化する場合は既存孤立データの整合性処置と合わせて設計すること）。4. 再発防止として、プリセット作成→一括削除→再作成の統合テストを backend/tests/integration/api/test_presets.py に追加する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-437
</linked_artifacts>
