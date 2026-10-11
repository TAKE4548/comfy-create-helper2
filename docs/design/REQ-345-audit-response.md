---
id: REQ-345-audit-response
pbi_id: REQ-345
status: draft
tags: [audit, generation, history, reload]
related_paths:
  - docs/design/REQ-345-audit-32k.json
  - docs/design/REQ-345-audit-retry.json
  - docs/design/REQ-345.md
  - docs/design/REQ-345-test-plan.md
  - implementation_plan.md
---

# REQ-345 ローカル監査指摘への設計応答

監査実行完了と設計承認を区別する。旧8対象の32k監査はISSUES_DETECTED、exit0/unload確認。従前の最終合成失敗INCONCLUSIVEを上書きしない。続く現revisionの16対象監査も7 chunks・最終合成までexit0、判定CRITICAL DEFECTS DETECTED、unload確認済み。証跡: `docs/design/REQ-345-audit-current.json` / `.log`。いずれも監査PASSを意味しない。

| 監査指摘 | AC/既存設計との照合 | 本revisionの対応・検証 |
|---|---|---|
| 1. INCONCLUSIVEとready/dispatchの不一致 | 対応が必要。旧readyは人間設計承認済みと誤読される | 全13カードdraft/design_gate=pending、handover implementation_ready=false。監査履歴と現revisionの未監査を分離 |
| 2. missingのmanual retry | missingの同page固定はAC-2の要求。missingにも再probeする案は不採用 | T1/T3/T4: retry=trueでもmissingはprobe0。unknown retryだけ許可。真page reloadでcontroller再作成。差分手動同期もMをknownへ送りmissing再検査0 |
| 3. backend missingとbrowser onLoadの優先 | 元設計はonLoadを契機とし存在根拠にしない。追加adopt/pending raceの明記は必要 | missingが優先しpage固定。cached image onLoad、BE present後のpending応答、互換present eventでも解除しない。T1/T11のrace test |
| 4. unknownのTTL/reload | 新TTLはユーザー要求・既存仕様にないため不採用。新候補と既存表示の扱いは区別が必要 | 既存unknown保持/自動retry0、差分unknown追加保留/同cycle検査0。manual retryまたは真page reloadで新確認。保存期限/IndexedDB10分は維持。AC-3/4/9 |
| 5. StrictMode dispose | 元設計の方針に加えて実装可能な接続世代の規則が必要 | 同owner effect reconnectでpending共有。cleanupの同一turn猶予中に再接続すればdispose/abortを取消、真離脱なら失効。settleは世代/接続を検査しlate書込0。T1/T3/T11に証拠 |
| 6. history/Snapshot owner混線 | Snapshot branchを未登録にする既存仕様で保護できる。Snapshotをkeyへ追加して一緒に確認する案は不要 | trial専用owner（history branch）だけobserve。Snapshot同URLでもobserve/adopt/差分集合へ入れない。別データqueryの保持をT4/T5/T13で深い等価比較 |
| 7. APIエラー/timeout分類 | 既存availability本文契約でmissing確定。HTTP404をmissingへ変換する案は誤り | probe本文missingのみ。503/422/HTTP404/timeout/通信失敗/不正本文はunknown/同期error。差分失敗は既存保持、fallback0。T7/T8/T11/T13でstatus別試験 |

本revisionでは上記の具体的な設計不足を記述上対応した。unsupportedなTTL追加、missing自動再確認、Snapshotまでprobeする要求は採用しない。実装による解消や検証PASSは未確認である。現revision全対象の再監査と人間設計レビューが残る。親の同pass重複監査禁止指示に従って追加推論は実行しなかった。

## 現行改訂の監査指摘整理（16対象）

