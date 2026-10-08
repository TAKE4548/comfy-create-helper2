# REQ-332 T2/T8 作業分解監査
Architecture/公開API/対象source2ファイル/AC18件は人間承認済み。旧T2の規模超過に対してのみ分割し、scopeと旧テスト契約を維持する。下記2Card本文を監査し、漏れ/矛盾/境界/依存/atomicityを確認する。T2のprivate基盤がT8の先行契約で、同じファイルを直列変更する。T1 done、fake-indexeddb6.2.5をpackage/lock確認済み。現行DAGはT2→T8→T3→T6の4層、歴史T1前提はcompleted_prerequisitesへ保持。T4→T5→T6とT7は不変。
既存監査は一次Conditional/全Card Needs Revision。TTL算術やIDB直列化の誤読は照合済み。serverがAPI正本、旧local APIキーread禁止、non-API metadata/session draftは移行しない。
Browser/test-plan全体の新監査ではなく分割保存契約とテスト範囲保存を対象とする。以前の監査結果をPASSへ読み替えない。


<!-- SOURCE: docs/backlog/task/active/REQ-332-T2.md -->
---
blocked_reason: oversized_card_split_pending_coordinator_release
completed_prerequisites:
- REQ-332-T1
decomposition_only: true
depends_on: []
design_review: approved_by_human_2026-10-08
id: REQ-332-T2
related_paths:
- docs/backlog/pbi/active/REQ-332.md
- docs/design/REQ-332.md
- docs/design/REQ-332-test-plan.md
- docs/backlog/task/active/REQ-332-T1.md
- docs/backlog/task/active/REQ-332-T8.md
- frontend/src/utils/queryCachePersister.ts
- frontend/src/utils/__tests__/queryCachePersister.test.ts
split_role: storage-core
status: in-progress
tags:
- frontend
- storage
- REQ-332
title: IDBトランザクション・検証・統合の基盤を実装
---

# REQ-332-T2: IDBトランザクション・検証・統合の基盤を実装

## Ownership and Scope
以下の既存承認済み2ファイルだけを所有する。まだsourceファイルは存在しないためこのTaskで新規作成する。
- C:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/queryCachePersister.ts
- C:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/__tests__/queryCachePersister.test.ts

旧T2の保存処理・検証・mergeを担当し、queue/coalescingは新T8へ分ける。T8は同じファイルの後続変更なので並行dispatchしない。
T1はdone、package/lockにfake-indexeddb 6.2.5を確認済み。充足済み前提として保持し再dispatchしない。
既存blocked状態はcoordinatorの解除待ち。人間承認済みのarchitecture/対象ファイル/AC18件は変更しない。
他担当の変更を戻さず、局所契約に差異があればcoordinatorへ報告する。
Atomicity見積: 2ファイル、差分<=280行（production<=180 + storage tests<=100）、Card<=300行。

## Hermetic Context
公開APIは変更しない:
```ts
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
export const API_CACHE_BUSTER = 'prompt-surgeon-api-cache-v1'
export const API_CACHE_MAX_AGE = 600_000
export interface QueryCachePersisterOptions {
  indexedDB?: IDBFactory
  storage?: Pick<Storage, 'removeItem'>
  now?: () => number
  timeoutMs?: number
}
export function createIndexedDBPersister(options?: QueryCachePersisterOptions): Persister
```

後続T8へ渡す同一module内private契約:
```ts
// 同じqueryCachePersister.ts内のprivate接続契約。新規export/ファイル追加なし。
interface QueryCacheStore {
  read(): Promise<PersistedClient | undefined>
  write(client: PersistedClient): Promise<void>
  remove(): Promise<void>
}
function createQueryCacheStore(options: QueryCachePersisterOptions): QueryCacheStore
function cloneClient(client: PersistedClient): PersistedClient | undefined
function mergeClients(
  stored: PersistedClient | undefined, incoming: PersistedClient, now: number
): PersistedClient | undefined
function pruneLegacyCache(storage?: Pick<Storage, 'removeItem'>): void
```

接続先の既存TanStack型定義周辺26行:
```ts
import { dehydrate, hydrate } from '@tanstack/query-core'
import type {
  DehydrateOptions,
  DehydratedState,
  HydrateOptions,
  NotifyEventType,
  QueryClient,
} from '@tanstack/query-core'

export type Promisable<T> = T | PromiseLike<T>

export interface Persister {
  persistClient: (persistClient: PersistedClient) => Promisable<void>
  restoreClient: () => Promisable<PersistedClient | undefined>
  removeClient: () => Promisable<void>
}

export interface PersistedClient {
  timestamp: number
  buster: string
  clientState: DehydratedState
}

export interface PersistQueryClientRootOptions {
  /** The QueryClient to persist */
  queryClient: QueryClient
```

