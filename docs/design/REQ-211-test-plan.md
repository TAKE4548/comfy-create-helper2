# PBI-REQ-211 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド 1 (Settings & History 回帰テスト)**:
  `npm test -- src/pages/__tests__/SettingsPage.test.tsx src/pages/__tests__/HistoryPage.test.tsx`
  - **判定基準**: 終了コードが 0 であり、テストログに `passed` を含む結果が出力され、全テストが合格すること。
- **コマンド 2 (useBulkDownload 単体テスト)**:
  `npm test -- src/pages/HistoryPage/hooks/__tests__/useBulkDownload.test.ts`
  - **判定基準**: 終了コードが 0 であり、全テストケース（正常系、AbortController中断、例外時のローディング解除・リトライ）が合格すること。
- **コマンド 3 (行数削減検証 - AC-1)**:
  `python -c "lines = len(open('src/pages/SettingsPage.tsx', encoding='utf-8').readlines()); assert lines < 300, f'Lines {lines} exceeds 300'; print(f'SettingsPage lines: {lines} (PASS)')"`
  - **判定基準**: 終了コードが 0 であり、行数が 300 行未満であること。
- **コマンド 4 (型チェック)**:
  `npx tsc -b`
  - **判定基準**: エラーログなし、終了コード 0 であること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **アーティファクト監査**:
  `python %GLOBAL_SCRIPTS%\artifact_linter.py %ARTIFACT_DIR%`
  - **判定基準**: 出力に `<status>PASS</status>` が含まれること。
- **ワークフロー整合性監査**:
  `python %GLOBAL_SCRIPTS%\workflow_validator.py validate-design REQ-211`
  - **判定基準**: 出力に `Validation successful.` が含まれること。

## 3. ブラウザ検証 (Browser / Manual Verification)
- **対象URL 1**: `http://localhost:5173/settings`
  - **操作手順**:
    1. 各アコーディオン（LLM Model, Prompts, Params, Bubble Detection, Speech Tones, Mapping Masters, Workflows, Connections）の開閉ボタンをクリック。
    2. セリフ口調プリセットで「プリセット追加」をクリックし、モーダルが開くことを確認。
  - **判定基準 (Assertion)**:
    - DOM要素 `[data-testid="speech-tone-presets-settings-section"]` が存在すること。
    - コンソールに未補足の例外エラー（Uncaught Error）が存在しないこと。
- **対象URL 2**: `http://localhost:5173/history`
  - **操作手順**:
    1. 「Albums」タブをクリックし、アルバム一覧が表示されること。
    2. アルバムカードをクリックして詳細ビューへ遷移し、2軸ソート（カスタム順/日時、昇順/降順）を切り替えること。
    3. 「一括ダウンロード」をクリックし、ローディングインジケータが表示され、ZIPファイルがダウンロードされること。
  - **判定基準 (Assertion)**:
    - 通信切断や例外発生時でも 100ms 以内に `isDownloading` が `false` に解除され、ボタンが再度クリック可能になること。
