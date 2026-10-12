# Incident Triage Report: REQ-350 seed型がSamplerCustomへ反映されず同一画像になる

<incident_metadata>
- Created_At: 2026-10-12 23:04:25
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: seed型をrandomにして3枚生成するとComfyUI側でも同一画像が保存される。
- Reproducibility: 2026-10-12 21:15 JSTの3枚生成で再現。generation_jobsに別prompt_idの3件がsucceededとして記録され、各seed型param_valuesには異なる乱数が保存された。
- Impact_Scope: frontend/src/utils/seedBatch.ts と frontend/src/utils/workflowParamInjector.ts。現在のworkflow_id=69にあるSamplerCustomノードのRough/Detail seed mapping。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: workflow_id=69のSampler_Seed mapping masterはparam_name=seed、fallback_param_names=[noise_seed]。実ノード1260:1398/1260:1396はSamplerCustom.inputs.noise_seedを持ちseedは持たない。seedBatch.collectTargetsとworkflowParamInjectorのseed注入はfallback_param_namesを参照せず、param_name=seedを最終fallbackとして新規inputs.seedに乱数を設定するため、ComfyUIが実際に読むnoise_seedはworkflow既定値のままになる。保存値では3件のSampler_Seed_rough/detailが相異なるが、ComfyUI POST本文は通常ログされず、成功後DB graph_jsonも消去されるため、送信payloadそのものは記録から直接復元できない。現行REQ-350の注入規則もfallback aliasを含まない。
- Failure_Location: `frontend/src/utils/seedBatch.ts:42; frontend/src/utils/workflowParamInjector.ts:297`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: REQ-350のSSoTを更新し、seedBatch validationとinjectorが同じ実パラメータ名を解決するようにする。mapping masterのfallback_param_namesからnoise_seedを解決・注入し、解決先がない場合は未使用の新規キーを作らず送信前に拒否する。ComfyUIへ渡す生成graphの検証を追加する。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-353
</linked_artifacts>
