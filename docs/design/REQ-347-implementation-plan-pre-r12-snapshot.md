# Implementation Plan: REQ-347 ステージ別入力と追従見出し

## Executive Summary

生成ページの水平仕切りで分かれたプロンプトとパラメータを、それぞれ独立したステージグループへ整理する。Settingsの対応付けは全対象工程を連続グループ表示し、各編集領域の上端に所属名を残す。工程別の値・chips・variant対応付けと既存保存を保持する。

設計: [REQ-347](docs/design/REQ-347.md)、検証: [test-plan](docs/design/REQ-347-test-plan.md)。初回承認後にT1/T2/T6へ着手しT1契約不足で停止。本番source変更なし、T6の `frontend/src/utils/__tests__/wiringStageGroups.test.ts` は部分作成済み・未検証。カードmetadataの承認反映は親調整役が行う。改訂内容をレビュー記録として親へ返す。

## Architecture and Contracts

生成の所属はmaster_id/variant_idと既存StageMasterから導出、roleを編集値キーのまま維持。順はsort_orderと定義順。mapped入力だけ表示し、欠落metadataはunknown/fallback表示で入力を保持する。

T1は `groupMappingsByStage(mappings, masters, stages)` の純粋関数のみ。T3の `useMappingStageGroups(mappings, masters?, enabled = true)` は既存 `['stage-masters']` / `stageMastersApi.list(true)` で `StageMaster[]` を取得し `data ?? []` をT1の必須第三引数へ渡す。master引数未指定だけ `['mapping-masters']` / `mappingMastersApi.list()` を有効化し、明示[]は取得済み空一覧として優先する。hook内の両queryは条件外で呼び、disabledは自身のfetch無し・返却[]（hook自体にはProviderが必要）。pending/errorは最後のcache、なければ空metadataで入力保持。Desktopは `(textMappings, mappingMasters, true)`。r5のParamPanel親はhookを呼ばず、flat/default/Mobile/StudioはProvider不要。true時だけ同ファイル内のgrouped子をJSXでmountし、子が `(visibleParamMappings, undefined, true)` を毎render呼ぶ。親のhook順序/値rendererを保持し工程propや生成stateを追加しない。

共通StageInputGroupは高さ36pxの通常フローCSS sticky、opaque背景、key併記、scroll-padding/focus露出44px。各rootを独立させ、次工程が上端へ到達した時に次タイトルが残る。Settingsは専用max-height:min(60vh,480px) scroll、saveは外側。Settingsのslotキーをv:/m:で分離し未設定enabled候補とlegacy payloadを保持する。

`scroll-root-contract-r3` の接続契約は検出selector `[data-stage-scroll-root]`、root属性 `data-stage-scroll-root=""`、共通class `stage-input-scroll-root`。T2がStageInputGroup.cssに `.stage-input-scroll-root[data-stage-scroll-root] {scroll-padding-top:44px}` とsection内controlのscroll-margin-top44を定義しcomponentから静的importする。rootのDOM接続はT4がDesktopLayout.tsx内のPrompt/Parameter両div、T7がAdaptiveWorkflowWiring.tsx内のSettings divを担当。T5は既存controls root内でgroupを描画する利用側とし、別rootを作らない。focus captureはown section内のHTMLElementとown headingの実矩形をroot client領域にclipして比較し、見出しと重なる対象だけ最寄りrootをscrollByして見出し下に8px露出する。

| root | 接続担当 | 検証担当 |
|---|---|---|
| `#desktop-prompt-scroll` | T4、既存overflow divに属性/class追加 | T4 unit/BR-P |
| `#desktop-controls-scroll` | T4、既存overflow divに属性/class追加。T5は利用 | T4 unit/T5 test-only root/BR-V |
| `#settings-mapping-scroll` | T7、専用scroll divに属性/class追加 | T7 unit/BR-S |

T2は共通CSSとmock矩形の局所test、T4/T7はroot属性/class適用とsave配置、T5は最寄りcontrols rootの利用を検証する。全3領域のcomputed padding/margin/heading高さと実非遮蔽はブラウザーで個別に記録する。所有ファイル/DAG/行上限を維持し、T4/T5の並列性は変わらない。

