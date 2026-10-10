# REQ-333 取消とサムネ互換の差分監査入力
設計のみ、人間レビュー前。35 AC/in-progress不変。旧normal-only/Studio保護推論を現行global互換へ訂正、raw audit verdictは保存。変化だけ監査し、TTL/件数制限/性能SLA/厳密security/新Studio Step機能を追加しない。実装試験未実施。

## 現物根拠
JobManagementModal.tsx:21-53:filterは表示のみ、単件はprompt ID、queue-only clear:true、all clear:true→interrupt。jobQueueSlice.ts:369-521: scope/session選択payloadなし、確認前UI reset/catch consoleのみ。comfy.py:168-211: queue/interrupt5秒、HTTP200 status:errorあり。
comfy.py:274-403:L1/L2 miss/0byte diskは既存L3原画GET→縮小webp再生成。test_comfy_proxy.py:216-284はdisk hit/0byte回復。GallerySection.tsx:297-307:onError単独削除を修正、:400-415 saved Snapshotは別。

## 共有公開型 T2/T8 (同一項目、重複省略)
```python
CancelMode = Literal['single','queued','all']
ActionOutcome = Literal['confirmed','unconfirmed','failed','not_requested']
class CancelTarget(BaseModel):
    job_id: str | None = None
    prompt_id: str | None = None
class CancelRequest(BaseModel):
    mode: CancelMode
    target: CancelTarget | None = None
class CancelResult(BaseModel):
    job_id: str | None
    prompt_id: str | None
    status: JobStatus | None
    outcome: Literal['cancelled','not_cancelled','already_terminal','unconfirmed','rejected']
    message: str
class CancelOperation(BaseModel):
    mode: CancelMode
    items: list[CancelResult]
    upstream_clear: ActionOutcome
    upstream_interrupt: ActionOutcome
    epoch: str
    revision: int
class UpstreamQueueItem(BaseModel):
    prompt_id: str
    client_id: str | None
class UpstreamQueueView(BaseModel):
    running: list[UpstreamQueueItem]
    pending: list[UpstreamQueueItem]
# singleはtarget内のjob_id/prompt_idの一方だけ必須。queued/allはtarget禁止。
# legacyはjob_id/status=null。queue取得失敗は503、空配列の成功へ変換しない。
```
TypeScript同名interface/type、Literal→union、list→Array、必須nullable→null。T8 CancelResult/CancelOperation/UpstreamQueueViewは完全同一項目。ImageIdentity={filename:string,subfolder:string,type:string};ImageAvailability={availability:present|missing|unknown}。JobStatus=queued/submitting/running/succeeded/failed/cancelled/unconfirmed。

## T10 routes
```python
@router.post('/jobs/{job_id}/cancel', response_model=CancelResult)
async def cancel_job(job_id: str) -> CancelResult: ...
@router.post('/cancel', response_model=CancelOperation)
async def cancel_operation(payload: CancelRequest) -> CancelOperation: ...
@router.get('/upstream-queue', response_model=UpstreamQueueView)
async def upstream_queue() -> UpstreamQueueView: ...
```
T8口: cancelJob(jobId):Promise<CancelResult>; cancel(body:CancelRequest):Promise<CancelOperation>; getUpstreamQueue():Promise<UpstreamQueueView>; imageAvailability(identity:ImageIdentity):Promise<ImageAvailability>。T12 GET /api/comfy/image-availability?filename&subfolder&type。managed job別availabilityは同判定helper。ErrorEnvelope={detail:{code,message,outcome:failed|unconfirmed|null,request_id:null|string,job_id:null|string}}。single targetはjob_id/prompt_idの一方、queued/allはtargetなし。確認済み200/取消未確認202、開始前照合不能503、不一致409。partial items/action結果を成功へ丸めない。

