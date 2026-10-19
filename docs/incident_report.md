# Incident Triage Report: 生成完了後のプレビュー表示遅延（約2.5秒）およびジョブキャンセル処理の遅延

<incident_metadata>
- Created_At: 2026-10-20 03:50:46
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 1. 生成完了後、UI上に生成画像プレビューが表示されるまでに1秒を大幅に超える遅延（約2.5秒）が発生する。 2. 生成ジョブのキャンセル操作（待機中および実行中）の反映が著しく遅い。
- Reproducibility: 100% (コード解析およびComfyUI WebSocket仕様との不整合により確定)
- Impact_Scope: 画像生成完了通知・プレビュー自動追従（auto-follow）、およびジョブキュー/実行中キャンセル機能全体（Backend GenerationService/Bridge, Frontend JobManagementModal）
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 【プレビュー遅延】ComfyUIは生成完了時にWebSocketで execution_success イベントを送信せず、executing (node: null) を送信する。しかし backend/app/services/generation_service.py の on_event は execution_success のみで完了処理（history取得・succeeded遷移）を行い、executing (node: null) を空処理として無視している。このため、バックエンドはリアルタイムに完了を検知できず、バックグラウンドワーカーのポーリング周期（_RECONCILE_SECONDS = 2.5秒）が満了して _reconcile_locked が走るまで完了状態および出力画像URLがフロントエンドへ配信されない。【キャンセル遅延】1. 待機中ジョブの単件キャンセルでは、Frontend JobManagementModal.tsx に3秒間の取り消し猶予タイマー（setTimeout 3000ms）が存在し即時送信されない。2. 実行中ジョブ中断（interrupt）では、comfy_generation_bridge.py が中断送信前に連続して2回 redundant な GET /queue を呼び出している上、generation_service.py がロック保持下で多重のHTTP問い合わせ（queue/history）を同期実行し、ComfyUIサンプラー停止直後の未完了状態で unconfirmed と判定され、結局2.5秒周期の reconcile ループ待ちとなる。
- Failure_Location: `backend/app/services/generation_service.py:288-326,421,599-612; backend/app/services/comfy_generation_bridge.py:150-160; frontend/src/components/JobManagementModal.tsx:99-118`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. 【プレビュー即時反映】generation_service.py の on_event において、event_type == 'executing' and data.get('node') is None を検知した時点で、即時に upstream history を取得し、job を succeeded へ遷移させてスナップショットを配信する（2.5秒ポーリング待ちを解消）。2. 【キャンセル高速化】comfy_generation_bridge.py の interrupt メソッド内の冗長な多重 queue() 呼び出しを削減する。また、generation_service.py の _cancel_single において interrupt 後の過度な多重同期待ちを最適化し、WebSocketの execution_interrupted イベント受信と連携して迅速に cancelled 状態を反映する。さらに JobManagementModal.tsx の待機キャンセル3秒タイマーの必要性を精査する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-385
</linked_artifacts>
