# REQ-347 Popup Anchor r14 — 最終監査応答・引渡し

## Raw Verdict and Execution

原判定 **現状のドキュメントは「マージ不可（UNSAFE FOR MERGE）」です。** をそのままREQ-347-r14-audit.log/traceへ保持。qwen/qwen3.5-9b / Q6_K / context32768 / reasoning none、61,453文字、3chunks＋最終合成。audit exit0は実行成功のみ、設計PASSへ変換しない。直後unload exit0、独立lms ps --json exit0/[]。

r14変更6対象の全文/本文hash各6一致、未変更T16/T17のr12全文/本文各2一致。今回の現契約8対象がすべてcoverageに入り、source/test10hashは変更なし。r12共有plan追記の7/8一致/body-changeと原snapshot、r13現全文3/3一致、すべてのraw勧告/指摘応答/log/trace/unloadを保持する。byte比較の詳細・経過時間は各traceが正本。

## Individual Finding Dispositions

| 原指摘 | 根拠・判定 |
|---|---|
| section非scrollとroot.scrollByは矛盾/無限loop | sectionは工程境界、rootは独立overflow HTMLElement。相互に別のDOMで矛盾しない。onFocusCaptureだけがtrigger、overlap時のみ同期1回、scroll event handler/継続observerなし。manual scrollを常時上書きしない。既存root/section guardsを維持 |
| padding削除/root統合でsticky数式不成立 | T18は両Desktop rootを保持し新rootを作らない。S/Eは変更後sectionの実rect、Hはheader実height36、Vtはroot client top。padding0も含め再layout後に測るためmax(S,min(Vt,E-H))は同じnative sticky条件。root統合は現契約にない |
| REQ-353混在/API不変と追加fieldが相反 | 共有planの別PBI節を保存、直前に独立scope/別承認を明記。REQ-347担当がREQ-353を実装する指示はない。REQ-347のAPI不変は自分の変更境界でありproject-wide schema凍結ではない。他担当者の独立節を削除する勧告は採用しない。T20にはREQ-353実装節は存在しない |
| useRefがTab A/Bで共有されdraft競合 | useRefは各WorkflowConnectionSection React instanceに固有、browser tab間共有状態ではない。既存epoch/revision snapshot保護/初期hydration/旧応答保持はIT-S6–9で検証済みbaseline。multi-tab新scopeはtest-planが明示して除外、r12はここを変更しない |
| heading幅36pxとpaddingで横overflow | 36pxは高さ。幅100%、name min-width0/ellipsis、key可視除去。BR5/10/VIS3はroot/document幅と実control rectを比較する。320pxではDesktopレスポンシブ対象外、Settingsは375等の既存範囲、Desktop入力pane最小330を使う。新320px製品境界を追加しない |
| start popupが右端buttonから画面外へ広がる/禁止だけで対策無し | T18はmenu自身のrelativeをstart時だけ外し、全幅relative toolbarStartを位置/最大幅基準にする。left0なので起点はbuttonの右端ではない。max-width100%/w72により幅=min(18rem,anchor幅)、popup.left=anchor.left>=Vl、right<=anchor.right<=Vr。具体的CSS/DOM対策とBR-VIS3の実rect/操作を明記、単なる禁止ではない。default endを維持 |
| 空name/fallbackで見出し不可視 | T16はstageName非空白→stageKey→「ステージ不明」、T18はdisplay_name→param_name→role→「プロンプト」。固定末尾があるので全空でも名前は不可視にならない。UT/IT/BR-VIS2で確認 |
| 同時preset/async Seed resolver | 新Seed resolverは別REQ-353のscope。本revisionは元role/React key/callback/preset/disabled chips契約を維持し回帰確認する。新merge/lock/backend処理をここへ足さない |
| fixture master/variant IDsが不一致 | recipeは同じschema templateからM/V/roleを一意生成して返す制御fixture、実DBへ混在しない。metadata/mappingは同じlogical setのIDを参照する。Prompt/Stepsの偶奇Mと4*i+s/4*i+2+s Vが分離、i0元ID/第四84001も別範囲。実adapterを公開して全metadataと参照の整合を確認できなければfixture未成立INCONCLUSIVE。異なるIDを返すmockを認める契約ではない |
| 固定commit baselineがDOM改訂で破綻/CI hash lock要 | 固定commitは変更行数の比較点であり新DOMのgolden truthではない。追加＋削除/未追跡全行で累積測定、超過時Architect再分割。受入oracleは新DOMの実geometry/state。CI全体lockの新製品要件を追加しない |
| adapterエラー/旧応答/再送が未定 | Fixture RecipeはPromise Error('old failure')/Error('offline')、HTTP adapterなら500/detail offlineを定義。IT-S7は最新draft/error保持/旧error適用無し/自動再送無し、BR11はrequest順序とsnapshot/valueログ。未定とする引用根拠なし |

新たな実装不能なcard defectや不可避の人間判断は0。T17の既定true/slot未指定は既定表示維持条項に従い、元toolbarのjustify-between配置を保持する実装を選べる。Desktop新slot/省略caption側だけwrapを使えばMobile/Studioの既定表示に影響しない。これは任意propsの既定互換性を満たす実装解釈であり、新製品仕様を追加するものではない。

## Architectural Handover

現カード5枚の契約は凍結し実装可能。rawモデル判定は上記のまま、Architectが現文書/実source根拠と照合した技術的判断として親へ返す。直接のユーザー視覚修正依頼と既存自律Architect差し戻し指示を承認根拠とし、追加確認待ちにしない。

- T16/T17/T20を並列開始。
- T17完了後にT18（DesktopLayout＋clipboard menuの2source）。
- T16/T18完了後にT19（新visual結合＋旧tabs期待）。
- 各局所/全体Gate1/2の再実行、実browser BR-VIS1–3/既存ACの証拠をQAへ渡す。

改訂DAG3層、所有file数3/2/2/2/2、累積行上限300/250/250/300/160。新実装と受入はまだ未実施。旧Gate1/2PASS（2053件）と変更前のユーザー動作OKを新視覚改訂PASSへ流用しない。Gate3はbrowser/telemetry/隔離fixture未充足ならINCONCLUSIVEを維持し、unsupported依存導入/架空の実測値を作らない。残るものは受入実行と外部capabilityであり、人間の新しい製品判断ではない。