## 取消共通contract T5/T6/T10/T16/T18
旧normal-only/Studio保護という推論は撤回。singleは選択job_idまたはlegacy prompt_idの一方のみ。queuedは全BE受付済み未投入待機＋全上流pendingをscope/session非限定でclear:true、runningは保持。allは同global clear後にglobal interrupt。表示フィルタは操作対象へ使用しない。per-job loopへ置換しない。
accept/dispatch/cancelを同一BE lockで直列化し、操作開始時のcommit済みBE待機をcutoff集合にする。以後の新受付は次集合。上流clearは実行時のpendingへ作用し、外部投入を含め分散atomicではない。
BE未投入はlock下の取消commitで確認、投入済みは正常ack＋上流queue/history/terminal照合で確認。単なるqueue不在/HTTP200旧status:errorは証拠にしない。先に終了した成功/失敗は既存終端を優先。timeout/曖昧結果をjob失敗に書換えない。unconfirmedには自動mutation再送なし、状態再取得のみ。
通常Nはconfirmed cancelledだけ除外、同ID重複で二重減算なし。Studio F=成功＋失敗/Nはbatch固有、取消はFへ加算しない。12成功＋8取消なら12/20・停止、終端cancelledでrunning flags解除、Step遷移/auto-advanceなし。confirmed cancelledには失敗トーストなし。
個別runningはlock下で直前対象確認、不一致409でinterruptなし。上流interruptはexpected IDを受けないため既投入job進行/外部legacyとの競合を絶対防止できない。観測した実対象と結果を開示する。全中断はglobal running対象。既存running履歴cleanupは取消確認後のbest effortで維持し、Snapshot/成功完了履歴を削除しない。cleanup失敗を取消不成立へ戻さない。
T5 cancel(job_id)->CancelResult、cancel_operation(CancelRequest)->CancelOperation。T6 clear_queue/delete_queue/interrupt_allはack観測dict、delete_history(prompt_ids)はbest effort。既存connect5,prompt10,queue/interrupt5,history15秒継承、mutation retryなし。

## 画像共通contract T12/T21
試行画像はjob UUIDの有無を問わずfilename/subfolder/type identityで原画利用状態を照会する。確定上流原画404だけmissing。thumbnail404/変換500やHEAD405、502/503/timeoutだけでは原画欠損を決めない。判定不能はunknown、必要ならHEAD非対応時に既存view GETで確認する。
L1/L2両cache欠損、0-byte/読取不能diskは既存L3原画GET→縮小webp→cache再登録の回復を保持。破損cacheのunlinkと、原画欠損時の孤児サムネ即削除禁止は別契約。500 memory/4000→3600 disk上限と変換品質を変えない。
同identityのerror probeは共有し、一度結果/エラーを得たら自動onError/refetch再発で再送しない。明示retry又は画像変更で再試行。present/unknownなら履歴/選択/原画previewを保持、既存placeholder/error上で再試行可能とし、一覧を原画サイズへ置換しない。原画missingだけtrial集合/query cache/選択から除外。保存Snapshot本体・画像・paramsは対象外。

## T30 unique contract
既存props `interface JobManagementModalProps {isOpen:boolean;onClose:()=>void}`、hooks-before-return、一覧の自セッション表示フィルタを保持。
T16の公開store口を使う: cancelJob(id:string):Promise<CancelResult>、clearPendingQueue():Promise<CancelOperation>、cancelAllJobs():Promise<CancelOperation>。局所testはこの3関数＋既存queue/clientId/filter口をtyped mockし、新GenerationServerState読取りを不要とする。T15結線の実検証はT28。
単件は選択行だけ。BE未投入UUIDとlegacy prompt IDをT16へ渡す。単件の既存無confirm操作は維持。
2全操作は既存native confirmを維持。文面は全セッション/normal/Studio/外部Comfyキューへ作用すること、queuedはrunning保持、allはrunning中断を示す。表示件数を操作全体件数と誤認させず、全体件数を未確認なら推定値で断定しない。filter中でもglobal actionをvisible ID列挙へ変えない。
処理中は同じ操作の連打を抑止。全requested効果がconfirmed（既に対象なしの確認含む）ならonClose。部分失敗/未確認/queue照会失敗は開いたまま既存message/toast形式で取消確認済み・未確認を別表示、明示状態再取得可。自動mutation retryなし。confirmed cancelledは失敗トーストなし。手動closeは取消完了扱いにしない。