`settings-draft-session-r4`: r3監査で確認した保存後refetchのdraft上書きはT8が修正する。既存revisionと、epoch/workflowId/hydrated/acknowledgedRevisionを持つ1つのsession refで保護。初回取得だけフォームを初期化し、同sessionの背景refetchはフォーム値を置換しない。保存対象ID/epoch/revision/snapshotを受付時に捕捉し、API成功時は元IDを通知、最新revisionに対応するsnapshotだけフォームへ採用して保存表示を出す。再編集draftは未保存表示で保持し、finallyで再保存可能にする。importも同規則。外部mapping/baseModel変更のフォーム反映は閉じ直し時となるが、graph/候補/工程metadataの更新は継続する。

## Task Cards and Ownership

全14枚を物理生成済み。計画上atomicityは全件PASS（<=3ファイル、変更<=300行）。カードは300行未満。実変更が超過しそうならArchitectへ自律差し戻しして再分割する。

| Task | 内容 | ファイル数 | 変更行上限 | 依存 |
|---|---|---:|---:|---|
| [T1](docs/backlog/task/active/REQ-347-T1.md) | 生成mappingのステージ投影 | 2 | 260 | なし |
| [T2](docs/backlog/task/active/REQ-347-T2.md) | 共通ステージ見出しとfocus露出 | 3 | 250 | なし |
| [T3](docs/backlog/task/active/REQ-347-T3.md) | ステージ取得hookとParamPanel prop公開 | 3 | 200 | T1 |
| [T4](docs/backlog/task/active/REQ-347-T4.md) | Desktopプロンプトの工程groupと独立root | 2 | 220 | T2,T3 |
| [T5](docs/backlog/task/active/REQ-347-T5.md) | ParamPanel grouped子とProvider不要flat互換性 | 2 | 300 | T2,T3 |
| [T6](docs/backlog/task/active/REQ-347-T6.md) | Settingsの全工程slot投影 | 2 | 260 | なし |
| [T7](docs/backlog/task/active/REQ-347-T7.md) | Settings対応付けproduction（実測255行） | 1 | 300 | T2,T6 |
| [T8](docs/backlog/task/active/REQ-347-T8.md) | Settings保存結合検証・cache通知・draft session保護 | 2 | 300 | T7 |
| [T9](docs/backlog/task/active/REQ-347-T9.md) | 生成2領域の工程別編集独立性の結合検証 | 1 | 260 | T4,T5 |
| [T10](docs/backlog/task/active/REQ-347-T10.md) | 生成・Settings正本の対象箇所同期 | 2 | 160 | なし |
| [T11](docs/backlog/task/active/REQ-347-T11.md) | Desktop grouped consumerのtest Provider fixture | 3 | 120 | T4 |
| [T12](docs/backlog/task/active/REQ-347-T12.md) | Settings/REQ-336の旧UI期待同期 | 2 | 100 | T8,T15 |
| [T13](docs/backlog/task/active/REQ-347-T13.md) | Workflow variant_id OpenAPI snapshot同期 | 2 | 80 | なし |
| [T14](docs/backlog/task/active/REQ-347-T14.md) | 可視復帰の履歴baseline条件test同期 | 1 | 80 | なし |
| [T15](docs/backlog/task/active/REQ-347-T15.md) | Settings staging局所test差分/確認（実測105行） | 1 | 150 | T7 |

## Dependency Graph and Scheduling

~~~mermaid
graph TD
  T1[REQ-347-T1 Grouping] --> T3[REQ-347-T3 Query Hook]
  T2[REQ-347-T2 Sticky Group] --> T4[REQ-347-T4 Prompt]
  T3 --> T4
  T2 --> T5[REQ-347-T5 Parameters]
  T3 --> T5
  T2 --> T7[REQ-347-T7 Settings Groups]
  T6[REQ-347-T6 Slot Projection] --> T7
  T7 --> T8[REQ-347-T8 Settings Integration]
  T4 --> T9[REQ-347-T9 Generate Integration]
  T5 --> T9
  T10[REQ-347-T10 SSoT]
  T4 --> T11[REQ-347-T11 Desktop Test Provider]
  T7 --> T15[REQ-347-T15 Settings Staging Tests]
  T15 --> T12[REQ-347-T12 Settings Assertions]
  T8 --> T12
  T13[REQ-347-T13 OpenAPI Snapshot]
  T14[REQ-347-T14 Visibility Test Baseline]
