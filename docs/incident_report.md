# Incident Triage Report: 新規ワークフロー追加時のノードマッピング初期選択が候補スコア順と連動せず空欄または非推奨ノードになる不具合

<incident_metadata>
- Created_At: 2026-11-06 01:48:45
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 新しいワークフローの追加時（UploadWorkflowModal）にノードマッピングが表示されるが、選択肢内のドロップダウン順序はスコア順になっているにもかかわらず、初期選択値（node_id）が空欄（未割当）もしくはスコアの低い（非推奨の）ノードが選ばれる。
- Reproducibility: 100% (新規ワークフロー追加時、バックエンド/api/workflows/scanの簡易判定結果が初期値として適用され、フロントエンドのrankWorkflowNodeCandidatesによるスコア順位と連動しないため確実に再現)
- Impact_Scope: ワークフロー新規登録モーダル（UploadWorkflowModal）、および初期配線生成を伴うワークフロー設定画面（AdaptiveWorkflowWiring）における初期ノードマッピング品質およびユーザーの手動修正負荷
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: 1) 候補一覧のスコア順ソート（rankWorkflowNodeCandidates）と、初期選択値の決定ロジック（useMasterMappingRows.initFromScan）が分離・不整合となっている。2) 初期値はバックエンドAPI（/api/workflows/scan）のscan_workflow / scan_workflow_variants結果（scanDefaults）から直接流し込まれているが、バックエンド側は候補をノードID数値順（candidates.sort(key=lambda x: int(x[0]))）でソートしており、正規化タイトルや文字バイグラム類似度によるステージ親和性スコアリングを持っていない。3) バックエンドでnot_found判定された場合（またはduplicated警告でnode_idが先頭IDに倒れた場合）、フロントエンド側には高スコアの候補ノードが存在しても、初期値は空欄（未割当）または低スコアノードが選択される。4) SSoT（REQ-358）において「候補一覧の順位・スコア算出（AC-8〜14）」は規定されたが、「新規登録・未割り当てスロットの初期選択（Auto-assignment）として推奨候補（スコア1位）を自動採用する」制約が仕様から欠落（Specification Gap）していた。
- Failure_Location: `frontend/src/hooks/useMasterMappingRows.ts:340-362,446-474; frontend/src/components/UploadWorkflowModal.tsx:37-80; backend/app/services/workflow_scanner.py:117-150,308-350; docs/design/REQ-358.md:Candidate Contract`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1) SSoT（SPEC_SETTINGS.md / REQ仕様）を改訂し、「新規ワークフロー登録時および未割り当てスロットにおいて、候補スコア最上位（推奨かつ最高スコア）のノードが存在する場合はそれを初期選択値として自動補完する」制約を明文化する。2) useMasterMappingRowsまたはUploadWorkflowModalにおいて、新規登録時（または未設定スロット）の初期値として、バックエンドの旧スキャナ結果に依存せず、フロントエンドで算出したrankWorkflowNodeCandidatesの最上位ノード（candidates[0]、ただし推奨フラグまたは一定スコア以上のもの）を適用するよう改修する。3) 必要に応じてバックエンドのworkflow_scannerもフロントエンドのスコアリング規則と整合させるか、初期マッピング決定の主権をフロントエンドのrankWorkflowNodeCandidatesに一元化する。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-416
</linked_artifacts>
