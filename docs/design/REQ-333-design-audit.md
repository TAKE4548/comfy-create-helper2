---
title: REQ-333 設計パッケージ自動監査
status: complete-with-findings
tags: [REQ-333, ba-audit, design-review]
related_paths:
  - docs/design/REQ-333.md
  - docs/design/REQ-333-design-audit-input.md
  - docs/design/REQ-333-design-contract-audit-input.md
  - docs/backlog/ba-audit/REQ-333.md
---

# REQ-333 Design Audit

2026-10-10（Asia/Tokyo）。この監査は設計レビュー前の提案への監査。履歴要件監査の REQUIRES MODIFICATION BEFORE PRODUCTION と元回答は変更しない。実装/コード試験は未実施。

## Input and Execution

第一入力: 設計全文、代表T2/T11/T18の全文、29カードのmanifest/実装要件/期待試験、DAG修正。42,719 chars（adapter実読取り42,716 chars）、4chunks。現物の依存・所有は補足でも再照合する。
補足入力: 物理29枚の所有/依存を読取り、残26枚の固有signature/divergent contract/正確なcommandを抽出。共通型/規定は完全一致で1回へ重複排除。設計/試験計画/同一logicを再実行しない。24,557 chars / 27,799 bytes。既存周辺24行snippetは補足へ含めない。
代表カード3枚と補足26枚を組み合わせる範囲で全29の契約を対象とする。補足開始前は全カードの自動監査完了とは扱わない。

```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2'
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --timeout 900 --unload-after ba-audit --target docs/design/REQ-333-design-audit-input.md
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --timeout 900 --unload-after ba-audit --target docs/design/REQ-333-design-contract-audit-input.md
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload
```

実推論・明示unloadはrequire_escalatedで行う。第一実出力はREQ-333-design-audit-output.txtへ保存。第一完了直後にexplicit unload、その後に補足推論を開始し、完了直後にexplicit unloadする。途中で別推論を並行しない。
モデルの解放出力とGPU全体使用量0は同じ意味ではない。全体GPU使用量は別計測していない。

## Current Evidence

第一監査: session1412完了、exit0。4chunksと統合回答を取得。モデル原判定は **「現在の状態では『実装前のレビュー修正』が必要」**。元回答全文・trace・auto-unload出力は`REQ-333-design-audit-output.txt`へ保存。監査完了はPASSを意味しない。
第一cleanup: プロセス終了を検出した同じfunctionsセルで、require_escalatedの`local_model_adapter.py unload`を直後実行、exit0。`REQ-333-design-audit-unload.txt`に`No models currently loaded in LM Studio.`。auto-unloadの`All models unloaded from LM Studio. VRAM freed.`も原出力にある。GPU全体利用量0の測定ではない。
補足監査: 第一cleanup後にrequire_escalated/timeout900/unload-afterでsession43349実行、exit0。3chunks＋統合回答を取得。元判定は **「条件付きで実装可能。ただしP1の修正が必須」**、総合6.2/10。元回答/trace/auto-unloadは`REQ-333-design-contract-audit-output.txt`へ保存。
補足cleanup: 終了確認直後、require_escalatedの明示unload、exit0。`REQ-333-design-contract-audit-unload.txt`に`No models currently loaded in LM Studio.`。GPU全体利用量0は別計測していない。
最終focused監査: 修正した契約のみ9,210 charsの`REQ-333-focused-audit-input.md`でrequire_escalated/timeout900/unload-after、session40781実行・exit0。出力先`REQ-333-focused-audit-output.txt`。原判定は「論理的整合性の主要な問題点…実装前に修正推奨」で、PASSではない。全体監査の再実行ではない。終了直後の明示unloadもexit0、`REQ-333-focused-audit-unload.txt`に`No models currently loaded in LM Studio.`。GPU全体使用量0の計測ではない。
構造レビュー: 29カード、所有target存在または(NEW)、各≤3files、依存47edges・非循環・最大4層。T1は前段governance preflight、T4→T2/T3、T28の実装leaf依存、T24のtyped mock境界を反映。
単体/integration/E2E試験: 未実施。監査モデルの成功をコード試験PASSへ流用しない。

