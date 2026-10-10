---
title: REQ-333 統合・E2E・Red Team検証計画
status: approved
tags: [REQ-333, test-plan, integration, e2e, red-team]
related_paths:
  - docs/design/REQ-333.md
  - docs/backlog/pbi/archive/REQ-333.md
  - backend/tests/test_ws.py
  - backend/tests/test_comfy_proxy.py
  - frontend/src/store/__tests__/slices/jobQueueSlice.test.ts
---

# REQ-333 Test Plan

この文書は試験計画。設計工程では試験を実行していない。PASS/FAIL/INCONCLUSIVEは実装後に実出力とともに記録する。mock試験と実PC/スマホ試験は別の証拠とする。

## Fixtures and Boundary

信頼済みLANのPC上で8000本体、8899Manager、8188ComfyUIを稼働。スマホはPCのIPv4で8000へ接続。PCホスト8899で非常復旧を事前確認。受付UUID、job/prompt ID、凍結graph、実使用seed、workflow、1024×1536画像を記録する。S-PC/S-PHONE、normal group N1、Studio A20件/B10件、別projectを用意する。

単体/統合は専用SQLite一時DB、mock upstream HTTP/WS/clock/Manager/subprocessを使用し、実サービスを停止しない。既存conftestのDB pool leakとdependency_overrides cleanupを維持する。SYSTEM_STATSはmockしハードウェア性能を合否にしない。browser断試験ではBE/ComfyUIを稼働維持する。終了時は通信遮断・停止・フィルタを復元する。

## Acceptance Mapping

| AC | シナリオ / 実施層 | 観測証拠・期待結果 |
|---|---|---|
| 01 | E01 Settings system / FE+E2E | 5tabのsystem内に操作/ログ、VRAM・表示カード保持 |
| 02 | E02 Comfy start / Manager+E2E | CONNECTING→status再取得でrunning。成功応答だけでrunningにしない |
| 03 | E03 Comfy stop / Manager+E2E | 対象停止確認、STOPPED |
| 04 | E04 Comfy restart / Manager+E2E | 同サービス復帰、HTTP正常 |
| 05 | E05 Backend restart / E2E | 8899要求→8000再表示後running。job完全復元を合否へ追加しない |
| 06 | E06 8000停止時のPC8899 / E2E | 既存埋込みHTMLから本体起動、8000アクセス復帰 |
| 07 | E07 各管理ログ / mock+E2E | backend/comfy/frontend/manager各識別行。tail既存上限 |
| 08 | S01 総合5label / fake clock+E2E | PBI状態表通り。STUCKは連続HTTP失敗30秒超 |
| 09 | S02 開発FEだけ停止/開始 / FE+E2E | 配布版READYを維持 |
| 10 | E08 スマホ8188遮断 / E2E | Networkは8000生成HTTP/WS/image、生成完了 |
| 11 | E09 受理後全browser閉鎖 / 統合+E2E | BE継続、同promptと凍結paramの履歴1件、保存記録 |
| 12 | R01 切断中queued→running→terminal / 統合+E2E | snapshot完了時に実状態、一job一行 |
| 13 | E10 実行中スマホ参加 / 統合+E2E | pairingなし、同job/node進捗/queue残数 |
| 14 | E11 PC完了後スマホ同期 / E2E | 同prompt thumbnail、一覽に原画bytesなし |
| 15 | F01 スマホ自session ON / selector+E2E | スマホIDだけ。PCフィルタに影響なし |
| 16 | F02 OFF / selector+E2E | 全session復帰、重複なし |
| 17 | P01 normal3/8・Studio12/20 / selector+統合 | 両端末一致、scope母数を混ぜない |
| 18 | W01 normal未終了、Studio残8 / selector+E2E | ON/OFFでStudio待機8 |
| 19 | W02 Studio未終了、normal残2 / selector+E2E | 通常生成待機2 |
| 20 | W03 ON同scope他session残2 / selector+E2E | 他session待機2。自jobなしなら待機なし |
| 21 | W04 OFF同scope他session / selector+E2E | 他session待機なし、共通進捗 |
| 22 | P02 Studio A12/20・B2/10 / BE+FE統合 | batch別、14/30なし。同projectも別batch |
| 23 | P03 normal2段バー / FE+E2E | F/N、node名/率、elapsed/estimate。参加時刻から計時しない |
| 24 | I01 一覧/マトリクス画像 / HTTP+E2E | thumbnail実pixel寸法<1024×1536、既存aspect設定保持 |
| 25 | I02 main/拡大 / HTTP+E2E | 1024×1536原画、同MIME、再encodeなし |
| 26 | I03 原画404 / HTTP+FE+E2E | 試行表示除外、Snapshot保持、thumbnail/metadata即削除なし |
| 27 | P04 normal3/8→pending1取消 / BE+selector | 確認後3/7、再取消も3/7、取消失敗なら3/8 |
| 28 | P05 normal取消なしで次job失敗 / FE+E2E | job失敗トースト1件、成功と表記しない |
| 29 | P05 同fixture / BE+selector | 4/8。別途取消後失敗なら4/7 |
| 30 | P06 Studio12/20で次job失敗 / FE+E2E | 対象batch/job失敗トースト |
| 31 | P06 同fixture / BE+selector | A13/20、Bは変化なし |
| 32 | W05 自対象running開始 / selector+E2E | 他scope/他session待機が消える |
| 33 | M01 正規Origin host/port / Manager+browser | localhost/127/192.168/10、有効5173/8000で読める。ACAO/Vary証拠 |
| 34 | M02 外部Origin/8080 / Manager+browser | browserで読めない。statusだけをCORS判定にしない |
| 35 | D01 人間レビュー / 文書 | 設計C1..C13の参照/現行/差分/更新案 |
| 36 | FC15–FC19 一括scope選択 / BE+FE+E2E | default global維持、normal全session共有、Studio/unknown保護、skipped理由と非完了表示 |

