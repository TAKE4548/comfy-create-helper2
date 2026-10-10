# REQ-333 補足監査: 現物29カードの依存・残る固有contract

第一監査に設計全文、代表T2/T11/T18全文、全29カードの実装要件・期待シナリオを含む。この補足は未監査の実物契約とコマンド/所有/現在依存を対象とし、同じ設計・logicを再監査しない。共通型/規定は完全一致のまま1回へ重複排除。実装未着手/コード試験未実施。

## 共通規定原文



以下は承認対象の新contract。scopeとproject、上流client IDと利用者sessionは別。clientから完了状態を送らない。
受付はDB commit後202。上流POST結果不明はunconfirmed、自動再送なし。BE再起動完全復元を追加しない。
通常Nはcancelled除外、F=succeeded+failed。Studio各batch独立。別scope待機優先、他session待機はfilter ONだけ。
snapshotはepoch/revisionでatomic置換、eventも同じ形の全状態dataを使い部分mergeを避ける。SYSTEM_STATS/VRAM_RECOVEREDのtype/data・2.5秒周期保持。
既存30local/1000server metadata、Snapshot独立、Studio750ms/draft競合、画像aspectを保持。
カード外ファイルや公開contract変更が必要なら設計へ差し戻す。



## 共通型原文

from typing import Any, Literal, Protocol
from pydantic import BaseModel
Scope = Literal['normal','studio']
JobStatus = Literal['queued','submitting','running','succeeded','failed','cancelled','unconfirmed']
class BatchItem(BaseModel):
    graph: dict[str, Any]
    workflow_id: int | None = None
    param_values: dict[str, Any]
    applied_assets: dict[str, Any] | None = None
    set_name: str | None = None
class BatchRequest(BaseModel):
    request_id: str
    session_id: str
    scope: Scope
    project_id: int | None = None
    items: list[BatchItem]
class GenerationPort(Protocol):
    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]: ...
    async def queue(self) -> dict[str, Any]: ...
    async def history(self, prompt_id: str | None = None) -> dict[str, Any]: ...
    async def interrupt(self, prompt_id: str) -> None: ...
class RepositoryPort(Protocol):
    def accept_batch(self, payload: BatchRequest) -> dict[str, Any]: ...
    def snapshot(self) -> dict[str, Any]: ...
    def transition(self, job_id: str, status: JobStatus, **fields: Any) -> dict[str, Any]: ...
# UUID、空items禁止、studio project必須をvalidatorで検査。

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

## REQ-333-T1 / docs/backlog/task/archive/REQ-333-T1.md
depends_on: []
- SKILL.md

### 現物固有contract
```text
C1: 生成通信8000、Manager8899独立。
C2/C3/C7: system管理、非常復旧、Studio request別。
C4/C5/C6/C9/C10/C11: BE正本/metadata受付/欠損表示/保存互換。
30local/1000server cache、Snapshot独立、Studio draft、aspect/周期は保持。
```

対象の関数/型契約:

```typescript
承認されたC1..C11文面と実装diffの一致を確認。仕様書で未実施試験をPASSと書かない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2'
Get-Content 'SKILL.md'
```

## REQ-333-T2 / docs/backlog/task/archive/REQ-333-T2.md
depends_on: []
- backend/app/schemas/generation.py (NEW)
- backend/tests/test_generation_schema.py (NEW)

代表全文は第一監査対象。現在依存/所有のみ再照合。

