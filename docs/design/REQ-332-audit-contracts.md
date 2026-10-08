# REQ-332 設計・全7 Task Cardの契約本文監査

Task Cardの全Implementation Requirements、全Verification、対象ファイルと依存、必要型を抽出。重複型と既存source snippet・共通説明だけを省略。原文Card/完全統合入力は隣接ファイルに保存済み。設計レビュー待ちで未実装。


1. App.tsx の persister 生成時、Reactのマウントeffectより前に storage.removeItem('prompt-surgeon-rq-cache') をtry/catch内で同期実行する。getItem/JSON.parseせず巨大な旧API payloadを読み込まない。
2. 削除対象は上記の完全一致キー1件だけ。clear、prefix削除、metadata/draft書換え、migration flagのlocalStorage追加はしない。
3. 同一版の複数タブによるremoveItemは冪等。StrictMode再作成やタブ再起動でも安全。
4. IDB復元が成功ならhydrate、missing/expired/invalid/拒否/timeoutならundefinedで復元完了し、サーバーfetchへ進む。
5. 旧cache削除後に中断しても次回起動は同じ処理で再取得できる。旧localStorageキャッシュへの書戻しはしない。
6. IDBの任意操作は1500ms以内にsettleし、timeout時は可能ならtransaction.abort、接続close、未完了openの遅延successでcloseする。どのPromiseもrejectを呼出し元へ漏らさない。保存失敗は生成受付の前提を変更しない。
7. IDB削除後は次回起動で空DBを作り直す。開いているconnectionへのversionchangeはclose、次の操作で再open。ブラウザ全データ削除で失われた非API状態の復元は本PBIの保証外。
8. localStorageの旧キー削除拒否の場合は起動を継続。容量解消AC-1/3は通常条件に限り、権限拒否中の非API保存成功は保証しない。

## Expiry, Schema and Multi-tab
- TTLは既存と同じ PersistedClient.timestamp からのsnapshot maxAge。各query.state.dataUpdatedAtとstaleTimeは別概念であり改変しない。9分の保存値は応答前に表示、11分はhydrateしない。境界 > 600000 でexpiryとし既存v5実装に合わせる。
- restoreはreadwrite transactionでget→検証→必要時deleteを一体化し、期限切れと判定したあと他タブの新しい書込みをdeleteする競合を防ぐ。
- schemaVersion不一致、buster不一致、不正timestamp（非finite/負/未来）、clientStateやquery shape不正はhydrateせず同一キーをtransaction内で廃棄して再取得。DB/API-cache-v1の将来schema変更は別DB名/busterへ分離する。旧版アプリが将来版のDBを上書きしない。
- 保存はreadwrite transaction内でstoredとincomingのqueriesをqueryHashごとに統合し、dataUpdatedAtが大きい成功データを選ぶ。同値はincomingを優先し、同一ミリ秒内の連続更新も保存する。同時計測の別タブ間は最終commit優先のbest effortとし、server再検証で収束する。expire/invalidなstoredは統合せず置換する。schema/除外filterは保存と復元の双方へ適用。
- 統合snapshot.timestampは両snapshotのmax。timestampをnowで勝手に延長しない。既存同様、snapshot内で部分的に古いqueryは各staleTimeで再検証される。
- DBの生成・同名storeへのtransactionはIDBが直列化する。localStorage/Web Locksの移行ロックは不要。除去removeClientも同じstoreのreadwrite transactionに直列化され、最終commitがキャッシュの状態となる。
- 同一タブのpersist/removeは発生順queueで実行。snapshotは呼出し時structuredCloneをtry/catchで取得。1秒のwrite coalescingで直近pending snapshotを選び、必要ならquery timestampを使ってpending内もmergeする。coalescingのtimerを追加更新で延長し続けない。待機Promiseはすべて成功/失敗/timeoutでsettle。1500msは各IDB操作の期限で、persistには最大1秒のcoalescing待ちが別に加わる。保存完了はflush/transaction completeを待つ。
- restoreはtransaction complete後に検証済みsnapshot全体を返し、providerがhydrateする。timeout時は全体をundefinedとし、部分的なhydrateを行わない。
- タブ間の表示の即時同期・削除イベントbroadcastは新規保証しない。生きている旧版タブが旧localStorageキーを書き直す混在運用は防げないため、更新時は全タブ再読込で確認する。

