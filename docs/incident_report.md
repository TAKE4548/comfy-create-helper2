# Incident Triage Report: Animaモードにおけるタブ切替時のタグチップ結合状態先祖返り不具合

<incident_metadata>
- Created_At: 2026-10-02 19:33:54
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Animaモードにおいてテキストモードからチップモードへ切り替えた際は正常にピリオド（.）でタグチップが分割されるが、プリセットタブや別画面タブ、別ブラウザタブへ切り替えて戻ってくると、分割されたタグチップが単一のチップに再結合（マージ）される、またはテキストモードへ先祖返りしてしまう。
- Reproducibility: 100%再現（Animaモードでピリオド区切りタグチップ確定後、タブ切替や画面遷移、ウィンドウフォーカスによりloadPresetDataが走ることで確実に発生）
- Impact_Scope: TagChipEditor, multiSetSlice, useWorkflowManagement, usePresetState, DesktopLayout, MobileLayout。Animaモード使用時のタグチップ編集体験およびプロンプト管理の整合性に重大な影響。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 1) multiSetSlice.ts の loadPresetData (L312) で initialPromptChips を生成する際、parseToChips(val) に isAnimaMode が渡されておらず、タブ切替やサーバー同期時に通常モード（カンマ区切り専用）で再パースされ単一チップで上書きされる。 2) useWorkflowManagement.ts で検知した isAnimaMode が useGenerationStore.setIsAnimaMode に同期されておらず、ストア内の isAnimaMode が恒常的に false のままである。 3) usePresetState.ts の一括編集 (L498, L523) でも parseToChips に isAnimaMode が渡されていない。 4) DesktopLayout / MobileLayout で defaultTextMode が isAnimaMode に固定されており、コンポーネント再マウント時（キー変更やタブ切替）にユーザーのチップモード選択状態が破棄されテキストモードにリセットされる。
- Failure_Location: `frontend/src/store/slices/multiSetSlice.ts:312`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1) multiSetSlice.ts の loadPresetData において、get().isAnimaMode を parseToChips(val, isAnimaMode) に渡す、もしくは既存の sets[i].promptChips が存在する場合は不要に再パース・上書きせず既存チップを維持する。 2) useWorkflowManagement.ts での Anima モード判定時、および UI での Anima モード変更時に useGenerationStore の setIsAnimaMode を呼び出してストアと同期する。 3) usePresetState.ts の parseToChips 呼び出し箇所にも isAnimaMode を渡す。 4) TagChipEditor の表示モード（テキストモード / チップモード）の状態を親やローカルストレージ等で維持し、タブ切替による再マウントで勝手にテキストモードへ先祖返りしないよう制御する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-306
</linked_artifacts>
