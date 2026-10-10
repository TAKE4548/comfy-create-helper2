---
id: REQ-334-contracts
title: REQ-334 API・永続化契約ゲート
status: implementation
tags: [REQ-334, api, persistence, contract-gate]
related_paths:
  - docs/backlog/pbi/archive/REQ-334.md
  - docs/design/REQ-334.md
  - docs/design/REQ-334-ac-coverage.md
---

# REQ-334 Contract Gates

OpenAPI正本 `docs/openapi.yaml` が現在存在しないため、以下は実装前に既存コード/APIを調査し、変更契約を設計・承認するための候補。エンドポイント名やresponse shapeを既成事実として扱わない。必要なAPI契約追加はPBIスコープ内で計画し、OpenAPI正本復旧と同期を先行させる。

| Gate | AC | Domain | Contract questions to resolve before implementation |
|---|---|---|---|
| C1 | AC-11, AC-57/58, AC-76/80 | filtered all-selection / bulk operations | 全件IDをページング・検索条件付きで取得できるか。削除/移動結果の部分成功、対象件数、競合時の原子性。 |
| C2 | AC-34–39 | queued-only cancel reservation | 3秒予約ID、開始済みjobを除外する原子的server guard、予約解除、経過後commit、部分成功/未確認結果。既存queue lifecycleとの両立。 |
| C3 | AC-57, AC-61–65 | LoRA metadata/editor | range strength、category/model relation、trigger set ordering、画像crop/example persistenceの現行schema/API能力。 |
| C4 | AC-66/67 | AddAsset tray | 選択集合と適用対象の一致、0.05 adjustmentと既存有効範囲、save semantics。 |
| C5 | AC-68–70 | TagSet parser/subsets | Danbooru token normalization、nested weighted expression、duplicate rule、named subset/crop representative storage. |
| C6 | AC-88–90, AC-101/102 | workflow settings | mapping configuration/import-export format/version/validation/atomic apply and error report. |
| C7 | AC-91/92 | prompt Playground | rendered prompt input path, token limit source, draft isolation, error/timeout behavior. |
| C8 | AC-95–97 | detection preview/translation dictionary | sensitivity preview contract, dictionary storage/matching and deletion behavior, translation test result. |
| C9 | AC-98–100 | service health/logs/control | authoritative source for 3 service states/logs, 8899 origin boundary, timeout-as-unknown/no automatic resend, confirmed operation guard. |

## Gate Exit Evidence

For each gate record current endpoint/schema (if any), proposed request/response types, persistence owner, failure and concurrency behavior, OpenAPI delta, and integration tests. A gate exits when contract is confirmed or explicitly designed and approved; lack of current endpoint alone does not defer the associated acceptance criteria.

## 実装時の契約確定（2026-10-10）

ユーザーは全102ACの実装を承認済み。下記は同じ受入基準を満たすため既存コードと照合した契約。実装完了・QA合格を意味しない。OpenAPIはAPI実装集約後にアプリの生成スキーマから復旧する。

| Gate | 確定契約と所有 | 実装・検証状態 |
|---|---|---|
| C1 | 既存一覧APIが絞込み全件を返す。T11共通選択、T12/T13対象操作、T14ZIP。表示済みページのみの全選択を禁止 | focused test済み、実画面QA待ち |
| C2 | 3秒はクライアントの取消予約。期限前Undo/閉鎖は要求0。既存POST jobs/{id}/cancelにonly_queued=trueを追加し、ロック内でlocal/upstream待機を確認、実行開始後はinterruptしない | T27実装済み、T63型/API後T6 UI。既定取消・only_unsubmitted維持 |
| C3 | 既存強度range/trigger保存を利用。手動作例はLoraExampleImage順序付き、example_paths省略/null保持・[]消去、生成作例は別関係維持 | T20/T34/T35/T50〜55実装済み、再訪QA待ち |
| C4 | 既存選択Mapがトレイと適用payloadの正本。強度0.05、既存0〜2を維持 | T21実装済み |
| C5 | 大小区別完全一致、括弧深さ0でのみカンマ/改行分割。既存subset/crop APIを使用 | T22/T13実装済み |
| C6 | Workflow設定JSON version1、インポート検証/確認後1更新。default_applied_assets省略保持・明示null消去 | T28/T55実装済み |
| C7 | POST llm-prompts/playground。未保存system_prompt/text、variables、model、llm_params。{{name}}をliteral置換。rendered_promptは展開system、resultはLLM出力、token_limitは実モデルmetadataの正整数またはnull。既定model読取可、preview保存不可 | T58後T59/T29。30秒、timeout/errorは失敗、再送なし |
| C8 detection | 既存POST snapshots/{id}/detect-bubble-debugのrequestに任意min_area50〜5000/min_brightness0〜255。省略は保存設定、指定は未保存感度。candidatesを返しsnapshot/設定を書かない | T41後T59/T40 |
| C8 dictionary | GET/PUT translate/dictionary {rules:[{source,replacement}]}。AppSetting.translation_dictionary保存。source非空/完全一致重複拒否。case-sensitive literal、最長一致優先の同時置換、連鎖なし。/translate/promptのcache後に適用し削除は即時反映 | T44後T59/T43。既存LLM翻訳経路も別統合で確認 |
| C8 translation test | 既存translate/testのsuccess/sample_translation/errorを利用。入力設定は未保存でも試験可 | T42 |
| C9 | Supervisor=8899到達性、Windows Backend=status.be、ComfyUI=status.comfyの3カード。frontendは主カードに追加しない。action/logsは同一hostname8899既存API。7秒read/120秒action、timeoutは要求結果未確認、再送なし、stop/restartは対象名付き確認 | T9後T32統合検証 |

追加表示契約: JobView.set_name/prompt_excerptは送信時の凍結記録から取得する。prompt excerptは記録済みsubmitted textarea、negative/private除外、最大160文字、欠損はnull（T56）。Album.descriptionは既存AppSettingのalbum_description:{id}に保存し、省略保持/null消去、legacy nullとする（T60/T61）。
