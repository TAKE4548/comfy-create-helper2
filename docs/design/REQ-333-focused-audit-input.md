# REQ-333 最終focused設計監査（変更した契約だけ）

対象は以下の明確化のみ。既存要件/全カードを再評価しない。実装・コード試験は未実施。35 AC/元BA・前2モデルの否定判定は保持。新SLO/資源上限/TTL/認証/自動POST再送/BE完全復元を追加しない。

## 用語/旧API境界/既存値

GenerationSnapshot=生成状態JSON、Snapshot=既存保存画像DB+params、thumbnail=一時一覧画像cache。相互に保存/cleanup対象を混同しない。

normal/Studioは新受付だけを使用し、BEのみがjob状態を書く。旧Comfy proxyは上流互換操作口、別のclient job状態正本ではない。未登録jobは上流で分かるlegacy表示のみ、scope/所有を推定して集計しない。旧metadata二重POSTは除去、旧API廃止期日を追加しない。

HTTPは実在comfy.pyのconnect5/prompt10/queue・interrupt5/history15秒(既定15)。BE upstream WSは旧ComfyWebSocketServiceの1秒開始/15秒最大/0〜499ms jitter。client統合WSは旧SystemWsServiceの1〜10秒。新期限/SLAではない。

requestはFE UUID、job/batch/groupはBE UUID、利用者sessionは既存LS文字列を継承。timestamp client IDを新batch識別に使わない。

writerはclientごと1つ、同一ws登録1回/disconnect冪等。slowreader未送信生成状態は最新1状態、stats最新は別に保持しworkerを待たせない。例外/既存30秒heartbeat受信timeoutでdead解除、1MB/100接続制限は追加しない。

## Runtime version / Atomicity

version=1をruntime検証。未知version/不正字段は適用せずlast valid状態とSYSTEM_STATS購読を保持。同epochの未知versionについて自動state再取得は最大1回、なお非対応なら再読込を案内する同期非対応状態にし、連続refetch/自動reload/reconnectを起こさない。手動操作または対応するpayloadに復帰した時に解除する。

snapshot()はread-only。DB read/serialize失敗は503、FEは前回のvalid状態を保持して同期失敗表示、部分payloadは適用しない。受付transaction未commitならrollbackして202なし。commit済みなら後続snapshot取得/通知失敗で受付を拒否扱いに戻さず、commitしたjob IDs/epoch/revisionから202を返す。request lookupを受付根拠とし、state取得失敗でmutationを再送しない。

## 公開リクエスト型

Scope=normal|studio; JobStatus=queued|submitting|running|succeeded|failed|cancelled|unconfirmed。BatchRequest={request_id,session_id,scope,project_id?:number,items:[{graph:object,workflow_id?:number,param_values:object,applied_assets?:object,set_name?:string}]}。Studio project必須、empty items不可、UUID検査。input内容は凍結した既存graph/metadata、false/0/空は保持。任意JSON graphをanyで受けることと公開state/responseが無型であることは区別する。

## T2 Python公開DTO（現在物理契約）

```python

class NodeView(BaseModel):
    id: str
    name: str
    value: float
    max: float
class ImageView(BaseModel):
    node_id: str
    index: int
    view_url: str
    thumbnail_url: str
    availability: Literal['present','missing','unknown']
class FailureView(BaseModel):
    reason: str
    outcome: Literal['failed','unconfirmed']
class JobView(BaseModel):
    job_id: str
    request_id: str
    prompt_id: str | None
    session_id: str
    scope: Scope
    batch_id: str
    normal_group_id: str | None
    project_id: int | None
    status: JobStatus
    started_at: str | None
    finished_at: str | None
    node: NodeView | None
    outputs: list[ImageView]
    failure: FailureView | None
class BatchView(BaseModel):
    batch_id: str
    scope: Scope
    project_id: int | None
class UpstreamView(BaseModel):
    http_ready: bool
    ws_connected: bool
    failure_since: str | None
class StateSnapshot(BaseModel):
    version: Literal[1]
    epoch: str
    revision: int
    normal_group_id: str | None
    jobs: list[JobView]
    batches: list[BatchView]
    upstream: UpstreamView
class BatchAccepted(BaseModel):
    batch_id: str
    job_ids: list[str]
    epoch: str
    revision: int
class RequestLookup(BaseModel):
    batch_id: str
    job_ids: list[str]
class CancelResult(BaseModel):
    status: JobStatus
class ErrorDetail(BaseModel):
    code: str
    message: str
    outcome: Literal['failed','unconfirmed'] | None
    request_id: str | None
    job_id: str | None
class ErrorEnvelope(BaseModel):
    detail: ErrorDetail
# timestampはUTC ISO文字列。必須nullableはキーを省略せずnullで返す。
# ResponseModelはStateSnapshot（FE名GenerationSnapshot）と同一JSON字段。

```

