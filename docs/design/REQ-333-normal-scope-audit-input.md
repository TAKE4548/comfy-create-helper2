# REQ-333 AC36 normal-only差分監査
設計のみ、人間レビュー前、source/コード試験なし。既存AC01..35不変、AC36追加で36/in-progress。旧raw監査/verdict不変。このscope追加だけ監査。既存サムネ/資源/保持/timeout/Studio Stepは不変、新TTL/件数制限/security/SLA/完全atomic保証を加えない。

## AC36
- [ ] **AC-36**: Given 通常生成・Studio・複数セッションのジョブが混在しジョブ管理を表示している, When 一括取消の対象を「通常生成のみ」または既定の「全生成（Studioを含む）」から選びキューのみ取消／実行中を含む取消を実行する, Then 通常生成のみは表示フィルタに依存せず全セッションの識別済みnormal待機・BE未投入のみを取り消しStudioとscope不明の旧ジョブを保持する。Studioまたはscope不明が実行中／上流待機にあればinterruptを送らず通常実行中も保持して理由と未完了を表示する。全生成は既存global clear→必要時interruptの範囲を維持し、単件取消は選択IDのみ。取消確認済みだけ進捗へ反映し、Studio Step遷移を追加しない。

## 現物と保守条件
JobManagementModal.tsx:21-53はfilter表示のみ、単件prompt、queued clear:true、all clear→interrupt。jobQueueSlice.ts:369-521はglobal操作・確認前reset、comfy.py:168-211は5秒・HTTP200 status:errorあり。既定globalをnormal-onlyへ限定せず、追加要望は明示scope chooser「通常生成のみ / 全生成（Studioを含む）」。
ID指定なしinterruptはatomic targetではない。Studio/unknownがrunning/pendingにあれば送らずnormal待機取消だけ行いnormal runningを保持/理由表示。known normal-only queueでのみlock下で試行し外部TOCTOUを保証しない。この保守条件は親/ユーザーへ提示済み。

## T2 Python/T8 TS exact parity
```python
CancelMode = Literal['single','queued','all']
CancelScope = Literal['all','normal']
ActionOutcome = Literal['confirmed','unconfirmed','failed','not_requested','skipped']
class CancelTarget(BaseModel):
    job_id: str | None = None
    prompt_id: str | None = None
class CancelRequest(BaseModel):
    scope: CancelScope = 'all'
    mode: CancelMode
    target: CancelTarget | None = None
class CancelResult(BaseModel):
    job_id: str | None
    prompt_id: str | None
    status: JobStatus | None
    outcome: Literal['cancelled','not_cancelled','already_terminal','unconfirmed','rejected']
    message: str
class CancelOperation(BaseModel):
    scope: CancelScope
    message: str
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
# singleはtarget内ID一方だけ、scope=allのみ（単件の対象をscopeで変更しない）。
# queued/allはtarget禁止。scope省略はall、normalは世代scope=normalに限る。
# legacyはjob_id/status=null。queue取得失敗は503、空配列の成功へ変換しない。
```
```typescript
export type CancelMode = 'single'|'queued'|'all'
export type CancelScope = 'all'|'normal'
export type ActionOutcome = 'confirmed'|'unconfirmed'|'failed'|'not_requested'|'skipped'
export interface CancelTarget {job_id?:string;prompt_id?:string}
export interface CancelRequest {mode:CancelMode;scope?:CancelScope;target?:CancelTarget}
export interface CancelResult {
 job_id:string|null;prompt_id:string|null;status:JobStatus|null
 outcome:'cancelled'|'not_cancelled'|'already_terminal'|'unconfirmed'|'rejected';message:string
}
export interface CancelOperation {
 scope:CancelScope;message:string;mode:CancelMode;items:CancelResult[];upstream_clear:ActionOutcome;upstream_interrupt:ActionOutcome;epoch:string;revision:number
}
export interface UpstreamQueueView {
 running:Array<{prompt_id:string;client_id:string|null}>
 pending:Array<{prompt_id:string;client_id:string|null}>
}
```
JobStatus=queued|submitting|running|succeeded|failed|cancelled|unconfirmed。legacy job_id/status=null、nullableキー必須。未知scope/single+normal/不正targetは422、省略scope all、single APIはUI scopeに影響されない。

