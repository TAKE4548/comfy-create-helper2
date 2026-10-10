# REQ-333 検証ウォークスルー

## 判定

**INCONCLUSIVE**。Gate 1 と Gate 2 は通過した。承認済みManager-only再起動、idle条件でのBE/Comfy再起動、再起動後のreadiness、許可Originのlogs/API/WS応答と不許可Origin拒否を実環境で確認した。一方、実ブラウザーおよび実スマホで画面表示・操作・再接続後のUI反映を観測できていないため、UI受入条件は未確定。独立QA監査の指摘と対応判断は [REQ-333-qa-triage.md](./REQ-333-qa-triage.md) に記録済み。

<execution_evidence>

## Gate 1 — 型検査・ビルド

| 対象 | コマンド | 結果 |
|---|---|---|
| Backend | `backend/.venv/Scripts/python.exe -m mypy backend` | PASS — 165 source files、errors 0。最終BE変更後にも再実行。 |
| Frontend | `npm run typecheck` / 最終 `npm run build` | PASS — `tsc -b --noEmit` はerrors 0。最終buildでも `tsc -b` を通過。 |
| 配布ビルド | `npm run build` | PASS — final build exit 0。T50–T53後の最終ログ: `.tmp/REQ-333-control-follow-build.txt`。 |
| 配信先 | `rg -n 'frontend_dist_path' backend/app` | `backend/app/config.py` と `backend/app/main.py` で `frontend/dist` の配信設定を確認。 |

## Gate 2 — 全件テスト

| 対象 | コマンド | 結果 |
|---|---|---|
| Backend | `backend/.venv/Scripts/python.exe -m pytest`（repo root、無フィルター） | PASS — T50–T53後に646 passed、2 warnings、86.12s。完全ログ: `.tmp/REQ-333-control-follow-backend-full.txt`。 |
| Frontend | `npm test`（無フィルター、Windowsのrealpath制約で昇格実行） | PASS — T50–T53後に155 files、1485 tests。完全ログ: `.tmp/REQ-333-control-follow-frontend-full.txt`。 |

通常権限のVitestはテスト収集前に `EPERM realpath frontend/src/test/setup.ts` となった。コマンドやテスト選択を変えずにローカル権限で再実行したところ全件通過したため、前者は製品テスト失敗として扱わない。

全件実行で見つかったlegacy fixtureとpreview contractの不整合は修正後に再実行した。T50–T53後の最終結果はBE 646/2 warnings、FE 1485/1485でPASS。BE mypy165 source files、FE build、Manager py_compile、PowerShell stub syntaxもPASS。最終buildログ: `.tmp/REQ-333-control-follow-build.txt`。以前のpreview null契約・timestamp pending表示失敗は修正前ログとして保持し、最終結果と混同しない。

## Gate 3 — シナリオ・異常系

### 実行した異常系シナリオ

最終全件pytest後、計画FC/RTに対応する次のケースを再実行した。

```text
pytest -q \
  backend/tests/test_generation_api.py::test_generation_state_read_failure_returns_typed_503_without_partial_state \
  backend/tests/test_generation_api.py::test_single_running_cancel_without_terminal_history_is_unconfirmed \
  backend/tests/test_comfy_proxy_fault.py::test_missing_original_does_not_immediately_delete_orphan_thumbnail
```

結果は **4 passed**（missing-originalは2 cache layerでparameterize）。観測した境界は、state読取失敗時のtyped 503と部分state非公開、running cancelの未確認扱い、原画missing確認前のthumbnail保全。実行中ComfyUI自体への取消操作は行っていない。

### ユーザー報告のpreview継続回帰

ユーザー報告の画像preview消失に対するT37/T38修正では、BEが利用可能な実preview URLだけをsnapshotに載せ、進捗通知間で安定保持する。FEはURLを合成せず、画像なし進捗や次jobへの切替中も直前画像を保持し、terminal/epoch変更でresetし、手動選択を尊重する。T33 fixtureは画像なし進捗でnullを期待するよう更新した。

後続ユーザー反馈を受けたT39–T46の検証も全件証拠に含む。進捗テキストはPC/mobileとも整数表示、取消footerはresponsiveに調整。報告された複数preset時の生成画像/content差は、初回投入時の実workflow parameter injectionを使い、current/non-current値が分かれるpresetで、投入後にUIを編集しても凍結内容が維持されることを検査したが、回帰は再現せず製品動作は変更していない。完了時刻`completed_at`は成功記録と原子的に保存し、既知jobの履歴照会はread-only。legacy FEはoptional metadataを解釈する。

