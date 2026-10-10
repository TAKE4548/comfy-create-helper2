# Incident Triage Report: ComfyUI停止後の未確認jobが待機キューに残留し、取消でも解除されない

<incident_metadata>
- Created_At: 2026-10-10 20:16:57
- Investigation_Status: INVESTIGATION_COMPLETED_BACKLOG_ONLY
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 生成中のComfyUI停止と再起動後、FEのキューにjobが残り、BE再起動でも解消しない。新規生成は可能。調査時点の残留は3件、全てunconfirmed/prompt_id=nullで、実ComfyUI queueはrunning/pendingとも空。
- Reproducibility: 2026-10-10実状態: read-only SQLite(mode=ro,query_only)と親エージェントのGET /api/generation/state・/upstream-queueで一致。残留job:0056d072-1a1a-4eb5-b826-d29bf562584a,96e4db2b-5ad7-4bf2-84c6-5d7e03ed2c1a,6e4d0839-d74c-4643-9261-daefbd96a3ab。メモリ内MemoryRepository/FakeBridgeでunconfirmed/nullを再現し、reconcile後もunconfirmed、単件取消がalready_terminal、Service作り直し後のreconcileでもunconfirmedを確認(exit0)。上流操作0回。本番への取消・再起動・DB書込みなし。
- Impact_Scope: FE待機中件数が3件残留。単件取消は既に終了として扱われるがjobは残る。DBのactive集合とnormal groupに未確認jobが残り、生成枚数/進捗の未終了扱いへ影響し得る。新規生成はユーザー申告で動作。ComfyUI自体が落ちた根因は本調査の対象外で未確定。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: logs/app.jsonl:99419-99423で20:04:37(JST)ComfyUI接続切断後、99423/99443/99458で20:04:42/47/54に残り3件の上流投入がConnectErrorとなり、BEが正しくunconfirmedを永続化。その後FE projectQueueがunconfirmedをqueued/submittingと同じpending配列へ投影し、Modalで状態未確認ではなく待機中として表示する。BEの_TERMINALにunconfirmedが含まれ、単件取消がalready_terminal/job already endedを返して状態を変えない。reconcileはprompt_id既知だけを対象とし、nullの3件は照合不能。Repositoryはunconfirmedをactiveとして保持するため再起動後も再表示される。SSoT docs/design/REQ-333.md:101/103/113は未確認の明示・状態区別を要求、docs/specs/SPEC_COMMON.md:318およびSPEC_GENERATE.md:174は未確認を完了扱いにしない契約。従って未確認を待機中/終了済み扱いする点はType A。結果不明を自動再送や成功/失敗へ推測変換しないこと自体は仕様通り。補足Type B候補:未確認記録をユーザー判断で一覧から解除するライフサイクル/操作契約は既存仕様に明確でない。
- Failure_Location: `frontend/src/store/slices/jobQueueSlice.ts:45; frontend/src/components/JobManagementModal.tsx:46,204; backend/app/services/generation_service.py:30,502-503,977; backend/app/services/generation_repository.py:23; docs/design/REQ-333.md:103; logs/app.jsonl:99423,99443,99458`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1.未確認jobを実待機中と区別し、状態未確認の表示・件数・進捗状態を一貫させる。2.単件取消でunconfirmedをalready_terminalと判定しない。上流識別不能はunconfirmedを保持し結果を明示する。3.ユーザーが未確認記録を解除/非表示にする操作を必要とする場合、生成成功/取消確認とは別の意味を持つ操作としてSSoT・保持・normal group終了条件を先に定義し設計承認を得る（仕様補足）。4.回帰確認:空上流+null unconfirmed、単件/一括取消、BE再起動、未確認後の新規生成、上流ID判明時の照合、二重投入なし。現在の3件を勝手に削除/failed/cancelled化しない。PBI作成/実装はユーザー明示承認後、dev-coordinator経由。
- SSoT_Update_Required: 表示・取消判定のType A修正のみならNo。未確認記録の解除操作を追加する場合はライフサイクル仕様の補足が必要。
- Recommended_Route: ユーザー承認後にdev-coordinatorへ /dev-design {PBI_ID} で引き継ぐ。
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-335 (docs/backlog/pbi/active/REQ-335.md; status=new; backlog only)
</linked_artifacts>



## 5. User Decision and Temporary Clearance

- 2026-10-10、ユーザーは「2で。暫定でゾンビの3件はクリアして」と指示。REQ-335をnew状態でバックログ登録のみ。恒久修正の設計・実装には着手していない。
- 対象3件の全カラムを db/maintenance/REQ-335-before-clear-20261010T112419Z.json に退避した。
- 対象job_idとunconfirmed/prompt_id=null/出力なしを再確認し、上流キューが空であることを確認後、指定3件だけをローカル手動解除としてcancelledへ移行。再送防止のrequest_id/item_index、元の未確認理由とoutcome=unconfirmedは保持。failure.reasonにユーザー指定によるローカル解除の理由を記録した。graph_jsonを解除し、DB revisionを増加させた。
- ComfyUIへ取消・割込み・再投入は行わず、BE再起動なし。ほかの生成ジョブは変更対象外。
- 最初の手動解除記録に既存FailureViewが許可しない追加フィールドを記入したため、状態APIが一時503となった。対象3件のfailureを既存reason/outcome形式へ修正済み。暫定スクリプトも修正済み。
- 修正後GET /api/generation/stateは正常応答、3件はcancelled、queued/submitting/running/unconfirmed合計0件。GET /api/generation/upstream-queueはrunning=[]/pending=[]。未確認の上流結果を確認済み取消と断定するものではない。