## Integration Scenarios

IG1: batch受付commit→VRAM待機→upstream prompt ID→metadata保存→running→outputs/terminal commit→WS→PC/スマホ。凍結graph/実seedが同じIDに対応する。受付後の入力変更は記録に反映しない。

IG2: BE watcherは全browser閉鎖後も生存。切断中のqueued/running/terminalを復帰snapshotで全置換する。queue空だけで完了にしない。終了event欠落後のhistory照合も確認する。

IG3: subscriber登録からsnapshot送信までにeventを挿入。HTTP snapshotを遅らせ、HTTP/WS応答逆順も試す。terminal→queuedの巻戻りなし。SYSTEM_STATSをsnapshot前/間/後へ挿入し、旧test_wsの「最初のframeが必ずstats」仮定を更新する。

IG4: Managerのみ停止。総合OFFLINE、生成/queue/image可、管理/log不可。8899復帰時に再取得。生成の管理経路依存を検出する。

IG5: normal/Studio/別session/別batch混在で単発取消、キューのみ全取消、実行中・キュー全取消を別fixtureで実施する。単発queuedは指定promptだけ削除、単発runningは直前照合後prompt_id hint付きinterruptを使用する。hint非対応上流との競合に原子的保証を主張しない。キューのみ全取消はglobal queue clearでrunningを継続し、実行中・キュー全取消はglobal clear→IDなしglobal interruptの順を維持する。自sessionフィルタON/OFFで全取消の対象を狭めない。BE受理済み・未投入jobも対象に含め、取消後worker投入を防ぐ。待機削除ではinterrupted履歴を捏造せず、操作前pending・正常ACK・正常な操作後queueの双方から消失・正常historyで先行終端なしを組み合わせて確認する。ACKだけ/不在だけ/照会失敗/running競合は未確認。空allは正常な操作前後queueとclear/interrupt ACKで対象なしを確認する。単発running事前照合の不一致は409/interrupt送信なし。照合後の上流進行競合にはID指定の原子的取消保証がなく、取消未確認を表示し確定前に母数を減らさない。