History/Snapshot表示では、完了時刻を問い合わせ中も現画像の有効なローカルrecordを出す。recordがない現画像はloadingを表示して古い画像情報を出さない。後続応答が同一prompt IDなら有効な`completed_at`だけをローカルfrozen recordへmergeし、生成params/seed/assets/workflow/queued_at/localStorageを保持する。query完了後はtimestamp拡張された解決済み同一ID recordを優先し、Snapshot.paramsは引き続き最優先。仕様差分同期T45と表示接続T46が完了し、original 36 ACは変更していない。複数preset時のユーザー報告は再現せず、製品動作は変えていない。preview_urlのOpenAPI再生成はT28 reworkで完了した。

これらのコード変更はBE全件646 tests、BE mypy165 files、FE全件155 files/1485 tests、buildで確認した。Independent Engineer reviewはPASS。初回のManager restart POSTは409で`GET /api/status`がservice `fe` のstart action in progressを返したため、その時点ではreloadしなかった。後続のUAC承認済みManager-only restartおよびidle-only BE restartでruntime反映を確認した（詳細はT54節）。

### T47–T49: dev WebSocket / Manager action timeout / status表示

T47でVite proxyを `changeOrigin: false` にし、HostとOriginを保持する設定を検査した。修正前のliveではlocalhost:5173とLAN8000 originは通る一方、LAN `192.168.3.13:5173` はHTTP403だった。修正後はlocalhost:5173、LAN5173、LAN8000の全てで`GENERATION_SNAPSHOT`と`SYSTEM_STATS`を受信し、LAN5173由来snapshotもupstream HTTP/WS readyを示した。`https://example.com` Originは403を維持。生ログは `.tmp/REQ-333-mobile-dev-ws-before.txt` / `.tmp/REQ-333-mobile-dev-ws-after.txt`。Vite自動再読込で設定変更後のWSは確認できたが、実スマホ画面の再読込と生成画像表示は未確認。

T48ではManager action captureのPIPEをstdout/stderr別の通常fileに変更し、file size上限付きsnapshot readとlocale decode with replacementにした。returncode/timeout/lock/cache cleanup契約は保持。これにより子孫プロセスがpipeを継承してEOFが来ない場合の待ち続けを避ける設計であるが、現旧Managerの実際のpipe継承再現は確認していない。対象30 tests、full mypy165、Manager py_compileはPASS。

T49ではservice alias `fe` をFrontend busyとして表示し、busy reasonをUIへ出す。busy中のactionを迂回しない。7 tests/typecheck PASS。T47–T49時点ではManager PID 34832 (medium integrity)がhigh-integrity BE PID 35920を停止できず、新action captureと表示のlive reflectionは未確認だった。後続の承認済み再起動結果はT54節に記載。T47–T49時点で36 AC本文を維持し、ローカル完了カード数は49。

### T50–T53: Manager logs/action、unknown result、preview overlay、起動復旧

T50のlive GETではManager status/log endpointsがHTTP 200を返したが、log `lines` は数値で、FE decoderは配列を前提にしていた。Backend/FEで数値・配列の両方を正規化し、status/log pollingを7秒、action timeoutを120秒にした。timeout/504/503/network failureはtyped `unconfirmed` とし、再送しない。

T53のUIはunknown action結果でstatusを再取得し、勝手に失敗・成功と表示しない。running表示だけでは再起動成功を証明しない。

T51は完了済み旧jobのpreview overlayが新jobの表示へ重なる回帰を再現して修正した。新しい次jobのframe/progressを維持し、filter OFF/foreign-session条件を尊重する。

T52のPowerShell backend stop/startは旧portを閉じてからstartし、非zero exitならreadiness=falseを返す。API restart budgetは設定済みwaitに35秒を加え、最低60秒を確保する。実processを止めないcontrolled PowerShell stubで契約を試験した。

T50–T53後の全件Gate 2はBE646/2 warnings、FE155 files/1485でPASS。PowerShell syntax stubとManager py_compileもPASS。後続の承認済みManager-only再起動とidle-only BE/Comfy再起動は次節の通り実行した。

### T54と実環境再起動後の確認

T54で仕様差分の文書同期を完了した。合計54ローカルカード、original 36 ACは維持。最終Gate 2はBE646 passed/2 warnings、FE155 files/1485 tests、build PASS（`.tmp/REQ-333-control-follow-backend-full.txt`、`.tmp/REQ-333-control-follow-frontend-full.txt`、`.tmp/REQ-333-control-follow-build.txt`）。