## Implementation Requirements
- [ ] DB prompt-surgeon-api-cache-v1 / version1 / store client / key prompt-surgeon-rq-cache。envelope={schemaVersion:1,client:PersistedClient}。production依存・追加sourceファイルなし。
- [ ] createQueryCacheStoreのopen/property access/upgrade/transaction例外を捕捉。read/write/removeは拒否を上流へ漏らさずsettleする。
- [ ] readのget→validation→必要時deleteは単一readwrite transaction。成功値はtransaction complete後にだけ返す。timeout時はundefined全体、部分hydrateなし。
- [ ] schema/buster/clientState/query形状、timestampとdataUpdatedAtのfinite/非負/未来、now-timestamp>600000を検証。未来/破損/expiredを再取得へ回す。
- [ ] 成功queryのみ、comfy-object-info/snapshots/workflow-presets/prompt-metadataを除外しmutations=[]。queryHashはTanStack既定hashKey(queryKey)と一致を確認。
- [ ] writeは同じreadwrite transactionでstored/incomingをqueryHash統合。dataUpdatedAt大を残し同値はincoming。stored expired/invalidは置換、snapshot timestampは両者max、nowで延長しない。
- [ ] timeout既定1500ms。abort/close、遅延open successのclose、versionchange時close→次操作reopenを実装。タイマーとイベントhandlerを成功/失敗/timeout全経路で片付ける。
- [ ] pruneLegacyCacheはwindow.localStorage取得を含めtry/catch内で完全一致旧キーを同期removeItemする。getItem/clear/他prefix削除/session操作/非API書換えなし。
- [ ] cloneClientは呼出時structuredCloneをcatchして失敗ならundefined。JSON fallbackで値を変えない。function/DOMの失敗はAPIcache保存skipのみ、Date/Map/Set/循環を一律拒否しない。
- [ ] この段階のcreateIndexedDBPersisterは薄い直接委譲facadeで、同期prune→cloneClient→store.write / store.read / store.removeを結ぶ。queue/coalescingは未完了としてT8へ引き継ぐ。App接続T3はT8完了まで開始しない。
- [ ] test suite名をdescribe('REQ-332-T2 storage transactions',...)とする。fake-indexeddbの新factoryをcaseごとに注入し、2connectionのread/delete/write直列化、古いtabの上書き防止を確認。
- [ ] normal/TTL9-11分/schema/hash/clock/Quota/Security/abort/blocked/timeout/clone/versionchangeをparameterized caseで確認。store.write完了はawait transaction completeを使い、将来T8の1秒待ちにも依存しない観測にする。

## Verification and Handover
作業dir: C:/Users/audih/ws/comfy-create-helper2/frontend。環境変数追加なし。
```powershell
npx vitest run src/utils/__tests__/queryCachePersister.test.ts -t 'REQ-332-T2'
npm run typecheck
```
全対象case成功、unhandledrejectionなし。T8へprivate契約と既存テストを渡す。T2完了をPBI完了にしない。
差分が280行を超えるなら省略実装で収めず再分割相談へ戻す。source変更・テスト実行は本設計作業では行わない。



<!-- SOURCE: docs/backlog/task/active/REQ-332-T8.md -->
---
id: REQ-332-T8
title: Persisterのqueue・coalescing・Promise制御を実装
status: blocked
blocked_reason: awaits_T2_storage_core
design_review: approved_by_human_2026-10-08
decomposition_only: true
split_from: REQ-332-T2
split_role: persister-control
tags: [frontend, storage, REQ-332]
related_paths:
  - docs/backlog/pbi/active/REQ-332.md
  - docs/design/REQ-332.md
  - docs/design/REQ-332-test-plan.md
  - docs/backlog/task/active/REQ-332-T2.md
  - frontend/src/utils/queryCachePersister.ts
  - frontend/src/utils/__tests__/queryCachePersister.test.ts
depends_on: [REQ-332-T2]
---

# REQ-332-T8: Persisterのqueue・coalescing・Promise制御を実装

## Ownership and Scope
以下の承認済み2ファイルのT2成果を後続変更する。新規sourceファイル・依存package・ACは追加しない。
- C:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/queryCachePersister.ts
- C:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/__tests__/queryCachePersister.test.ts

旧T2のqueue/coalescing要件を移管した分割。人間のarchitecture承認は継続適用される。
T2と同じファイルを所有するためT2完了後に直列実装。T2のtransaction/validation/mergeや他担当の変更を戻さない。
Atomicity見積: 2ファイル、差分<=240行（control<=110 + unit tests<=130）、Card<=300行。