IG6: relative新view/旧8188絶対URLでSnapshot保存。上流path=/view、tはmetadata照会へ残る。空/false/0を含むparams保持。試行metadata整理後もSnapshot画像/params保持。一括保存部分失敗、album/関連編集、Studio draft競合を回帰する。

IG7: 同一fixtureにnormal(session A/B)、Studio、scope不明legacy、BE未投入normalを置く。scope省略/明示allは既存globalを維持。normal queuedはDBで対応付けたnormal pending IDだけdelete、BE未投入を取消しfilter ON/OFFで同じ集合。normal allはその削除後の最新queueにStudio/unknown running/pendingがあればinterrupt0回、通常runningと保護jobを保持、skipped理由を表示しModalを全取消完了として閉じない。StudioがBE未投入だけの場合はlockでdispatchを止め、known-normal queueでのみrunning interruptを試行できる。外部投入/上流遅延との非原子的競合は未確認へ分離する。

## Red Team / Gate 3

| ケース | 制御入力 | 期待する境界 |
|---|---|---|
| RT01 | duplicate/out-of-order revision、epoch変更 | 重複加算なし、欠番/変更で全同期 |
| RT02 | snapshot途中切断/壊れたJSON/未知type | 部分commitなし、再同期中。stats購読維持 |
| RT03 | 同request ID同body/異body | 同job集合/409、上流送信増加なし |
| RT04 | 202応答喪失/上流POST timeout後受理 | request照会、unconfirmed通知、自動POST再送なし |
| RT05 | 受付/terminal DB commit失敗 | 202なし/保存失敗通知、成功event先行なし |
| RT06 | BE再起動/上流履歴消失 | 保存ID照合可能範囲のみ、未知は未確認、自動再実行なし。AC-11証拠へ流用しない |
| RT07 | 取消/failed/全取消N=0/running50% | 3/7、4/8、idle。3完了+1running50%は枚数3/8とfraction43.75%を区別 |
| RT08 | 単発cancel事前照合不一致/照合後running入替/取消再送 | 事前不一致409でinterruptなし。照合後競合は原子的対象保証を主張せず未確認を通知。scope allはglobal、normalは保護barrier条件、確定取消だけ一度母数変更 |
| RT09 | thumbnail 404/502/timeout/cache hit、原画present/missing/unknown | サムネエラーだけでは除外しない。原画確認missingだけ試行表示除外、present/unknownは保持、orphan即unlinkなし |
| RT10 | filename/subfolder encode、任意host、巨大画像 | 上流host固定、既存validation、原画/縮小経路分離 |
| RT11 | 外部/8080/192.168.999.1/10.example.org/null Origin | 拒否、8899同origin HTML維持 |
| RT12 | 遅いWS reader/heartbeat停止、同一ws重複connect/二重disconnect | workerを待たせず最新状態を保持、例外/既存timeoutでdead解放、25秒ping/30秒timeout整合、重複登録なし。新しい100+接続SLOは設定しない |
| RT13 | localStorage拒否/ID削除/旧URL/空snapshot | タブ内IDfallback、全端末で回復、古い履歴復活なし |
| RT14 | TCP LISTENだがHTTP失敗30秒境界 | >30秒STUCK、ちょうど30秒は未超過、成功でreset。進捗無変化だけではSTUCKなし |
| RT15 | 終端1001件/active/metadata30/1000整理 | 既存上限連動、active追跡、Snapshotを削除しない |
| RT16 | Studio別batch/project切替/draft競合 | progressのみ同期、フォーム上書きなし、750ms/復元維持 |

## Exact Commands and Evidence

### Focused Contract Regression

