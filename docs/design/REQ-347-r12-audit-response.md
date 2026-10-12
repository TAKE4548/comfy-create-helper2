# REQ-347 Visual Polish r12 — 監査指摘応答

## Raw Result and Coverage

モデル `qwen/qwen3.5-9b`、context32768、reasoning none、59,726文字、3chunks＋最終合成。実行exit0は推論完了のみ。raw結論は **実装直前に致命的な論理的矛盾と脆弱性を有しています**、最終勧告は **実装開始を即座に停止すべきレベルの矛盾**。原文はREQ-347-r12-audit.logに保持し、PASSへ変換しない。

直後unload exit0/独立lms ps --json exit0/[]。traceと8原文snapshotを保存。監査完了時に7/8全文・本文hash一致（implementation_plan.mdへ別PBI REQ-353節が追記されbody-change。REQ-347の元節は保持、r13は追記を含む現plan全文をsnapshot/再監査）、9/9実装/test source hash一致（Architectのsource変更0）。この後のT19文言補足はr12 snapshotへ遡及せずr13で対象cardを再監査する。

## Findings and Evidence-based Dispositions

| 原指摘 | 根拠・応答 | Disposition |
|---|---|---|
| Sticky focus補正とepochが古い矩形で競合する | StageInputGroupのonFocusCaptureはawait/timer無しの同期handlerで、そのevent内で現在root/header/target矩形を測ってscrollByする。own section.contains/closest root/visible header checksを保持。epochはSettings session保護であり保存時にepochを増やす契約ではない。別eventのReact commitがその同期handler中へ割り込むとする具体的経路は示されていない。既存BR3/BR7/IT-S8/9を維持 | 根拠未成立。rAF/ResizeObserver/新epoch接続は追加しない |
| IT-S6が旧成功表示を削除しないのでDのdraftとC保存表示が並存 | 現test-planのIT-S6は「未保存表示、旧成功表示/preview解除なし」、fixtureは「旧保存済み表示無し」。設計は編集時savedを消し、最新ID/epoch/revision一致時だけ保存表示する。rawが引用した「削除しない」は現文書の規定ではない | 既存契約との前提不一致、T8保護維持 |
| T19 stage suffix無しが設定文字列を削除する要求に見える | design/T18は「非空設定文字列のMain/Rough等を削除しない」。T19の同名fixture「描写」に描画側がsuffixを足さない意図だが短縮語は誤読を招く。T19へ付加禁止/設定全文保持とMain_Positive_Prompt caseを明記 | 具体的文言改善。r13の1card対象へ補足 |
| 固定fixture IDsが既存DB/他runと衝突 | recipeは隔離した制御fixtureのみ、production DB/通常origin変更は禁止、transport未充足はINCONCLUSIVE。Main/Rough生成formulaはmaster偶奇、variant 4*i+s/4*i+2+sで一意、i0 original/第四84001も範囲外。実DBのmaxID queryはこの試験境界に不要 | 前提不一致、隔離確認と一意fixtureを維持 |
| UT-C1がjsdomでstickyを検証する | UT-C1はCSS文字列とmock rectのfocus関数試験、直後にjsdomではCSS sticky計算不可/AC2/3/5の証拠ではないと明示。UT/IT-VIS表も同じ限界を明示。物理BR1–3/VIS1–3は実browser | 既に分離済み。assertの削除/偽polyfillは不要 |
| BR11 transportが存在しない | Current Execution Context/Fixture Recipe/Oracleは未実装/未起動を明記、capability欠けたcaseはINCONCLUSIVE。requestId/seqは制御adapterが記録する試験logでbackend product telemetry追加の要求ではない | 外部capability blockを維持、新依存の自動導入なし |
| T18にT16依存がない（heading高さ変更） | T16は36pxを変更しない。T18はprops変更のT17に依存、T19はT16/T18両方に依存。別sourceのT16/T18へ順序依存を足す型/geometry根拠なし | 独立性維持、改訂DAG最長3層 |
| loadPresetDataのchip上書き/mergeが未定 | r12は元activeSetId-role key/handlers/disabled chip/parse/historyを維持。既存SPEC_GENERATEにpreset/store契約、T19にchips/collapse/state回帰とfull-suite再実行。新mergeは視覚scope外 | 既存契約/回帰を維持、製品scopeを増やさない |
| display_name重複にはstage/ID badge推奨 | ユーザーは表示名のみを希望。工程ARIA name(key)/data、h4元mapping ID/role/aria-controlsで同名をscopeし値独立を検証。可視badgeの再追加は明示意図に反する | 不採用。T19同名case/元ID編集を維持 |
| 承認後にだけ実装 | 新改訂は直接のユーザー3点修正依頼と既存Architect自律修正指示で承認根拠を持つ。dev-design review deliverableを親へ返し、raw勧告とArchitect応答を分ける | 人間の新規判断事項0。親が応答とr13を確認してdispatch |

## Remaining Work

T19の語を明確化してtargeted再監査、raw結果/unload/coverageを記録して親へ引渡す。新視覚実装・局所試験/全体Gate1/2/実browser Gate3はまだ未実施。旧2053件とユーザーの変更前動作確認は改訂後PASSを意味しない。実ブラウザーcapability blockは既存のものを保持する。