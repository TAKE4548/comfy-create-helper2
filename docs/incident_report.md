# Incident Triage Report: ワークフロー登録およびノードリマッピング時の候補ノード情報（タイトル・クラス）欠落の不具合

<incident_metadata>
- Created_At: 2026-10-11 15:49:21
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ワークフロー登録時(UploadWorkflowModal)およびノードリマッピング時(RescanModal/NodeRemapModal)のドロップダウン候補において、ノード情報（タイトルおよびクラス）が付いているものと付いていないものが混在し、単なるノードIDのみが表示されたりロール名が表示される不具合が発生している。
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: RescanModalにおいて候補ノードのラベル表示にworkflowJsonを参照せず、scanResult.matchedの先頭1件のみを格納したnodeTitleMapを用いていたため、2件目以降の候補ノードでtitleがundefinedとなりノードID単体で出力されていた。また付与されていた情報もclass_typeではなくrow.master.role（ロール名）であった。UploadWorkflowModalにおいてもnode._meta.titleのみを参照しておりnode.titleやclass_typeへのフォールバックが不完全であった。
- Failure_Location: `frontend/src/components/RescanModal.tsx:42, frontend/src/components/UploadWorkflowModal.tsx:53, frontend/src/pages/DatasetStudioPage/components/NodeRemapModal.tsx:39`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 共通のノードラベル解決ユーティリティ（例: getNodeLabel(id, workflowJson)）を整備し、_meta.title、node.title、class_type/typeを堅牢にフォールバックして `${id} - [${title}] (${classType})` の形式で統一表示するように改修する。RescanModalでは不完全なnodeTitleMapを廃止しworkflowJsonから直接ノード情報を解決する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-342
</linked_artifacts>