| ケース | 制御と観測 | 対象カード |
|---|---|---|
| FC01 未知version | version2 frame/HTTP responseを繰返す。同epochの自動GETは最大1回、非対応表示、旧valid state/SYSTEM_STATS保持、自動reload/reconnect/refetch loopなし | T2/T10/T15 |
| FC02 commit後snapshot失敗 | batch commit成功後のsnapshot readを例外にする。POSTはcommitted IDsで202、GET stateは503、独立したrequest/batch記録lookupに同じIDs、再POST/rollback/上流重複投入なし。lookup 404は未受付証明にしない | T4/T10/T15/T28 |
| FC03 commit前DB失敗 | batch transactionに失敗。全件rollback、202なし、受理job/workerなし。既存jobを消さない | T4/T10 |
| FC04 公開DTO一致 | Python BatchAccepted/StateSnapshot/RequestLookup/CancelResult/ErrorEnvelopeをJSON化し、T8 decoderで同一項目/null/enumとして受信。409/422/503/404とpreview bytes/availability配列を検査 | T2/T8/T10/T28 |
| FC05 T15/T24互換 | server状態から旧progress等を導出したstoreをhook adapterが読む。旧typed vi.mockでも局所動作、新8188socket/別状態正本なし | T15/T24/T28 |
| FC06 T29 props副作用 | mount/read-only URL/closeで旧setLocalComfyUrlとsetComfyUrlは0回。closeのsetIsSettingsOpen(false)、workflow/default params/reset/model callbackは既存通り。config未取得で旧URLを正本表示しない | T29/T28 |
| FC07 正本差分確認 | T27指定のSettings§3/§5、Studio§2保持＋Step1生成節、Manager§2.2/アクセスURLをC2/C3/C7と逐語比較。実施試験の記載はwalkthrough command/exit/AC/Network証拠へ対応付ける | T27 |
| FC08 0母数UI | PC/Mobileの全取消renderがidle/0、NaN/Infinityなし。枚数F/Nとrunning fractionを別assert | T9/T20/T28 |
| FC09 取消3操作互換 | JobManagementModalから3操作を呼び、queued単発delete指定ID、running単発interrupt、キューのみglobal clear、実行中を含むglobal clear→interruptを記録。running単発および全取消の既存history整理を維持し、保存Snapshotは保持。フィルタON/OFF、normal/Studio/別session混在で対象範囲が現行と同じ | T5/T6/T10/T12/T30/T28 |
| FC10 受理済み取消と競合 | 操作cutoffの前後に新規受付を挿入しD7の対象集合と結果を照合。未投入/投入中/queued/running/unconfirmedを別々に制御し、確定取消の再投入なし。clear成功・interrupt失敗など部分失敗はjob別結果を返し、未確認jobの母数を楽観削減しない。再要求/重複eventで二重削減なし | T5/T6/T10/T12/T28 |
| FC11 旧jobとStudio取消 | BE UUIDを持たない既存promptも3操作対象となり、架空UUIDやscopeを付与しない。normal確定取消は母数再計算、Studioはbatch別停止終端を表示し別batchと合算しない。取消を失敗トーストや成功枚数に算入せず、新たなStep遷移なし | T6/T8/T16/T18/T21/T30/T28 |
| FC12 サムネ既存再生成 | L1/L2両miss・L2ゼロbyte・読込失敗で既存L3原画取得とWebP再生成を確認。原画bytes・既存画質/サイズ/保存上限を維持。既存test_get_comfy_thumbnail_disk_cache_corrupt_recoveryを証拠に含める | T12/T28 |
| FC13 サムネ失敗と原画有無 | サムネ取得/再生成失敗時、filename/subfolder/typeで原画availabilityを照会。原画presentまたはunknownなら行/選択/拡大導線を保持し再試行可能表示。確定missingだけ試行行/表示cache/選択から除外。Snapshotと付随ファイルを即削除せず、一覧へ原画全体を自動読み込みしない | T12/T31/T28 |
| FC14 availability境界と再試行 | BE job UUIDなしの旧履歴でも照会できる。原画200=present、確定404=missing、502/503/timeoutおよび照会失敗=unknown。HEAD非対応時の既存GET経路fallbackを確認。同一画像の照会を共有し、エラーによる自動probe/retry loopを作らない。明示再試行または画像変更で再確認可能 | T12/T31/T28 |