## D7/T5/T6/T10/T16/T18 共有処理
一括scopeはall|normal、mode=single|queued|allとは別軸。既定scope=allを維持。singleは選択job_id/prompt_id一方だけ、scopeを選択させずallのみ。表示filterは対象決定へ使わない。
all scope: queuedは全BE受付済み未投入＋全上流pendingをglobal clear:true、running保持。mode allは同clear後global interrupt、Studio/全session/legacyを含む。per-job loopへ縮小しない。
normal scope: 全sessionのDB job.scope=normalかつcutoff前commit済み未投入、またはDB prompt_idに正に対応付いた上流normal pendingだけ対象。削除はdelete:[確定ID群]、clear:true禁止、Studio/unknown legacyは触らない。推測client_id/表示行/残数からnormalを判定しない。
accept/dispatch/cancelを同じBE lockで直列化。normal allはID削除後に最新queueを再取得し、running又は上流pendingにStudio/unknownが1件でもある、queue照合不能、対象normalがrunningと確認不能ならinterruptを送らない。upstream_interrupt=skipped、messageで「Studio/未分類を保護するため通常実行中を維持」等の理由、正常終了前ならnot_cancelledを返す。全取消完了と表示しない。normal queuedはrunningに関係なく上記確定待機取消を行う。
最新queueが全件known normal、対象running一致、lock保持の場合だけnormal-running interruptを試行可能。直前一致検査を行うが、上流はexpected IDを受けず、外部legacy投入/上流自律切替/遅延到達とのTOCTOUを原子的に防げない。Studio保護の絶対保証と称さず、競合・timeoutはunconfirmedで明示、自動再送しない。既知保護対象がある場合は常に見送るという保守条件を優先。
未投入はlock下の取消commit、上流投入済みは正常ack＋queue/history/terminal照合で確認。queue不在/旧HTTP200 status:errorだけを証拠にしない。成功/失敗先行は終端を優先。normal Nはconfirmed cancelledのみ除外し重複減算なし、操作のfailed/unconfirmed/skippedをjob失敗へ変換しない。cutoff後の新BE受付は次集合、上流global clearは実行時集合、分散atomicではない。
Studio batch F=成功+失敗、取消非加算、12成功+8取消は12/20停止。cancelled終端でrunning flags解除、Step移動/auto-advanceなし。confirmed cancelに失敗トーストなし。running履歴cleanupは取消確認後best effort、先行完了履歴/保存Snapshotを消さずcleanup失敗で取消を戻さない。
POST /api/generation/cancel(CancelRequest)->CancelOperation。POST /jobs/{job_id}/cancel->CancelResult単件。GET /upstream-queueはrunning/pending各{prompt_id,client_id}、失敗503を空成功にしない。T8 cancel(body)->Promise<CancelOperation>、cancelJob(jobId)->Promise<CancelResult>。T16 clearPendingQueue(scope?)/cancelAllJobs(scope?)->Promise<CancelOperation>、省略all。T5 cancel_operation(CancelRequest)->CancelOperation。T6 delete_queue(prompt_ids:list[str])->dictで確定ID群、clear_queueはall scopeだけ、interrupt_allはnormal barrier通過時又はscope all。
ErrorEnvelope={detail:{code,message,outcome:failed|unconfirmed|null,request_id:null|string,job_id:null|string}}。normal時upstream_clearは指定ID deleteの結果。skipped結果HTTP200も全取消成功でない。未確認202/開始不能503、normal queuedはinterrupt not_requested、normal all保護barrierはskipped/message・not_cancelled running item。timeout自動再送なし。

## T30固有UI
既存props `interface JobManagementModalProps {isOpen:boolean;onClose:()=>void}`、hooks-before-return、一覧の自セッション表示フィルタを保持。
T16の公開store口を使う: cancelJob(id:string):Promise<CancelResult>、clearPendingQueue(scope?:CancelScope):Promise<CancelOperation>、cancelAllJobs(scope?:CancelScope):Promise<CancelOperation>。局所testはこの3関数＋既存queue/clientId/filter口をtyped mockし、新GenerationServerState読取りを不要とする。T15結線の実検証はT28。
単件は選択行だけ。BE未投入UUIDとlegacy prompt IDをT16へ渡す。単件の既存無confirm操作は維持。
2一括操作には「通常生成のみ / 全生成（Studioを含む）」選択を設け、初期値all（全生成）にする。表示filter/sessionと独立の操作選択、単件は選択IDのみでscope選択の影響なし。2全操作は既存native confirmを維持。all scope文面は全セッション/normal/Studio/外部キュー、queuedはrunning保持、allはrunning中断を示す。normal scope文面は全sessionの識別済み通常生成のみ、Studio/未分類保持、保護対象が実行中又は待機中なら通常実行中も中断を見送る条件を表示。表示件数を操作全体件数と誤認させず、全体件数を未確認なら推定値で断定しない。filter中でもscope=allはglobal、scope=normalもvisible IDではなく全session識別済normal集合。
処理中は同じ操作の連打を抑止。全requested効果がconfirmed（既に対象なしの確認含む）ならonClose。normal allでupstream_interrupt=skippedか未確認なら「Studio/未分類を保護するため通常実行中を維持」等のBE messageを表示し、全取消完了とせずonCloseしない。部分失敗/未確認/queue照会失敗は開いたまま既存message/toast形式で取消確認済み・未確認を別表示、明示状態再取得可。自動mutation retryなし。confirmed cancelledは失敗トーストなし。手動closeは取消完了扱いにしない。
試験: confirm拒否はAPI0回、ON/OFF filterで同じglobal payload、managed未投入+Studio+別session+legacyを含む。queuedでinterrupt0回、allでclear→interrupt、partial/timeoutでonClose0回と非optimistic保持、単件targetが選択IDのみ。CancelResult.cancelled通知時の失敗toast0、重複click1操作。scope選択初期all、normalはfilter ON/OFF同じpayload、Studio/unknown barrier時はskipped・保持理由・onClose0。単件はscopeを送らず選択IDのみ。