## T31 unique contract
既存Gallery props、選択/autoFollow/複数選択、一覧thumbnail寸法、main原画preview、保存Snapshot別タブのまま保持。
T8公開口: `generationApi.imageAvailability(identity:{filename:string;subfolder:string;type:string}):Promise<{availability:'present'|'missing'|'unknown'}>`。URLはnew URL(img,location.origin)でfilename/subfolder/typeを抽出、tをidentityに含めず上流hostを渡さない。legacy画像にjob UUIDを要求しない。
既存LazyThumbnail props/onErrorを使用し、新キャッシュformat/品質やLazyThumbnail公開型を変更しない。Gallery内の同identity promise/結果guardで同時errorの照会を共有する。成功/unknown/HTTP例外結果後、rerender・onError再発でprobe/refetchを反復しない。明示retry又は画像identity変更でguardを解除。新TTL/intervalは不要。
thumbnail errorで直接historyを削除する現callbackを置換する。原画present/unknown・503・ネット断なら画像行/選択/原画preview維持、既存placeholder上でサムネ取得失敗/再試行を示す。retry clickは行選択イベント伝播を止め、既存toThumbnailUrlのままLazyThumbnailをkey変更で再mountして通常GETを再試行。原画を一覧srcに入れない。
確定原画missingだけstoreのcomfyHistoryImages/batchImagesから削除。query cacheと選択の同期はT21のhookが担当、T28で実結線を確認。保存Snapshot branchにこのonError/probe/削除を適用しない。

## 変更カード所有/依存/命令
BE cwd=C:/Users/audih/ws/comfy-create-helper2/backend、FE cwd=同frontend。FE test前にnpm run typecheck、BE mypyは各カードの対象。
T2: 所有=backend/app/schemas/generation.py;backend/tests/test_generation_schema.py;依存=なし;.\.venv\Scripts\python.exe -m pytest tests/test_generation_schema.py -q ; .\.venv\Scripts\python.exe -m mypy app/schemas/generation.py
T5: 所有=backend/app/services/generation_service.py;backend/tests/test_generation_service.py;依存=REQ-333-T2;.\.venv\Scripts\python.exe -m pytest tests/test_generation_service.py -q ; .\.venv\Scripts\python.exe -m mypy app/services/generation_service.py
T6: 所有=backend/app/services/comfy_generation_bridge.py;backend/tests/test_comfy_generation_bridge.py;backend/requirements.txt;依存=REQ-333-T2;.\.venv\Scripts\python.exe -m pytest tests/test_comfy_generation_bridge.py -q ; .\.venv\Scripts\python.exe -m mypy app/services/comfy_generation_bridge.py
T8: 所有=frontend/src/api/domains/generation.ts;frontend/src/api/domains/__tests__/generation.test.ts;frontend/src/api/client.ts;依存=なし;npx vitest run src/api/domains/__tests__/generation.test.ts
T10: 所有=backend/app/routers/generation.py;backend/app/main.py;backend/tests/test_generation_api.py;依存=REQ-333-T2,REQ-333-T4,REQ-333-T5,REQ-333-T6,REQ-333-T11;.\.venv\Scripts\python.exe -m pytest tests/test_generation_api.py -q ; .\.venv\Scripts\python.exe -m mypy app/routers/generation.py app/main.py
T12: 所有=backend/app/routers/comfy.py;backend/tests/test_comfy_proxy.py;backend/tests/test_comfy_proxy_fault.py;依存=なし;.\.venv\Scripts\python.exe -m pytest tests/test_comfy_proxy.py tests/test_comfy_proxy_fault.py -q ; .\.venv\Scripts\python.exe -m mypy app/routers/comfy.py
T15: 所有=frontend/src/store/slices/connectionSlice.ts;frontend/src/store/types.ts;frontend/src/store/__tests__/slices/connectionSlice.test.ts;依存=REQ-333-T8,REQ-333-T14,REQ-333-T16;npx vitest run src/store/__tests__/slices/connectionSlice.test.ts
T16: 所有=frontend/src/store/slices/jobQueueSlice.ts;frontend/src/api/domains/settings.ts;frontend/src/store/__tests__/slices/jobQueueSlice.test.ts;依存=REQ-333-T8;npx vitest run src/store/__tests__/slices/jobQueueSlice.test.ts
T18: 所有=frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx;frontend/src/pages/DatasetStudioPage/hooks/useStudioGeneration.ts;frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx;依存=REQ-333-T8;npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx
T21: 所有=frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts;frontend/src/utils/thumbnailUrl.ts;frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx;依存=REQ-333-T8,REQ-333-T16;npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx
T30: 所有=frontend/src/components/JobManagementModal.tsx;frontend/src/components/__tests__/JobManagementModal.req333.test.tsx;依存=REQ-333-T8,REQ-333-T16;npx vitest run src/components/__tests__/JobManagementModal.req333.test.tsx
T31: 所有=frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx;frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx;依存=REQ-333-T8,REQ-333-T12;npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx
T26依存=T17/T20/T21/T22/T30/T31、所有SPEC_GENERATE/HISTORY/COMMON。T27所有Settings/Studio/Manager、取消Step1節のみ追加同期。T28依存=T7/T10/T12/T15/T17/T18/T20/T21/T22/T23/T24/T25/T29/T30/T31、所有backend/tests/test_generation_integration.py;frontend/src/__tests__/App.generationIntegration.test.tsx;backend/openapi.json。命令: BE .\.venv\Scripts\python.exe -m pytest tests/test_generation_integration.py -q; FE npx vitest run src/__tests__/App.generationIntegration.test.tsx。

