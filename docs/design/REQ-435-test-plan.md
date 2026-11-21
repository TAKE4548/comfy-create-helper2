# REQ-435 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

本 PBI の受け入れ検証は **V1 Baseline（既定）** に従う（V2 オプトインは宣言しない）。Backend/API/DB の変更を含まないフロントエンド UI 改修であり、**レーンB（System E2E）は不要**。

### Gate 1: 静的型チェック・不変条件・単体テスト
- **UI 不変条件チェック**: `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
- **Frontend Typecheck**: `npm.cmd --prefix frontend run typecheck`
- **Backend Typecheck**: `backend\.venv\Scripts\python.exe -m mypy backend`
- **Frontend Unit Tests**: `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/__tests__ src/hooks/__tests__`
- **テスト命名・配置規約**: `backend\.venv\Scripts\python scripts/verify_test_naming.py --strict`
- **期待値**: 全コマンド Exit code 0、エラー・規約違反 0 件。

### Gate 2: 全テストスイート実行（ファイルフィルタなし）
- **Full Suite**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`（Frontend `npm test` + Backend `pytest -n auto`）
- **期待値**: 全テスト PASS（Exit code 0）、予期せぬ skip・収集欠落 0 件。

### Gate 3: 実ブラウザ E2E・境界値・Red Teaming（レーンA）
- **Playwright E2E Suite (`@critical`)**: `backend\.venv\Scripts\python scripts/run_e2e.py`
- **局所実行（開発時）**:
  - `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/generatePresetTabs.spec.ts`
  - `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/generateMobileGallery.spec.ts`
  - `backend\.venv\Scripts\python scripts/run_e2e.py frontend/e2e/historyResponsive.spec.ts`
- **期待値**: 全 E2E ケースおよび全 `test.step` が PASS（Exit code 0）。

### リスク分類と全スイートフォールバック条件
- **変更リスク分類**: `low`（Frontend UI・CSS・`localStorage` のみ。インフラ・検証基盤・権限・DB スキーマ・公開 API 契約・共有フィクスチャの変更なし）。ただし現行検証プロファイルは **V1 Baseline** のため、常に全スイート新規独立実行を適用する。
- **強制フルスイートフォールバック条件（OR 条件）**:
  1. `index.css` のグローバルルールや共有テストフィクスチャへの波及変更が発生した場合
  2. テスト収集件数の不一致、0 件収集、予期せぬ skip 増加、またはフレーキーなテストを検知した場合
  3. 内部ロジックへの不適切なモック・アサーション欠落が監査で見つかった場合
  4. トラック対象入力ファイルまたは環境変数が変更された場合

### 環境・収集制約
- Runtime: Node.js + Vite/Vitest（jsdom）+ Playwright Chromium（Zero-GPU、CPU/RAM のみで完結）
- テストファイル名・ディレクトリ名にチケット番号（`req435`, `REQ-435` 等）を含めない（SPEC-TESTING v2.1）。
- 全新規テストケース名・`test.step` タイトルに `[REQ-435/AC-n]` タグを付与する。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 Seam Map
- **結合対象（実コード）**: `PresetTabItem`, `PresetTabCloseMenu`, `StageInputGroup`, `ParamPanel`, `DesktopLayout`, `MobileLayout`, `PromptSectionClipboardMenu`, `HistoryPage`, `SnapshotGalleryView`, `useStageCollapseState`, `selectMobileOverallProgress`, `useGenerationStore`, 実 CSS（`index.css`, `StageInputGroup.css`）。
- **切断対象（外部 I/O のみ）**: Backend HTTP API（`/api/*`）および `/api/ws` WebSocket を Vitest モック／Playwright `page.route`・`page.routeWebSocket` で切断。`localStorage` は実 Web Storage を使用。
- **Fault Injection**: `localStorage` 破損 JSON・`QuotaExceededError` 時の安全フォールバック、プリセット一括クローズ時の 503/409 失敗保持（REQ-402 回帰）。

### 2.2 テスト配置計画（標準形式。`workflow_validator.py test-hygiene REQ-435` が参照）

