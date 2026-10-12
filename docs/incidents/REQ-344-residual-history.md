# Incident Triage Report: 残存履歴20ページ境界テストの初回同期待機が全体suite負荷で期限切れ

補足検証（2026-10-13）: 診断コピーで初回renderをasync actで待つ変更後のfull contextはexit 0、229 files / 2079 tests全PASS（72.38s）。対象コピー8/8 PASS（1792ms）。これは仮説検証であり、原本への修正実装ではない。

診断実行用コピーはfrontend/tmp/incident-evidence配下の`.txt`へ改名し、通常のテスト収集対象から除外済み。原本hookのSHA256は62D7C0478046DFC37CE05A84AB4D54C6A1EDB553BEEF8078E7C66EC80C67F5BE、原本testは4CD86E93BE27CF94574F673853434A9679B2857B8EE2EBBC5D0817F6F8B0DE09。調査前後で一致。

<incident_metadata>
- Created_At: 2026-10-13 01:46:19
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: useGenerateDisplayState.residual.test.tsx の baseline-known B follows a full 20-page cycle が初回partial確認行201でcheckingを受信。手動retry検証前に失敗。
- Reproducibility: 原本focused独立6回、4並行4回、8並行8回、12並行12回は計30/30 PASS。原本ファイル8/8 PASS。既定npm test再実行は同一行201でFAIL（73.23s、2078 PASS/1 FAIL）。診断コピーを原本に差し替えたfull contextでも同一失敗（72.01s）。
- Impact_Scope: REQ-344対象13ケースとは独立した既存REQ-345テストのflakyが全体suite受入を遮断。アプリケーションのretry機構の不具合は確認されていない。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 初回render後に既定1000msのwaitForで20ページ処理後partialを待つテスト同期実装。診断traceでwait開始4954.154ms、page20 API開始6110.449ms、record.partial到達6169.788msを記録。正常な有限逐次処理は待機開始から1215.634msを要し期限を超過、その後renderはrecord.partial/observed.checkingで失敗。無限ループではない。SPEC_GENERATE:280は20page上限partialを要求するが1秒完了を要求しない。テストが仕様にない実時間上限を暗黙に置いている。
- Failure_Location: `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx:200-201; frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts:308,317,326,416-418; docs/specs/SPEC_GENERATE.md:280`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 対象1ケースの初回renderHookをawait act(async () => { hook = renderHook(...) })で包み、有限即時mock応答とReact commitの完了を明示的に待ってから20calls/partialをassertする。テスト数、retry検証、hook、global timeout、製品SSoTを維持。診断コピーfocused PASS、full context対象8/8 PASS（1792ms）、traceでpartial commit5630.116ms後にassert開始5634.511msを確認。全体suite結果と証拠ログはdocs/design/REQ-344-residual-incident-diagnostic.log及びREQ-344-residual-incident-act-full.logを参照。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
