# REQ-344 T3 静的解析報告

解析時点: 2026-10-13 (Asia/Tokyo)。コード版識別: `frontend/src/pages/__tests__/GeneratePage.test.tsx` SHA256 `8026BF5F41348F340C37D5A4976CB1813BE52037619E1913DB245E312FADB80D`。`git status` はfsmonitor IPCエラーで取得できず、対象テストのdiff統計は428行（277 insertions / 151 deletions）。T1/T2の記録情報は親 coordinator から受領。期待された `REQ-344-suite-results.json` と `REQ-344-suite-*.log` は見つからず、実行全体ログは未確認。

## Attempt Evidence

- T1: coordinator提供の証拠では typecheck exit 0、対象テスト13/13 PASS。変更前単独/全体の生ログ、時間、失敗内容は本報告で未観測。対象テストのT1/T2後の差分にはmock初期化・Zustand fixture・storage/QueryClient cleanupの変更がある（`frontend/src/pages/__tests__/GeneratePage.test.tsx:68-214`）。
- T2: typecheck exit 0。Vitestを人手で停止し exit 1、PASS扱いではない。RE​​Q-161 Desktop/Mobileを反復中、`comfy-lora-models` の `No queryFn` 警告で出力が増えたという親提供の証拠。target実行数、経過時間、最後の完了ケース、警告stackは未観測。suite batch未完了、5回結果なし。各未実行回はNOT-RUN。
- 別の全体実行は `setup.ts` の realpath EPERMでcollect不能だったとの親提供情報。生ログ未確認。これはT2の警告原因を説明する証拠ではない。
- trigger: T2局所検証が正常完了せず対象FAIL/未処理例外の有無を判定できないため、Task Cardの切替条件1で静的解析を実施。変更前からの歴史的flaky原因は未確定。

## Lifecycle Matrix

|分類|owner / start|settle / cleanup|case間共有・観測|未確定事項|
|---|---|---|---|---|
|async|`useWorkflowManagement` のworkflow queryは `selectedWorkflowId` があると開始（`useWorkflowManagement.ts:39-43`）。REQ-161はdeferred resolve/reject（test:332-365）。|未解決テストはrender後unmount（test:342-346）。rejectケースはrejectをawait catchしquery errorを確認（test:350-365）。|テスト間で同じAPI mock群をresetし、store fixtureを差し替える（test:152-181）。T2の未解決時にpromiseがsettleしたかは未観測。|停止時点でin-flight queryの数、unmount後完了/例外の有無は不明。|
|timer|autosave hookがeffectで1秒timeoutを作成（`usePresetAutoSave.ts:91-108`）。preset queryは5秒poll（`usePresetState.ts:74-80`）。|effect cleanupはclearTimerを返す。test teardownはcleanup、全timer clear、real timer復帰（test:194-206）。|T2 autosave試験は初期待機後fake timerを使う（test:463-540）。|停止したREQ-161反復でfake timerが有効だったか、poll/query通知との競合は未観測。|
|mock|API factoryは `vi.mock` で定義（test:31-65）。|各caseで `vi.resetAllMocks` 後、API既定値を再設定（test:152-180）。|同じmock module singletonを共有。`lorasApi` mockは `list` だけを持ち `getComfyModels` を定義しない（test:54）。|reset後の全mock実装状態と警告発生時に呼ばれたqueryFnは未観測。|
|store|Zustand実storeをfixture初期値で生成（test:68-134）。|各caseで `setState(freshFixture, true)`（test:181）。`useGeneratePageState` はhook購読を持つ（`useGeneratePageState.ts:18-70`）。|fresh outer fixtureを使う一方、mock関数module自体は共有（test:152-181）。setterは一部immutable更新（test:83,107-128）。|既存のnested value identityが他caseまで漏れた観測はない。全state fieldのfreshnessは未確認。|
|query|workflows queryはkey `['workflow', id]` + queryFn + enabled条件（`useWorkflowManagement.ts:39-43`）。presetsはkey + queryFn + enabled + polling（`usePresetState.ts:74-80`）。|各テスト専用QueryClient、retry false / gcTime Infinity、teardownでcancel/clear（test:186-200）。|同一caseではGeneratePage配下のquery observerがclient/keyを共有する。`comfy-lora-models`を使う3箇所はすべてqueryFnに `lorasApi.getComfyModels` を渡す（`LoraStackEditor.tsx:16-20`; `LoraFormFields.tsx:49-52`; `ProfileBulkEditModal/index.tsx:30-34`）。|mockに同メソッドが無いため、実行時のqueryFn値はundefinedになる見込み。警告ログstack、query cacheの最初のobserver/options、発火契機は未観測。|
|boundary|GeneratePageはDesktop/Mobile layoutをviewportで選択（`GeneratePage.tsx:92-100`）。両layoutのGenerateボタンは `!workflow` でdisabled（`DesktopLayout.tsx:717-718`; `MobileLayout.tsx:827-828`）。|Rescan/Upload等のmodalは条件render（`GeneratePage.tsx:102-110`）。ProfileBulkEditModalはimport境界から入る（同:6）。|T2は両viewportで同一query keyのwarningを報告。`comfy-lora-models`はコード内3箇所（上記）で、1箇所はGeneratePageから直接importされたmodal。|警告がどのcomponent mount/refetchで発生したか、Desktop/Mobile双方で同じ経路か未観測。|

