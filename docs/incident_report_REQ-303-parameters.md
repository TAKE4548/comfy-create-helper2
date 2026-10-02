# Incident Triage Report: REQ-303: Anima区切りがcheckpoint等の非プロンプトパラメータへ波及

<incident_metadata>
- Created_At: 2026-10-02 22:37:25
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Animaモードでプリセット読込・一括更新後、checkpoint名などの非プロンプト値にドット区切りが適用され、生成時に不正な値が送信される。
- Reproducibility: 静的経路と既存テストで確認。モデル.safetensors型の値はAnimaパーサーで2チップとなり、シリアライズでモデル. safetensorsへ変化する。実際のComfyUIエラー画面は未再現。
- Impact_Scope: プリセット内のcheckpoint、LoRA等の非textareaパラメータ。Animaモードでドットを含む値の生成失敗リスク。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: SPEC_COMMON.md:79ではTagChipEditor対象はinput_type=textarea。ところがmultiSetSlice.ts:323-329とusePresetState.ts:496-498,521-523はmergedParamValuesの全roleをparseToChips(val,isAnimaMode)でpromptChips化する。multiSetSlice.ts:25-27のgetEffectiveParamValuesは全promptChipsを同名paramValuesに上書きするため、非プロンプトのcheckpoint値にもピリオド分割・空白結合が適用される。
- Failure_Location: `frontend/src/store/slices/multiSetSlice.ts:323;frontend/src/pages/GeneratePage/hooks/usePresetState.ts:496;frontend/src/store/slices/multiSetSlice.ts:25`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: promptChipsの生成対象とgetEffectiveParamValuesの上書き対象をworkflow.mappingsのinput_type=textareaに限定する。checkpoint等の非プロンプト値とドットを含むファイル名の往復・送信テストを追加する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
