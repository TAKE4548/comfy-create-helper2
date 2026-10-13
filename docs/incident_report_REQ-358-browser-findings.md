# Incident Triage Report: REQ-358 B2 remap drops disabled mapping IDs

## 2026-10-14 調査更新

先のGeneratePage→Rescanのraw渡し修正だけでは、ユーザーが確認したSettings Activeの症状と保存後の再スキャン再有効化を説明できていなかった。追加報告を基に次の実装欠陥を再現し、T32/T34で修正した。

1. Settings Stage Active=falseは全variantをfalseへ変更するが、false→true時はstageだけ戻していた。配下variantもtrueへ復帰する対称の一括操作へ修正。既存WorkflowMappingのID/nodeID/slot state保持を実backend APIテストで確認（5件PASS）。
2. 再スキャンはisFetchedだけを待ち、再取得中のcacheで一度だけhydrateして最新falseを捨てていた。最新GET完了後の初期化へ変更し、refetch遅延・save・reopen回帰testで修正前失敗→修正後成功を確認。
3. legacy null variantは旧mキーとV2キーが重複保存され、旧mappingが生成cloneに残っていた。単一slotまたは保存role/master legacy roleとcomputed_roleの一意な完全一致でidentityを解決し、単一保存・legacy状態継承・master取得後の生成clone除外を追加。複数stageの場合もroleが一意なら解決する。rawと未知stateキーは保持。

B3はSeed専用欠陥ではなく状態identity・非同期初期化の問題。前の「現行unitでは再現しない」は保存往復/旧形式境界を欠いた試験の範囲に限る。ブラウザ証拠はdocs/design/REQ-358-browser-recheck.mdで追補予定。既存監査FAILは保持する。

<incident_metadata>
- Created_At: 2026-10-13 23:03:01
- Investigation_Status: EXISTING_PBI_REWORK_IN_PROGRESS
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: After disabling a stage and reopening remapping, saved role-to-node assignments disappear and do not return when re-enabled.
- Reproducibility: User-reported browser observation; the data-loss code path was confirmed by source inspection, but a local browser replay is pending.
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: GeneratePage passed the generation-filtered workflow clone mappings to RescanModal as existingMappings, so remapping initialized without IDs belonging to disabled slots.
- Failure_Location: `frontend/src/pages/GeneratePage.tsx; frontend/src/components/RescanModal.tsx`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: Pass rawWorkflow.mappings to RescanModal; keep generationWorkflow filtering scoped to its clone; verify disable-enable-save-remap persistence in browser.
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-358 (existing approved PBI; no new PBI requested)
</linked_artifacts>