## Findings

第一原判定を保存し、以下は実行者による物理設計との照合として区別する。設計の明確化は承認前の提案であり、履歴要件監査・35 AC・正本を変更していない。

| 第一モデル指摘 | 現物照合 / 対応 |
|---|---|
| D5「prefix checkを使う/使わない」矛盾 | **誤読**。D5は最初からURL/IP解析・妥当IPv4・port条件・文字列prefix不使用を記載。prefix allowlistへ変更しない。 |
| Snapshot用語が状態/画像/cacheで混在 | **用語明確化**。設計3冒頭にGenerationSnapshot=状態JSON、Snapshot=保存画像DB、thumbnail=一覧画像cacheの用語区別を追加。保存仕様は変えない。 |
| legacy API並存で状態二重書込み | **境界明確化**。D3に新normal/Studio受付のみがapp生成の入口、BEのみがjob状態を更新、旧proxyは上流互換操作、未登録jobをscope/所有へ推定混入しないと記載。旧metadata二重POST除去はT16の既契約。廃止期日を新要求にしない。 |
| Protocolにtimeout/retryがない | **既存値の明記**。comfy.pyのconnect5/prompt10/queue・interrupt5/history15秒と旧ComfyWS 1〜15秒＋jitter、SystemWS 1〜10秒をD2/T6へ明記。新期限/SLAではない。POST自動再送なしは既記載。 |
| T14/T23のclose/新socket禁止矛盾 | **誤読**。T14は最後のsubscriberだけclose、T23は旧serviceの新8188socket禁止/互換helper整理。各subscriber終了で全socketをcloseする仕様ではない。 |
| T18が送信失敗時即切断を指示 | **誤読**。T18はStudio生成UI、当該指示なし。送信はT11が所有する。 |
| 即時再接続storm | **誤読＋既存値明記**。D2は「即時再接続」無期限loopを規定しない。T14の既存backoffとT6の移行値を明記。新接続数制限は要求しない。 |
| timestamp batch ID衝突 | **旧snippetとの混同**。現Studio sourceのtimestamp client IDを新batch識別に使わない。request UUIDは既記載、job/batch/groupもUUIDとD3へ明記。時刻base版管理を追加しない。 |
| active_connections重複/競合、slow reader | **実装境界明確化**。D2/T11へ登録1回/disconnect冪等/client単一writer/最新生成状態とstats別保持を追記。RT12へ重複connect/二重disconnect追加。Setやlockの具体型を新要件にせず、既存heartbeat/送信例外による切断を保つ。 |
| 1MB制限/100+接続負荷 | **追加仮定・範囲外**。ユーザーは性能/資源上限変更を意図しない。新MB上限・公開多人数SLOは追加しない。workerを待たせない送信/既存cache上限/個人LANの回帰を既存試験範囲で確認する。 |
| Spec Freezeを導入すべき | **既存ゲートで対応**。承認前の正本を黙って更新せず、C1..C11とD1..D6をレビューで固定。T1先行governance preflight、実装結果の正本同期T26/T27を維持。新凍結期間や別承認を追加しない。 |
| T28依存多く検証不足 | **依存数のみを欠陥としない**。全code leaf依存、4層/非循環を確認済み。IG3/RT01..05/RT12は競合・snapshot/event・stats共存を対象。実端末試験は別証拠として未実施。 |

第一回答取得後に用語・既存期限・legacy境界・UUID・送信writerの明確化を追加した。補足監査はその直前の物理契約snapshotを入力に開始済みであり、この追記部分までモデルが再合格したと称さない。追記内容も人間設計レビュー対象として提示する。

