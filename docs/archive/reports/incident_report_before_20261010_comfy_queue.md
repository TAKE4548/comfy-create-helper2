# Incident Triage Report: LoRA Studio マトリクス生成投入時の ComfyUI 直接投入エラー (Failed to fetch)

<incident_metadata>
- Created_At: 2026-10-08 01:13:18
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: Dataset Studio (Step 1) でマトリクス計算完了後、「ComfyUIに20件直接投入」を実行すると「ComfyUI直接投入エラー: Failed to fetch」が発生しキュー投入が失敗する。通常の生成画面では同一ワークフローで正常に生成可能。
- Reproducibility: 100% (ブラウザからの http://127.0.0.1:8188 直接 fetch が CORS またはポート・ネットワーク制約によりブロックされる)
- Impact_Scope: Dataset Studio の Step 1 から ComfyUI へのマトリクス画像20件直接投入が実行不可
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: MatrixGenerationStep.tsx (L515-L549) において、アプリ標準のプロキシ (comfyApi.queuePrompt / /api/comfy/prompt) を経由せず、ブラウザから http://127.0.0.1:8188/prompt へ直接 fetch を行っているため。ComfyUI はデフォルトで CORS ヘッダーを返さないためブラウザ側で Failed to fetch となり遮断される。通常の生成画面ではバックエンド経由で通信するため問題なく動作する。
- Failure_Location: `frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx:515-549`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: MatrixGenerationStep.tsx で comfyApi をインポートし、直接 fetch を comfyApi.queuePrompt({ prompt: payload, client_id: clientId }) に置き換えてバックエンドプロキシ経由に変更する。併せて MatrixGenerationStep.test.tsx のテストを追従させる。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-330
</linked_artifacts>
