# REQ-365 文書検証レポート r6（delta 再レビュー）

- 役割: doc-reviewer (doc-verify)。レビュー対象は読み取り専用。本ファイルのみ作成。r1〜r5 は保持。
- 対象差分: r5 以降の doc-editor 変更（SPEC_COMMON 1-4 / REQ-365.md 設計 §2,§3,§4.1,§9 / REQ-365-test-plan.md AC-9, RT-5b）
- 総合判定: **PASS**（軽微な改善提案 M1〜M3 あり。いずれも矛盾ではなくブロッカーではない）

## 1. 実コード照合（証拠）

| 項目 | 結果 |
|---|---|
| index.css 疑似ハンドル (a) | L350 `.modal-backdrop:not(.flex-col):not(:fullscreen):has(> [role='dialog']) > [role='dialog']:not([data-radius-exempt])::before` は `@media (max-width:767px)` 内。SPEC_COMMON の (a) と一致 |
| index.css 疑似ハンドル (b) | L375 `> :not([role='dialog']):is([class~='max-w-md'] … [class~='max-w-7xl'])::before`（36x4px）。(b) の記述（role="dialog" 無し、max-w-md〜7xl、36x4px）と一致 |
| 共通Modalが対象外 | Modal.tsx L140-143: 直下子は `role="dialog"` + `data-radius-exempt` の1要素のみ（max-w 付き非dialog直下子なし）。(a) は :not([data-radius-exempt]) で除外、(b) は :not([role='dialog']) で除外。実ハンドルは L156 の1つ（`data-testid="modal-sheet-handle"`）。記述と一致 |
| `.modal-backdrop` を使わない独自overlay | セレクタが `.modal-backdrop` 起点のため疑似ハンドルは付かない。記述と一致 |
| レガシー一覧 | `.modal-backdrop` を使う非テスト tsx 20 ファイル（Modal.tsx 除く19 + DatasetStudio 2 + AddAsset 含む）が SPEC_COMMON の列挙（BulkEdit, Bypass, CategoryManager, HistoryModalPreview, LoraDetail, LoraRegister, ParamSync, ProfileBulkEdit 本体+BulkEditConfirmView, Rescan, SceneGenerator, SpeechBubbleEditor, TagSet 3種, UploadWorkflow, OutfitMaster, CreateProject, AddAsset）と過不足なく一致 |
| E2E テスト数 | settingsResponsive.spec.ts を自分で数えた: 静的 test 10（L58,85,96,111,121,145,157,176,330,339）+ SHEET_TARGETS 2件×2 = 4 + EXTRA_SHEET_TARGETS 5件×2 = 10 = **24**。test-plan の「24」と一致。名前（stage manager / mapping master edit / speech tone preset / mapping master delete / workflow rename / workflow copy / workflow delete）も計画と一致 |
| WorkflowDiffReplaceModal | L146 `<Modal ... size="5xl" closeOnBackdropClick={false}>` で `sheetMaxHeightClass` 指定なし = 既定高さ。記述と一致 |
| closeOnEsc ネスト例外 | MappingMasterEditModal.tsx L99 `isNodePickerOpen` state、L301 `closeOnEsc={!isNodePickerOpen}`、L594 に NodePicker。SPEC_COMMON・REQ-365.md §3・test-plan RT-5b の記述と一致。Modal.tsx L96/L148 で closeOnEsc=false なら外側は Esc を処理しない |
| エンコード (Python バイト計数) | SPEC_COMMON / SPEC_SETTINGS / REQ-365.md / REQ-365-test-plan.md: CR=0（全て LF のみ）、BOM なし、UTF-8 デコード成功。r5 の「CRLF」主張は誤りで、実際は LF |
| 他箇所との矛盾 | SPEC_SETTINGS を grep（ハンドル/疑似/角丸/Esc/alertdialog）: F1 の新文言と矛盾する記述なし。SPEC_COMMON 内の「共通Modalは実ハンドル1つ」「レガシーは12px・疑似ハンドル」「`data-radius-exempt` 除外」記述は (a)(b) と整合 |
| r5 検証済み主張の維持 | モーダル一覧（Settings 11件）、alertdialog 注記、SettingsComponents.MappingMasterModal 未参照、85dvh 説明などに変更なし・矛盾なし |

## 2. 指摘の解消確認

- **F1（疑似ハンドル範囲）: 解消**。2系統 (a)(b) の分類が index.css と一致し、旧 r5 の「(b) 欠落」矛盾は消えた。
- REQ-365.md §9 T18〜T30 第3列: 末尾注記で「所有ファイルではなくカードtitleの要旨」と明示され、13件すべて実カード title と一字一句一致（T18〜T30 を確認）。誤解を招かない程度に明記されている。許容。
- DAG §8 を T1〜T17 のままにする判断: 実カード T18〜T30 は「実装中の是正・移行・E2E」で依存が直列的な後続カードであり、DAG の「最大深さ4」「並列可能な根」は T1〜T17 についての記述として依然正しい。ただし注記が無く読者が全カードの DAG と誤読し得る（M1）。許容だが一文追加を推奨。

## 3. AC 表

| AC | 判定 | 根拠 / 限界 |
|---|---|---|
| AC-9（モーダル=ボトムシート・文書面） | PASS | SPEC_COMMON 1-4、REQ-365.md、test-plan が実コード（index.css, Modal.tsx, E2E spec）と一致。E2E の実行結果は未確認（静的・推論レビュー。実機/Playwright 実行は tester-reviewer の範囲） |
| 他 AC（AC-1〜8,10）の文書面 | PASS（r5 から変更なし） | 今回差分の影響なし |

## 4. 軽微な改善提案（任意・非ブロッカー）

- **M1** docs/design/REQ-365.md §8 の「最大深さ 4（T2→T4→T6→T15）。」の直前または直後に追記: 「（上記 DAG と深さは T1〜T17 の初期計画範囲。T18〜T30 は実装中に追加された後続カードで DAG には含めない。§9 参照。）」
- **M2** docs/design/REQ-365-test-plan.md AC-9 行「`settingsResponsive.spec.ts` の24テスト」は、24 がファイル全体の総数（AC-9 タグ付きは 17: 静的2+SHEET 4+EXTRA 10+backdrop 1）。置換案: 「`settingsResponsive.spec.ts`（ファイル全体で24テスト、うち AC-9 は17件。`SHEET_TARGETS` と `EXTRA_SHEET_TARGETS` の各ダイアログを375px/1280pxで検証）」
- **M3** REQ-365.md §4.1 AC-9 行のカード列に T24, T29, T30 が無い（test-plan 側は T24, T30 を含むが T29 は両方に無い）。追記案: 「T2, T4, T5, T7, T18, T20〜T22, T24〜T30」（T29=`.req314-settings [role='dialog']` の max-height 規則撤去は AC-9 カード）。

## 5. 限界

- E2E / vitest は実行していない（静的・推論のみ）。
- 実エージェント試行は不要な文書変更のため未実施。
- レビュー対象ファイルは変更していない（git 上の既存変更のみ）。コミット・状態変更なし。