UAC承認後、elevated helperによるManager-only restartは`status=ok`。BE PID 35920は再起動前後で維持された。続いてqueue idleを確認して許可されたBE restartを実行し、約10.35秒で成功。PIDは35920から39828、epochは`261e7524-a9b2-4dd3-aaf7-a3000c546a59`から`c9bdee5d-7501-44a2-881e-b6b8e3893cd0`へ変化し、`preview_url` fieldが存在、upstream HTTP/WSともreadyだった（`.tmp/REQ-333-manager-admin-result.json`、`.tmp/REQ-333-elevated-be-restart.json`）。

その後、8899経由のComfy restart APIは約19.81秒で`status=ok`を返し、直後のqueue probeはrunning 0 / pending 0だった（`.tmp/REQ-333-elevated-comfy-restart.json`）。最終read-only statusではBE/FE/Comfyがrunning、`action_in_progress=null`、upstream HTTP/WS readyだった（`.tmp/REQ-333-post-restarts-status.json`）。これはAPI応答とreadinessの証拠で、ブラウザー上のtoastや実WSL PID遷移、画面上の生成・復旧表示を独立に観測した証拠ではない。

再起動後のlogs GET 4 endpointはすべて200で、数値のline countとcontentを返した。localhost:5173、LAN 192.168.3.13:5173、LAN 192.168.3.13:8000の許可originはACAOを返し、`https://example.com`とLAN :8080は403で拒否された（`.tmp/REQ-333-post-elevation-logs-cors.json`）。WebSocketもlocalhost:5173、LAN :5173、LAN :8000から`GENERATION_SNAPSHOT`と`SYSTEM_STATS`を受信し、hostile originはHTTP403で拒否された（`.tmp/REQ-333-post-elevation-ws.txt`）。これは実HTTP/WS経路の証拠であり、実ブラウザーのCORS制御・UI描画や実スマホ画面の合格証拠とは区別する。

### OpenAPI契約と稼働中API

`openapi_parser.py` の `list-endpoints` と `get-endpoint` で `backend/openapi.json` を検証した。generation stateはversion/epoch/revision、jobs、batches、upstreamを含むsnapshot、batch受理は202とbatch/job IDを返し、cancelはscope/mode・item outcome・upstream clear/interrupt状態を返す契約である。画像availabilityはfilename/subfolder/typeを受け、present/missing/unknownを返す。API項目とPython定義の整合確認はT28統合テストでも実施済み。

再起動前のread-only live probeはgeneration WS snapshot `version=1`、`revision=74`、`jobs=3`、外側envelopeとdata一致、SYSTEM_STATS 13 keys、upstream HTTP/WS trueを返した。後に承認済みManager-only restart、idle-only BE restartを実施し、epoch `c9bdee5d-7501-44a2-881e-b6b8e3893cd0`、preview_url field、HTTP/WS readinessを確認した。Comfy restart APIも成功し、最終statusではBE/FE/Comfy running、action_in_progress null、upstream HTTP/WS ready。Manager PID 43960はUAC helper実行後、BE PID 39828は別途BE再起動後のprocess。旧ManagerのPermissionErrorと権限差は実際に観測されたが、承認済み再起動でruntime blockerは解消した。再起動後のOrigin/WS実測はT54節のraw logsを参照。

既存の実上流画像を使ったread-only経路検査では、原画PNG 2512×1680・5,341,745 bytes、thumbnail WebP 256×171・6,270 bytesとなり、backend原画bytesは8188上流と一致した。詳細は `.tmp/REQ-333-live-image-probe.txt`。これは原画／thumbnail API経路の証拠で、履歴UIを実ブラウザーで操作した証拠ではない。

### 実環境制約とログ

- 実スマホは利用できず、Cuaブラウザー起動はkernel assetsのパス不存在で失敗した。画面操作・実ブラウザーNetwork観測は未実施。jsdomのPC/mobile DOM試験を実機証拠として数えない。
- Manager-only restartおよびBE/Comfy再起動は承認済みの実行で成功し、再起動後のHTTP/WS origin allow/denyを直接確認した。ただしAPI応答は実ブラウザーの描画・CORS enforcementや実スマホUIの観測を代替しない。
- 初回8899からのbackend再起動POSTは90秒で応答未確認だった。後続の承認済み再起動は別途成功応答・PID/epoch変化・readinessで確認済み（T54節）。初回ACK未確認と後続restartの成功を混同しない。
- テスト直後の `scripts/inspect_logs.py --clean-check 10` はexit 1で7件（warning/error）を検出した。内容はsubmission応答不明と、テスト用upstream-offline条件でのqueue read/cancel reconcile/state 503。親の確認では異常系fixtureが生成したログであり、履歴ログは削除していない。その後の最終 `--clean-check 10` はexit 0で「No errors or warnings found in the last 10 minutes」。生出力は `.tmp/REQ-333-inspect-logs-final.txt`。

