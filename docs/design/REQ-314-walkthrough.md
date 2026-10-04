# REQ-314 検証 walkthrough

検証日: 2026-10-04  
検証担当: tester-reviewer  
総合 verdict: **PASS（2026-10-05 ユーザー手動確認完了報告による受入）**

## 判定

自動 Gate 1 と Gate 2、実行対象のGate 3シナリオは成功。2026-10-05、ユーザーから「確認完了」と報告を受領し、手動確認待ちを解消して受入完了とする。以下のAC表とチェックリストは2026-10-04の自律検証終了時点の記録として保持する。個別の測定値・スクリーンショット・実サービスログは提供されておらず、エージェントによる実測証拠は追加しない。QA原判定78/100・ISSUES_DETECTEDと物理GPU使用量の未測定は保持し、記録済みトリアージとユーザー確認を根拠にクローズする。

## `<execution_evidence>`

### Gate 1 — Typecheck

- 実行: `frontend` で `npm run typecheck`
- 結果: exit 0。`tsc -b --noEmit` の診断エラーなし。

### Gate 2 — 全テスト

- 実行: `frontend` で `npx vitest run`（ファイル指定なし）
- 結果: exit 0、**117 files passed / 1,137 tests passed**、失敗0。
- 参考: 開始時ベースラインは106 files / 1,063 tests。最終実行ではテスト74件増加。
- 実行ログに既存テストの意図的なfault injectionに伴うstderr（HTTP 503、接続拒否、WebSocket切断、React act警告等）が出たが、Vitestの失敗は0。

### Gate 3 — 自動実行できたシナリオと境界

- `frontend/src/pages/__tests__/SettingsPage.req314.test.tsx`: 2件成功。hash優先、history/storage同期、未保存prompt編集のtab移動保持を含む。ページ統合テストでは他パネル/コンポーネントをmockしており、全画面や実ブラウザー挙動の証拠ではない。
- コンポーネント/フックの個別テストも全Suiteに含まれ、TranslationSettingsSection 12件、WorkflowConnectionSection 6件、ServiceConnectionCard 5件、MappingMasterSection 3件、SpeechToneSection 3件、BaseModelSection 4件、ThumbnailSettingsSection 3件、SettingsTabBar 6件、`useSettingsTab` 11件、`useThumbnailAspectRatio` 6件等が成功。
- Red Team異常系の実行証拠: `useThumbnailAspectRatio.test.tsx` のstorage読み取り拒否・書き込み拒否・event listener読み取り拒否（3ケース）が成功し、既定値/メモリ値を保つことを確認。翻訳設定テストでは保存中の編集維持、古いrefetchの無視、FuguMT選択時の認証欄非表示とproviderだけの保存を確認。これらはmock/DOMでの失敗注入であり、実ブラウザーの障害試験ではない。
- API/schema確認: `python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py backend/openapi.json list-endpoints` を実行し、workflow、mapping、speech-tone、translate、VRAM、health/config等の契約エンドポイントを抽出。加えて `REQ-314-contract-invariant-evidence.json` は変更対象にbackend/API/client/types/store schema/dependency/AppShell変更がないことを記録。実サーバー疎通は未実施。
- ビルド: coordinatorによる最終 `npm run build` 証拠 `REQ-314-build-evidence.json` はexit 0、index存在、JS `index-CLoDDw42.js` (1,321,985 bytes) とCSS `index-vF0RBO2Y.css` (90,869 bytes) を記録。既存の500kB超Vite chunk警告あり。tester-reviewerは再ビルドしていない。
- 独立QA監査: 初回sandbox実行はLM Studio daemon起動timeoutとWindows socket access deniedで監査回答なし。sandbox外の再試行はexit 0、score **78/100 / ISSUES_DETECTED**。全文ログ `REQ-314-qa-audit.log`。指摘: タブ幅差2 CSS px・44px hitbox・scroll into viewの測定定義が不明瞭、mockテストは実寸証拠ではない、viewport計測自動化/スクリーンショット比較を推奨、repo-state preflightと進捗連動timeout延長も推奨。トリアージ: テスト計画にはタブ幅の`max(width)-min(width) <= 2px`、hitbox DOMRect `width/height >= 44px (1px誤差以内)`、最終操作要素の44px領域全体がbottom navより上にあること、および`document.scrollWidth <= clientWidth+1px`を既に記載している。下の手動表へCSS pixel/rect座標の記録方法を補記する。自律ブラウザー操作・golden screenshot導入はユーザー指示で除外。preflight/timeout-extensionはUI PBIの範囲外。スコアは維持しCOMPLIANTとも扱わない。
- VRAM cleanup: 監査後の明示 unload はexit 0で「No models currently loaded」、外部実行の `lms ps` もexit 0で「No models are currently loaded」を確認。`nvidia-smi` はコマンド未導入でexit 1のため、物理GPU使用量が100%解放されたことは独立測定できない。