## Synchronous Metadata
frontend/src/utils/promptRecord.ts に readLocalRecordedMetadata(promptId: string | null): ResolvedMetadata | null を追加。既存local read/validationを再利用し、純粋に同期で返す。新しい保持枠やメモリ無期限mapは作らない。
resolverの既存signatureと順位を維持する。妥当なversion1生成記録はlocal優先、legacy/corrupt/missingはserver参照、server prompt_id一致検証、例外はlocalへ戻す。
HistoryModalPreview でactive promptIdから毎レンダー同期読取し、未保存画像のeffective metadataを有効なlocal record優先→当該promptIdのquery結果とする。initialDataのみでは既存query(null)があると同期表示を保証できないため、render中の直接読取を表示優先に採用する。
queryFnはlegacy/欠落のserver取得用に維持。queryKeyはpromptIdごと、keepPreviousData/placeholderDataで前画像を引き継がない。遅着A結果はA-keyのみでBに混入しない。
Snapshot IDがあるときはsnapshot.paramsを常に正本にする。local readによる上書きをしない。記録がない値を現在入力やworkflowから補完しない。
timestampのfiniteに加えDate.toISOString可能な範囲を既存例外境界で検証する。生成recordにprompt_idが存在する場合は参照キーのpromptIdとの一致も確認し、不一致を有効localとして表示しない。

## Dependencies and Task Atomicity
| Task | 依存 | 変更ファイル数 | 差分上限目安 | 内容 |
|---|---|---:|---:|---|
| T1 | なし | 2 | 50 | fake-indexeddb test dependency + lockfile |
| T2 | T1 | 2 | 300 | native IDB Persister + parameterized tests |
| T3 | T2 | 2 | 240 | App provider移行 + restore integration |
| T4 | なし | 2 | 160 | 同期メタ情報reader + unit |
| T5 | T4 | 2 | 180 | プレビュー初回同期表示 + UI |
| T6 | T3,T5 | 2 | 280 | 大容量連続生成/保護回帰 + storage recovery、3-Gate |
| T7 | なし | 3 | 180 | SPEC_COMMON/GENERATE/HISTORY改訂 |

最大4層=T1→T2→T3→T6。T4→T5とT7は独立。全Card<=300行。見積もり上限を超えた実装はカードの境界を再分割して設計レビューへ戻し、無断で膨らませない。
上流: provider/TanStackの型、LS_KEYS、promptRecord。下流: workflow query/生成ガード、batch queue/server metadata、history preview、storage gauge、Studio reload。


# REQ-332-T1: IDB単体試験用依存を固定

Ownership
- frontend/package.json
- frontend/package-lock.json
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
// Test only: import { IDBFactory } from 'fake-indexeddb'
// Each test gets new IDBFactory(); do not overwrite production dependencies.
## Implementation Requirements
- [ ] fake-indexeddb をdevDependenciesへ追加しlockfileに固定する。production dependencyや既存TanStack版を変更しない。
- [ ] インストールは実装開始後に npm install --save-dev fake-indexeddb を frontend で実行。添付HTMLのnpmコマンドは実行しない。
- [ ] module-local test factoryを使うためvite config/test setupは変更不要。

Verification
PowerShell:

