---
id: REQ-332-TEST
status: review-pending
tags: [frontend, storage, test-plan, red-team]
related_paths: [docs/design/REQ-332.md, docs/backlog/pbi/active/REQ-332.md]
---

# REQ-332 実行可能テスト計画

## Baseline Gates
以下は実装後の予定コマンド。設計段階の実行PASSではない。
作業dir: C:/Users/audih/ws/comfy-create-helper2/frontend。環境変数追加なし。
Gate 1: `npm run typecheck`。
Gate 2: `npm test`。全体既知失敗はbaselineと新規失敗を区別し記録する。
Gate 3: `npx vitest run src/utils/__tests__/queryCachePersister.test.ts src/test/e2e_req332_recovery.test.tsx`。
Red Team Gate 3はnormal-success試験だけで代替しない。

## Fixtures and Observation
- API保存文字列=2,097,152 UTF-16コード単位、meta30件合計=786,432コード単位。JSON構造/paddingを含む値の長さをassertする。
- 旧cacheは正しい旧PersistedClient JSON。metaは有効な__prompt_surgeon_metadata_v1、異なるprompt ID・timestamp。
- 設定/param入力/batch URL/selected URL/session下書きの固定値を列挙してキー・値を前後で比較する。
- 31個のqueue応答prompt IDは相異、時刻を昇順制御。localメタ保存完了を待ち、最後30件を期待集合として確認。
- モニタ期待量はΣ(key.length + value.length)*2。元APIキーの長さ分も除く。実クォータと混同しない。visibleで次の2.5秒測定を待ち、1 MiB境界・小数1桁を既存formatterに合わせる。
- APIキャッシュの保存完了はpersisterのPromiseとIDBtransaction complete、1秒coalescing flushを待つ。単なるsetQueryData直後を永続完了にしない。
- 期限試験は時刻制御下9分/11分。restoreでproviderのisRestoring解除を待つ。fetch応答はdeferredで保留する。
- UI初回のgetByText/DOM assertionはawait waitForを前置せずレンダー直後。UI callbackのcommit時点とrAFの表示フレームを分けて観測する。

## AC Mapping
| AC | 実行シナリオ / 期待結果 | 主担当 |
|---|---|---|
| 1 | 旧大容量cache→初回移行→API保存。monitorは非APIのUTF-16期待量と単位/丸めまで一致 | T3/T6 + browser |
| 2 | 移行後workflowsのみ4MiB更新。monitor/localStorage全固定値不変、IDBには更新値 | T6 + browser |
| 3 | 独立初期状態から31件queue受付・保存。「生成時メタ情報の保存に失敗しました」0回 | T6 + browser |
| 4 | 3と同じ開始状態から31件生成。最後30件それぞれのrecorded条件をresolver/UIで確認 | T6 + browser |
| 5 | localA/B有効record、server未解決、infoを開いてA→B。切替commit直後はB全文/seed/steps | T5 + browser |
| 6 | B切替〜server未解決中の全観測frameにA値/空仮表示なし。A遅着もB表示を変更しない | T5 + browser |
| 7 | local30件外C、Snapshotなし。server成功後Cのprompt/seed/stepsが表示 | T4/T5 |
| 8 | workflow一覧保存9分後、new clientでrestore、fetch保留。保存値を参照 | T3 + browser |
| 9 | 11分後同手順。期限切れ一覧をhydrate/displayせずfetch待ち | T3 + browser |
| 10 | 初回移行、workflow詳細fetch保留。desktop/mobile Generate Batch非活性 | T6 + browser |
| 11 | IDBread拒否 / write QuotaExceededErrorの独立ケース。fetch成功後単画像実行1回→受付job1件 | T6 + browser |
| 12 | 移行→reload。設定/入力/画像URL/選択ID/保存済みSnapshot.paramsが期待値一致 | T6 + browser |
| 13 | 新しい未保存Studio下書き→同タブ移行/reload。serverより新しい下書きのフォーム一致 | T6 + browser |
| 14 | meta local setItemだけquota失敗、server create成功。queue時recordがgetで一致 | T6 |
| 15 | workflow-presets旧値をqueryへ持たせてもpersistされない。未編集presetは起動時server最新 | T3/T6 |
| 16 | remove旧キー後、新cache保存前にreload。fetch完了後1回生成→job1件 | T6 + browser |
| 17 | API専用IDBだけ削除し非API維持。再起動fetch成功→job1件 | T6 + browser |
| 18 | restore→server更新一覧→保存complete→期限内new client restore。保留応答前は更新値 | T3 + browser |