| AC | 新規 test() | 理由 | 相乗り先のファイル | 親の test() | 挿入位置 | 追加する test.step |
| --- | --- | --- | --- | --- | --- | --- |
| AC-1 | あり | 既存 Mobile Generate の test() が 6 ステップ上限に達しているため分割 | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | ファイル末尾（Desktop テストの前または後） | `[REQ-435/AC-1] 360px/390px Generate ボタン・タブ外形縮小と44x44px Hit-Slop検証` |
| AC-2 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | AC-1 step の直後 | `[REQ-435/AC-2] 隣接Hit-Slop非重複・中心タップ独立実行・キーボードフォーカス視認` |
| AC-3 | なし | - | `frontend/e2e/generatePresetTabs.spec.ts` | `[REQ-402/AC-3] Desktop 1280x800: 画面外タブを閉じる操作のスクロール追従` | `[REQ-402/AC-4] close-right-offscreen` の後 | `[REQ-435/AC-3] Desktop 1280px/800px プリセットタブ・ActionBarが44px未満であること` |
| AC-4 | なし | - | `frontend/e2e/generatePresetTabs.spec.ts` | `[REQ-402/AC-3] Desktop 1280x800: 画面外タブを閉じる操作のスクロール追従` | AC-3 step の直後 | `[REQ-435/AC-4][REQ-435/AC-5] Desktop 単一統合ボタン・右クリック同一メニュー・選択不変` |
| AC-5 | なし | - | `frontend/e2e/generatePresetTabs.spec.ts` | `[REQ-402/AC-12] Mobile 375x667: タブのタッチジェスチャー` | `[REQ-402/AC-13] tap-menu` の後 | `[REQ-435/AC-4][REQ-435/AC-5] Mobile 単一ボタン・500ms長押し下部シート・選択不変` |
| AC-6 | なし | - | `frontend/e2e/generatePresetTabs.spec.ts` | `[REQ-402/AC-3] Desktop 1280x800: 画面外タブを閉じる操作のスクロール追従` | AC-4/AC-5 step の直後 | `[REQ-435/AC-6] 「このタブを閉じる」単件クローズと一括クローズの維持` |
| AC-7 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | AC-2 step の直後 | `[REQ-435/AC-7][REQ-435/AC-8] 生成中進捗バー1本・n/m進行・ETA/Queue/完了導線維持` |
| AC-8 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | AC-7 step に統合 | `[REQ-435/AC-7][REQ-435/AC-8] 生成中進捗バー1本・n/m進行・ETA/Queue/完了導線維持` |
| AC-9 | あり | 既存 Desktop テストが 6 ステップ上限に達しているため分割 | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持` | ファイル末尾 | `[REQ-435/AC-9] Desktop 生成中進捗表示が従来どおりであること` |
| AC-10 | あり | History 画面向けの既存 E2E ファイルが存在しないため機能名ファイル新設 | `frontend/e2e/historyResponsive.spec.ts` | `[REQ-435/AC-10] History Mobile 360x640: ヘッダー密度・フィルター初期折り畳み・件数表示・常時ソート` | ファイル先頭 | `[REQ-435/AC-10] 360x640 初期折り畳み1行と最初の画像カード視認可能` |
| AC-11 | なし | - | `frontend/e2e/historyResponsive.spec.ts` | `[REQ-435/AC-10] History Mobile 360x640: ヘッダー密度・フィルター初期折り畳み・件数表示・常時ソート` | AC-10 step の直後 | `[REQ-435/AC-11] 絞り込み条件指定後に折り畳むと件数が文字表示される` |
| AC-12 | なし | - | `frontend/e2e/historyResponsive.spec.ts` | `[REQ-435/AC-10] History Mobile 360x640: ヘッダー密度・フィルター初期折り畳み・件数表示・常時ソート` | AC-11 step の直後 | `[REQ-435/AC-12] 開閉両状態でソート可・AND結合・0件Empty Stateと解除` |
| AC-13 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | AC-7/AC-8 step の直後 | `[REQ-435/AC-13][REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Mobile パラメータステージ表示・折り畳み・永続化` |
| AC-14 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持` | AC-9 step の直後 | `[REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Desktop Prompt/Param ステージ折り畳み・キーボード操作・リロード＆WF往復復元` |
| AC-15 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持` | AC-14 step に統合 | `[REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Desktop Prompt/Param ステージ折り畳み・キーボード操作・リロード＆WF往復復元` |
| AC-16 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持` | AC-14 step に統合 | `[REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Desktop Prompt/Param ステージ折り畳み・キーボード操作・リロード＆WF往復復元` |
| AC-17 | なし | - | `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | `ParamPanel` | 既存 describe 内 | `[REQ-435/AC-17] 折り畳み中ステージの値が生成・ParamSync・プリセット切替に保持される` |
| AC-18 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持` | AC-14..16 step の直後 | `[REQ-435/AC-18] Desktop 折り畳み時のスクロールでsticky見出しが切替わり入力欄を覆わない` |
| AC-19 | なし | - | `frontend/e2e/generateMobileGallery.spec.ts` | `[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性` | AC-13..16 step の直後 | `[REQ-435/AC-19] 360px SafeAreaあり/なし・ソフトキーボード開閉で固定バーとボトムナビに隠れない` |

### 2.3 AC-1〜AC-19 トレーサビリティ＆実行階層マトリクス

| AC | Tier (`unit`/`integration`/`e2e`/`scenario`) | テストファイル・対象ケースID | 検証観点 |
|---|---|---|---|
| AC-1 | `integration`, `e2e` | `MobileLayout.test.tsx`, `SnapshotGalleryView.test.tsx`, `generateMobileGallery.spec.ts`, `historyResponsive.spec.ts` | 360px/390px で外形高さ縮小（32px/28px < 変更前 44px/54px）かつ `::before` Hit-Slop 込み有効タップ領域 ≥ 44×44px |
| AC-2 | `e2e`, `scenario` | `generateMobileGallery.spec.ts`, `historyResponsive.spec.ts` | 隣接要素の Hit-Slop 矩形が重ならないこと、中心タップで対象操作のみ発火すること、Tab フォーカスで `:focus-visible` 視認可 |
| AC-3 | `integration`, `e2e` | `DesktopLayout.tabs.test.tsx`, `generatePresetTabs.spec.ts` | 1280px・800px でプリセットタブ・タブバー・ActionBar ボタンの高さが 44px 未満 |
| AC-4 | `integration`, `e2e` | `usePresetTabClose.integration.test.tsx`, `DesktopLayout.tabs.test.tsx`, `generatePresetTabs.spec.ts` | 各プリセットタブに操作ボタンが 1 つのみ（独立した `×` ボタンが存在しない） |
| AC-5 | `integration`, `e2e` | `usePresetTabClose.integration.test.tsx`, `generatePresetTabs.spec.ts` | 統合ボタン・右クリック・500ms 長押しで同一メニュー（Mobile BottomSheet / Desktop menu）、開くだけでは選択タブ・入力値不変 |
| AC-6 | `integration`, `e2e` | `usePresetTabClose.integration.test.tsx`, `generatePresetTabs.spec.ts` | 「このタブを閉じる」単件保存クローズ、左/右/他一括クローズ対象集合と 503/409 失敗時保持（REQ-402） |
| AC-7 | `unit`, `integration`, `e2e` | `generationQueueSync.test.ts`, `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | 767px 以下生成中に進捗バーが実行中 job の 1 本のみ、全体進捗 `n/m` 文字表示 |
| AC-8 | `unit`, `integration`, `e2e` | `generationQueueSync.test.ts`, `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | job 完了・失敗・キャンセル時の `n/m` とバー遷移、経過時間・ETA・Queue・完了導線維持 |
| AC-9 | `integration`, `e2e` | `DesktopLayout.test.tsx`, `generateMobileGallery.spec.ts` | 768px 以上で進捗表示（全体バー＋ノードバー）が変更前と同一 |
| AC-10 | `integration`, `e2e` | `SnapshotGalleryView.test.tsx`, `historyResponsive.spec.ts` | 360×640 初期表示でフィルター折り畳み 1 行、最初の画像カードがスクロールなしで視認可能 |
| AC-11 | `integration`, `e2e` | `SnapshotGalleryView.test.tsx`, `historyResponsive.spec.ts` | 1〜3 件絞り込み指定後の折り畳み行に件数が文字表示される |
| AC-12 | `integration`, `e2e` | `SnapshotGalleryView.test.tsx`, `historyResponsive.spec.ts` | 折り畳み・展開両状態でソート可能、Workflow/LoRA/TagSet AND 結合・0 件 Empty State・フィルター解除 |
| AC-13 | `integration`, `e2e` | `ParamPanel.test.tsx`, `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | 767px 以下パラメータ欄がワークフローステージ順にグループ化・見出し付きで同ロール異ステージ識別可能 |
| AC-14 | `unit`, `integration`, `e2e` | `StageInputGroup.test.tsx`, `DesktopLayout.test.tsx`, `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | クリック/タップ/Enter/Space で当該ステージのみ開閉、アイコン＋`aria-expanded` 変化 |
| AC-15 | `unit`, `integration`, `e2e` | `useStageCollapseState.test.ts`, `ParamPanel.test.tsx`, `generateMobileGallery.spec.ts` | 初見ワークフローですべてのステージが展開状態 |
| AC-16 | `unit`, `integration`, `e2e` | `useStageCollapseState.test.ts`, `generateMobileGallery.spec.ts` | リロードおよび別ワークフロー往復で workflow ごと・欄（prompt/parameters）ごとに折り畳み復元 |
| AC-17 | `integration`, `scenario` | `ParamPanel.test.tsx`, `DesktopLayout.test.tsx`, `MobileLayout.test.tsx` | 折り畳み中ステージの値が生成・ParamSync 同期元変更・プリセット切替で保持・反映 |
| AC-18 | `unit`, `e2e`, `scenario` | `StageInputGroup.test.tsx`, `generateMobileGallery.spec.ts` | Desktop でステージ折り畳み時のスクロールで sticky 見出し切替が保たれ入力欄を覆わない |
| AC-19 | `e2e`, `scenario` | `generateMobileGallery.spec.ts`, `historyResponsive.spec.ts` | 360px、safe-area あり/なし、ソフトキーボード開閉でレイアウト崩れ・固定バー／ボトムナビ被覆なし |

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

1. **RT-1（隣接 Hit-Slop 重複・誤爆検証）**:
   - **手順**: 360×640 Mobile で `PresetTabItem`（選択・チェック・統合メニュー）およびプロファイル行（Undo・Redo・管理）、プロンプトツールバー（コピー・メニュー・翻訳・Add Asset）の `::before` 疑似要素の実効矩形を `getComputedStyle` + `getBoundingClientRect` で算出し、隣接矩形の交差面積が 0 であることを検証。さらに各中心座標をタップし、意図した単一操作のみが発火することを確認。
   - **期待結果**: 全隣接ペアで交差 0px、誤タップなし。
2. **RT-2（`n/m` のキャンセル・失敗・状態未確認混在）**:
   - **手順**: `selectMobileOverallProgress` に「3 件中 1 件キャンセル（m=2）」「3 件中 1 件失敗＋1 件実行中（2/3）」「3 件全完了（3/3）」「全件キャンセル（total=0 → null）」「`unconfirmed` 混在（m から除外）」を投入。
   - **期待結果**: 仕様通りの `n/m` を返し、`0/0` や `4/3` のような不正文字列を出さない。
3. **RT-3（`localStorage` 破損 JSON・Stale ステージ・容量超過）**:
   - **手順**: `prompt-surgeon-stage-collapsed-v1` に不正 JSON（`"{broken"`）、不正バージョン（`{"version":99}`）、存在しないステージキー `["stage:deleted"]` を事前注入して描画・トグル。さらに `Storage.prototype.setItem` が `QuotaExceededError` を投げる状態でトグル。
   - **期待結果**: クラッシュせず全展開へフォールバックし、存在しないステージキーは無視される。
4. **RT-4（幅 360px + Safe-Area + ソフトキーボード開閉 + 固定バー退避）**:
   - **手順**: 360×640 で `--safe-area-inset-bottom` 相当パディングあり/なし、テキスト入力フォーカスによる `isInputFocused`（ソフトキーボード起動）と blur（終了）を行い、AC-1/AC-5/AC-7/AC-10/AC-14 を実行。
   - **期待結果**: `document.documentElement.scrollWidth <= 360`（横はみ出しなし）、下部固定生成バーとボトムナビが操作対象を覆わない。
5. **RT-5（折り畳みステージに対する ParamSync・プリセット切替・生成）**:
   - **手順**: ステージ B を折り畳んだ状態で、ステージ A の ParamSync マスター値を変更・プリセット切替・生成を実行。
   - **期待結果**: ステージ B の値が失われず、ParamSync と生成ペイロードに従来どおり反映される。

---

## 4. 第三者監査 (Subagent Audit)
- **監査役**: `qa-auditor`（`subagent-audit` Skill。読み取り専用の軽量サブエージェント）
- **機械チェック**: Gate 1〜3 がすべて PASS で、`python "C:\Users\audih\.gemini\config\skills\agent-tooling-maintenance\helpers\workflow_validator.py" test-hygiene REQ-435` が終了コード 0 のときだけ監査役を起動する。失敗したら起動せずに止める。
- **入力**: (1) `docs/backlog/pbi/active/REQ-435.md` と `docs/design/REQ-435-test-plan.md`、(2) 変更差分 `docs/logs/REQ-435/audit/diff.patch` と変更ファイル一覧 `docs/logs/REQ-435/audit/changed-files.txt`、(3) Gate 1〜3 の記録とログのパス。親の会話履歴は渡さない。
- **再監査**: 1 回まで。2 回目も FAIL なら INCONCLUSIVE として利用者に判断を求める。起動できなければ INCONCLUSIVE。
- **記録**: `subagent_audit_result` を `docs/logs/REQ-435/audit/dev-verify-<attempt>.md` に保存し、`workflow_validator.py audit-evidence REQ-435 --file docs/logs/REQ-435/audit/dev-verify-<attempt>.md` で確認する。
