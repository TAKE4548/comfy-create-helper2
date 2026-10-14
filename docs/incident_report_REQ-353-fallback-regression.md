# Incident Triage Report: REQ-353後 workflow APIでSeed fallbackが欠落し生成を事前拒否

<incident_metadata>
- Created_At: 2026-10-12 23:35:49
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Generate時にseed入力がない旨で失敗する。ComfyUI純正FEにもqueueが作られず、ComfyUI POST前に拒否されている。
- Reproducibility: 再現確認済み。workflow_id=69のGET応答を稼働中BEから読み取り、Sampler_Seed_rough/detailのfallback_param_names=nullを確認。
- Impact_Scope: workflow 69の専用Seed mapping。特にnode 1260:1398と1260:1396はgraph inputsにnoise_seedがありseedがないため、FEのseed batch事前検証で拒否される。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: mapping master id=4のAPI応答にはfallback_param_names=[noise_seed]が保存されているが、GET /api/workflows/69の7件のseed mappingすべてでfallback_param_names=nullを返す。graphではrough/detail sampler inputsがnoise_seedのみ。FE resolveSeedInputKeyはparam_nameと返却されたfallback_param_namesだけを調べ、seedBatch.ts:43-46で解決不能として送信前に例外を出すためComfyUI queueに到達しない。workspaceのbackend/app/routers/workflows.py:88-90にはeffective_masterからfallbackを返す実装があるため、稼働中BEがこの変更を含むコードを読み込んでいない（古いプロセス/別実行コード）ことがAPI観測と矛盾なく説明できる。
- Failure_Location: `backend/app/routers/workflows.py:88; frontend/src/utils/seedBatch.ts:43`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 稼働中BEをREQ-353更新後のコードへ揃えて再起動し、GET /api/workflows/69の該当mappingがfallback_param_names=[noise_seed]を返すことを確認する。再度GenerateしてseedBatchが通りComfyUI queueに到達することを確認。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-354
</linked_artifacts>