## T8 TypeScript state対応（変更前から同一で維持）

```typescript

export type Scope = 'normal' | 'studio'
export type JobStatus = 'queued' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unconfirmed'
export interface GenerationItem {
  graph:Record<string,unknown>; workflow_id?:number
  param_values:Record<string,unknown>; applied_assets?:Record<string,unknown>; set_name?:string
}
export interface BatchRequest {
  request_id:string; session_id:string; scope:Scope; project_id?:number; items:GenerationItem[]
}
export interface JobView {
  job_id:string; request_id:string; prompt_id:string|null
  session_id:string; scope:Scope; batch_id:string; normal_group_id:string|null; project_id:number|null
  status:JobStatus; started_at:string|null; finished_at:string|null
  node:{id:string; name:string; value:number; max:number}|null
  outputs:Array<{node_id:string; index:number; view_url:string; thumbnail_url:string; availability:'present'|'missing'|'unknown'}>
  failure:{reason:string; outcome:'failed'|'unconfirmed'}|null
}
export interface GenerationSnapshot {
  version:1; epoch:string; revision:number; normal_group_id:string|null; jobs:JobView[]
  batches:Array<{batch_id:string; scope:Scope; project_id:number|null}>
  upstream:{http_ready:boolean; ws_connected:boolean; failure_since:string|null}
}
export type GenerationEnvelope = {
  type:'GENERATION_SNAPSHOT'|'GENERATION_EVENT'; version:1; epoch:string; revision:number; data:GenerationSnapshot
}

```

## T8公開成功/error（現在物理契約）

```typescript

export interface BatchAccepted {batch_id:string;job_ids:string[];epoch:string;revision:number}
export interface RequestLookup {batch_id:string;job_ids:string[]}
export interface CancelResult {status:JobStatus}
export interface ErrorDetail {
 code:string;message:string;outcome:'failed'|'unconfirmed'|null;request_id:string|null;job_id:string|null
}
export interface ErrorEnvelope {detail:ErrorDetail}
export class GenerationApiError extends Error {
 readonly status:number
 readonly detail:ErrorDetail
 constructor(status:number, detail:ErrorDetail) { super(detail.message);this.status=status;this.detail=detail }
}
// JobView/GenerationSnapshotの共通項目は上記既存interfaceのままPython DTOと同一。
// submitBatch -> BatchAccepted; getRequest -> RequestLookup; cancelJob -> CancelResult
// availability -> JobView['outputs']; preview HTTP200は画像bytes/MIME（JSONではない）。
// 409/422/503/404はErrorEnvelope。通信失敗・非JSON旧エラーは同じErrorDetailへ正規化。
// nullable項目は必ずnullとして受信、versionは1以外を型castで通さずruntime検証。

```

## T10 route表面（現在物理契約）

```python

router = APIRouter(prefix='/api/generation', tags=['generation'], route_class=GenerationAPIRoute)
@router.post('/batches', response_model=BatchAccepted, status_code=202)
async def submit_batch(payload: BatchRequest) -> BatchAccepted: ...
@router.get('/state', response_model=StateSnapshot)
async def get_generation_state() -> StateSnapshot: ...
@router.get('/requests/{request_id}', response_model=RequestLookup)
async def get_request(request_id: str) -> RequestLookup: ...
@router.post('/jobs/{job_id}/cancel', response_model=CancelResult)
async def cancel_job(job_id: str) -> CancelResult: ...
@router.get('/preview/{job_id}', response_class=Response)
async def get_preview(job_id: str) -> Response: ...
@router.get('/images/{job_id}/availability', response_model=list[ImageView])
async def image_availability(job_id: str) -> list[ImageView]: ...
# cancelは確認済み200/処理中202、previewはimage bytes/MIME・404 ErrorEnvelope。
# generation router内のGenerationAPIRouteがRequestValidationError等をErrorEnvelopeへ変換。
# 他の既存routerの422/旧error contractは変えない。
# 409/422/503/404はErrorEnvelope、HTTPException.detailにはErrorDetail.model_dump()を渡す。

```

