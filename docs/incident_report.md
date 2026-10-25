# Incident Triage Report: prompt_id確定後の上流消失ジョブがrunning/queuedのまま残留し取消・解除できない（REQ-335再発）

<incident_metadata>
- Created_At: 2026-10-26 00:59:11
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: ComfyUI停止・再起動等で上流queue/historyから消失したprompt_id確定済みの生成ジョブ（実DBではbatch 08894265-ef05-46c2-8781-c5576618694aの先頭3件: running 1件・queued 2件）が、FE上で実行中・待機中として恒久的に残留し、normal_group_idが閉じず、単件取消・一括取消・未確認解除のいずれでも解消できない。
- Reproducibility: 100%（実DB db/prompt_surgeon.db の残留3レコードおよび GenerationService の reconcile / cancel / release コード経路の静解析で完全特定）
- Impact_Scope: backend/app/services/generation_service.py, docs/specs/SPEC_COMMON.md, docs/specs/SPEC_GENERATE.md（FE表示・normal group管理・取消/解除フロー全般に波及）
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: 1. 【Reconcileでの上流消失未検知】GenerationService._reconcile_locked (L1271-1293) は prompt_id を持つ queued/submitting/running ジョブが上流 queue (running/pending) に不在のとき bridge.history(prompt_id) を照会するが、ComfyUI再起動等で履歴も消失し history.get(prompt_id) が None を返すと L1291-1292 でそのまま continue し、status を unconfirmed へ遷移させない（REQ-335 設計 R13/Q8 で範囲外として残存していた経路）。 2. 【取消時のDB状態未更新・一括取消の対象漏れ】_cancel_single (L788-826) および cancel_queued (L283-292) は、上流 queue 不通時や queue/history 不在時にレスポンスの CancelResult.outcome だけ 'unconfirmed' を返し、DB上の job.status を 'unconfirmed' へ遷移させない。さらに _cancel_global (L828-969) と _cancel_normal (L1126-1261) は local_ids (prompt_id=null) と上流 queue 実在分しか対象にしないため、prompt_id!=null で上流から消失した queued/submitting/running ジョブは unconfirmed へ遷移せず、一括取消対象からも漏れる（_cancel_normal の stale_running L1222 も not_cancelled を返すのみ）。 3. 【解除経路の遮断とNormal Groupの恒久開放】DB上の status が running/queued のまま残るため、FE の selectUnconfirmedJobs (status==='unconfirmed') に現れず、POST /api/generation/release (L374: status!='unconfirmed') でも拒否される。また _ACTIVE_STATUSES に留まり続けるため normal_group_id が閉じず後続の全通常生成ジョブが同一グループへ累積し続ける。
- Failure_Location: `backend/app/services/generation_service.py:283-298,374-375,788-826,836-930,1140-1227,1271-1293`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. GenerationService._reconcile_locked において、prompt_id を持つ active ジョブ (queued/submitting/running) が成功した queue 照会で running/pending の双方に不在、かつ成功した history(prompt_id) 照会でもレコード不在の場合に _mark_unconfirmed で status='unconfirmed' へ遷移させる。 2. 単件取消 (_cancel_single, cancel_queued) および一括取消 (_cancel_global, _cancel_normal) において、上流 queue 照会失敗時または上流 queue/history 不在により取消確認できない active ジョブ (prompt_id!=null) の DB status を _mark_unconfirmed で 'unconfirmed' へ遷移させた上で CancelOperation.items に outcome='unconfirmed' として含め、FEの『状態未確認の記録』欄からの手動解除 (release) を可能にする。 3. SPEC_COMMON.md (L552, L555) および SPEC_GENERATE.md (L214, L216-218) に、prompt_id 確定後の上流 queue/history 消失時および取消未確認時の status='unconfirmed' 遷移契約を明記する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-401
</linked_artifacts>
