# Incident Triage Report: Dataset Studio Node Remapping Save Failure due to Missing Master and Incomplete State Update

<incident_metadata>
- Created_At: 2026-10-07 20:46:13
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Studio（DatasetStudioPage）のノード再割当モーダル（NodeRemapModal）でPositiveノードまたはNegativeノードを再割当して「マッピングを保存」を押下しても、ワークフローへのマッピング更新が反映されない（バッジやバックエンドDBに反映されない、または次回取得時に戻る）
- Reproducibility: 再現率100%（ワークフローの既存マッピングにPositive/Negativeロールが存在しない場合、あるいはモーダル保存後に親コンポーネントが最新WorkflowReadを再取得しない場合）
- Impact_Scope: frontend/src/pages/DatasetStudioPage/components/NodeRemapModal.tsx, frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: NodeRemapModal.tsx において、1) 既存ワークフローのマッピングに対象ロール（Main_Positive_Prompt等）が存在しない場合、マスターID（master_id）を mapping_masters マスタから解決せず positiveMapping?.master_id を参照しているため、updatedMappingsList に追加されずバックエンドに送信されない。2) handleSave完了時に更新後Workflowとしてローカル合成しているが、新規追加されたマッピング情報（idやmasterメタ情報）が含まれず不完全な状態となり、さらに親側（MatrixGenerationStep）で workflowsApi.get による最新マッピングの再取得（リフェッチ）が行われないため、UIバッジおよび内部状態に反映されない。
- Failure_Location: `frontend/src/pages/DatasetStudioPage/components/NodeRemapModal.tsx:58-96`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. mappingMastersApi.list() を取得または参照し、Main_Positive_Prompt および Negative_Prompt の master_id を確実に解決して mappings リストへ追加・更新する。2. workflowsApi.update 成功後に workflowsApi.get(workflow.id) を再取得して完全な Workflow オブジェクト（WorkflowMappingRead群）を onSaved に渡し、親コンポーネントの currentWorkflow を更新する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-321
</linked_artifacts>
