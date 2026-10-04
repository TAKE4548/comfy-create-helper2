---
id: REQ-316-test-plan
status: completed
tags: [metadata, integration, e2e, red-team, association-edit]
related_paths:
- docs/backlog/pbi/archive/REQ-316.md
- docs/design/REQ-316.md
- frontend/src/components/HistoryModalPreview.tsx
- backend/app/services/snapshot_service.py
---
# REQ-316 改訂テスト計画

## Scope / 実施条件
人間の設計承認後に実装担当/QAが実行。受入基準AC-1〜24の正本は[PBI](../backlog/pbi/archive/REQ-316.md#acceptance-criteria-ac)とし、本書の各AC参照はそこへ対応する。全ACに対応する自動・ブラウザー・実生成の記録済みシナリオを完了した。失敗経路E2Eは未実施であり、ACのPASS根拠には用いない。
生成factsと現在関連を分け、actual graph/mapping・全JSON値・参照UI・タグ編集を対象とする。全任意ノード収集や生成完了時刻の取得は追加しない。local200/server1000の保持を維持。
PowerShellの起点はworkspace root。frontendコマンドはfrontend/で実行し、backendコマンドはbackend/へ移動して `.venv/Scripts/python.exe` を使う。
QA runnerは各プロセスに最大900秒のtimeoutを適用する。標準出力・標準エラーの実内容と終了コードを実行記録へ保存する。timeout、ログ欠落、結果を取得できない終了はPASSにせずINCONCLUSIVEとする。想定環境は`.agents/context.md`記載のbackend `.venv` とNode/npmであり、pathがないときは別環境を推測せず実行不能を記録する。

### 証拠と比較の定義
- 文字列の「完全一致」はtrim・Unicode正規化・改行変換をしないJavaScript文字列の厳密一致（`actual === expected`）。JSONはparse後の対象string fieldを比較し、DOMは該当要素の`textContent`を期待文字列と直接比較する。スクリーンショットは配置/可視性の証拠で、文字列比較の代用にはしない。
- 全文の「末尾まで表示」はスクロール後に一意な末尾marker要素がメタ情報パネルのviewport内に存在し、実際に文字列を読める画面状態で確認する。証拠にはviewport寸法とmarkerのスクリーンショットを記録する。
- test commandのactual outputは標準出力/標準エラーの保存ログ、summaryのPASS件数、およびprocess exit codeを指す。型検査はexit 0かつdiagnosticなし、test suiteはexit 0かつ失敗0件をPASS条件とする。
- Clipboardの手動確認はユーザーから完了報告あり。以前のCUA virtual clipboard readback空はツール制約の証拠として保持する。報告からOS byte比較やseedコピー個別確認までは推定しない。

## Static / Unit and Contract
```powershell
Set-Location frontend
npm run typecheck
npx vitest run src/utils/__tests__/generationRecord.test.ts src/utils/__tests__/promptRecord.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/useAssetSelectionState.test.ts src/store/__tests__/slices/jobQueueSlice.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/components/__tests__/GenerationMetadataPanel.test.tsx src/components/__tests__/GenerationPromptFields.test.tsx src/components/__tests__/SnapshotTagAssociationsPanel.test.tsx src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts src/api/__tests__/snapshotAssociations.test.ts
Set-Location ..\backend
$env:PYTHONPATH = '.'
\.venv\Scripts\python.exe -m pytest tests/test_prompt_metadata.py tests/test_snapshots_req316_metadata.py tests/test_snapshot_associations_req316.py -v
\.venv\Scripts\python.exe -m mypy app/schemas/snapshot.py app/services/snapshot_service.py
Set-Location ..
```
上記frontend test pathは本改訂実装で追加済み。各コマンドのexit codeと実出力を証拠とし、未実行・存在しないpathはPASSとしない。既存injector/multiSet回帰はT2カードの局所コマンドで確認。
JSON文字列輸送の原文一致、decode後の欄順/名前/値、PATCH前後のfacts不変を検証する。SQLite fixture/依存mockで外部画像DLを避ける。既存baselineの全体3-Gateはcoordinator/QAで実施。

## Integration Scenarios
|ID|Given / When|Then / AC・証拠|
|---|---|---|
|INT-1|任意5欄＋negative＋空欄、disabled chip、ParamSync、default-only値で生成|各record fieldをJSON decode後、期待JS文字列と`===`で比較し、DOM `textContent`も同じ期待文字列と`===`で一致させる。欄数はrecorded fields配列の要素数と一致し、固定欄数を使わない。AC-1/2/6/9。|
|INT-2|random2回/fixed2回/2セット×2バッチ、待機中workflow名/入力/選択を変更|送信graph seedと各画像record seedが一致、fixed+indexも一致。再乱数化なし。旧seedは実使用として昇格しない。AC-4/16/17。|
|INT-3|mapped CFG/steps/denoise/checkpoint/VAE/roleなし/同role複数、未知params、false/0/空文字/配列/辞書/null|各mappingのname/valueが記録順でDOMにあり、追加paramsはkey/valueで表示される。0/false/空/null/配列/objectのJSON表現が入力値と一致し、`[object Object]` にならない。graph参照は参照として表示。AC-15。|
|INT-4|bypass、model/clip strength別値、後日master名/description変更|bypassed入力を実使用として示さず、生成時モデル値/各強度を保持。現master名は現在関連にのみ使用。AC-18。|
|INT-5|生成→現在全入力編集→保存→元prompt metadata削除→リロード|Snapshot.paramsが正本で全facts保持、current fallbackなし。empty snapshotでもcache補完なし。AC-4/5/8/10。|
|INT-6|local破損/server成功、paramsあり/assetsなし、server ID不一致、片方失敗/両方失敗|同一画像/同一ソース、片方成功を維持、prompt ID成功を保存失敗に変えない。欠落は未記録。200/1000規則維持。|
|INT-7|triggerを明示選択、default、旧asset wordsのみ、master同words別ID|新選択だけID/name/wordsを捕捉、default none、旧unknown。名称/同wordsで推定しない。AC-18。|
|INT-8|正/負role付きgeneric＋trigger2リスト、LoRA strength/model/clip別値を持つsnapshotを編集|各リスト追加/削除後PATCH・再GET一致。generation record/通常params/LoRA role/strength/album/created_atは不変。AC-19/21。|
|INT-9|編集→キャンセル/閉じる/画像切替/追従、保存時400/ネットワーク失敗|キャンセルはAPIなしでdraft破棄。失敗はdraft保持と日本語エラー、再試行可能。別画像へdraft/応答を混入しない。AC-20。|
|INT-10|TagSet IDとtrigger ID同じ数値、親LoRA違い、重複、roleなし、両旧新payload|source別保存。不正新規ID/親不一致/同時payloadは400、transaction全体変更なし。削除済み既存参照の保持/削除を許可。AC-19/21。|
|INT-11|queued_at/local timestamp/server created_at/snapshot created_atを別時刻に設定|キュー記録/DBメタ保存/画像保存の意味を別表示、完了時刻は未記録。生成時workflow名なしでmaster補完なし。current albumを複数列挙。AC-17。|

## E2E / Acceptance Paths
新ブラウザ基盤は追加しない。既存起動URLを利用するQAのブラウザツールで確認し、実際に使ったviewportと確認結果をwalkthroughへ保存する。デスクトップ/狭幅表示は画面内の横スクロールや本文切れの有無を記録し、画面サイズ自体を製品仕様の固定値にしない。実ComfyUIが使えない場合、生成E2EはINCONCLUSIVEでありmockのみでPASSにしない。

### 実行済み実生成シナリオ（成功経路）
2026-10-04に実ComfyUI queueを使い、Prompt ID `e7a2d286-2aaf-4794-bc07-0be46c27a47d` の生成を確認した。5欄の入力文字列が投入graph・generation record・保存Snapshot・再読込DOMで完全一致し、graph seed `1548941896` とrecord seedが一致した。生成後に現在Core入力を `CURRENT_INPUT_CHANGED_AFTER_GENERATION` へ変えてからSnapshot #2を保存し、隔離DB上で元PromptMetadataを削除、現workflow名を変更したうえで、localStorage共有のない別originから再読込した。5欄のDOM値は完全一致し、記録済みworkflow名/Prompt ID/seedは保持された。request/history/snapshot/UIの証拠ファイルはwalkthroughにリンクする。
本シナリオはAC-1/4/5/8/16の成功経路証拠。追加実生成ではrandom 1回とfixed 2 seed×2 batchの計5画像を完了し、全5欄とgraph seedが各recordに一致することを確認した。初回random画像1件と合わせ6画像を確認済み。失敗経路は網羅していない。

Windowsの保存画像HEADは200 `application/octet-stream` を返し、拡張子から形式を推測せずにMIME取得する対応が必要と判明した。T16でgeneric MIMEの場合だけ画像ヘッダーを検出し、T17でHEADのHTTP cacheを回避するQA修正を実施中。確認用同一ブラウザーでは修正前の汎用MIMEが残っていた。T16/T17完了後、WebP HEADと同ブラウザーの再確認で形式表示ACを判定する。

1. **情報構造・全文**: 画像＋パネル、Prompts/Parameters & Assetsタブ、任意全欄、negative、空欄/未記録、非空欄初期open/空欄closed、個別/全開閉。日本語改行2000文字以上＋末尾markerを、定義済みの厳密文字列比較とmarkerのviewport内表示で確認する。desktop/mobileでスクロールとfocus/keyboard操作を確認（AC-1〜3/6/13/14）。
2. **seed・非prompt**: random/fixed各画像で投入graphとseedの表示/コピー一致、全mapped/その他キー/LoRA各strengthを確認。false/0/空JSON値を失わない（AC-10/15/16/18）。
3. **画像・件数・copy**: 実寸832×1216なら正確比率13:19（2:3としない）、別寸法と取得不能を確認。日本語/結合文字/家族emojiで書記素数、欄/item件数は実データから算出。Clipboard許可/拒否で成功/失敗文言が正しい。プロンプトと実seedの原値だけコピー（AC-22〜24）。
4. **生成後変更・保存**: 入力/workflow/マスター変更、保存、cache削除、History再表示で生成時facts不変。ヘッダーはPrompt ID/生成時workflow名・ID/キュー/保存時刻/現在album。完了と呼ばない（AC-4/5/8/17）。
5. **関連編集**: 保存画像でgenericとtriggerを別に追加/削除/保存、再取得/再読込。Cancel、失敗と再試行。facts/非編集role/strength不変。未保存画像の「保存後に編集」を確認（AC-19〜21）。
6. **旧記録・切替**: Qualityのみ/unknown version/params={}/trigger由来unknown。可能性表示、currentから補完なし、後日追加欄を追加なし。画像切替で前画像の値/寸法/draftが消える（AC-7/8/11/12）。

## Red Team / Boundary
- record JSON破損/未知version/重複mapping ID/不正fields/recorded=falseでcomplete: 完全と誤認させず通常JSON値を保持。
- graph参照配列とliteral配列、0/false/null/空辞書: 未記録・空欄・参照を区別。reserved2キー以外の未知キーを隠さない。
- script/HTML/改行/長い1行/CRLF: Reactテキスト、実行なし、全文保持。
- 同display_name/role、mapping変更/名前変更: ID/node識別で全件。現masterで歴史の名前を書き換えない。
- params空＋別cache豊富/誤prompt ID: snapshot正本と対象ID一致。
- browser queue clockとserver/save clockがずれる: 時刻意味を保持、完了時間/所要時間を差分から作らない。
- trigger master削除/名前変更/words編集、旧wordsが複数候補一致: current ID未登録・origin unknownを維持。
- PATCH二重click/保存中閉じる/404/400/一部検証後失敗: 二重保存抑止、atomic rollback、draft保持、他画像/facts不変。
- ローカル容量超過、server拒否、200/1000削除: 他保存先を試し通知。saved factsは削除されない。
- Clipboard reject/Intl.Segmenter未対応/画像load・MIME取得失敗: 偽成功/偽count/架空寸法/推測formatを表示しない。未対応環境は該当ACをPASSにしない。
- 2予約キーを復元して再生成: 入力/graphへ混入せずfresh record。

## Traceability / 判定
AC-1/2/3/6/7/11/12 → T9/T1/T15/T14/T4/T7。AC-4/5/8/9/10 → T2/T3/T5/T6/T7。AC-13/14/15/17/18/22/23/24 → T1/T4/T14/T15、由来はT10。AC-16 → T9/T2/T3/T14。AC-19/20/21 → T11/T12/T13/T4、初回関連はT5。
T8は正本のplanned/implemented区別を実装証拠に合わせる。
PASSは対象ACと実行証拠が成立したときだけ。値不一致/現値混入/role強度破壊/偽copy成功はFAIL。未実施・実環境利用不能はINCONCLUSIVE。
