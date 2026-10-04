# REQ-314 BA監査指摘の照合結果

> 後続決定: D1は既存6種類、D2は既存契約内に人間が確定済み。[決定記録](REQ-314-decisions.md)。以下は要件確定前の監査入力に対する照合結果として保持する。最終設計レビュー承認は未記録。

## 結論
監査処理は全8部分で完了（各exit 0）。ローカルモデルは条件付き承認・追加指摘を返しており、**COMPLIANT/PASSとは判定していない**。
指摘の原文を保持し、設計・タスクカード・現行コード・公式資料に照合した。D1/D2は既知の人間判断待ちとして維持する。今回の照合で、それ以外の新たな必須仕様変更を確定していない。
実装前の設計監査であり、型チェック・Vitest・手動ブラウザ確認の合格証拠ではない。

## 実行証拠
- 最新17成果物（詳細設計・テスト計画・実装計画・14カード）の全文80,598文字を、省略せず8部分に分割。
- 実行所要時間: 15.6分。
- 全部分にD1/D2の判断待ち、ブラウザ確認はユーザー手動という共通文脈を追加。断片境界でコード・定義が離れることによる誤検出の可能性は残る。
- Model: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored / reasoning / 9.0B / Q6_K（各ログtrace）。
- 推論引数1200秒、各呼出の保護上限1260秒。完成した部分の結果を保存し、会話中断後に成功済み部分を再実行しない方式。
- [実行情報・対象SHA-256](REQ-314-ba-audit-checkpoint-evidence.json)、[全文カバレッジ照合](REQ-314-ba-audit-coverage-evidence.json)。
- 全対象ファイルのSHA-256は監査開始時から不変。各入力の本文を連結した結果と全対象テキストの一致を確認した。
- 明示unload exit 0、lms ps exit 0でモデル未ロードを確認。[cleanup](REQ-314-ba-audit-checkpoint-unload.log) / [model state](REQ-314-ba-audit-checkpoint-model-state.log)。GPU物理メモリ100%解放は未実測。

## 原判定・出力
監査モデルの原判定は改変しない。exit 0は実行成功であり設計の無条件承認ではない。

| 部分 | 原出力の要旨 | 原文 |
|---|---|---|
| 1 | PASS with reservations / NEEDS IMPROVEMENT / AT RISK | [part1](REQ-314-ba-audit-checkpoint-part1.log) |
| 2 | CONDITIONAL APPROVAL PENDING HUMAN DECISION CLARIFICATION | [part2](REQ-314-ba-audit-checkpoint-part2.log) |
| 3 | CONDITIONAL APPROVAL | [part3](REQ-314-ba-audit-checkpoint-part3.log) |
| 4 | 条件付きで許容、SSoT violation等を指摘 | [part4](REQ-314-ba-audit-checkpoint-part4.log) |
| 5 | Consistency 6.5/10、矛盾等を指摘 | [part5](REQ-314-ba-audit-checkpoint-part5.log) |
| 6 | Integrity 6.25/10、実装ゲート前の解決を要求 | [part6](REQ-314-ba-audit-checkpoint-part6.log) |
| 7 | review with clarifications、P0対応前は実装不可と評価 | [part7](REQ-314-ba-audit-checkpoint-part7.log) |
| 8 | APPROVE WITH CONDITIONS | [part8](REQ-314-ba-audit-checkpoint-part8.log) |

## 指摘照合

