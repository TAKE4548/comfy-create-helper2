# Implementation Plan: REQ-345 未保存試行の欠損除外と再読込差分追加

## Executive Summary

サムネ成功でも表示需要のある未保存試行の原画availabilityを確認し、missingだけ除外してpage内の自動再取得を抑止する。再読込では非空persist baselineの復元/初回Generation同期後にBEの残存差分を要求し、表示履歴にないpresent原画だけ追加する。既存URL・相対順・選択、保存Snapshot、metadata、cleanup期限を保持する。

設計: [REQ-345](docs/design/REQ-345.md)、検証: [test-plan](docs/design/REQ-345-test-plan.md)、監査応答: [audit-response](docs/design/REQ-345-audit-response.md)。旧REQ-350は [保存版](docs/design/REQ-350-implementation_plan.md)、本書は [REQ-345保存版](docs/design/REQ-345-implementation_plan.md) を同期する。

## Architecture and Contracts

- DisplayStateがpage共有controllerを所有。lazy試行load/errorから原画確認、最大2並列、identity共有。missingは同page固定/unknownは手動retry。cached onLoadはpresentの根拠にしない。
- 表示済みDは復元済み両session query/対応storeのlogical union、viewport/tab/filter非依存、Snapshotを除く。identity=filename/subfolder/type、host/t非比較。
- 新POST /api/generation/history/residualへknown=D+missingとexaminedを送る。BEは既存200件候補窓から差分だけ原画確認。1page10/最大2並列、present itemsのみ、unknown/missingはrejected。
- 1logical sync最大20page/200検査、逐次追加。BEには旧Comfy historyの上限付き列挙が必要だが、FEのfull GET/全件表示置換はreload経路から廃止する。
- first/epoch snapshotの過去成功出力を暗黙追加しない。同epoch live成功event/進捗/queue/autoFollowは維持。
- 応答時最新D/Mへ再比較、差分presentだけ追加。複数pageは追加ブロックの順序維持、既存URL/相対順/選択保持。unknown新規は保留、unknown既存は保持。
- allへ全新規、ownへsession_id===clientIdだけ。null/foreignはallのみ。選択/modal/Snapshot/metadataを同期自身で変更しない。
- failureは既存/適用済みpage保持、fallback/auto retry0、manual retryのみ。真離脱はabort/世代失効でlate書込0。StrictMode再接続はpending共有。

## Task Cards and Ownership

13枚を物理生成済み。全カードdraft/design_gate=pending。計画値の原子性は全件PASS（<=3ファイル、<=300行）であり、監査/実装/受入PASSではない。実装時の超過見込みは着手前に再分割する。

| Task | 内容 | ファイル | 行上限 | 依存 |
|---|---|---:|---:|---|
| [T1](docs/backlog/task/active/REQ-345-T1.md) | controller/adopt/局所試験 | 2 | 300 | なし |
| [T2](docs/backlog/task/active/REQ-345-T2.md) | LazyThumbnail通知 | 2 | 160 | なし |
| [T3](docs/backlog/task/active/REQ-345-T3.md) | DisplayState基盤/選択/公開状態型 | 2 | 290 | T1 |
| [T4](docs/backlog/task/active/REQ-345-T4.md) | Gallery/差分同期状態UI | 3 | 290 | T1,T2,T3 |
| [T5](docs/backlog/task/active/REQ-345-T5.md) | 既存AC統合/保護 | 1 | 280 | T3,T4,T6 |
| [T6](docs/backlog/task/active/REQ-345-T6.md) | GENERATE/COMMON/HISTORY | 3 | 200 | なし |
| [T7](docs/backlog/task/active/REQ-345-T7.md) | BE残存差分API | 3 | 300 | なし |
| [T8](docs/backlog/task/active/REQ-345-T8.md) | FE API/decoder | 2 | 200 | なし |
| [T9](docs/backlog/task/active/REQ-345-T9.md) | 純粋追加merge | 2 | 240 | なし |
| [T10](docs/backlog/task/active/REQ-345-T10.md) | 初回full bootstrap停止 | 2 | 240 | なし |
| [T11](docs/backlog/task/active/REQ-345-T11.md) | 復元後差分同期 | 2 | 280 | T3,T8,T9,T10 |
| [T12](docs/backlog/task/active/REQ-345-T12.md) | OpenAPI同期 | 1 | 200 | T7 |
| [T13](docs/backlog/task/active/REQ-345-T13.md) | reload AC-3/7/8/9 | 1 | 280 | T7,T11,T6,T12,T4 |

