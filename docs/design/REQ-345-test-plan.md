---
id: REQ-345-test-plan
pbi_id: REQ-345
status: draft
tags: [generation, availability, history, reload, testing]
related_paths:
  - docs/design/REQ-345.md
  - docs/backlog/pbi/active/REQ-345.md
  - frontend/src/test/e2e_req345_trial_availability.test.tsx
  - frontend/src/test/e2e_req345_residual_history.test.tsx
  - backend/tests/test_residual_history.py
  - backend/tests/test_comfy_proxy_fault.py
local_audit: issues-detected
audit_coverage: revised-assets-not-audited
---

# REQ-345 テスト計画

## Baseline Gates

現在は設計のみ。実装・実装テスト未実行。人間設計承認後に担当者が次の実結果を記録する。ローカル監査は本書末尾の履歴参照。

### Gate 1: Static Checks

rootから `mypy backend`、frontendで `npm run typecheck`。両方exit0。新差分BE service/APIも検証対象。

### Gate 2: Unit and Integration

frontend配下:
~~~powershell
npx vitest run src/services/__tests__/trialImageAvailability.test.ts src/components/__tests__/LazyThumbnail.req345.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.req345.test.tsx src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req345.test.tsx src/test/e2e_req345_trial_availability.test.tsx
npx vitest run src/services/__tests__/residualHistory.test.ts src/api/domains/__tests__/generation.test.ts src/store/__tests__/slices/connectionSlice.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx src/test/e2e_req345_residual_history.test.tsx
npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx src/store/__tests__/slices/jobQueueSlice.test.ts
npm test -- --run
~~~

root配下:
~~~powershell
& backend/.venv/Scripts/python.exe -m pytest backend/tests/test_residual_history.py backend/tests/test_generation_api.py backend/tests/test_comfy_proxy_fault.py backend/tests/test_comfy_proxy.py
git diff --check -- docs/specs/SPEC_GENERATE.md docs/specs/SPEC_COMMON.md docs/specs/SPEC_HISTORY.md docs/openapi.yaml
~~~

REQ-333のerror present/unknown保持、missing除外、retry伝播抑止、Snapshot保護を維持。既存connectionテストの初回full bootstrap期待は新契約へ改訂。jobQueueの明示fetchHistory(200)自体は維持し、reloadで呼ばれないことを別に確認する。予算超過見込みはカード再分割を先行する。

### Gate 3: Browser and Boundary

既存サーバーの実URLを確認し、利用中jobがない時点でComfyUI再起動を行う。API応答切替による模擬と、実機restart/cache-hitを区別する。Networkを保存しreload期間のGET /api/comfy/historyが0、残存POSTはknown/examinedを送信、BEへ全表示分のavailability要求がないことを確認する。BE内部の既存bounded history照会は0と主張しない。

## Acceptance Scenarios

| ID / AC / 担当 | Given / When | Then / 証拠 |
|---|---|---|
| E1 / AC-1 / T5 | A/Bサムネcache成功、initial present後restart相当A404/Bpresentで履歴更新 | A非表示/B保持、サムネerrorなしでも確認、cached onLoadはpresentの根拠にならない |
| E2 / AC-2 / T1,T3,T5 | A missing確定後rerender/B選択/filter/sort/layout/history/retry | A availability/原画要求増分0、両query/store/主・複数選択から除外、present後着でも復活0 |
| E3 / AC-3 / T13 | 復元A消失/Bpresent、BEのみCpresent/Dmissing/Eunknownでreload | restoreとsnapshot後に差分開始、Cだけ追加1、A初期lazy確認後除外、B保持、D/E追加0、反復取得0 |
| E4 / AC-4 / T1,T4,T5 | thumbnail404、API503/通信失敗/timeout/HTTP404/不正本文を個別注入 | existingを保持、unknown自動要求0、manual retry1。同page missingはretryでも0 |
| E5 / AC-5 / T5,T7 | 期限前thumbnail/metadataがあり原画missing | 即時削除0、既存BE memory/disk bytes保持、差分serviceからDB/cache mutation0 |
| E6 / AC-6 / T4,T5,T13 | Snapshot Sとtrial Aが同URL、A missing | Snapshot branch probe0、S画像/params/query深い等価、差分known集合へSを含めない |
| E7 / AC-7 / T9,T13 | B旧host/t、Cがresponse前live到着、F同filename別subfolder/type | B/C重複0、F別行、既存URL/相対順/選択保持。二page追加はBE受信順保持、ascは全体reverse |
| E8 / AC-8 / T7,T10,T11,T13 | 非空persist/snapshot到着順を両順、空baseline、tab/filter有効、StrictMode | barrier前/空baseline POST0、非空baselineで1logical sync（page逐次）、GET full0/置換event0、known/examined BE probe0、再開始0 |
| E9 / AC-9 / T7,T8,T11,T13 | 差分503/timeout/通信例外/不正、null/foreignsession、離脱応答 | existing/選択/params保持、fallback/auto retry0、null/foreignはallのみ、ownはsession一致、late書込0 |