## Hermetic Context
公開API/定数はT2と同じ:
```ts
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
export const API_CACHE_BUSTER = 'prompt-surgeon-api-cache-v1'
export const API_CACHE_MAX_AGE = 600_000
export interface QueryCachePersisterOptions {
  indexedDB?: IDBFactory
  storage?: Pick<Storage, 'removeItem'>
  now?: () => number
  timeoutMs?: number
}
export function createIndexedDBPersister(options?: QueryCachePersisterOptions): Persister
```

T2が実装するprivate基盤（同module内から利用）:
```ts
// 同じqueryCachePersister.ts内のprivate接続契約。新規export/ファイル追加なし。
interface QueryCacheStore {
  read(): Promise<PersistedClient | undefined>
  write(client: PersistedClient): Promise<void>
  remove(): Promise<void>
}
function createQueryCacheStore(options: QueryCachePersisterOptions): QueryCacheStore
function cloneClient(client: PersistedClient): PersistedClient | undefined
function mergeClients(
  stored: PersistedClient | undefined, incoming: PersistedClient, now: number
): PersistedClient | undefined
function pruneLegacyCache(storage?: Pick<Storage, 'removeItem'>): void
```

既存TanStackのPersister型周辺26行:
```ts
import { dehydrate, hydrate } from '@tanstack/query-core'
import type {
  DehydrateOptions,
  DehydratedState,
  HydrateOptions,
  NotifyEventType,
  QueryClient,
} from '@tanstack/query-core'

export type Promisable<T> = T | PromiseLike<T>

export interface Persister {
  persistClient: (persistClient: PersistedClient) => Promisable<void>
  restoreClient: () => Promisable<PersistedClient | undefined>
  removeClient: () => Promisable<void>
}

export interface PersistedClient {
  timestamp: number
  buster: string
  clientState: DehydratedState
}

export interface PersistQueryClientRootOptions {
  /** The QueryClient to persist */
  queryClient: QueryClient
```

## Implementation Requirements
- [ ] T2の直接委譲facadeをcreateIndexedDBPersisterのprivate queue制御へ完成させる。署名、DB/store/key/buster/schema/TTL/例外fallbackは変更しない。
- [ ] factoryのpruneLegacyCacheを同期実行のまま維持。windowのgetter拒否もcatchし、旧API localStorageを読まない。
- [ ] persistClientは呼出時cloneClientを行い、その時点のsnapshotを所有する。待機中に呼出側が値を変更しても保存内容が変わらない。clone失敗はその呼出だけsettle/skip。
- [ ] 同タブpersist/removeは発生順queue。restoreも先行pending操作の後に実行し、読取りを追い越さない。
- [ ] 最初のpending writeから1000msでflushするcoalescing。連続更新でtimerを延長し続けない。直近pendingを選び、別queryを失わないようT2のmergeClientsで統合する。
- [ ] coalesced全呼出のPromiseはtransaction complete/保存skip/timeoutでsettle。戻りPromiseからrejectや永遠待ちを漏らさない。
- [ ] removeClient前のpending writeは先にflushまたはcancelして全待機Promiseをsettle。remove後に古いタイマーが復活して書き戻さない。後続persistはremove後にだけ実行。
- [ ] 1500msは各IDB操作deadline、1秒coalescing待ちとは別。T2のabort/close/versionchange/late-open処理を二重に置換しない。
- [ ] suite名をdescribe('REQ-332-T8 persister control',...)とし、fake timersで1秒未満/境界/連続更新、persist-remove-persist、restore順、clone後入力変化、failure全waiter解放を試験。
- [ ] T2のstorage transaction suiteは維持し、合算実行でも全case成功。native timeout、2tab merge、schema/hash/clock検証を削って行数を縮めない。
- [ ] ブラウザclose直前1秒のAPI未永続は既承認の再取得回復を維持。metadata/session draftの保持方式は触らない。
- [ ] 完了後にのみT3のApp接続が着手できる。新Cardのready化は物理更新完了後の状態整理のみであり、engineer dispatchの指示ではない。

## Verification and Handover
作業dir: C:/Users/audih/ws/comfy-create-helper2/frontend。環境変数追加なし。
```powershell
npx vitest run src/utils/__tests__/queryCachePersister.test.ts -t 'REQ-332-T8'
npx vitest run src/utils/__tests__/queryCachePersister.test.ts
npm run typecheck
```
旧T2契約全体とT2/T8 suitesが成功し全Promise settle。T3へ同じcreateIndexedDBPersister APIを渡す。
差分が240行を超えるなら省略実装で収めず再分割相談へ戻す。未確認をPASSにしない。