### AC適合マトリクス

| AC | 自動検証で得られた証拠 | 判定 |
|---|---|---|
| AC-1 5タブ配置/横幅 | SettingsTabBar DOMテストとビルド成功。1280/768pxの実測はなし。 | **未確認（ユーザー手動）** |
| AC-2 hash/localStorage/履歴 | SettingsPage統合テストでhashを選択元にすること、storage同期とhistory操作、タブ間移動を検証。ブラウザーのback/forward/reload実操作は未実施。 | **部分確認・手動未確認** |
| AC-3 workflow/base/mapping集約 | Workflow、BaseModel、Mapping各コンポーネントのテストが成功。実アプリ内の全操作経路は未確認。 | **部分確認・手動未確認** |
| AC-4 prompt詳細 | 改訂条件D1に沿って既存6種類のallowlist分割テスト、詳細UI・dirty/refetch等のコンポーネントテスト、統合画面で初期閉と未保存編集保持を確認。全画面の保存互換はブラウザー未確認。 | **部分確認・手動未確認** |
| AC-5 tone/model/bubble | Tone、BaseModel、LLM設定、BubbleのDOM/局所テストが成功。下流画面で永続値が反映されることは未確認。 | **部分確認・手動未確認** |
| AC-6 翻訳provider/preview | 4 providerの切替表示、credential条件、保存中編集、stale refetch、provider-only payload等のmock/componentテスト成功。実翻訳、API key、実サービス疎通は未確認。 | **部分確認・手動未確認** |
| AC-7 接続/VRAM/表示 | D2範囲の接続カード、Workflow接続、Thumbnail/VRAM関連のコンポーネントテストとAPI一覧確認。実Comfy/Backend/LM Studio疎通、WebSocket、実GPU値は未確認。 | **部分確認・手動未確認** |
| AC-8 responsive/44px/table/modal | CSSとDOM/componentテストは成功。実viewport計測、safe-area、44px hitbox、モバイルスクロール/重なりは未確認。 | **未確認（ユーザー手動）** |
| AC-9 ARIA/keyboard | tab role/selected/controls/labelledbyとDOM操作の自動テスト成功。実キーボード、読み上げソフト、焦点遷移は未確認。 | **部分確認・手動未確認** |

ACに関係する実測が残るため、上の「部分確認」は合格を意味しない。すべての手動結果を記録するまでAC全体のPASSは宣言しない。

## ユーザー手動チェックリスト（未実施）

各項目はユーザーが実画面で実施し、実測値・観測結果・画面幅・使用サービスを記録する。未実施の状態をPASSに変更しない。

### 画面寸法とAppShell境界