## Causal Paths

- 観測されたコード上の経路: test API factory `lorasApi` は `list` しか定義しない（test:54）。一方、3つのReact Query observerは `queryFn: lorasApi.getComfyModels` を渡す（上記query欄）。従って対象mock下ではこのqueryFn参照がundefinedとなる可能性が高い。同一key `['comfy-lora-models']` を3箇所が使うため、同じcase内でquery observerが共有される可能性もある。
- 親から受領した `No queryFn` 警告は、この欠落と整合するが、生ログのstackや呼出順がないため警告発生箇所・発火操作・Desktop/Mobileの責任境界は確定できない。コード上の一致を実行時根因の証明とはしない。
- T2差分のfixture cleanup/deferred workflow待機/ autosave timer制御（test:152-214, 332-365, 463-540）は、上記API mockの欠落を修正していない。T2で候補辺の遮断が成功したとの証拠はなく、今回の中断に対する原因経路は残存している。
- workflow deferred promise → query settle → button state（`useWorkflowManagement.ts:39-43`; Desktop/Mobile上記）は別経路。ボタンdisabledの設計はworkflow未取得時に維持されるが、T2警告がこのpromise経路に起因する証拠はない。

## Hypotheses

|候補|分類|支持 / 反証|未観測項目・最小の次検証|
|---|---|---|---|
|API mockに `getComfyModels` が無い|強く支持（静的）|test:54とobserver 3箇所のqueryFn指定が一致。親提供の警告keyとも一致。反証なし。|実行時発生は未確定。対象testのmockにこの関数があるか確認し、警告stackまたはqueryFn値を一度記録する。|
|複数observerが同じquery keyを共有|可能性あり・未確定|3箇所すべて `['comfy-lora-models']`。ProfileBulkEditModalは `enabled: isOpen`（`ProfileBulkEditModal/index.tsx:30-34`）。|警告時のobserver数とmount状態がない。component単位のmount記録で確認。|
|cleanup不足によるcase間query/timer/store漏れ|未確定|T2は専用QueryClient、cancel/clear、timer復帰、store再生成を追加（test:152-206）。|T2完走前停止のため隔離成功は未評価。今回警告との因果証拠なし。|
|workflow deferred promiseのsettle/unmount漏れ|未確定|REQ-161 unresolved caseはunmountし、failure caseはrejectを処理（test:332-365）。|中断時のin-flight状態と警告との時間相関なし。|
|autosave debounce/polling timer干渉|未確定|autosave 1000ms、presets poll 5000ms（hook上記）。|REQ-161時にtimer操作をした記録なし。今回warningの原因候補として支持する観測はない。|
|setup/全体suite環境のEPERM|別の実行障害として観測（親報告）|全体suite collectを阻害。|生ログ未確認。`comfy-lora-models`警告との関連を示す証拠なし。|

## Next Decision

T2対象テストはPASSせず、受入用5回バッチも完了していないためT4へ進めない。静的解析で最有力の具体的修正候補は、`frontend/src/pages/__tests__/GeneratePage.test.tsx:54` の `lorasApi` mockに `getComfyModels` のresolved mockを加えること。ただし本T3はコード変更・再実行禁止のため未修正。親はこの候補と `No queryFn` 警告stack/query observer状態の一回限りの記録を改訂Task Cardに含めるか判断し、設計レビューへ返すのが妥当。候補修正後も再現する場合は別原因として、警告時のkey/observer/queryFnを採取してから次の設計判断とする。現証拠だけではCPU競合、歴史的flakyの根因、全体suiteの不安定性は断定できない。