## AC適合マトリクス

「自動確認」はunit/integration/DOM試験・契約検証に基づく確認で、未実施の実機条件までPASSに拡張しない。すべてのACを列挙し、実機依存の項目はINCONCLUSIVEとした。

| AC | 判定 | 証拠・未確認点 |
|---|---|---|
| AC-01 | INCONCLUSIVE | Settings systemカード/5タブのFE試験はGate 2で通過。実ブラウザーで設定欄の表示は未確認。 |
| AC-02 | INCONCLUSIVE | Manager startの境界・成功後status再取得は自動試験対象。実Comfy restart APIは成功しqueue 0/0だが、UI操作・表示は未確認。 |
| AC-03 | INCONCLUSIVE | Manager stop経路は自動試験対象。実サービス停止と表示遷移は未確認。 |
| AC-04 | INCONCLUSIVE | Manager restart応答/状態再取得は自動試験対象。実BE restart APIは成功しPID/epoch更新を確認したが、UIで追跡していない。 |
| AC-05 | INCONCLUSIVE | T52 controlled stubはclose-port-before-start/readiness failure/restart budgetを確認。T53 unknown結果は再取得し、running単独を成功扱いしない。実BE/Comfy再起動APIは成功したがUI表示は未確認。 |
| AC-06 | INCONCLUSIVE | 8000停止中にPCの8899埋め込みFEから復旧する実画面試験は未実施。現8899は承認済みUACで更新後processへ再起動済み。 |
| AC-07 | INCONCLUSIVE | T50が数値/配列双方のlog linesをnormalizeし、7秒pollを確認。再起動後の実GET 4 endpointは200で数値line count/contentを返した。実UI表示は未確認。 |
| AC-08 | INCONCLUSIVE | READY/CONNECTING/STUCK/STOPPED/OFFLINEの判定unit試験は通過。Manager単独停止を含む実ヘッダー表示を未確認。 |
| AC-09 | INCONCLUSIVE | 配布build成功。開発FEだけを止めた配布版の実ブラウザー表示は未確認。 |
| AC-10 | INCONCLUSIVE | 8000経由の生成API/WS/image統合は自動試験済み。スマホから8188遮断状態での実生成は未実施。 |
| AC-11 | INCONCLUSIVE | 受理後切断・再同期は統合試験で検証。実ブラウザー全切断中の生成と履歴再表示は未確認。 |
| AC-12 | INCONCLUSIVE | 再同期snapshotの重複抑制と実状態反映は統合/selector試験済み。実切断端末の表示は未確認。 |
| AC-13 | INCONCLUSIVE | server snapshotのjob/node/queue stateはAPI試験済み。実スマホ初回同期は未実施。 |
| AC-14 | INCONCLUSIVE | 既存画像の原画/縮小APIは実上流で確認。実スマホの履歴thumbnail表示は未確認。 |
| AC-15 | INCONCLUSIVE | session selectorのunit/DOM回帰は通過。スマホとPC間のlocalStorageセッション独立確認は未実施。 |
| AC-16 | INCONCLUSIVE | filter OFFのselector回帰は通過。実端末間切替は未確認。 |
| AC-17 | 自動確認 | 通常生成とStudioの独立進捗、PC/mobile DOMの枚数表示をFE試験で確認。進捗テキスト整数化も最終全件に含む。実端末同期は未確認。 |
| AC-18 | 自動確認 | 通常生成中にStudio待機を表示するselector/DOM試験が通過。 |
| AC-19 | 自動確認 | Studio中に通常生成待機を表示するselector/DOM試験が通過。 |
| AC-20 | 自動確認 | filter ONで他session実行中の待機条件をselector/DOM試験で確認。 |
| AC-21 | 自動確認 | filter OFFで他session待機を抑制するselector/DOM試験が通過。 |
| AC-22 | 自動確認 | Studioのbatch別集計と非合算をselector/store試験で確認。 |
| AC-23 | 自動確認 | 枚数bar・node bar・経過時間・整数進捗テキストのPC/mobile DOM試験が通過。T37/T38のno-image progress保持とT51旧job overlay防止も全件試験済みだが、当該コードの実スマホ表示は未確認。 |
| AC-24 | 自動API確認 | 実上流画像でthumbnailが原画より小さい寸法。履歴一覧の実ブラウザー表示は未確認。 |
| AC-25 | 自動API確認 | 実上流PNG原画bytes/MIME/寸法一致を確認。実メインpreview/拡大UIは未確認。 |
| AC-26 | 自動確認 | 原画missing時の試行一覧除外、確認前thumbnail保全、unknown時保持をFE/BE試験で確認。 |
| AC-27 | 自動確認 | 通常生成取消確認後に分母から除き再計算するselector/service/API試験が通過。 |
| AC-28 | 自動確認 | 通常生成失敗通知経路のhook/store試験が通過。実通知UIは未確認。 |
| AC-29 | 自動確認 | 通常生成失敗を終了分として数える集計試験が通過。 |
| AC-30 | 自動確認 | Studio失敗通知経路のhook/store試験が通過。実通知UIは未確認。 |
| AC-31 | 自動確認 | Studio失敗を該当batchの完了分に含める試験が通過。 |
| AC-32 | 自動確認 | blocker実行開始後に待機表示を解除するselector/DOM試験が通過。 |
| AC-33 | INCONCLUSIVE | 実再起動後、localhost:5173/LAN:5173/LAN:8000 originへのlogs GETとWS接続、およびACAOを確認。ブラウザーによる画面読込・描画は未確認。 |
| AC-34 | INCONCLUSIVE | 実再起動後、https://example.comとLAN:8080はHTTP/WSとも403。実ブラウザー上の拒否表示は未確認。 |
| AC-35 | PASS | 既存仕様との差分・衝突一覧を提示し、設計レビューでユーザー承認済み。T45後のGenerate/History仕様差分も同期済み。 |
| AC-36 | 自動確認 | all/normal scope、queued/all、保護barrier、取消結果・responsive footerをBE/FE統合・異常系試験で確認。実画面操作は未確認。 |

