# Incident Triage Report: REQ-303: タグチップのピリオド削除が区切りへ反映されない

<incident_metadata>
- Created_At: 2026-10-02 22:37:50
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Animaモードでタグチップのサブメニュー入力欄から末尾のピリオドを削除して編集すると、ピリオドが復活し、後続チップが空白区切りのままとなる。ユーザー確認では、テキストモードおよびタグチップのダブルクリック編集では発生しない。
- Reproducibility: ユーザーがサブメニュー入力欄での編集で発生し、テキストモードとダブルクリック編集では発生しないことを確認。静的経路と既存TagChip.test.tsxでは、ドット無し1girlをAnimaモードで強度変更すると(1girl:1.5).が生成されることも確認。末尾ドット削除のUI一連操作は未自動化。
- Impact_Scope: Animaモードのタグチップ単語編集・強度調整・プロンプト文字列化。ユーザーのカンマ区切り選択が保持されない。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: TagChip.tsx:145,159,186はformatTagWeightにisAnimaModeを渡し、useChipParser.ts:173がisAnimaMode=trueだけでhasPeriodをtrueにするため、ドットを削除した編集値でも自動復活する。chipsToStringはuseChipParser.ts:129で末尾ドットを見て空白結合する。REQ-303.mdの末尾ドット有無による動的結合と、REQ-306.md:54-57のAnimaならドット自動付与がSSoT上で衝突する。
- Failure_Location: `frontend/src/components/TagChipEditor/useChipParser.ts:173;frontend/src/components/TagChipEditor/TagChip.tsx:186;docs/design/REQ-306.md:54`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: REQ-303とREQ-306およびSPEC_COMMONの仕様を、ユーザーが削除したピリオドを再付与しない方針へ整合する。formatTagWeightは入力チップの末尾ドット有無のみを保存し、word/weight編集後のカンマ・空白結合を回帰テストする。Type Aのパラメータ波及はdocs/incident_report_REQ-303-parameters.md参照。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
