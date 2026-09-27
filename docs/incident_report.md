# Incident Triage Report: リソース監視 GPU使用率算出是正 (3D偏重解消および全エンジンMAX採用)

<incident_metadata>
- Created_At: 2026-09-27 19:42:29
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ComfyUI画像生成中やローカルLLM推論中にタスクマネージャーのGPU使用率が90〜100%に達しても、Prompt Surgeon上のGPU使用率が0.0%〜数%のまま推移する
- Reproducibility: 100% (Confirmed)
- Impact_Scope: backend/app/services/resource_monitor.py, WebSocket経由のGPU使用率配信, フロントエンドResourceGaugeChips
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: PDHカウンターが engtype_3D に固定されており、AI/推論ワークロードのComputeエンジンが除外されていた。また、タスクマネージャー準拠の全エンジン最大値(MAX)ではなく3Dインスタンスの単純加算(SUM)となっていた
- Failure_Location: `backend/app/services/resource_monitor.py:166`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: PDHカウンターを全エンジン監視 (\GPU Engine(*)\Utilization Percentage) に拡張し、エンジン毎のプロセス合算値を集計した上で全エンジン中の最大値(MAX)を算出する _get_engine_max を導入する
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
