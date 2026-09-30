# Incident Triage Report: 「シーン一括生成」ボタン無反応: generateDraftApi 渡し漏れによる空スタブ実行

<incident_metadata>
- Created_At: 2026-09-28 10:35:51
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: SpeechBubbleEditorModal ヘッダーの「シーン一括生成」ボタン押下後、画面変化・エラーログ・API 通信が発生せず完全無反応。バックエンド /api/speech/scene-draft へのリクエストが未発火。
- Reproducibility: 100% (Confirmed)
- Impact_Scope: Under Evaluation
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: HistoryPage/index.tsx から generateDraftApi prop が渡されていないため、fallback の空スタブ（() => Promise.resolve({ bubbles: [] })）が実行される。primaryTagSetId 未指定ルートで即時空配列返却 → setBubbles 空追加 → 1ms 未満でスピナー終了。単体テストは外部モック注入で全 PASS していたため結合漏れが検知されなかった。
- Failure_Location: `frontend/src/components/SpeechBubbleEditorModal/index.tsx + frontend/src/pages/HistoryPage/index.tsx`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 2点修正: (1) SpeechBubbleEditorModal/index.tsx の generateDraftApi fallback を実 fetch 呼出に差し替え (2) HistoryPage/index.tsx から generateDraftApi を明示的に渡す。既存 Props インターフェース・テストへの破壊的変更なし。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-293
</linked_artifacts>