| 指摘群 | 判断 | 原文・現行コードによる根拠 |
|---|---|---|
| D1: 6/7 prompt、D2: 接続URL編集 | 既知の判断待ちを維持 | REQ-314.md Required Human Decisions、test-plan AC-4/7 BLOCKED、各カードReview Gate。承認前は実装禁止。 |
| 承認待ちなのに設計・将来の検証手順があるという「paradox」 | 誤読 | 設計時点の未実行と、承認後の予定・期待値を明示的に分けている。承認後の条件付き判定は現在のPASS宣言ではない。 |
| T14/T5、T7/T12/T13の循環、T11依存欠落 | 誤検出 | 全14カードのdepends_onを検査し循環なし・未定義依存なし・最大4層。T11→T7→T12/T13を含む。[DAG証拠](REQ-314-ba-audit-dag-evidence.json)。 |
| 2個の詳細booleanでは5タブを管理できない | 誤読 | activeTabは別のSettingsTabId。詳細booleanはprompt/dialogueの詳細だけ。基本カードは展開済み。REQ-314.md State/NavigationとT7。 |
| invalid hash、Storage例外、壊れたv2値の対策がない | 対策済み | REQ-314.md:115-119、T1、T7:74、RT-1に優先順位・replace正規化・try/catch・object/boolean検証を規定。QuotaExceededErrorという個別テスト名は任意の追加候補。 |
| 古い翻訳応答・unmount後応答・provider切替競合 | 対策済み、実装注意を維持 | REQ-314.md:158、T6:69のrequest sequenceで旧response/rejectionを無視。RT-3/4、T6のfake timer/遅延応答検証を維持。タイマーcleanupはこの既存責務の実装時確認事項。AbortSignal追加はAPI不変制約から要求しない。 |
| debounce 300..2000がランダム、provider別値が必要 | 誤読・追加要件 | 既存translation_debounceの設定範囲300..2000ms、step50、既定500。T4/T6は保存済みの単一設定を使用。provider別設定や新cacheは要求外。 |
| dirty値保護・保存失敗時の保持がない、dirtyを永続化すべき | 対策済み・追加要件 | REQ-314.md:143、T3:101、T4:76でrefetch保護と保存成功値照合。ページ離脱後の未保存draft永続化は新設しないという明示範囲。 |
| translate-stats keyが5個の列挙にないため不変違反 | 誤読 | 列挙は排他的allowlistではない。現行TranslationSettingsSection.tsx:34で存在し、T4:75とREQ-314.md:150で既存統計/cache機能の維持を要求。 |
| TranslateTestRequest/Responseが存在しない | 誤検出 | frontend/src/api/types.ts:778,784に定義、client.tsでimport/re-exportしtestConnectionが使用。previewは既存translatePrompt APIを使う。 |
| boolean inputが未対応 | 誤検出 | SettingsComponents.tsx:124とMappingMasterSection.tsx:55にboolean選択肢が存在。T9は既存type/row契約を維持する。 |
| 矢印でfocus/選択を同時変更するのは非準拠 | 誤検出 | W3C APGは自動activationを認め、即時表示できる事前ロードpanelで推奨。全panel常時mountの設計と一致。下記公式資料参照。 |
| tabs化が現行accordionと異なるため矛盾 | 要求された変更そのもの | REQ-314は縦accordionから5水平tabへの刷新を要求。surgical snippetは変更前の接続契約の記録で、最終UI指定ではない。 |
| CSS境界/safe-area/44px/50件/モバイルDNDの定義欠落 | 既存手動確認項目で対応 | REQ-314.md Responsive、test-plan E2E-5/RT-5/RT-8/RT-11、T11/T12/T9に明記。向き変更・ソフトキーボードは任意の手動追加候補。ブラウザ自動化はユーザー指示で除外。 |
| SPEC更新はSSoT不変原則に違反、version tagが必要 | プロトコル解釈の相違・追加要件 | T13は承認済みD1/D2と実装証拠で関連正本を同期する明示タスク。未承認要件へ書換えたりAPIを追加する許可ではない。独自version制度の追加は要求外。 |
| 予定変更行・カード行数・抜粋行数が一致せずatomicity不明 | 単位の誤読 | 予定変更行は実装+テストの追加削除合計、カード本文と抜粋は文書の行数。各カードは超過見込み時の分割差戻しを明記。実装差分の実測は実装後に行う。 |
| 保存されたURLがofflineならrollbackすべき | 追加要件・既存契約保持 | 保存値と疎通成功は別。T14は既存void setterを使い、INT-6/RT-6/RT-9で保存・probe・失敗表示を検証。既存store/APIへPromise・自動rollbackを追加する要件はない。 |
| propsにdata/onChangeがない、query inheritanceがない、model名不明 | 誤読・断片由来の不足 | 既存component内部Queryと共有cacheを再利用する設計。T3のgroup allowlist/modelキー、T4自己管理provider、REQ-314.md:130-143が接続先を定義。 |
| T8/T9独立、touch/mouseの二重反応、virtualization/contrast/live-region | 仮説・実装/手動注意 | 既存独立componentの表示変更を所有し、T12/T13で合流。現行longpress/DNDを維持してRT-11と局所検証を行う。二重発火の再現証拠はなく、仮説のみで新virtualization等を追加しない。 |
| 新testがまだ無くコマンドが実行済みでない | 設計段階の予定であり誤読 | 各カードが生成するtestのpathを指定し、設計時点未実行を明記。実行予定と成功証拠を混同しない。 |

公式根拠: [W3C APG Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) Keyboard Interaction / Note（即時表示できるtabはfocus時の自動activationを許容）。

## 次の状態
D1（既存6種への訂正か7件目定義）とD2（接続UIを既存契約に限定するかAPI拡張するか）の決定、および設計承認を待つ。監査再試行やcontinueは実装承認として扱わない。
任意の追加検証候補は必須要件へ格上げしていない。型チェック/Vitest/ブラウザ手動確認は実装後に計画通り実施し、未確認のACをPASSとしない。