## T15/T24 状態・互換境界

既存GenerationStateはtype intersection。GenerationServerStateを合成し、server状態から旧progress/previewImage/isConnected/isGenerating/currentPromptIdを導出。旧actionsはT16受付口へ委譲。

T24 hookはこの既存公開口だけのtyped adapter、GenerationSnapshot追加字段を独立正本にせずvi.mockの既存型で隔離。Vite/api ws:trueは8000への同origin生成WSを運ぶ。旧/comfy WS8188と別のVite開発HMRは混同しない。T28がT15とT24双方に依存し実結線を検証。

## T29旧propsと新提案snippet

旧URL input onChangeはsetLocalComfyUrl(value),setComfyUrl(value)を即呼ぶ。新UIはuseConfig().data.comfy_urlをread-only表示、旧URL callbacksはmount/change/closeで0回。旧propsは型互換だけに残す。close=setIsSettingsOpen(false)、workflow/default params/reset/model callbackは従来通り。config未取得なら読込み中/取得不可、旧local URLをBE正本表示しない。既存wrapper/mobile/header layoutも保持。C3の明示的なURL編集差分としてレビューする。

## T27 doc検証/依存

所有はSPEC_SETTINGS/SPEC_DATASET_STUDIO/server_manager_guideの3つ。Settings§3system・§5接続、Studio§2の750ms/sessiondraft/競合を保持しStep1生成節、Manager§2.2とaccessURLをC2/C3/C7とbefore/after逐語比較。関数/型追加でなく節の正本同期なので架空functionを作らない。rgは下記、さらに実試験記載はwalkthroughのcommand/exit/AC/jobID/pixel/Network/logへ照合。

rg -n '^## 3|^## 5|system|8899|8000|Backend URL|LM Studio URL' docs/specs/SPEC_SETTINGS.md

rg -n '^## 2|^### 2\.|750ms|sessionStorage|Step 1|batch|scope' docs/specs/SPEC_DATASET_STUDIO.md

rg -n '^### 2\.2|8188|8899|8000|非常|CORS|Origin' docs/specs/server_manager_guide.md

T4→T2/T3、T28→T7/T10/T12/T15/T17/T18/T20/T21/T22/T23/T24/T25/T29。T29はrootでT28へ依存しないのでcycleなし。T1はsource dispatch前governance preflight。実装DAG4層。

## 今回変更した検証期待（予定、未実施）

FC01 unknown version2反復→同epoch refetch最大1回/非対応表示/旧state+stats保持/自動reload0。

FC02 commit後snapshot例外→POST202同IDs/GETstate503/lookup同IDs/rollback0・mutation再送0。FC03 commit前DB失敗→全件rollback/202なし/workerなし。

FC04 Python DTO JSONをT8でnull/enum/字段一致受信、409/422/503/404、preview画像bytesとavailability配列。

FC05 T15導出旧stateをT24adapterが読んで単一WS、旧mock型でも動作。FC06 T29 URL callbacks0/closeと既存操作維持。

FC07 T27節別before/afterと実試験証跡対応。FC08 PC/Mobile両renderでN0 idle/0、NaN/Infinityなし。3終了+running50%は枚数3/8、全体43.75%、node50%を別assert。

RT12同ws重複connect/二重disconnect/遅いreader/25秒ping・既存30秒timeout、stats/生成同時配信。

判定は修正した契約の論理整合だけを扱い、コードPASS・以前の否定判定の上書き・全資料の合格保証にしない。残る問題は具体的字段/clausesへ対応づける。