| FC15 scope選択/旧互換 | Modal初期scope allで既存global clear→interrupt。normalを選ぶとmodeとは独立のscopeを送信し全session normal対象。filter ON/OFFで同じmembership。単件は選択IDだけでscope chooserの影響なし。未知scopeとsingle+normalは422 | T2/T8/T16/T30/T28 |
| FC16 normal queued識別 | mixed upper pendingのknown-normal ID群のみdelete:[IDs]、clear:trueは0回。DB scope/prompt対応を持たないlegacy・Studioを保持、BE未投入normalを取消commitしてworker再投入なし。client ID推測でscopeを補わない | T5/T6/T10/T16/T28 |
| FC17 normal all保護barrier | Studio running、Studio pending、unknown running、unknown pending、照合503を各fixtureで投入。normal待機取消は成功分反映、interrupt0回、normal running保持、upstream_interrupt=skipped/message。all-cancel完了/onClose/Studio Step遷移なし。queued modeでも同じ待機取消は可能 | T5/T6/T10/T18/T30/T28 |
| FC18 known-normal running試行 | upper queueがknown normalのみ/対象running一致/BE lockを保持し指定normal待機削除→再queue→interrupt。保護対象が再queueで増えれば送信0。直前不一致は送信0。外部TOCTOU/timeout時は原子的Studio保護成功と称さずunconfirmed、自動再mutation/母数減算なし | T5/T6/T10/T30/T28 |
| FC19 scoped結果と集計 | normal bulkの部分成功/failed/unconfirmed/skippedを別返却、確定cancelだけNを減らし失敗toastなし。非対象Studio progress/running/batch/Stepを維持。scopeとmessage/action skippedをPython→TS parityで検査。既定globalでStudio停止に達した場合の既存FC11は維持 | T2/T8/T15/T16/T18/T30/T28 |
| FC20 VRAM wait取消の互換 | 低VRAMでも先にbatch受付。明示abortは同request IDsへonly_unsubmitted=trueだけを送り、BE lock内で未投入queuedだけ取消。待機表示から取消応答の間に上流投入/実行へ移ったjobは維持しinterrupt0。Studio/他request不変。disconnect/unmountで勝手に取消しない。10秒warningは1回 | T5/T8/T10/T17/T28 |

各カードの局所pytest/vitestを実装後に実行する。以下は統合チェックの候補。新規ファイルはカード実装後に実行し、設計工程で実行済みと扱わない。

```powershell
Set-Location 'C:\Users\audih\ws\comfy-create-helper2'
.\backend\.venv\Scripts\python.exe -m mypy backend
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_generation_integration.py backend/tests/test_ws.py backend/tests/test_comfy_proxy.py backend/tests/test_prompt_metadata.py backend/tests/test_snapshot_service_req267.py backend/tests/test_snapshots_req316_metadata.py backend/tests/test_dataset_router.py -q
Set-Location frontend
npm run typecheck
npx vitest run src/__tests__/App.generationIntegration.test.tsx src/store/__tests__/slices/connectionSlice.test.ts src/store/__tests__/slices/jobQueueSlice.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx src/pages/__tests__/SettingsPage.req314.test.tsx
```

既存3-Gate上位ルールは調整役/QAが適用する。Gate 3は実端末Network/CORS/サービス復旧の証拠を含みmockで代替しない。browser権限/実ComfyUI不可なら該当ACはINCONCLUSIVE、Doneにしない。

実装後`REQ-333-walkthrough.md`へcommand/exit、AC、job/prompt ID、pixel寸法、Network URL、epoch/revision、UI、ログ時刻を対応付ける。ログ検査はrootで`python scripts/inspect_logs.py --clean-check 10`。新規エラーの原因と対応を記録する。新しい性能閾値・認証・公開環境監査は追加しない。