## 独立QA監査

初回監査ログ `.tmp/REQ-333-qa-audit-final.txt` はComfyUI実行中jobによるVRAM待ち後exit 42 `[VRAM_GUARD_BUSY]`。後にqueue idleを確認してから、同じ `--timeout 900 --unload-after qa-audit docs/design/REQ-333-test-plan.md` コマンドで再実行しexit 0。生出力は `.tmp/REQ-333-qa-audit-retry.txt`。

再試行auditはscore 7.5/10を返し、以下の指摘を列挙した。これらは監査モデルのfindingで、承認済み仕様・受入条件を自動変更する根拠ではない。Coordinatorの設計トリアージ待ちとする。

- 絶対PowerShell pathによる監査手順の環境依存、テスト失敗基準・各tier timeoutが未定義。指摘とCoordinatorの判断は [REQ-333-qa-triage.md](./REQ-333-qa-triage.md) に整理済み。
- STUCK判定の「HTTP failure」、running fraction、unconfirmedの意味や上限が未定量と指摘。
- RT08/FC18/FC19のunconfirmedを逃げ道、FC06の「既存通り」を比較基準不足、FC02/RT05 partial failureを測定曖昧と指摘。
- RT01/FC15/IG2に必要な具体証跡matrix不足、network partitionとrollback verification不足と指摘。
- FC16/FC17のnormal/Studio scope挙動が曖昧と指摘。

audit出力は `--unload-after` で「All models unloaded from LM Studio. VRAM freed.」を記録。直後に明示 `local_model_adapter.py unload` を実行しexit 0、「No models currently loaded in LM Studio」と報告された（`.tmp/REQ-333-qa-unload-retry.txt`）。これはアダプター内モデルの未ロード確認であり、GPU全体のVRAMが0であるという測定ではない。

</execution_evidence>

## 結果

Gate 1/2と計画したmock異常系は通過し、全54ローカルカードの証拠とoriginal 36 ACを維持した。T39–T54のmetadata/History/Snapshot表示、progress/footer、preset調査、dev WS origin、Manager logs/action/restart互換も最終試験を通過した。Manager-only、idle-only BE、Comfy restart API、許可/拒否OriginのHTTP/WS実環境確認は成功した。実スマホ画面と実ブラウザーの表示・操作証拠は依然なく、これらのACは未確定。監査findingはtriage記録へ引継ぎ済み。よってPBI全体の最終判定は **INCONCLUSIVE** とする。


## 2026-10-10 ユーザー受入・完了

ユーザーは「大丈夫そう。これで完了にしよう」と明示し、現状を受け入れてクローズを指示した。Gate 1/2成功、54カード局所完了、実APIの再起動・ログ・LAN WS確認を根拠として完了する。実ブラウザー・スマホの全36 AC実行証拠を取得したという意味ではなく、自動Gate 3のINCONCLUSIVEと監査findingの原判定は履歴に保持する。追加の設計変更・厳密な監査をクローズ条件に追加しない。
