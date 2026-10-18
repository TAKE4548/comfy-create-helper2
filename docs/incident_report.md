# Incident Triage Report: ComfyUIへの原画確認処理の残存状況調査と仕様整合性の分析

<incident_metadata>
- Created_At: 2026-10-19 00:44:36
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ユーザーより「REQ-362等でComfyUIへの原画確認はやめたはずだが、まだ確認処理が残っているのは廃止漏れか」との指摘。実際にGallery表示時等にComfyUIへの原画確認通信（GET /api/comfy/image-availability）が発生している。
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: REQ-362で廃止（ゼロプローブ化）されたのは『サムネイル/プレビュー画像配信エンドポイント（/thumbnail, /view）におけるキャッシュヒット時のComfyUI HEADプローブ』のみである。一方、現在観測されている原画確認処理はREQ-333/345で策定された『Galleryの試行履歴表示に伴う原画実在確認（SPEC_COMMON/SPEC_GENERATE規定）』であり、REQ-362のスコープ外として現行SSoT上も維持されている。また、comfy.py内のget_comfy_thumbnailに旧プローブの残骸関数（_check_comfy_exists）がデッドコードとして残存している。
- Failure_Location: `backend/app/routers/comfy.py:444; frontend/src/services/trialImageAvailability.ts:96; docs/specs/SPEC_COMMON.md:460; docs/specs/SPEC_GENERATE.md:243`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. ユーザーの意図が『Gallery試行履歴の原画確認機能も不要であり全廃したい』である場合、SSoT（SPEC_COMMON, SPEC_GENERATE）の改定およびFE/BEのavailability機能削除（Type B）を実施する。 2. 意図が『原画確認機能自体は維持でよいが不要プローブの残骸確認だった』場合、comfy.pyの未使用関数_check_comfy_existsを削除するクリーンアップを実施する。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-379
</linked_artifacts>