## 追加試験 FC09–14
| FC09 取消3操作互換 | JobManagementModalから3操作を呼び、queued単発delete指定ID、running単発interrupt、キューのみglobal clear、実行中を含むglobal clear→interruptを記録。running単発および全取消の既存history整理を維持し、保存Snapshotは保持。フィルタON/OFF、normal/Studio/別session混在で対象範囲が現行と同じ | T5/T6/T10/T12/T30/T28 |
| FC10 受理済み取消と競合 | 操作cutoffの前後に新規受付を挿入しD7の対象集合と結果を照合。未投入/投入中/queued/running/unconfirmedを別々に制御し、確定取消の再投入なし。clear成功・interrupt失敗など部分失敗はjob別結果を返し、未確認jobの母数を楽観削減しない。再要求/重複eventで二重削減なし | T5/T6/T10/T12/T28 |
| FC11 旧jobとStudio取消 | BE UUIDを持たない既存promptも3操作対象となり、架空UUIDやscopeを付与しない。normal確定取消は母数再計算、Studioはbatch別停止終端を表示し別batchと合算しない。取消を失敗トーストや成功枚数に算入せず、新たなStep遷移なし | T6/T8/T16/T18/T21/T30/T28 |
| FC12 サムネ既存再生成 | L1/L2両miss・L2ゼロbyte・読込失敗で既存L3原画取得とWebP再生成を確認。原画bytes・既存画質/サイズ/保存上限を維持。既存test_get_comfy_thumbnail_disk_cache_corrupt_recoveryを証拠に含める | T12/T28 |
| FC13 サムネ失敗と原画有無 | サムネ取得/再生成失敗時、filename/subfolder/typeで原画availabilityを照会。原画presentまたはunknownなら行/選択/拡大導線を保持し再試行可能表示。確定missingだけ試行行/表示cache/選択から除外。Snapshotと付随ファイルを即削除せず、一覧へ原画全体を自動読み込みしない | T12/T31/T28 |
| FC14 availability境界と再試行 | BE job UUIDなしの旧履歴でも照会できる。原画200=present、確定404=missing、502/503/timeoutおよび照会失敗=unknown。HEAD非対応時の既存GET経路fallbackを確認。同一画像の照会を共有し、エラーによる自動probe/retry loopを作らない。明示再試行または画像変更で再確認可能 | T12/T31/T28 |
T15はT16 projectQueue(GenerationSnapshot,UpstreamQueueView)で旧queue tupleへread-only投影。managed UUID/sessionとlegacy prompt ID/client IDを分け既知prompt dedup。upper503は前回表示+未確認、架空jobなし。T30旧store口typed mock、T31はT8/T12後、T28はT15/T21/Modal/Gallery結線。31カード56辺、depth4、所有最大3、最大214行。T1 preflight後だけ実装dispatch。
