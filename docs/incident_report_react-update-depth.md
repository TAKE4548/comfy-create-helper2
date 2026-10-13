# Incident Triage Report: Generate画面のReact更新ループ

<incident_metadata>
- Created_At: 2026-10-13 20:55:13
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 開発FEを起動してindex（/）を開くと、Maximum update depth exceededが表示される。
- Reproducibility: ソース追跡で再描画ループの因果経路を確認。起動時データの組合せを使ったブラウザ再現は未実施。
- Impact_Scope: indexのGeneratePage。選択workflowとbaseModelsのクエリ完了後、GeneratePage全体がレンダーできなくなる。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: useWorkflowManagement.ts:45がrenderごとにgenerationWorkflow(rawWorkflow)を呼び、workflowMappingState.ts:59-65は常に新しいworkflow objectとfilter配列を返す。そのためAnima Detection effect（useWorkflowManagement.ts:92-99）の依存値workflowが各renderで変化して毎回発火する。effect内ではsetIsAnimaModeのwrapperがZustandのsetIsAnimaModeを実行し、直後にeffectが同じZustand actionをもう一度実行する。action（store/slices/multiSetSlice.ts:82-84）は値が同一でも新しいstate objectをsetする。GeneratePage state hookはuseGenerationStore()でstore全体を購読するため、そのstore更新で再renderし、fresh workflow、effect再実行、store更新の循環になる。
- Failure_Location: `frontend/src/pages/GeneratePage/hooks/useWorkflowManagement.ts:45,92-99; frontend/src/utils/workflowMappingState.ts:59-65; frontend/src/store/slices/multiSetSlice.ts:82-84; frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts:18-19`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 生成用workflowをrawWorkflowの参照に対して安定化（useMemo等）し、Anima判定effectの依存値を安定したworkflow/model IDにする。またsetIsAnimaModeの二重呼び出しをなくし、値が変化したときだけstoreを更新する。選択workflowとAnima/非Animaの双方で起動後レンダーが収束することを確認する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