npm ls fake-indexeddb
npm run typecheck
```
判定: dependency解決、lockfile一致、既存型定義への影響がないこと。

# REQ-332-T2: 例外安全なIndexedDB Persisterを実装

Ownership
- frontend/src/utils/queryCachePersister.ts
- frontend/src/utils/__tests__/queryCachePersister.test.ts
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
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
// Native DB: prompt-surgeon-api-cache-v1 / version 1 / client / prompt-surgeon-rq-cache
// Envelope: { schemaVersion: 1, client: PersistedClient }
// Defaults: timeoutMs=1500, write coalescing=1000ms
## Implementation Requirements
- [ ] createIndexedDBPersister は同期で旧localStorage完全一致キーをremoveItem（取得含めcatch内）。metadata/session/別キーを触らない。
- [ ] Native IndexedDBの上記DB/storeにstructured cloneのenvelopeを保存。factory/open/property access/upgrade/transactionのerrorを捕捉。
- [ ] 復元は同一readwrite transaction内でget/validation/期限切れdelete。finite nonnegative timestamp<=now、buster/schema/queries/state shapesを検証しinvalidはundefined。除外queryはhydrateしない。
- [ ] 成功queryのみ。comfy-object-info, snapshots, workflow-presets, prompt-metadataを除外しmutations=[]。
- [ ] 保存transaction内でstored/incomingをqueryHash統合しstate.dataUpdatedAt大の値を残す。同値はincoming（同一ms連続更新も保存）。stored expired/invalidなら置換。timestamp=max(stored,incoming)、nowへ延長しない。
- [ ] timeout既定1500ms。abort/close、遅延open successもclose。versionchange時closeし次回reopen。promise reject/永遠待ちを出さない。
- [ ] 同タブのpersist/removeは発生順queue。snapshotの呼出時clone、1秒coalescing、全待機Promiseをsettle。remove前のpending persistをflushまたはcancelして、古いwriteをremove後に再適用しない。
- [ ] timerを追加更新で延長し続けない。1500msはIDB操作期限、coalescing待ちは別。restore timeoutはundefined全体で返し、部分hydrateしない。transaction complete後にのみrestore値を返す。
- [ ] fake-indexeddb新factoryを各caseに注入、2connectionsとfailure/deferred factoryを使う。使用禁止global indexedDB getterでも動く。
- [ ] 差分300行上限を超える場合は手続き省略で収めず、storage transaction層とPersister層に再分割して設計へ戻す。

Verification
PowerShell:

npx vitest run src/utils/__tests__/queryCachePersister.test.ts
npm run typecheck
```
判定: 正常保存復元、TTL9/11分、schema/JSON形状、Quota/Security/abort/blocked/timeout、2tab stale overwrite、expired-delete race、persist/remove順、全Promise settle。

# REQ-332-T3: Appの永続化をIDBへ接続

Ownership
- frontend/src/App.tsx
- frontend/src/__tests__/App.persistence.test.tsx
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
// createIndexedDBPersister contract = T2 exact interface
import { defaultShouldDehydrateQuery } from '@tanstack/react-query'
// PersistQueryClientProvider persistOptions: {persister, maxAge, buster, dehydrateOptions}
// dehydrateOptions: shouldDehydrateQuery, shouldDehydrateMutation
## Implementation Requirements
- [ ] createSyncStoragePersisterの生成/使用をcreateIndexedDBPersisterへ置換し、buster/API_CACHE_MAX_AGEを接続。
- [ ] gcTime=600000、retry=1、default staleTime=30000と独自staleTimeを保持。
- [ ] shouldDehydrateQueryはdefaultShouldDehydrateQueryと除外listをANDする。prompt-metadata追加除外、mutation persist無効。旧cache除去はfactory内でReact/store初期化より前。
- [ ] Appテストでは重いpageをmockしProvider/client cacheと実Persisterでhydrate/subscribeを結合する。APIdataUpdate完了→persist complete→new client restoreを確認。
- [ ] workflow-presets/動的ノード/snapshot一覧/failed queriesが保存・復元されない、静的refresh既存契約が壊れないことを確認。
- [ ] 保存失敗やrestore timeoutでserver queryが実行でき、旧localStorage persisterへ戻らない。

Verification
PowerShell:

npx vitest run src/__tests__/App.persistence.test.tsx src/utils/__tests__/queryCachePersister.test.ts
npm run typecheck
```
判定: AC8/9/18、更新後snapshot復元、10分maxAge、provider isRestoring解除、除外と成功条件、migration旧キーのみ削除。

# REQ-332-T4: 生成記録の同期local readerを抽出

Ownership
- frontend/src/utils/promptRecord.ts
- frontend/src/utils/__tests__/promptRecord.test.ts
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
import type { AppliedAsset } from '../store/types'
export interface ResolvedMetadata {
  paramValues: Record<string, unknown>; appliedAssets: Record<string, AppliedAsset[]>; workflowId: number | null
  queuedAt: string | null; metadataSavedAt: string | null
}
export function readLocalRecordedMetadata(promptId: string | null): ResolvedMetadata | null
export function resolveRecordedMetadata(promptId: string | null): Promise<ResolvedMetadata | null>
## Implementation Requirements
- [ ] 既存localStorage read/JSONparse/resolved/parseRecord判定を readLocalRecordedMetadata に抽出。妥当なversion1生成recordだけ返し、legacy/corrupt/missing/getter拒否はnull。
- [ ] resolveRecordedMetadataのsignature、妥当local優先/server fallback、server prompt_id一致、legacy localへの最後のfallbackを維持。legacyfallback用local解析は既存private helperと共有しvalidationを二重独自実装しない。
- [ ] timestampのNaN/巨大finite/invalid Dateはcatchし、記録・ID混同を起こさない。
- [ ] version1 recordのprompt_idが存在する場合はpromptId一致を確認。不一致は同期readerから返さずserver参照へ進む。未記録prompt_idに現在IDを補完しない。
- [ ] readerは同期return。APIを呼ばずメモリcache/保持件数を増やさない。Snapshot.paramsはこのreaderの対象にしない。

Verification
PowerShell:

npx vitest run src/utils/__tests__/promptRecord.test.ts
npm run typecheck
```
判定: 同期returnがPromiseでない、正しいpromptId、false/0/空/null維持、server呼出なし、legacyserver優先、不正日付/拒否/異なるserverIDの回帰。

# REQ-332-T5: 画像切替の初回レンダーを記録値で表示

Ownership
- frontend/src/components/HistoryModalPreview.tsx
- frontend/src/components/__tests__/HistoryModalPreview.test.tsx
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
import type { AppliedAsset } from '../store/types'
export interface ResolvedMetadata {
  paramValues: Record<string, unknown>; appliedAssets: Record<string, AppliedAsset[]>; workflowId: number | null
  queuedAt: string | null; metadataSavedAt: string | null
}
export function readLocalRecordedMetadata(promptId: string | null): ResolvedMetadata | null
export function resolveRecordedMetadata(promptId: string | null): Promise<ResolvedMetadata | null>
// Props (existing): isOpen:boolean; images:string[]; currentIndex:number;
// onChangeIndex:(index:number)=>void; snapshotIds?:(number|null)[]
// query key: ['prompt-metadata', promptId]
// Snapshot.params: Record<string, unknown> remains authoritative.
## Implementation Requirements
- [ ] activeImageから計算済みpromptIdを用いrender毎に同期reader呼出。Snapshotなしで有効localrecordをquery結果より優先表示。initialDataだけに依存しない。
- [ ] snapshotIdありはsnapshot.paramsを正本にし、空objectもlocalで補完しない。
- [ ] async queryFnとID別queryKeyを維持。placeholderData/keepPreviousDataで旧画像値を渡さない。server欠落fallbackは現行resolver。
- [ ] A/Bの別条件、B-keyにnull queryが先在、server保留でも切替直後にB表示。await waitFor前の同期assertで確認。A遅着をresolveしてもB不変。
- [ ] UI操作のInfo/Show info/既存編集ロック・Snapshot関連保存・表示空値回帰を維持。

Verification
PowerShell:

