# Incident Triage Report: ワークフローマッピング画面におけるRole×ステージ多段階対応および未設定選択のUI/データ不整合

<incident_metadata>
- Created_At: 2026-10-11 19:49:09
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: マッピングマスタを見直したがマッピングする側の画面がロール単位でしか設定できず、有効なステージ分のノードが選択できないためマッピング不足が発生する。また不要な組み合わせを未設定にする操作性が不十分。
- Reproducibility: 常時発生（多段階サンプラーや複数ステージを持つワークフローのアップロード・再スキャン・配線時）
- Impact_Scope: frontend/src/components/UploadWorkflowModal.tsx, frontend/src/components/RescanModal.tsx, frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx, backend/app/routers/workflows.py
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: REQ-336でRole×Stageの2軸正規化が導入されたが、UploadWorkflowModal/RescanModalが旧来のMappingMaster単一選択のままであり、/scan APIもscan_workflow_variantsを呼んでいない。さらにWorkflowConnectionSectionでvariant_idが破棄され同一master_idの重複がエラーとなるため、ステージごとの複数選択や未設定切り替えができない。
- Failure_Location: `frontend/src/components/UploadWorkflowModal.tsx:44`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. UploadWorkflowModal/RescanModalおよび配線画面にて、検出された有効ステージごとにノード候補を選択できるRole×Stageマトリクス/サブスロットUIを新設。2. 各ステージスロットに「未設定」選択肢およびワンクリック解除を配置。3. バックエンド/scanエンドポイントのvariants対応と、WorkflowMappingのvariant_id保存・検証の是正。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-343
</linked_artifacts>