初期確認完了とは「差分同期のcomplete/partial/errorが確定し、初期サムネ読込需要のpendingがsettleした状態」。画面外既存行の全原画存在を事前保証しない。差分unknownは未表示のため追加しないが、existing unknownは保持する。

## Integration and Race Cases

- T7の実API/サービスはfake上流history+Generation service+probeで検証。managed owner優先/legacy fallback/null、latest200 candidate窓、managed/legacyの確定順とidentity重複を確認。
- known/examinedをprobe前に差し引く。1page<=10、active<=2。同cycle二pageで旧identity再probe0、missing/unknownがitemsへ混入0。
- 開始にはquery復元由来の非空canonical baselineが必須。T9のall/ownはquery両variantとstoreのlogical union。viewport/tab/sort/filterはDへ影響しない。不正URLexisting保持/request未送信。
- live C到着、missing M確定、filter変更、両query後着復元をresponse前に注入し最新再比較を確認。residual absenceで既存を削除しない。
- 二page追加ブロックが逆順にならず、既存行同士の順序/URLを維持。200行capacityで新規追加0/既存保持、空きslot分だけ追加。
- T1 adopt present→Gallery observeでprobe0。adopt missing→pending present settle/互換present/onLoadでmissing維持。unknownをpresentへ昇格しない。
- 最後の1件missingはquery=[]/主選択null/複数空/modal close。差分同期自体は選択/modalを書き換えない。
- first/epoch snapshotの過去成功出力は直接追加0。同epochで新成功遷移は既存event/autoFollowを維持。同期中focusでfull GET0。
- 真離脱でabort/世代失効、late書込0。StrictModeの同一turn再接続はdispose/abortを取消してPromise共有。unmount→別page controllerの応答混線0。
- error時の自動fallback0、適用済みpageを保持。manual retryで新cycleを作りunknown再検査可能、missingはknown Mへ送って再検査0。

## Red Team Boundaries

| ケース | 期待結果 |
|---|---|
| 成功サムネのcached bytesと原画404 | cached onLoadよりAPI本文missingを優先 |
| API HTTP404そのもの/503/timeout/HEAD非対応 | 本文missingと混同せずunknownまたは同期error |
| 同filename異type/subfolder、host/t違い | 前者別、後者共通identity、host/tをprobeへ送らない |
| URL破損/filename空/任意host | existing保持/request未送信。API入力不正422、応答identity不一致reject |
| 重複items、itemsにunknown、空page+has_more | decoder reject、既存保持、無限page0 |
| upstream history非2xx/不正JSON/service不在 | BE503、正常空[]へ偽装しない、fallback0 |
| サムネ需要200行中2行、新差分候補3行 | existing probe2以内、新規BE probe3のみ。全200既存probeは禁止 |
| missing後同identity原画再作成 | 同page自動再取得0、真reloadで新controller確認可能 |
| rejected unknown候補がlater response/liveで来る | 同cycleexaminedで再probe0、missingは優先、live表示は既存需要確認経路 |
| Snapshot URL identity衝突 | branch/owner分離、Snapshot query/params/selection保持 |
| candidate増加でhas_more継続 | 最大20page/200検査でpartial、UI手動retry、timer/auto retry0 |

## Evidence and Audit State

CLI exit code、AC別結果、要求数差分、browser screenshot/Network、metadata/Snapshot前後値を記録。T5だけで改訂全AC PASSとはしない。FE spyだけでBE candidate/probe抑止を証明したとは扱わない。

2026-10-12: 旧監査はINCONCLUSIVE。docs/design/REQ-345-audit-retry.jsonでは3 chunks処理後、最終合成が出力token上限で未完了（exit1）。直後のunloadはexit0でロードモデルなしを確認した。初回モデル不在/timeoutの記録も履歴として保存する。

後続の固定model qwen/qwen3.5-9b / Q6_K / reasoning=none / context32768 / timeout600 / --unload-afterによる8対象監査はexit0で最終合成まで完了、判定はISSUES_DETECTED（CRITICAL DEFECTS DETECTED）。unload exit0を確認済み。証跡: docs/design/REQ-345-audit-32k.json / REQ-345-audit-32k.log。exit0は監査実行完了であり設計PASSではない。

本再読込改訂はPBI/設計/テスト計画/13枚Task Card/計画を更新した新revision。32k監査の対象は旧8資産で、新規T7〜T13を含む現revision全体の再監査は未実行。親の重複監査禁止指示に従い同passで追加推論しない。指摘対応は docs/design/REQ-345-audit-response.md に個別記録。実装・実装テスト未着手。全カードはdraft/design_gate=pending、改訂設計の人間承認待ち。