~~~

最大4層。T1/T2/T6/T10は初期並列。T3でParamPanel prop型を公開後、別sourceのT4/T5を並列。Settings側T7→T8と生成側T4/T5→T9は別ファイル。T10は仕様同期のみで実装sourceと競合しない。

r5はT5を再作業し、T11～T14を追加。最大4層を維持。T11/T12は既存source後の別test、T13/T14は独立。T5完了後にT9/Mobile/Matrixを再検証する。全体Gate2を再実行して残件を新診断で分類する。

## SSoT Synchronization

T10がSPEC_GENERATE §2/2-3/2-5、SPEC_SETTINGS §3-1/4-1/7とmetadataを同期。desktop Prompt tabsの旧記載を実装に合わせる。REQ-336/343の既存role/variant構造、REQ-348の未設定追加範囲を尊重する。endpoint/schemaを変更しない。

## Test Strategy

型チェックと各カードの局所unit、実QueryClient/実対象UI/API境界mockでT8/T9結合試験を行う。jsdomはstickyを検証できない。Gate3はPrompt/Parameter/Settingsそれぞれのスクロール途中・境界切替・編集非遮蔽を実ブラウザーで測定し、領域別に証拠を残す。現在実装test未実行。

UT-G2/UT-H1/IT-M1でquery→T1三引数の接続、masters=[]とundefined、disabled cache有無・再有効化、metadata片方待ち・cold error・cache有refetchを確認する。既存mapping/role別値/chipsが保持され、metadata到着で所属名/順だけ変わることを実hook/groupingで検証する。

T8のIT-S6/7/8は実QueryClient/実Settings UIでdeferred保存→再編集→旧response/refetch/失敗、保存中workflow/session変更を検証する。BR-11は実ブラウザーでも旧保存がRoughの最新draftを戻さないことを確認する。T8はsource約65/test約235の計300行、2所有ファイルを維持し、超過予測時はArchitectへ自律再分割する。

r5のGate2診断は38 failed/2012 passed。T5がMobile18/Matrix1のProvider不要互換性、T11がDesktop16のProvider fixture、T12が旧UI2のexpect、T14が履歴baseline1の旧expectを扱う。visibilitychangeはfetchQueue成功・fetchHistory抑止が現行SPECに一致し、変更前baseline未実行のため歴史的FAILとは断定しない。T13は実装済みoptional variant_idをdocs/openapi.yaml/backend/openapi.jsonへ同期し、Pydanticとのfield parityを確認する。

## Trade-offs and Risks

CSS stickyは境界をDOMで表現できるがsection末尾の押し出しと小paneでの非遮蔽を実機で確認する。共通固定バー方式は領域別active state/resize管理を増やすため採用しない。Settings連続表示は縦長になるので専用scrollを使う。初期query未完了時のunknown表示、legacy工程情報不足、v:/m:衝突、sync/seed/chips/assets/preset回帰を検証する。未設定候補範囲の拡張はREQ-348に残る。

## Local Audit and Human Review

固定LOCAL_AUDIT_MODEL_KEY、context-length32768、reasoning noneで設計/test-plan/全カード/本planを明示してBA監査する。LM Studio localhost APIとlms CLIが必要なため初回からelevated実行。結果・設定・chunks・経過時間をdocs/design/REQ-347-audit.logへ保存し、直後にunload exit0を確認する。監査実行完了と設計PASSは別。変更設計はdev-designの人間レビューゲートで承認を受けた後に実装へ進める。

初版13対象の監査はexit0、3 chunksと最終合成まで完了。raw verdictはDesign Gate FAIL、直後unload exit0、追加lms ps --json=[]。判定を消さず、[指摘応答](docs/design/REQ-347-audit-response.md)へ根拠と対応を記録。境界余白0・型投影/legacy serialize・成功時workflow cache通知を設計/カードへ明記した。これらは監査後の改訂であり改訂全体の再推論は未実行。全カードのゲートはpendingのまま、人間レビュー待ち。