| 指摘 | 現行AC・設計との照合 | 判定・残作業 |
|---|---|---|
| 真のページ再読込後のmissing回復 | document reloadで新しいcontroller epochを作り、残存差分APIでBE候補を再評価する。同一ページ中のmissing固定はAC-2の要件。 | **設計では対応済み。** テストで「missing後に同一画像が復旧し、真の再読込後に1回だけ再追加、同一epochでは再確認しない」を明示する。 |
| unknownのretry/reload方針 | 既存表示のunknownは保持し自動retryしない。明示retryまたは真のreloadで再評価可能。新規unknown候補は当該同期で追加せず、同じ同期中に繰り返し確認しない。 | **設計・テスト計画で対応済み。** missingとunknownを区別し、要求にないTTLは追加しない。 |
| BE候補200件の上限 | BEは既存上流 `/history?max_items=200` の候補範囲に制限される。ページ分割はこの候補集合内だけを確認し、範囲外の古い候補は検出できない。 | **残存履歴の制約として妥当な指摘。** 最新200件より古い履歴の完全性は保証しない。この上限を人間レビューで明示し、全履歴を完全同期すると説明しない。 |
| HTTP 404とunknown | 上流原画の404がavailability応答本文の `missing` として確認された場合は消失確定。残存/availability API自体のHTTP 404、422/503、通信/timeout/不正応答はAPI・同期エラーであり、原画missingへ変換しない。 | **設計・テスト計画で対応済み。** 2種類の404を混同しない。 |
| reloadと手動同期の競合 | document epoch重複排除でStrictMode/route replayを防ぎ、応答直前再比較で重複行は抑止する。一方、同epoch内で独立した手動同期が同時に始まる場合の直列化は明記されていない。 | **設計上の未解決点。** epoch内のin-flight同期を1件に制限し、再操作はPromise共有または操作無効化とする規則および競合テストが必要。 |
| 回復行のmetadata・時系列 | 既存URL/順序/選択の維持は定義済み。ただし `ResidualHistoryItem` はidentity、view URL、session IDのみで、既存履歴画像型が必要とする全metadataの復元元は確定していない。 | **設計上の未解決点。** 既存履歴型に必要な生成metadata/timestampを応答またはmapperで維持し、BEレコードとの一致・順序を検証する。 |
| SSoT/session/type/partial結果 | session振分けとページ単位partial結果は記載済み。`ImageIdentity` のFE/BE正本の所有先と、BE 200件上限による未完了状態をUIでどう伝えるかが未確定。 | **一部対応、残課題あり。** canonical identityの型所有と上限/partial表示を定義する。session隔離ルールは維持する。 |

この整理によって実装準備完了とはならない。支持された設計不足と上限付き履歴という制約を、設計/AC/該当カードへ反映して承認を得るまで実装へ進まない。このターンで監査を再実行しない。

## 現行改訂版の再監査（2026-10-12）

対象: 設計書、実装計画、テスト計画、Task Card T1〜T13 の全16資産。固定モデル `qwen/qwen3.5-9b`、context=32768、timeout=600、7 chunks、exit 0、`--unload-after` による unload/ロード中モデルなし確認も exit 0。監査実行結果は **CRITICAL DEFECTS DETECTED**。完全な出力は `docs/design/REQ-345-audit-current.log`、構造化記録は `docs/design/REQ-345-audit-current.json`。

| 最新監査指摘 | 照合・扱い |
|---|---|
| missing の復旧と unknown の再確認 | controller 状態はdocument reloadで新epochとなる。既存表示行は差分同期の候補から除外されるが、可視時のlazy availability確認で再評価する。新規差分候補はBE presentのみ採用し、missing/unknownは追加しない。この意図をレビュー時に確認する。 |
| BE候補上限200件と、それより古い残存履歴 | **実際の制約として明示する。** upstream に差分API/ページングがないため、1回のreload差分でBEが列挙できる履歴は既存上限200件。200件より古い/上限外の残存画像が完全同期される保証はない。全履歴GET/置換を行わないという要件とのトレードオフとして設計リスクに記載し、受入レビュー対象とする。 |
| HTTP 404のmissing/unknown分類 | 設計契約ではprobe本文の明示的な`missing`のみmissing。HTTP 404、503、timeout、通信失敗、不正本文はunknownまたは同期error。HTTP状態だけでmissing扱いする指摘は現設計と不一致で、テスト計画に確認ケースがある。 |
| 同時同期・StrictMode | 1 document epochにつき一度の論理同期、QueryClient共有の実行記録、逐次ページ要求、接続世代検査とlate-write抑止を設計済み。route remount/StrictMode replayの重複を回避する前提。手動同期との重複は実装時に既存同期契約へ照合する。 |
| 復元画像のmetadata/時系列 | BEから返る履歴アイテムのmetadataを保つ。既存表示の相対順・選択状態を変えず、新規presentだけをまとまりとして追加し、推測日時による挿入はしない。厳密な時系列挿入は保証しない制約を開示する。 |
| SSoT、session isolation、type duplication、partial UI | canonical identityとsession一致条件、page/session scoped state、partial/error statusをTask Card/AC/test planで検証する。監査出力にはファイル・行を特定しない一般的なリスク記述も含まれ、現状で特定できる追加矛盾とは分ける。 |

本監査は実行完了を示すもので、設計PASSを示さない。追加した200件上限の制約を設計レビュー対象として明記する。改訂後レビュー未承認、実装・実装テスト未着手。
