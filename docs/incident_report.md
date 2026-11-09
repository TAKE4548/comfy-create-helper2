# Incident Triage Report: マッピング保存時のinput_name属性欠落によるComfyUIへのSeed未伝播不具合

<incident_metadata>
- Created_At: 2026-11-09 04:31:07
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 生成画面でSeedを変更してもComfyUIでの生成画像が変化しない。一方、生成後の画像メタ情報表示には変更したSeed値が反映・記録されている。
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: REQ-417でスキャナーが検出したノード入力名（input_name）をWorkflowMappingに永続化して注入に使う仕様となったが、フロントエンドの複数のマッピング保存経路（useMasterMappingRows:getMappings, WorkflowConnectionSection:saveWorkflowConfig, RescanModal等）でinput_nameが除外・欠落し、DBに空文字列が保存されていた。これによりworkflowParamInjectorでseedNode.input_nameが空となり、マスタのparam_name（'seed'）にフォールバックしてnode.inputs['seed']へ新規プロパティとして誤注入された。ノード（KSamplerAdvanced等）本来の入力（noise_seed）は変更されずComfyUIで無視される一方、メタ情報記録（generationRecord）は注入されたnode.inputs['seed']を読み取るため表示上は反映されるという不整合が発生した。
- Failure_Location: `frontend/src/hooks/useMasterMappingRows.ts:487-517, frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx:256, frontend/src/utils/workflowParamInjector.ts:345-365`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. useMasterMappingRows.tsのgetMappingsおよびWorkflowConnectionSection.tsxの保存処理でinput_nameを保持・永続化するよう修正する。2. workflowParamInjector.tsにおいて、input_nameが空の場合でもノード入力に実在するキー（noise_seed, seed, value等）を安全に解決し、実在しないキーの誤注入を防止する。3. 再スキャン時に正しいinput_nameが自動更新・永続化されることを確認する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-423
</linked_artifacts>