<!-- [LLM Audit Trace: Action=ba-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->

## PBI Integrity Caveat

## Supplement Findings and Targeted Corrections

| 補足モデル指摘 | 現物照合 / 対応 |
|---|---|
| version=1固定と将来移行 | v2移行は新要求にしない。今回の未知version安全処理は実ギャップとしてT2/T10/T15へ追加。同epoch1回refetch→非対応表示、旧valid state/stats維持、loop禁止（FC01）。 |
| T15追加field/T24参照禁止が矛盾 | 誤読。T24は旧公開口のadapterで、新snapshotを別正本へ持たない。T15の既存type intersection/旧field導出/旧action委譲をさらに明記（FC05）。 |
| snapshot()失敗rollback欠如 | readとmutationの混同を区別。GET503はread失敗で部分状態不適用。commit前は全件rollback、commit後snapshot失敗でも202/lookupを受付根拠としmutation再送しない（FC02/03）。 |
| T2 Python/ T8 TS / T10外部応答が緩い | 有効。T2にJobView/StateSnapshot全項目、成功DTO/nullable/errorを展開。T8/T10を同じ名前・値形へ揃え、router-local error envelopeとpreview bytesを明記。dict[Any]は内部portのみ（FC04）。 |
| T23/T24の8188/Vite WS混同 | Vite `/api` ws:trueは8000への転送、廃止する`/comfy`8188 WSとは別。開発HMRも別。T24互換境界/単一SystemWSへ整合済み。 |
| T20 N=0未定義 | 誤読。D4/T9/T20/RT07既記載。加えてT20のPC/Mobile renderでidle/0・NaN/InfinityなしをassertするFC08を明示。 |
| unconfirmed自動retry/expiryなし | 意図的境界。再送すると重複生成になり得るため自動再送なし。新expiry SLAを作らずrequest lookupと未確認表示を維持。 |
| T29旧props副作用不明 | 有効。旧onChangeが2setterを呼ぶ事実と、新readonlyではmount/change/closeで0回、既存close/workflow/default/model callback維持を記載。proposal snippetはreadonly、config未取得は旧URLを正本表示しない（FC06）。 |
| T27検証対象空欄 | 文書同期に架空関数を作らず、Settings§3/§5、Studio§2保持＋Step1節、Manager§2.2/accessURLを指定。rg/逐語diff/実試験証跡を確認（FC07）。 |
| 未実施試験の客観性なし | テスト計画のwalkthrough command/exit/AC/jobID/pixel/Network/logを証拠とする。設計・監査完了はコード試験PASSでない。 |
| T28→T29がcycle | 誤読。T29はrootでT28へ依存しない。一方向のintegration leaf依存。29nodes/47edges/非循環4層の構造確認。 |
| batch50〜100制限、session TTL、全体mypy刷新、失敗batch再送 | 範囲外/ユーザー意図との不一致。採用しない。既存resource/identity/typecheck境界とPOST自動再送禁止を維持。 |

### Focused Audit Triage

Focused原判定も否定的なまま履歴保存し、以下の物理境界だけを補足した。これらは人間レビュー用の修正であり、監査モデルのPASSを意味しない。

| focused指摘 | 最終照合・扱い |
|---|---|
| `Snapshot`と`StateSnapshot`/`GenerationSnapshot`の命名 | 設計の用語表で、wire上の一時状態DTO、FEのstate composition、永続画像/params entityを区別済み。保存画像の品質・保持は既存維持。 |
| 「単一WS」と複数WS経路 | `/api/ws` 1接続はブラウザ向け生成状態+SYSTEM_STATSの意味。BE→ComfyUIの常駐上流WSは別接続。8188ブラウザ直結とVite `/comfy` proxyは廃止対象で、Vite `/api` ws転送・HMRとは別契約と明記。 |
| commit後のstate read失敗とlookup | 受付transactionでbatch/request IDをcommit後、POSTは確定job IDで202。StateSnapshot GETは503になり得るが、request lookupはcommit済みrequest/batch記録を独立に読む。lookupの404/保持整理後の未確認は未受付証明ではなく再送しない。FC02がこの分離を検査する。 |
| T29依存による循環 | 構造上の誤判定。T29はrootでT28に依存せず、T28がT29を統合対象として依存する有向辺だけ。 |
| 新たな5秒可視化SLA、lookup TTL、heartbeat grace | 既存契約・ユーザー範囲にない数値保証の提案なので不採用。新しい期限や保持期間を足さず既存保持整理・既存heartbeat値を継承する。 |
| それ以外の未確認期限、精度、負荷上限 | 今回の受入条件を越える追加要件として採用しない。post-commit不明時は照会と未確認表示、自動再送なしを維持する。 |

この追記はfocused原文・traceを変更しない。監査3段階すべてのraw出力、auto-unload記録、終了後の明示unload証跡を保存した。最終設計は**人間レビュー提出可能（監査指摘をtriage済み。監査PASSではない）**。実装・コード試験は未実施であり、人間の設計承認まではTask Cardをdispatchしない。

## 追加差分監査：取消3操作・原画/サムネ互換

2026-10-10、11,752文字の差分限定入力 `REQ-333-cancel-image-audit-input.md` を、権限付き `--timeout 900 --unload-after ba-audit --target` で実行。process exit 0、auto-unload `All models unloaded from LM Studio. VRAM freed.`。完了直後に明示 `unload` を実行し exit 0、`REQ-333-cancel-image-audit-unload.txt` は `No models currently loaded in LM Studio.`。raw verdict/trace全文は `REQ-333-cancel-image-audit-output.txt`。GPU全体利用量0の測定を意味しない。

モデル原判定は **Overall Readiness 5.8/10; Not production-ready; requires remediation**。この判定をPASSに変えない。指摘は以下の通り照合し、結論の違いは設計レビュー資料へ開示する。

| 差分監査指摘 | 現物照合とtriage |
|---|---|
| single target制約の矛盾 | **誤読**。入力ではsingleはjob_idまたはlegacy prompt_idの一方を必須、queued/allはtarget禁止と明記。T30の単件対象と全体二操作を分離し、FC09で検査する。 |
| T15/T16循環 | **誤判定**。実DAGはT16 store/stateをT15 connection projectionが使う一方向edge。31 nodes/56 edges、循環なし、最大4層を再計測。 |
| clear:trueと外部投入の非原子性 | 実在する上流境界であり、設計も外部ComfyUI投入を分散原子化できるとは主張しない。アプリ受付/dispatchと取消はlock下で直列化し、Comfy clear時点の上流pending集合が範囲。外部投入競合をabsolute guaranteeにせず、未知/partial結果はunconfirmedとして返す。追加Redis lockや全体整合SLAは追加しない。 |
| present/503、missing復帰、unknown状態のタイムアウト | **既存契約を越える自動expiry要求は採用しない**。present/unknownは行を保持し、明示再試行またはidentity変更で再照会。確定missingだけ表示除外。新TTL・自動poll・期限SLAを足さない。 |
| unconfirmedの最大期間/自動再取得期限 | **範囲外**。mutation自動再送なし、状態再取得・未確認表示、重複イベントの一回反映を契約化。新しい時間期限を設けない。 |
| legacy cancelのglobal副作用 | 現行の全体操作はclear:true/global interruptであり、legacy pendingも上流のglobal clear対象。singleはprompt IDで指定。新版も全体/単件を区別し、managed UUIDのないlegacyを架空UUIDへ変換しない。 |
| T28依存15個、性能SLAなし | **欠陥とは扱わない**。T28は全主要経路を統合するterminal card。ユーザー意図にない遅延/負荷/再試行SLAを追加しない。 |
| Modal props進化 | **誤読**。T30は現行 `isOpen`/`onClose` propsを維持し、store APIをtyped mockで検証する。 |

新たな監査要求を無条件に取り込まず、31 Task Card・更新テスト計画・人間向け互換性レビューを最終確認対象にした。この差分監査後にコード試験や再監査は実施していない。

AC-36 normal-only追加前の構造確認（初版）: PBIはin-progress、AC-01..35各1件。31 unique draft cards、56 edges、循環なし/最大4層、最大214行/カード、変更対象最大3ファイル/カード、handover line countと全NEW pathを照合。AC-36追加後は下記の221行測定を正とする。実装dispatch・アプリsource変更・コード試験はなし。

## AC-36 normal-only 差分監査

2026-10-10、10,778文字の `REQ-333-normal-scope-audit-input.md` を、権限付き `--timeout 900 --unload-after ba-audit --target` で一度だけ実行。完了exit 0、auto-unloadを確認し、直後の明示unload exit 0、`No models currently loaded in LM Studio.`。証跡は `REQ-333-normal-scope-audit-unload.txt`。モデルの可視原判定は **BLOCKED - Requires clarification before implementation**。raw verdictはPASSに変更しない。

**監査出力保存の制限**: terminal toolの表示上限で1,256-token出力の中間が切り詰められ、完了済みsessionからraw全文を再取得できなかった。`REQ-333-normal-scope-audit-output.txt`は見えていた冒頭・末尾の抜粋と欠落箇所を明示した記録であり、全文rawではない。再推論して同一入力を再監査することは避けた。input、出力抜粋、終了/明示unload証跡を保持する。

| 見えていた監査指摘 | 照合と対応 |
|---|---|
| Atomicity/Studio保護のrace | race境界自体は実在する。設計はexpected-prompt指定のない上流interruptに原子性を主張せず、Studio/unknown legacyがrunning/pendingならnormal-only interruptを見送る。known-normal queue時のraceも明示し、人間レビューに提示する。 |
| scope defaultはnormal-onlyではないか | **棄却**。ユーザーは既存global cancelを残すよう指定。scope省略/default all、明示normal-only optionとした。 |
| normal scopeがsession内か全sessionか | **確定済み**。AC-36は全sessionの識別済みnormal対象、表示filter独立と定義する。 |
| legacy job検出の曖昧さ | **scope不明legacyを保護**。推測client ID・cutoff date・架空UUIDを使わない。positive DB prompt mappingのみnormal対象。 |
| timeout retry/backoff | **不採用**。自動mutation再送や新timeout/SLA/回数制限を追加せず、unconfirmed/skipped理由を表示し状態再取得を案内する。 |

監査表示の言及では、API mode/scopeを分離し、global既定、normal全session、single対象をそれぞれテストする。raw出力の欠落は監査証跡の制限としてレビューで開示し、モデル判定を合格根拠にしない。

**最終静的確認（AC-36後）**: AC-01..36各1件、31 unique draft cards、56 edges、acyclic/depth4、最大221行/カード、変更対象最大3ファイル/カード、全manifest line count/NEW path一致。test-planのrow36/IG7/FC15..19とscope API契約を照合。設計承認前のため実装dispatch、コード変更、コード試験なし。

修正内容はFC01..08/RT12へ予定試験として対応付け、focused入力へ変更点だけ抽出した。元の第一/補足判定をPASSへ書換えていない。カード所有ファイル数・DAGは変えず、DTO展開後の実行数は調整役が物理再計測する。

### PBI Integrity Caveat

設計着手時、物理PBIがAC-08状態表の途中で終了していることを読取りで発見した。調整役・親は先行する完全な出力を根拠に復元し、AC-01..35と2026-10-10の設計進行承認metadataを保持した。設計者は復元後に全文を再読し、現在の35 ACを確認した。切断の原因は未診断であり、pbi_manager等の特定ツールに原因を帰属させない。

今後ready/in-progress/done等の状態更新を行う担当は、更新前後にAC-01..35が各1回あること、AC本文の比較（チェック済み印のみの差分は区別）、承認metadata・監査履歴参照の保持を確認する。欠損時は進行を止め、直前の完全な証拠から復元して原因を別途調査する。本PBIの実装カードに共有ツールのsource修正を追加しない。
