---
id: REQ-402-test-plan
tags: [preset-tabs, v1, integration, e2e]
related_paths:
  - docs/backlog/pbi/active/REQ-402.md
  - docs/design/REQ-402.md
  - .agents/verification.json
---
# REQ-402 テスト計画

## Collection and Metadata
- V1 baseline。最終candidate freeze後、独立testerがGate1→2→3をfresh実行。設計中はtest未実行。
- Vitest1.6のnative callback `({task})` で `Object.assign(task.meta,{acIds:['REQ-402/AC-7'],layer:'integration',caseId:'waits-for-ack'})` をcase冒頭に設定。installed runnerのTaskBase.meta/TaskContext.taskを確認済み。unsupported decoratorやshared fixture追加なし。
- metadataは実行時。収集selectionは一意title `[REQ-402/AC-n] case-id` とfile/suite/full runner IDで行う。収集時にmetaが埋まると主張しない。multi-AC caseのacIdsに全IDを宣言。
- Playwrightは同じ一意titleと `testInfo.annotations.push({type:'ac',description:'REQ-402/AC-n'},{type:'layer',description:'e2e'},{type:'caseId',description:'...'})`。
- case-idはparameter展開後も一意。fast-checkは単一case plan-properties内でseed/pathをfailure logへ。期待値をproduction plannerから算出せず、A〜E固定例も使う。
- approved selection S / collected C / outcomes E / exclusions Xを保存。S⊆C、S−X全PASS。empty/duplicate/unknown AC/collection error/skip/deselect/xfailを拒否。必須AC skip不可。titleとruntime metaの不一致も不備。

## Placement and Case Matrix
既存ファイル: STORE=`frontend/src/store/__tests__/slices/multiSetSlice.test.ts`、STATE=`frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts`、AUTO=`同hooks/__tests__/usePresetAutoSave.test.ts`、SYNC=`同hooks/__tests__/usePresetStoreSync.test.ts`、DESKTOP=`frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx`、MOBILE=`同components/__tests__/MobileLayout.test.tsx`。
新規INT=`frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` は旧STATE fileのAPI-domain mocksと分離してproduction境界を守るため。新規E2E=`frontend/e2e/generatePresetTabs.spec.ts` は既存Generate E2Eがgallery責務でtab用suiteがないため。ticket名fileなし。

| AC | layer | file / case-id | 独立した期待・検証 |
|---|---|---|---|
| 1 | integration | DESKTOP/MOBILE / context-open-preserves-state | 右click/長押し双方C対象の3項目、active A/open列/入力不変 |
| 2 | unit/integration | STORE/INT / close-others | target A B D E、残C、DELETE0 |
| 3 | unit/e2e | STORE/E2E / close-left-offscreen | target A Bのみ、画面外も含みC D E維持 |
| 4 | unit/e2e | STORE/E2E / close-right-offscreen | target D Eのみ、A B C維持 |
| 5 | unit/integration | STORE/DESKTOP/MOBILE / no-target-disabled | 単独C/左端A/右端E、disabled識別と実行不可 |
| 6 | unit/integration | STORE/INT / retain-active ; activate-trigger | active保持/triggerへ切替、prompt/assets/chips/seed/batch整合 |
| 7 | integration | INT / waits-for-ack ; inactive-dirty ; pending-multi-id | deferred PUT中は全target保持、全ACK後のみclose、異IDpending欠落なし |
| 8 | integration/scenario | INT / save-503 ; save-409 ; disconnect ; partial-save-abort | 全target/draft保持、原因通知、forceなし、失敗snapshotをACK扱いしない |
| 9 | integration/e2e | INT/E2E / reopen-preserves-preset | 管理から再open、保存内容/総数維持、DELETEなし |
| 10 | unit/e2e | STORE/E2E / reload-persists-tabs | reload後open/選択一致、closedの復活なし |
| 11 | integration/e2e | DESKTOP/MOBILE/E2E / cancel-focus | 外側/Escape、状態不変、背景click不発、focus復帰 |
| 12 | integration/e2e | DESKTOP/MOBILE/E2E / gesture-preservation | select/check/singleclose/横scroll維持、move/cancel/controls起点で誤menuなし |
| 13 | integration/e2e | DESKTOP/MOBILE/E2E / tap-menu | ellipsis/keyboardで同3操作、inactiveでもselectせず開く |
| 2,3,4,5,6 | unit | STORE / plan-properties | varying長さ/位置/ID型、trigger不包含/順序/partition/入力不変 |
| 7,8,12 | scenario | INT / edit-during-save ; workflow-switch ; unmount ; open-order-change | 後着ACKのclose0、最新内容維持、新workflowへ漏れない |
| 7,8,12 | integration | AUTO/SYNC/STATE/INT / autosave-preservation | debounce/tab切替/生成前flush/history/clean・dirty poll/再試行/競合3経路維持 |