## Dependency Graph and Scheduling

~~~mermaid
graph TD
  T1[REQ-345-T1 Controller] --> T3[REQ-345-T3 DisplayState]
  T1 --> T4[REQ-345-T4 Gallery]
  T2[REQ-345-T2 LazyThumbnail] --> T4
  T3 --> T4
  T3 --> T5[REQ-345-T5 Existing Acceptance]
  T4 --> T5
  T6[REQ-345-T6 SSoT] --> T5
  T3 --> T11[REQ-345-T11 Reload Sync]
  T8[REQ-345-T8 API Client] --> T11
  T9[REQ-345-T9 Merge] --> T11
  T10[REQ-345-T10 Bootstrap] --> T11
  T7[REQ-345-T7 BE Residual] --> T12[REQ-345-T12 OpenAPI]
  T7 --> T13[REQ-345-T13 Reload Acceptance]
  T11 --> T13
  T6 --> T13
  T12 --> T13
  T4 --> T13
~~~

最大4層。初期T1/T2/T6/T7/T8/T9/T10は独立。T3→T11は同hookの書込競合を防ぐ必須依存。T4/T11は別ファイル、T5/T13は別統合test、T6/T12は別仕様群なので並列可能。T3でUIが参照する残存同期型を先に公開しT4とT11の人工依存を避ける。

## SSoT Synchronization

T6でSPEC_GENERATE:222-224/271、SPEC_COMMON:337、SPEC_HISTORY:56/71を同期。T12で新POST/schemaをdocs/openapi.yamlへ反映。既存availability契約、Snapshot独立、metadata上限30/1000、IndexedDB10分、cleanup期限は維持。REQ-333過去設計は保持する。

## Test Strategy

型チェック、controller/LazyThumbnail/DisplayState/Galleryの局所試験、残存BE API/FE decoder/純粋merge/bootstrap/復元接続の局所試験、T5既存ACとT13reloadAC結合を実QueryClientで検証する。既存BE cache保持、FE全体回帰、Gate3でbrowser cache-hit/Comfy再起動/hard reloadを実機確認する。詳細はtest-plan/カードを参照。現在は設計のみで実装テスト未実行。

## Trade-offs and Risks

既存履歴はlazy需要だけ確認、新規差分候補は存在確認後に追加するため初回差分応答を待つ。BE HEAD非対応では既存GET原画転送が起き、10候補pageでも遅延が生じる。最大2並列と逐次page表示で操作を継続可能にする。HEAD改善/新TTL/DB missing flagは範囲に加えない。

上流は差分history APIを持たないためBE内部でmax_items=200を列挙する。FEへ全件を返して置換する案は追加要求と合わず採用しない。既存200行を優先し空きslotのみ追加、候補窓外や同期中の新規増加はpartialになり得る。unknown候補は存在未確認のため追加保留。manual retry/reloadだけ回復する。

既存相対順を維持して新規ブロックを先頭へ置くため、復元から漏れた古い試行を厳密な生成日時へ挿入しない。managed/legacyで根拠時刻が違うためBEの順序を固定し推測日時を作らない。missing同identity再作成は同page抑止、真reloadで再確認する。

## Local Audit and Human Review

2026-10-12: 旧監査はINCONCLUSIVE。docs/design/REQ-345-audit-retry.jsonでは3 chunks処理後、最終合成が出力token上限で未完了（exit1）。直後のunloadはexit0でロードモデルなしを確認した。初回モデル不在/timeoutの記録も履歴として保存する。

後続の固定model qwen/qwen3.5-9b / Q6_K / reasoning=none / context32768 / timeout600 / --unload-afterによる8対象監査はexit0で最終合成まで完了、判定はISSUES_DETECTED（CRITICAL DEFECTS DETECTED）。unload exit0を確認済み。証跡: docs/design/REQ-345-audit-32k.json / REQ-345-audit-32k.log。exit0は監査実行完了であり設計PASSではない。

本再読込改訂はPBI/設計/テスト計画/13枚Task Card/計画を更新した新revision。32k監査の対象は旧8資産で、新規T7〜T13を含む現revision全体の再監査は未実行。親の重複監査禁止指示に従い同passで追加推論しない。指摘対応は docs/design/REQ-345-audit-response.md に個別記録。実装・実装テスト未着手。全カードはdraft/design_gate=pending、改訂設計の人間承認待ち。