npx vitest run src/components/__tests__/HistoryModalPreview.test.tsx src/utils/__tests__/promptRecord.test.ts
npm run typecheck
```
判定: AC5/6/7、B初回prompt/seed/steps、A遅着、Snapshot空params、corrupt/missing→server、現在入力補完なし。

# REQ-332-T6: 容量・復旧・非API保護の結合試験と3-Gate

Ownership
- frontend/src/test/e2e_req332_storage.test.tsx
- frontend/src/test/e2e_req332_recovery.test.tsx
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
// createIndexedDBPersister contract = T2 exact interface
import type { AppliedAsset, QueuePromptOptions } from '../store/types'
import type { Workflow } from '../api/types'
import type { CaptureAssetInput, GenerationRecord } from '../utils/generationRecord'
queuePrompt: (
  workflow: Record<string, unknown>,
  metadata?: {
    paramValues?: Record<string, string>
    appliedAssets?: Record<string, AppliedAsset[]>
    workflowId?: number
  },
  options?: QueuePromptOptions
) => Promise<string | null>
export function buildGenerationRecord(
 workflow: Workflow, injectedGraph: Record<string, unknown>,
 submittedGraph: Record<string, unknown>, assets: Record<string, CaptureAssetInput[]>
): GenerationRecord
// CaptureAssetInput = AppliedAsset & { triggerSetId?: number|null; triggerSetName?: string|null }
// useBrowserStorageUsage(): BrowserStorageUsage; visible measurement interval=2500ms
## Implementation Requirements
- [ ] AC1-4/10-17の独立fixtureをtest plan通り作成。大容量値の長さ、30件合計、timestamp/IDsの相異、31queue成功をassert。
- [ ] API永続保存をawaitしてからmonitor測定cycle、UTF16量・既存formatterを確認。全local/sessionキーの非API保護をbefore/after一致で検証。
- [ ] meta setItemだけ失敗させserver.create成功→server.getの投入記録一致。IDB失敗とは別ケース。
- [ ] workflow未読込のdesktop/mobile投入非活性は既存buttonガードを結合で確認。API取得成功後のjobはqueue受付1件で数える。
- [ ] Studioは MatrixGenerationStep の既存新しいdraft→フォーム復元シナリオを移行前後で結合。session helperだけの一致はAC13の代替PASSにしない。
- [ ] 関連contextはfrontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx の508-541行と前掲snippet。必要なら同testのsetup/型をカードへ局所追記し、他実装ソースを変更しない。
- [ ] 中断後再起動/IDB専用cacheclear、read拒否/writequota後サーバー取得、更新値再restoreを実装依存のfake-indexeddbで確認。
- [ ] 命名e2eでもVitest結合試験。実ブラウザAC全件とframe/quota/multi-tab検証はtest planに従い別証拠で判定。未実施はINCONCLUSIVE。
- [ ] Gate1/2/3、既存regressionを実行し結果をcoordinatorへ返す。このCardはapplication sourceの修正を所有しない。

Verification
PowerShell:

npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx src/test/e2e_req317_storage.test.tsx src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx
npm run typecheck
npm test
```
判定: AC1-4/10-17、Red Team、31通知0、last30記録、非API値保持、Studioフォーム復元、servermetadata記録、cache削除再起動。

# REQ-332-T7: API cacheと同期metadataの正本同期

Ownership
- docs/specs/SPEC_COMMON.md
- docs/specs/SPEC_GENERATE.md
- docs/specs/SPEC_HISTORY.md
Atomicity PASS: files<=3 / diff<=300 / Card<=300


Types:
// Documentation contract only: maxAge=600000, local metadata limit=30,
// server metadata limit=1000, studio draft/session semantics unchanged.
## Implementation Requirements
- [ ] SPEC_COMMON 6のlocalStorage APIcache記述を専用IDB/schema/buster/旧キー削除/例外fallbackへ変更。
- [ ] 既存3除外にprompt-metadata追加、成功query・mutation除外、10分snapshot TTLとquery staleTime再検証の別概念を記録。
- [ ] SPEC_GENERATEとSPEC_HISTORYに同期local readerによる初回表示、server fallback、Snapshot.params優先の契約を局所追記。
- [ ] localメタ情報30件、server1000件、モニタ対象、Studio下書き同期/競合を維持。旧archive PBIは編集しない。
- [ ] 他taskと独立に案を準備できるが、実装結果を照合した後に正本の現行仕様として確定。実装済みと未検証を混同しない。
- [ ] テストコード追加不要。doc links、版・更新日、関連設計/対象source pathを更新。3ファイル以内。

Verification
PowerShell:

rg -n 'IndexedDB|prompt-metadata|600000|10分|30件|1000件|同期' ../docs/specs/SPEC_COMMON.md ../docs/specs/SPEC_GENERATE.md ../docs/specs/SPEC_HISTORY.md
```
判定: 設計/T3/T5最終実装との照合、リンクと保持境界、容量無制限/0ms等の一般保証を書かない。