2026-10-12 `hook-query-contract-r2`: T1の所有外hook記述を除去し、T3に取得元・必須第三引数の受け渡し・disabled/pending/error/空引数契約、T4/T5/T9に具体的な呼出と回帰確認を追加。タスク所有ファイル・DAG・変更行上限は維持する。現改訂の再監査は未実行であり、初版FAILと以前の監査後改訂をそのまま保存する。親調整役は全13対象を新規ログ/traceで再監査し、結果と直後unloadを記録する。2026-10-12ユーザー追加指示により、通常のエンジニア差し戻しはArchitectが自律修正し、再承認待ちで止めない。今回の取得接続の明確化は承認済み要件内であり人間の新規判断事項はない。初回レビュー承認とこの追加指示を実装再開の承認根拠として親調整役へ返す。

同日r2全13対象の再監査を完了。4 chunks＋最終合成、audit exit0、raw verdict **FAIL (実装着手禁止)**、直後unload exit0/no models loaded。[監査応答](docs/design/REQ-347-audit-response.md)のR2節へ全指摘と現文書/既存コード/APIの根拠を照合した結果を記録。原判定を保持し、Architectは前提不一致を根拠付きで評価した。人間の新規判断事項は0、親調整役へ継続判断を返す。各カードの挙動契約/DAGは監査時snapshotから変更なし。実装受入は未確認。

2026-10-12 `scroll-root-contract-r3`: T2のroot selector/CSS/外部接続所有の不足をArchitectへ自律差し戻しし、T2/T4/T5/T7と設計/test-planへ具体化した。r3はローカルモデル未監査。初版/r2のraw FAILと応答/log/traceは保持。承認済み要件内の具体化で人間の新規判断事項は0。初回設計承認とユーザーの自律修正指示を継続の根拠として親調整役へ返す。

r3監査は4 chunks＋最終合成、audit exit0/raw FAIL (実装停止推奨)/直後unload exit0で完了。根拠付き応答を監査応答R3節へ記録。root/query等の前提不一致と、実コードで確認した保存draft上書きリスクを分けた。`settings-draft-session-r4` でT8の保護と遅延保存試験を追加し、全13対象を新規ログ/traceで再監査する。今回も人間の新規判断事項0、既存の初回承認/自律修正指示に従って継続。過去raw FAILは保持し監査実行成功を設計PASSとしない。

r4全13対象の再監査完了（96,492文字、5 chunks＋最終合成、audit exit0/raw Design Gate FAIL（設計ゲート失敗）、直後unload exit0/no models loaded、464.031秒）。[監査応答](docs/design/REQ-347-audit-response.md) R4節に根拠評価を記録し、[r4 trace](docs/design/REQ-347-r4-audit-trace.json)に全体/本文hashを保持。監査中の本文変更なし、T9のmetadata-only差分を直接判別。T8の改訂契約は凍結し、親調整役へ既存人間承認/自律修正指示に基づく継続判断を返す。raw FAILをPASSへ変更しない。実装後のIT-S6/7/8とGate3の実測は必須。

`consumer-compatibility-r5`: 受入済みscope内のProvider互換性、旧UI期待、OpenAPI文書差分と既存履歴条件のtest同期を自律修正した。r4はこの新設計/4カードを評価していないためstale。設計/test-plan/全14カード/planの17対象を新規r5 audit planとfull/body hashで準備する。過去raw FAIL/log/trace/unloadは保持。人間の追加判断事項0、既存の承認と自律修正指示に基づき親へ返す。

## R5 Audit and T8 Targeted Rework

監査未実行等の過去記述は時点履歴。最新結果は末尾のrevision節とhandover.current_local_auditに記録する。

r5全17対象監査は120,119文字/6 chunks＋最終合成、754.925秒、audit exit0/raw **【設計ゲート FAIL】（実装着手禁止）**。直後unload exit0、lms ps --json exit0/[]、全対象full/body hashは監査完了まで一致。[監査応答](docs/design/REQ-347-audit-response.md) R5節に全指摘と根拠を記録。raw FAILと過去証跡は保持する。

