# Incident Triage Report: 複数端末における生成履歴同期抜け（スナップショット遷移判定・差分スロット上限・挿入位置時系列不整合）

<incident_metadata>
- Created_At: 2026-10-17 01:42:33
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 複数端末でPrompt Surgeonを開いて画像生成を行った際、filterOwnSessionを無効（全セッション表示）にしているにもかかわらず、他端末で生成されたバッチが閲覧端末側の履歴に同期されず抜け落ちる。再読み込みを行っても反映されないか、履歴の最末尾に追いやられる。
- Reproducibility: 実コード静的検証および通信シーケンス検証により確定。1. HTTP再同期(loadSnapshot)時にprevious?.epoch !== snapshot.epochまたは既完了ジョブがcompletedJobsに含まれずマージスキップ。2. 画面アクティブ中のポーリング完全停止。3. IndexedDB等で200件保持時にallSlots=0となり差分切り捨て。4. insertAfterPriorで初回priorAddedIdentities空時に末尾挿入。
- Impact_Scope: フロントエンド(frontend/src/store/slices/connectionSlice.ts, frontend/src/services/residualHistory.ts, frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts)。複数端末またはバックグラウンドタブで生成履歴を閲覧・共有する全ユーザーシナリオ。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 1. [スナップショット遷移判定漏れ] connectionSlice.tsのapplyGenerationSnapshotにおいて、completedJobsが直前スナップショットからの状態変化（succeededへの遷移）のみを抽出するため、初回ロード時やHTTP再同期(loadSnapshot)で最初からsucceededのジョブがmergeManagedHistoryに渡されず破棄される。 2. [能動的再同期要求の不在] バックグラウンド復帰時や画面表示中にスナップショットや履歴を能動的に問い合わせる仕組みが抑止されている。 3. [残存差分スロット計算欠陥] residualHistory.tsのmergeResidualHistoryにおいて、allSlotsがMath.max(0, 200 - existingAllCount)で計算されるため、既存履歴が200件あると受け入れ枠が0となり全候補が切り捨てられる。 4. [差分挿入位置の時系列逆転] residualHistory.tsのinsertAfterPriorにおいて、初回priorAddedIdentitiesが空の場合にfoundPriorがfalseとなり、配列最末尾（最古画像の後ろ）に追記される。
- Failure_Location: `frontend/src/store/slices/connectionSlice.ts:176-179, 255; frontend/src/services/residualHistory.ts:73-85, 103-109, 113-118; frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts:380-413`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. connectionSlice.tsのapplyGenerationSnapshotにおいて、遷移ジョブだけでなくスナップショット内の全成功ジョブ(succeededかつoutputs保有)を対象にmergeManagedHistoryを実行し、未反映の完了画像を網羅マージする。 2. residualHistory.tsのスロット計算を空き容量上限からFIFO方式（新規候補を受け入れてから最大200件に切り詰め）に是正する。 3. insertAfterPriorの挿入順序を時系列に整合する位置（最新側/先頭ブロック等）へ補正する。 4. タブ復帰時(visibilitychange)にgenerationApi.getState()を明示的に呼び出してスナップショット整合性を再検証する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-370
</linked_artifacts>