## Seams, Failure and Preservation
- INTは実hook + QueryClient + 実Zustand。local MSW setupServer/fetch HTTPだけを切る。旧STATEのapi vi.mockは既存維持試験用、新AC保存scenarioの受入証拠にはしない。新INTで内部hook/store/domain API/plannerをmockしない。
- queue試験: 同ID同snapshot重複、同ID後続snapshot、異ID連続flush、先行失敗後の後続保留、409無断forceなし、失敗後pollでdraft保護。
- 保存fault: deferred/503/409/serverlatest/network断、先行ACK→後続失敗。open IDsとlocal contentsとserver writesを別assert。成功済server保存のrollbackを期待しない。
- drift: 保存中のactive/inactive編集、tab追加/並び/active変更、workflow切替/unmount、二重close。Promise完了後の遅延closeなし。
- 維持: timer1000ms、tab切替/生成前flush、newpreset直後の誤保存なし、履歴undo/redo、seed、無効chip、clean remote update/dirty conflict、競合3経路。
- E2Eは実GeneratePage。stateful GET/PUT route fixture、DELETEを失敗/0回assert、WebSocketをrouteWebSocketで切る。実backend/DB/GPU変更なし。内部storeをJS書換えて合格を作らない。
- 実browserで360px touch/767px/768px/1024px/150%相当viewport、端位置portal、sheet scroll、longpress→synthetic click/native contextmenu重複、pointercancel、横scroll、checkbox/close、keyboard/focusを確認。jsdom geometryだけでlayout PASSにしない。

## Exact Local Commands
WORKSPACE_ROOTからPowerShell、PYTHONDONTWRITEBYTECODE=1。これらはTDD/local checksで受入baseline代用ではない。
```powershell
npm.cmd --prefix frontend run typecheck
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/store/__tests__/slices/multiSetSlice.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetAutoSave.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetStoreSync.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/store/__tests__/slices/multiSetSlice.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx -t 'REQ-402/'
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t 'REQ-402/'
backend\.venv\Scripts\python.exe scripts/run_e2e.py generatePresetTabs.spec.ts --grep 'REQ-402/'
```

## Final V1 Commands
profile固定argvを維持し各commandを独立record化。backendを含む固定commandは勝手に省略しない。
```powershell
# Gate1
backend\.venv\Scripts\python.exe -m mypy backend
backend\.venv\Scripts\python.exe -m pytest backend/tests/unit
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils 'src/components/**/__tests__'
backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py
npm.cmd --prefix frontend run typecheck
# Gate2: frontend npm test and backend pytest -n auto, no file/name filters
backend\.venv\Scripts\python.exe scripts/run_full_suite.py
# Gate3 fixed full E2E
backend\.venv\Scripts\python.exe scripts/run_e2e.py
# Gate3 additional normal/failure/preservation scenario
backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx -t 'REQ-402/'
```
- run_e2e.pyがVite5173を起動/終了。使用中portの他processを無断停止しない。環境/browser未導入やprofile不備はINCONCLUSIVE。
- profile読取とwrapper確認のみ実施。正式verification_record/profile validation/fullsuiteは設計中未実行。
- risk unknownなのでV1必須。tracked inputs/argv/environment変更、収集不備、skip、semantic/mock欠陥、flakyはfresh full discoveryへ戻す。
- freeze前にtracked edits/card局所doneを確定し、freeze後はignored docs/logsへ証拠。T3は独立doc-reviewerの意味/矛盾/参照/正常・失敗・維持判定を別途統合。
