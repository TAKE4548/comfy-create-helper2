# Incident Triage Report: 個別プログレスバーの停止および連続生成時のプレビュー表示遅延・旧画像残存

<incident_metadata>
- Created_At: 2026-10-20 10:20:04
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 1. 個別プログレスバー（ノード/ステップ進捗）が0%から動かず停止したままとなる（全体プログレスバーは進行する）。 2. 連続生成時、直前画像のプレビュー表示が遅延し、次生成画像の完了タイミング付近になってようやく前の画像が表示される。
- Reproducibility: 100% (コード解析および各レイヤー間の状態伝播トレースにより完全特定)
- Impact_Scope: Backend GenerationService (progressバインド), Frontend Store connectionSlice (previewImage解除), UIレイアウト DesktopLayout/MobileLayout (進捗フォールバック・プレビュー合成)
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 1. 【個別進捗バー停止】ComfyUIのprogressイベントはprompt_idを省略することが多く、未初期化サンプラーや数値型node_idの受信時にGenerationService.on_eventでnode進捗が脱落してjob.nodeが未設定となっていた。さらにDesktopLayout/MobileLayoutでgenerationSnapshot存在時にmanagedNodePercentageが0でもnodeProgressへのフォールバックが走らず0%固定となっていた。 2. 【プレビュー表示遅延】connectionSlice.applyGenerationSnapshotにおいて、直前ジョブで中間プレビューが未受信の場合にfollowedJobPreviewIsObsoleteがfalseとなり、後続ジョブ実行中に古い中間フレーム（previousPreview）が残存して完了原画（selectedImg）を覆い隠していた。後続ジョブ完了でactive jobが0件になった時点で初めてpreviewImageがnull化されるため、『次画像完了タイミングで前画像が出る』現象が発生していた。さらにDesktopLayoutでTanStack Queryのキャッシュ反映ラグにより一時的にselectedImgがdisplayImages先頭に存在しない場合、GenerateParallelPreviewがインデックス0の旧画像を表示していた。
- Failure_Location: `backend/app/services/generation_service.py:270-308; frontend/src/store/slices/connectionSlice.ts:192-207; frontend/src/pages/GeneratePage/components/DesktopLayout.tsx:253-268,648-662; frontend/src/pages/GeneratePage/components/MobileLayout.tsx:265-288; frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts:655-664`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: REQ-386で提案された3タスク（T1, T2, T3）の修正方針は完全に妥当であり、両不具合を根本解決する。 1. 【T1】GenerationService.on_eventでprompt_id欠落時に単一実行中ジョブへ即時バインド、node_idの文字列型正規化、KSamplerノードの自動補完を実施。 2. 【T2】connectionSliceでautoFollowImage発生かつ後続frame未受信時にpreviewImageを無条件にnull化して覆い隠しを解除。useGenerateDisplayStateで画像確認までpendingAutoFollowUrlを維持。 3. 【T3】DesktopLayout/MobileLayoutで個別進捗の二重フォールバック（managedNodePercentage -> nodeProgress）を実装。DesktopLayoutでselectedImgを先頭合成したeffectiveDisplayImagesを供給し即時プレビュー表示を担保。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-386
</linked_artifacts>
