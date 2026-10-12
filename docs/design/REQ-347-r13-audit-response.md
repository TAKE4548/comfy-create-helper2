# REQ-347 r13 — 設定文字列全文保持の再監査応答

## Raw Result

固定qwen/qwen3.5-9b/32768/none、30,361文字/2chunks＋最終合成、213.928秒。audit exit0、直後unload0/独立lms ps0/[]。raw: **現状の設計は「致命的な論理的矛盾」と「重大なシステムリスク」を抱えており、即座の実装開始を停止すべきです。** 原文logを保持しPASSへ変換しない。3対象全文/本文一致、source9一致。

## Scope and Individual Dispositions

共有implementation_plan.mdに別PBI REQ-353節が追記されておりr13 snapshotもそれを含む。r12はplanだけbody drift、原snapshot/traceを保持、先の8/8要約は7/8へ訂正した。REQ-347のAPI不変は本PBIの変更scopeであり、別PBIに認められたschema追加をプロジェクト全体で禁止する意味ではない。REQ-353の設計/人間承認を本監査で承認したと扱わない。

| 指摘 | 根拠/Disposition |
|---|---|
| REQ-347のschema不変とREQ-353 fallback_param_names追加が相反 | 独立PBIの変更scope。REQ-347は既存型/APIを消したり新fieldを禁止するruntime処理を導入しない。REQ-353部分の未審査契約を本PBIへ取り込まない |
| API境界mock/ReactQuery enabledでhang、Hermetic不可能 | T19はquery key/安定client/retryfalse/staleTimeInfinityとAPI/router境界mockを明記、実UIを検証。現在T9/5等の同構造実testは旧full Gate2で成功。r12後は局所/全体再検証、hangの具体的経路は示されていない |
| T16/T17並列とT18→T17が矛盾 | T16/T17は異source、T18はT17完了後、T19はT16/T18完了後。明示DAGは矛盾無し |
| key m.id保証不足 | design/T18は元m.id/keyとactiveSetId-role editor keyを維持。表示名/配列indexへ変えない。新視覚scopeでParamPanel sorterを追加しない |
| effective_master破損のfallback/seed key同時実行lock | REQ-353/既存backendの問題をr12へ混同。r12はDB/seed処理を変更しない、Backend修正の権限をこの監査から増やさない |
| scroll-paddingブラウザー互換性 | 既存実矩形focus helper/BR1–3/VIS1は実browserで判定。新debug state/driver依存を根拠なく導入しない。能力不足はINCONCLUSIVE |
| ARIAへstage key追加 | StageInputGroupのname(key)/section/data/IDを保持、旧r7Settings select名を保持。Prompt表示名は見える文字にstageを付加しない。操作の元role/id/所属regionで区別し回帰確認 |
| pending表示フリンカー | groupingは欠落metadata fallbackでも元入力を保持、metadata到着で名前/順のみ変更。IT-M1/BR7/8を維持。r12はquery状態/取得方法を変更しない |

T19の曖昧語は「描画側の付加禁止、設定Main_Positive_Prompt/Rough Prompt全文保持」と明記済み。rawにその契約の新たな具体的欠陥は無い。別途Architectが実clipboard sourceを読み、左寄せ再配置でright-0 w72 popupが左へはみ出す具体的リスクを確認した。この実根拠をT18/局所結合/BR-VIS3へ最小補足し改訂を監査して引き渡す。人間の新規判断0、実装source変更0。