## Integration and E2E
Vitestは新規factoryをfake-indexeddbへ注入し、provider、QueryClient、store、APIdeferred、storage gaugeを結合する。server createとlocal failureは別mockで独立させる。
T6のStudioはhelperだけでPASSにせず、現行DatasetStudioのフォーム復元既存試験と同じ入口を使う。必要な追加contextをカード内で指定する。
実ブラウザは現行デスクトップChromium系と実モバイル1環境以上（可能ならiOS Safari/WebKitを含む）で通常ACを実施。特定の最低バージョンを今回新規サポート保証として設定しない。
証拠にブラウザ版、origin、real quotaの取得可否、API/backend応答、localStorage保持内容、画面フレーム、IDBtransactionの完了時点を残す。
UIはGenerate / 既存Infoモーダル / Studioを開く。実サーバー・ComfyUIを使ったAC3/4/11/16/17はqueue受付job数で判定し、生成完了時間へ要件を拡張しない。
起動URL/portは当日の環境から取得し、架空URLを固定しない。

## Red Team Boundary and Failure Cases
旧T2の検証契約は分割後も保持する。T2がIDB transaction/validation/merge、T8がqueue/coalescing/Promise順序を担当する。両者は同じqueryCachePersister.test.tsを直列編集し、T8完了時に全suiteを合算実行する。対象ACとbrowser確認は変更しない。
1. IDB未実装、getterSecurityError、open拒否、read拒否、write quota、transaction abort、blocked/open未完了、clear失敗。全Promiseはdeadlineでsettleし、unhandledrejectionなし、serverfetch継続。
2. schemaVersion/ buster不一致、壊れたclientState、timestamp NaN/negative/未来、queryHash/key/state/status不正。hydrateなし、当該cacheだけ廃棄。設定/metadata/draftに書込みなし。
3. 期限切れreadと他タブの新規write競合を2connectionで再現。get→deleteとwriteがtransaction順に直列化され新データを誤消去しない。
4. tabAの旧workflows(dataUpdatedAt低)がtabB新一覧の後にpersist。新一覧が残る。別queryの同時更新はmergeされる。同timestampはincoming優先（同一ms連続更新のAC18も検証）。別タブ同時刻の更新は最終commit優先としてserver再検証で収束する。
5. 同タブ連続persist/remove/persistの順序、coalescing待ちでabort/timeout、遅延open success、versionchange close。待機呼出しが全settle。
6. 2タブ同時初回起動で旧キーremoveを各実行。非API全キーは不変。StrictMode二重初期化も同結果。
7. A→B→Aの高速切替、A応答の遅着、cacheのquery data=null既存状態、local壊れJSON、読取拒否。Bの有効localがある場合はB初回表示。Snapshot.params={}は空の正本をlocalで補完しない。
8. 旧版タブ再書込みは混在版運用の限界として記録し、全タブ更新後の移行再実行で旧キー消失を確認。
9. localmeta容量不足では失敗通知を禁止せず、server記録が正しいことをAC14で確認。通常条件AC3の通知0と混同しない。
10. API専用cache削除とブラウザ全データ削除を別ケースにし、非API消失を移行機能の保証へ追加しない。
11. API更新後coalescingの1秒以内にタブを閉じ、再起動でserver再取得できる。local metadata/draftをAPI未永続と混同しない。大容量restoreが1500msを超える場合は全体hydrateなし→fetch成功を確認する。
12. Date.nowを前進/巻戻りさせexpiry/未来snapshotとquery時刻を検証。TanStack hashKeyと一致しない偽造queryHashを拒否する。function/DOMを含むclone失敗はcache保存だけをskipし、serverfetch/非API値は保持する。

## Regression
`npx vitest run src/test/e2e_req317_storage.test.tsx src/utils/__tests__/promptRecord.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/hooks/__tests__/useBrowserStorageUsage.test.tsx src/pages/DatasetStudioPage/utils/__tests__/studioDraftStorage.test.ts`
Studioフォーム回帰は `npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx`。新しい下書きの復元とフォーム値の一致を確認する。実装でscope増加なら設計レビューへ戻す。

## Audit Evidence and Closure
docs/design/REQ-332-audit.md にモデル・domain・actual answer・cleanupと手動照合を分けて記録する。
spec同期T7、全AC証拠、3-Gate結果、browser-only確認の未実施項目がある場合のINCONCLUSIVEを含め、dev-coordinatorが完了判定する。