`settings-initial-hydration-r6` は実コード照合で確認したwarm-cache初回GET中のdraft上書きをT8へ差し戻す未監査改訂。フォームは選択ID/session/configWorkflow一致かつhydrated=trueの時だけmountし、未初期化保存も拒否。初期化後の背景refetchは編集を止めない。toggleで旧savedを解除。T8所有2ファイル/変更上限300/依存T7、DAG最大4層を維持しIT-S9を既存testファイルへ追加。上限超過見込みはArchitectへ再分割。初回操作開始はGET完了まで待つ安全な選択で人間判断は不要。r5はこの追加契約を監査していない。親調整役へT8の技術的差し戻しと改訂再監査を返し、他のカード契約は維持する。実装受入PASSは未確認。

## R6 Audit and T7/T12 Accessible Selection Rework

最新r7結果:変更5文書の監査完了、53,701文字/3 chunks＋最終合成、308.519秒、audit exit0、raw CRITICAL FAILURE（重大な失敗）、直後unload0、lms ps0/[]。全5全文/本文hash一致。原文とr6以前の証跡を保持し[監査応答](docs/design/REQ-347-audit-response.md) R7節に根拠評価を記録した。日付/プロセス終了の指摘は実時刻と別Architect処理への前提誤り、draft/snapshot/rootの指摘は既存契約と不一致。T7/T12 label契約に新たな具体的欠陥なし、実装可能。人間判断事項0、カード挙動は凍結。親がT7を再開し局所test後にT12を再検証、全体Gate2/Gate3で受入を確認する。raw FAILをPASSへ置き換えない。

r6全17対象監査完了:122,815文字/6 chunks＋最終合成、627.849秒、audit exit0/raw **【実装着手禁止】 (Implementation Prohibited)**、直後unload0、lms ps0/[]。全17本文hash一致、T11～T14のmetadata-only差を保存。raw判定を保持し[監査応答](docs/design/REQ-347-audit-response.md) R6節で全指摘を照合した。

`settings-slot-accessibility-r7`: T12の同Main内sampling/stepsとsampling/cfgが同名selectになる実コード根拠へ対応。T7がselect名をstageName+role+「 → 」+paramName（空は「—」）+「 のノード」にし、既存局所testで各1取得/独立保存を確認。T12はMain region内の`Main sampling → steps のノード`を操作しcfg slotも保持。T7の2ファイル/累積300行、T12の2ファイル/100行、既存依存T12←T7,T8、DAG最大4層を維持。T8の並行修正を巻き戻さない。5変更文書を別r7 auditへ回し、原r6証跡を維持する。人間判断は不要。REQ-336 13/13、Settings 8/9とtypecheck成功はengineerのpartial報告で、修正後の全test/Gate2/Gate3受入は未確認。


## Settings Ownership Split and Line Accounting (r8)

旧T7は固定baseline 3b901040c1887b24c56cc517e75768b777913a5eからsource57+198とtest81+24の計360行で上限300違反。現在の分割はT7 production1ファイル255/300、T15 staging test1ファイル105/150。計360行そのものは変えず、各所有差分を重複計上しない。engineerのtypecheck成功/10件成功とコードは保持、歴史的違反をPASSと呼ばない。

T7→T15→T12とT7→T8→T12、T12直接依存T15,T8、15カード/最長4層。T7を親が完了確認し、T15は現test差分の要件照合/局所検証（不要なコード変更なし）、続いてT12全consumer再検証。既存の動作・label・保存・ブラウザー受入は変わらない。source/test所有分離は証拠の引渡しが増える制約を持つが、上限と単独所有を両立する。6変更対象をr8監査し、raw判定は別途保持。人間判断事項0。

r8変更6文書監査完了:61,169文字/3 chunks＋最終合成、342.099秒、audit exit0、raw【実装禁止 / Design Gate FAIL】（最終【実装禁止】）、直後unload0/lms ps0/[]。6全文/本文hash一致、source/testコードhash一致、固定baselineの255/105を再確認。[監査応答](docs/design/REQ-347-audit-response.md) R8節へ全指摘の根拠を記録。source T7完了確認→test所有T15の局所再検証→T12（T8も完了）の順でdispatchできる。現在の所有・上限・DAGを凍結し新しい人間判断は不要。旧combined360行の違反とraw判定は保持し、実装受入PASSへ変換しない。