## REQ-333-T3 / docs/backlog/task/archive/REQ-333-T3.md
depends_on: []
- backend/app/models.py
- backend/app/migrations/steps.py
- backend/tests/test_generation_jobs_migration.py (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
class GenerationJob(Base):
    __tablename__ = 'generation_jobs'
def step_027_generation_jobs(conn: Connection, inspector: Inspector) -> None: ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_generation_jobs_migration.py -q
.\.venv\Scripts\python.exe -m mypy app/models.py app/migrations/steps.py
```

## REQ-333-T4 / docs/backlog/task/archive/REQ-333-T4.md
depends_on: [REQ-333-T2, REQ-333-T3]
- backend/app/services/generation_repository.py (NEW)
- backend/app/routers/prompt_metadata.py
- backend/tests/test_generation_repository.py (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
class GenerationRepository:
    def accept_batch(self, payload: BatchRequest) -> dict[str, Any]: ...
    def snapshot(self) -> dict[str, Any]: ...
    def transition(self, job_id: str, status: JobStatus, **fields: Any) -> dict[str, Any]: ...
    def find_request(self, request_id: str) -> dict[str, Any] | None: ...
    def prune_terminal(self) -> None: ...
def persist_prompt_metadata(db: Session, payload: PromptMetadataCreate) -> None: ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_generation_repository.py -q
.\.venv\Scripts\python.exe -m mypy app/services/generation_repository.py app/routers/prompt_metadata.py
```

## REQ-333-T5 / docs/backlog/task/archive/REQ-333-T5.md
depends_on: [REQ-333-T2]
- backend/app/services/generation_service.py (NEW)
- backend/tests/test_generation_service.py (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
class GenerationService:
    def __init__(self, repository: RepositoryPort, bridge: GenerationPort, clock, vram_status, publish): ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def accept(self, payload: BatchRequest) -> dict[str, Any]: ...
    async def cancel(self, job_id: str) -> dict[str, Any]: ...
    async def reconcile(self) -> None: ...
    def snapshot(self) -> dict[str, Any]: ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_generation_service.py -q
.\.venv\Scripts\python.exe -m mypy app/services/generation_service.py
```

## REQ-333-T6 / docs/backlog/task/archive/REQ-333-T6.md
depends_on: [REQ-333-T2]
- backend/app/services/comfy_generation_bridge.py (NEW)
- backend/tests/test_comfy_generation_bridge.py (NEW)
- backend/requirements.txt

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
class ComfyGenerationBridge:
    async def start(self, on_event, on_preview) -> None: ...
    async def stop(self) -> None: ...
    async def submit(self, graph: dict[str, Any]) -> dict[str, Any]: ...
    async def queue(self) -> dict[str, Any]: ...
    async def history(self, prompt_id: str | None = None) -> dict[str, Any]: ...
    async def interrupt(self, prompt_id: str) -> None: ...
# interrupt直前に実running prompt一致を検査。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_comfy_generation_bridge.py -q
.\.venv\Scripts\python.exe -m mypy app/services/comfy_generation_bridge.py
```

## REQ-333-T7 / docs/backlog/task/archive/REQ-333-T7.md
depends_on: []
- tools/server-manager/server_api.py
- backend/tests/test_manager_origin_req333.py (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
def is_allowed_app_origin(origin: str) -> bool: ...
class ManagerHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self): ...
    def do_GET(self): ...
    def do_POST(self): ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_manager_origin_req333.py -q
```

## REQ-333-T8 / docs/backlog/task/archive/REQ-333-T8.md
depends_on: []
- frontend/src/api/domains/generation.ts (NEW)
- frontend/src/api/domains/__tests__/generation.test.ts (NEW)
- frontend/src/api/client.ts

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export const generationApi = {
 submitBatch:(body:BatchRequest,signal?:AbortSignal):Promise<{batch_id:string;job_ids:string[];epoch:string;revision:number}>=>...,
 getState:():Promise<GenerationSnapshot>=>...,
 getRequest:(requestId:string):Promise<{batch_id:string;job_ids:string[]}>=>...,
 cancelJob:(jobId:string):Promise<{status:JobStatus}>=>...,
 availability:(jobId:string):Promise<JobView['outputs']>=>...,
}
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/api/domains/__tests__/generation.test.ts
```

## REQ-333-T9 / docs/backlog/task/archive/REQ-333-T9.md
depends_on: [REQ-333-T8]
- frontend/src/utils/generationSelectors.ts (NEW)
- frontend/src/utils/__tests__/generationSelectors.test.ts (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export function selectProgress(s:GenerationSnapshot, scope:Scope, sessionId:string|null, batchId?:string): {finished:number;total:number;fraction:number;idle:boolean} { ... }
export function selectWait(s:GenerationSnapshot, scope:Scope, sessionId:string|null, batchId?:string): {kind:'scope'|'session'|'batch';remaining:number;label:string}|null { ... }
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/utils/__tests__/generationSelectors.test.ts
```

## REQ-333-T10 / docs/backlog/task/archive/REQ-333-T10.md
depends_on: [REQ-333-T2, REQ-333-T4, REQ-333-T5, REQ-333-T6, REQ-333-T11]
- backend/app/routers/generation.py (NEW)
- backend/app/main.py
- backend/tests/test_generation_api.py (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
router = APIRouter(prefix='/api/generation', tags=['generation'])
async def submit_batch(payload: BatchRequest): ...
async def get_generation_state(): ...
async def get_request(request_id: str): ...
async def cancel_job(job_id: str): ...
async def get_preview(job_id: str): ...
async def image_availability(job_id: str): ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_generation_api.py -q
.\.venv\Scripts\python.exe -m mypy app/routers/generation.py app/main.py
```

## REQ-333-T11 / docs/backlog/task/archive/REQ-333-T11.md
depends_on: [REQ-333-T2]
- backend/app/routers/ws.py
- backend/tests/test_ws.py
- backend/tests/test_generation_ws.py (NEW)

代表全文は第一監査対象。現在依存/所有のみ再照合。

## REQ-333-T12 / docs/backlog/task/archive/REQ-333-T12.md
depends_on: []
- backend/app/routers/comfy.py
- backend/tests/test_comfy_proxy.py
- backend/tests/test_comfy_proxy_fault.py

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
async def get_comfy_view(filename: str, subfolder: str = '', type: str = 'output', t: str | None = None): ...
# filename/subfolder/typeのみ上流paramsへ、tは転送しない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_comfy_proxy.py tests/test_comfy_proxy_fault.py -q
.\.venv\Scripts\python.exe -m mypy app/routers/comfy.py
```

## REQ-333-T13 / docs/backlog/task/archive/REQ-333-T13.md
depends_on: []
- frontend/src/api/domains/systemManager.ts (NEW)
- frontend/src/hooks/useManagerStatus.ts (NEW)
- frontend/src/hooks/__tests__/useManagerStatus.test.ts (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export interface ManagerStatus {fe:{running:boolean;status:string};be:{running:boolean;status:string};comfy:{running:boolean;status:string};action_in_progress?:{service:string;action:string}|null}
export function useManagerStatus():{status:ManagerStatus|null;available:boolean;refetch:()=>Promise<void>}{ ... }
export const systemManagerApi = {status:()=>...,action:(action:'start'|'stop'|'restart',service:'comfy'|'backend')=>...,logs:(service:string,tail?:number)=>...}
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/hooks/__tests__/useManagerStatus.test.ts
```

## REQ-333-T14 / docs/backlog/task/archive/REQ-333-T14.md
depends_on: [REQ-333-T8]
- frontend/src/store/services/systemWsService.ts
- frontend/src/hooks/useSystemStats.ts
- frontend/src/store/services/__tests__/systemWsService.test.ts (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
class SystemWsService {
 subscribe(onMessage:(m:Record<string,unknown>)=>void,onOpen?:()=>void,onClose?:()=>void):()=>void { ... }
 suspend():void { ... }
 resume():void { ... }
 resetForTesting():void { ... }
}
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/store/services/__tests__/systemWsService.test.ts
```

## REQ-333-T15 / docs/backlog/task/archive/REQ-333-T15.md
depends_on: [REQ-333-T8, REQ-333-T14]
- frontend/src/store/slices/connectionSlice.ts
- frontend/src/store/types.ts
- frontend/src/store/__tests__/slices/connectionSlice.test.ts

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
interface GenerationState { generationSnapshot:GenerationSnapshot|null; generationSyncing:boolean }
// initialize({force?})とclientIdを保持。applyGenerationSnapshot/envelope処理を追加。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/store/__tests__/slices/connectionSlice.test.ts
```

## REQ-333-T16 / docs/backlog/task/archive/REQ-333-T16.md
depends_on: [REQ-333-T8]
- frontend/src/store/slices/jobQueueSlice.ts
- frontend/src/api/domains/settings.ts
- frontend/src/store/__tests__/slices/jobQueueSlice.test.ts

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
// queuePrompt(workflow,metadata?,options?):Promise<string|null>は互換維持。
// submitGenerationBatch(payload:BatchRequest):Promise<{batch_id:string;job_ids:string[]}>
// cancelJob(jobId:string)、fetchHistory()、setFilterOwnSession(filter:boolean)を保持。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/store/__tests__/slices/jobQueueSlice.test.ts
```

## REQ-333-T17 / docs/backlog/task/archive/REQ-333-T17.md
depends_on: [REQ-333-T8, REQ-333-T16]
- frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts
- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
// useGenerateAction(workflow:Workflow|undefined,comfyObjectInfo:any={},options?:UseGenerateActionOptions)
// buildGenerationRecord(capturedWorkflow,injectedGraph,finalGraph,assets)の不変値を渡す。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts
```

## REQ-333-T18 / docs/backlog/task/archive/REQ-333-T18.md
depends_on: [REQ-333-T8]
- frontend/src/pages/DatasetStudioPage/components/MatrixGenerationStep.tsx
- frontend/src/pages/DatasetStudioPage/hooks/useStudioGeneration.ts (NEW)
- frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx

代表全文は第一監査対象。現在依存/所有のみ再照合。

## REQ-333-T19 / docs/backlog/task/archive/REQ-333-T19.md
depends_on: [REQ-333-T8, REQ-333-T13]
- frontend/src/components/common/SystemStatusBadge.tsx (NEW)
- frontend/src/components/common/PageHeader.tsx
- frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export interface SystemStatusBadgeProps {upstream:GenerationSnapshot['upstream']|null;reconnecting:boolean;manager:ManagerStatus|null;managerAvailable:boolean}
export function SystemStatusBadge(props:SystemStatusBadgeProps):React.JSX.Element { ... }
// PageHeader既存props/badge slotを保持。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/components/common/__tests__/SystemStatusBadge.test.tsx
```

## REQ-333-T20 / docs/backlog/task/archive/REQ-333-T20.md
depends_on: [REQ-333-T9, REQ-333-T19]
- frontend/src/pages/GeneratePage/components/DesktopLayout.tsx
- frontend/src/pages/GeneratePage/components/MobileLayout.tsx
- frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
// selectProgress/WaitはT9契約、SystemStatusBadgeはT19契約。
// overall=(F+runningFraction)/N、枚数F/N、node=value/max。
// failedトーストはjob_id/terminal revisionでdedup。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx
```

## REQ-333-T21 / docs/backlog/task/archive/REQ-333-T21.md
depends_on: [REQ-333-T8, REQ-333-T16]
- frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts
- frontend/src/utils/thumbnailUrl.ts
- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export function toThumbnailUrl(url: string | null | undefined, size: number = 256): string { ... }
// useGenerateDisplayState({selectedWorkflowId})の戻り値とautoFollowを保持。
// URL(filename,subfolder,type,t)で正規化しavailabilityで置換。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx
```

## REQ-333-T22 / docs/backlog/task/archive/REQ-333-T22.md
depends_on: [REQ-333-T12]
- backend/app/services/snapshot_service.py
- backend/tests/test_snapshot_service_req267.py
- backend/tests/test_snapshots_req316_metadata.py

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
def resolve_internal_comfy_url(url: Optional[str], base_url: str) -> str: ...
class SnapshotService:
    @staticmethod
    def create_snapshot(db: Session, payload: schemas.SnapshotCreate): ...
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_snapshot_service_req267.py tests/test_snapshots_req316_metadata.py -q
.\.venv\Scripts\python.exe -m mypy app/services/snapshot_service.py
```

## REQ-333-T23 / docs/backlog/task/archive/REQ-333-T23.md
depends_on: [REQ-333-T14]
- frontend/src/store/services/comfyWebSocketService.ts
- frontend/src/store/useGenerationStore.ts
- frontend/src/store/services/__tests__/comfyWebSocketService.test.ts

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
// _resetWebSocketForTesting exportとpending promise getter/setterは互換。
// ブラウザComfyWS.connectの8188socket生成を廃止する。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/store/services/__tests__/comfyWebSocketService.test.ts
```

## REQ-333-T24 / docs/backlog/task/archive/REQ-333-T24.md
depends_on: [REQ-333-T8]
- frontend/src/hooks/useComfyWebSocket.ts
- frontend/src/hooks/__tests__/useComfyWebSocket.test.ts
- frontend/vite.config.ts

### 現物固有contract


隔離実装の境界: T15が追加するGenerationSnapshot字段をimport/参照せず、既存GenerationStateのprogress、previewImage、isConnected、isGenerating、currentPromptId、queuePrompt、cancelGeneration、clearPreviewだけを使うtyped adapterとする。この既存公開口をvi.mockで提供して局所試験を行う。T15後の実結線はT28で検証する。

既存口の型: progress=ComfyProgress|null、previewImage=string|null、isConnected/isGenerating=boolean、currentPromptId=string|null、queuePrompt(workflow:Record<string,unknown>):Promise<string|null>、cancelGeneration():Promise<void>、clearPreview():void。hookのcancelGeneration公開型voidは内部Promiseをawaitせずvoidで呼ぶ互換を保つ。(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export function resolveComfyUrl(url:string|null):string { ... }
export function useComfyWebSocket(clientId?:string):UseComfyWebSocketReturn { ... }
// /api/comfyを返しhookはstore adapter、Vite/api ws:true維持。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/hooks/__tests__/useComfyWebSocket.test.ts
```

## REQ-333-T25 / docs/backlog/task/archive/REQ-333-T25.md
depends_on: [REQ-333-T13]
- frontend/src/pages/SettingsPage/components/ServiceConnectionCard.tsx
- frontend/src/pages/SettingsPage.tsx
- frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
export function ServiceConnectionCard():React.JSX.Element { ... }
// systemManagerApi action→status再照会、logs→content表示。
// tab/hash/draft契約はそのまま。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx
```

## REQ-333-T26 / docs/backlog/task/archive/REQ-333-T26.md
depends_on: [REQ-333-T17, REQ-333-T20, REQ-333-T21, REQ-333-T22]
- docs/specs/SPEC_GENERATE.md
- docs/specs/SPEC_HISTORY.md
- docs/specs/SPEC_COMMON.md

### 現物固有contract
```text
C1: 生成通信8000、Manager8899独立。
C2/C3/C7: system管理、非常復旧、Studio request別。
C4/C5/C6/C9/C10/C11: BE正本/metadata受付/欠損表示/保存互換。
30local/1000server cache、Snapshot独立、Studio draft、aspect/周期は保持。
```

対象の関数/型契約:

```typescript
承認されたC1..C11文面と実装diffの一致を確認。仕様書で未実施試験をPASSと書かない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2'
Get-Content 'docs/specs/SPEC_GENERATE.md' 'docs/specs/SPEC_HISTORY.md' 'docs/specs/SPEC_COMMON.md'
```

## REQ-333-T27 / docs/backlog/task/archive/REQ-333-T27.md
depends_on: [REQ-333-T18, REQ-333-T25]
- docs/specs/SPEC_SETTINGS.md
- docs/specs/SPEC_DATASET_STUDIO.md
- docs/specs/server_manager_guide.md

### 現物固有contract
```text
C1: 生成通信8000、Manager8899独立。
C2/C3/C7: system管理、非常復旧、Studio request別。
C4/C5/C6/C9/C10/C11: BE正本/metadata受付/欠損表示/保存互換。
30local/1000server cache、Snapshot独立、Studio draft、aspect/周期は保持。
```

対象の関数/型契約:

```typescript
承認されたC1..C11文面と実装diffの一致を確認。仕様書で未実施試験をPASSと書かない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2'
Get-Content 'docs/specs/SPEC_SETTINGS.md' 'docs/specs/SPEC_DATASET_STUDIO.md' 'docs/specs/server_manager_guide.md'
```

## REQ-333-T28 / docs/backlog/task/archive/REQ-333-T28.md
depends_on: [REQ-333-T7, REQ-333-T10, REQ-333-T12, REQ-333-T15, REQ-333-T17, REQ-333-T18, REQ-333-T20, REQ-333-T21, REQ-333-T22, REQ-333-T23, REQ-333-T24, REQ-333-T25, REQ-333-T29]
- backend/tests/test_generation_integration.py (NEW)
- frontend/src/__tests__/App.generationIntegration.test.tsx (NEW)
- backend/openapi.json

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```python
承認されたC1..C11文面と実装diffの一致を確認。仕様書で未実施試験をPASSと書かない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/backend'
.\.venv\Scripts\python.exe -m pytest tests/test_generation_integration.py -q
.\.venv\Scripts\python.exe -c "import json; from app.main import app; from pathlib import Path; Path('openapi.json').write_text(json.dumps(app.openapi(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')"
Set-Location '../frontend'
npm run typecheck
npx vitest run src/__tests__/App.generationIntegration.test.tsx
```

## REQ-333-T29 / docs/backlog/task/archive/REQ-333-T29.md
depends_on: []
- frontend/src/pages/GeneratePage/components/SettingsPopover.tsx
- frontend/src/pages/GeneratePage/components/__tests__/SettingsPopover.req333.test.tsx (NEW)

### 現物固有contract
(共通型は先頭の完全一致原文参照)

対象の関数/型契約:

```typescript
// SettingsPopoverPropsのworkflow/default-param公開signature保持。
// 旧localComfyUrl/setLocalComfyUrl/setComfyUrl props互換を保ち通信経路へ使用しない。
```


### 現物verification command
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/GeneratePage/components/__tests__/SettingsPopover.req333.test.tsx
```