## FC15-FC19 (実装後実施)
| FC15 scope選択/旧互換 | Modal初期scope allで既存global clear→interrupt。normalを選ぶとmodeとは独立のscopeを送信し全session normal対象。filter ON/OFFで同じmembership。単件は選択IDだけでscope chooserの影響なし。未知scopeとsingle+normalは422 | T2/T8/T16/T30/T28 |
| FC16 normal queued識別 | mixed upper pendingのknown-normal ID群のみdelete:[IDs]、clear:trueは0回。DB scope/prompt対応を持たないlegacy・Studioを保持、BE未投入normalを取消commitしてworker再投入なし。client ID推測でscopeを補わない | T5/T6/T10/T16/T28 |
| FC17 normal all保護barrier | Studio running、Studio pending、unknown running、unknown pending、照合503を各fixtureで投入。normal待機取消は成功分反映、interrupt0回、normal running保持、upstream_interrupt=skipped/message。all-cancel完了/onClose/Studio Step遷移なし。queued modeでも同じ待機取消は可能 | T5/T6/T10/T18/T30/T28 |
| FC18 known-normal running試行 | upper queueがknown normalのみ/対象running一致/BE lockを保持し指定normal待機削除→再queue→interrupt。保護対象が再queueで増えれば送信0。直前不一致は送信0。外部TOCTOU/timeout時は原子的Studio保護成功と称さずunconfirmed、自動再mutation/母数減算なし | T5/T6/T10/T30/T28 |
| FC19 scoped結果と集計 | normal bulkの部分成功/failed/unconfirmed/skippedを別返却、確定cancelだけNを減らし失敗toastなし。非対象Studio progress/running/batch/Stepを維持。scopeとmessage/action skippedをPython→TS parityで検査。既定globalでStudio停止に達した場合の既存FC11は維持 | T2/T8/T15/T16/T18/T30/T28 |

## 所有/依存/命令
BE cwd=C:/Users/audih/ws/comfy-create-helper2/backend、FE cwd=同frontend。FE npm run typecheck後にtest、BE mypyは各カード対象。
T2:所有=backend/app/schemas/generation.py;backend/tests/test_generation_schema.py;依存=なし;.\.venv\Scripts\python.exe -m pytest tests/test_generation_schema.py -q ; .\.venv\Scripts\python.exe -m mypy app/schemas/generation.py
T5:所有=backend/app/services/generation_service.py;backend/tests/test_generation_service.py;依存=REQ-333-T2;.\.venv\Scripts\python.exe -m pytest tests/test_generation_service.py -q ; .\.venv\Scripts\python.exe -m mypy app/services/generation_service.py
T6:所有=backend/app/services/comfy_generation_bridge.py;backend/tests/test_comfy_generation_bridge.py;backend/requirements.txt;依存=REQ-333-T2;.\.venv\Scripts\python.exe -m pytest tests/test_comfy_generation_bridge.py -q ; .\.venv\Scripts\python.exe -m mypy app/services/comfy_generation_bridge.py
T8:所有=frontend/src/api/domains/generation.ts;frontend/src/api/domains/__tests__/generation.test.ts;frontend/src/api/client.ts;依存=なし;npx vitest run src/api/domains/__tests__/generation.test.ts
T10:所有=backend/app/routers/generation.py;backend/app/main.py;backend/tests/test_generation_api.py;依存=REQ-333-T2,REQ-333-T4,REQ-333-T5,REQ-333-T6,REQ-333-T11;.\.venv\Scripts\python.exe -m pytest tests/test_generation_api.py -q ; .\.venv\Scripts\python.exe -m mypy app/routers/generation.py app/main.py
T16:所有=frontend/src/store/slices/jobQueueSlice.ts;frontend/src/api/domains/settings.ts;frontend/src/store/__tests__/slices/jobQueueSlice.test.ts;依存=REQ-333-T8;npx vitest run src/store/__tests__/slices/jobQueueSlice.test.ts
T18:所有=frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx;frontend/src/pages/DatasetStudioPage/hooks/useStudioGeneration.ts;frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx;依存=REQ-333-T8;npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx
T30:所有=frontend/src/components/JobManagementModal.tsx;frontend/src/components/__tests__/JobManagementModal.req333.test.tsx;依存=REQ-333-T8,REQ-333-T16;npx vitest run src/components/__tests__/JobManagementModal.req333.test.tsx
T12旧comfy queue/interrupt proxyはglobal互換、normal scopeを推測しない。T15 cancelled終端はrunning flags解除、not_cancelled保持。T26はSPEC_GENERATE/HISTORY/COMMONへAC36/D7同期、T27 Studio Step変更なし。T28はT15/T16/T18/T30結線とshape parity、既定global FC09-11回帰。31カード56辺depth4、最大221行/3所有files。全draft、T1 preflightと人間設計承認前の実装dispatchなし。