- [ ] 1280px幅: `/settings#workflows` でサイドバーを除いた有効幅と5タブ全rectをCSS pxで記録する。DevToolsで各tabの`getBoundingClientRect().width`を読み、最大値−最小値が2px以内か確認する。横並びを記録。
- [ ] 768px幅: 5タブ等幅表示を確認・計測。
- [ ] 767px幅: 短縮ラベルと横スクロール/snapへの切替、全5タブ選択可を確認。
- [ ] 390px幅: 5タブをスクロール選択後、選択tabのrect全体がtabbar scrollport内に入ったか記録する。ページ横overflowは`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` CSS pxで確認する。表のカード表示、長文折返し、最下部操作とbottom navの重なり、safe-areaも記録。
- [ ] 320px幅: 390pxと同じ項目を確認し、情報欠落や操作不能がないことを記録。
- [ ] AppShell境界 1023px/1024px: それぞれでnavigation/layout境界、tab表示、横overflow/重なりを比較。
- [ ] 200% zoomとlong Japanese/URL/promptでレイアウト、表、modal scroll、最後の操作要素を確認。各実ボタン/input/select/textarea/drag/checkbox labelの`getBoundingClientRect()` width/heightをCSS pxで記録し、最低44px（計画記載の1px誤差許容）を照合する。最後の操作要素では44px全体がbottom navigationのtopより上にあることをrect座標で確認する。

### タブ、履歴、ARIA、draft

- [ ] 5タブをクリックし、hash・選択タブ・表示panel・localStorage値が一致することを確認。
- [ ] 選択中タブ再クリックで履歴が増えないこと、back/forward各5回、reload、search query保持、無効hash/storage時のfallbackを確認。
- [ ] Tab/Shift+Tab、Left/Right/Home/End、Enter/Spaceで操作し、選択状態、focus、tabpanel移動、hidden panelへのfocus侵入を確認。
- [ ] 各tabの `aria-controls` と panelの `aria-labelledby`、accessible name、読み上げ可能環境で見出し/表ラベルを確認。
- [ ] prompt、params、provider credential、toneの未保存編集中に別tabへ移動し、戻った時の値を確認。保存中の追加編集とrefetch後も観察する。

### 設定と障害シナリオ

- [ ] 翻訳 providerをFuguMT、DeepL、Google Cloud、LLMへ順次変更し、保存前の詳細表示/認証欄、保存payload、preview、実翻訳の結果を記録する。
- [ ] 実際に利用可能なComfy接続URLの編集・保存・疎通、Backend origin/health、LM Studio Backend経由接続を確認。利用不能な場合はその環境を明記しINCONCLUSIVEとする。
- [ ] VRAM値/threshold、live更新、WebSocket切断・復帰を確認。実機GPUメモリは実測ツールの値を記録する。
- [ ] Storageアクセス拒否、API 500/timeout、空models、offline Comfy、WS切断の実環境シナリオで画面クラッシュ、値保持、誤った成功表示がないか確認する。
- [ ] Workflow rename/copy/diff/rollback/delete、BaseModel/checkpoint、Mapping CRUD/reorder、preset/modalを専用fixtureで確認。既存ユーザーデータを破壊せず、後処理でfixtureを戻す。
- [ ] Speech tone/modal、bubble設定、LLM prompt分類と保存、Thumbnail比率を確認し、Generate/Speech等の利用側に反映されることを確認する。

### 仕様決定の確認

- [ ] D1: prompt分類は決定記録の既存6種類に限定され、7種類目や新規保存キーがない。詳細初期閉、既存キーで保存互換。
- [ ] D2: Comfyは既存URL編集/保存/疎通、Backendは同一origin表示/health、LM StudioはBackend経由疎通/環境案内。Backend/LM Studio URL編集や新API/schema追加は対象外。

## 制約と証拠の境界

T12のページ統合テストはhash/history/draft/request境界に絞り、他panel/componentをmockしている。個別機能の根拠はT8/T9/T10/T16/T18等のcomponent/DOMテストであり、アプリ全体の実表示や接続の証拠として代用しない。実ブラウザー操作、自動ブラウザーテスト、実APIサーバー、外部翻訳provider、Comfy/LM Studio接続、物理GPU使用量はこの検証では実施していない。

決定 D1/D2 の根拠は `REQ-314-decisions.md`。ビルド詳細は `REQ-314-build-evidence.json`、変更範囲不変条件は `REQ-314-contract-invariant-evidence.json` を参照。

</execution_evidence>


