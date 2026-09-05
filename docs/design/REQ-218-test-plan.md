# REQ-218 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run test -- run src/utils/__tests__/promptUtils.test.ts src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` (frontend ディレクトリにて実行)
- **判定基準**:
  - プロセス終了ステータスコードが `0` (Exit Code 0) であること。
  - テスト結果出力に `FAIL` が一切含まれず、すべてのテストスイートが `passed` と表示されること。
  - Vitest サマリー例:
    ```
    Test Files  2 passed (2)
         Tests  X passed (X)
    ```

### テスト対象と期待される検証内容
1. `src/utils/__tests__/promptUtils.test.ts`:
   - `prependToPrompt`:
     - `prependToPrompt("1girl, solo", "masterpiece")` -> `"masterpiece, 1girl, solo"`
     - `prependToPrompt("", "masterpiece")` -> `"masterpiece"`
     - `prependToPrompt("   ", "masterpiece")` -> `"masterpiece"`
     - `prependToPrompt("1girl", "")` -> `"1girl"`
     - `prependToPrompt("1girl", "   ")` -> `"1girl"`
     - `prependToPrompt("1girl, solo", "masterpiece, ")` -> `"masterpiece, 1girl, solo"`
     - `prependToPrompt(", 1girl, solo", "masterpiece")` -> `"masterpiece, 1girl, solo"`
   - `appendToPrompt`:
     - `appendToPrompt("1girl, solo", "sitting")` -> `"1girl, solo, sitting"`
     - `appendToPrompt("", "sitting")` -> `"sitting"`
     - `appendToPrompt("   ", "sitting")` -> `"sitting"`
     - `appendToPrompt("1girl", "")` -> `"1girl"`
     - `appendToPrompt("1girl", "   ")` -> `"1girl"`
     - `appendToPrompt("1girl, solo, ", "sitting")` -> `"1girl, solo, sitting"`
     - `appendToPrompt("1girl, solo", ", sitting")` -> `"1girl, solo, sitting"`
     - `appendToPrompt("1girl, solo, ", " , sitting , ")` -> `"1girl, solo, sitting"`

2. `src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`:
   - `handleBulkEditApply` で `prefix` 適用時、`workflowPresetsApi.update` に渡される `param_values.positive_prompt` が `, ` 区切りで先頭に追加されていること（例: 既存 `"1girl"`、追加 `"masterpiece"` -> `"masterpiece, 1girl"`）。
   - `handleBulkEditApply` で `suffix` 適用時、`workflowPresetsApi.update` に渡される `param_values.positive_prompt` が `, ` 区切りで末尾に追加されていること（例: 既存 `"1girl"`、追加 `"sitting"` -> `"1girl, sitting"`）。

## 2. Red Teaming (境界値・異常系検証)
- **ケース 1 (既存プロンプトが空文字または空白・カンマのみ)**:
  - 入力: 既存プロンプト = `",   ,"`、追加テキスト = `"flat color"`
  - 期待値: 厳密に `"flat color"` と一致すること（先頭・末尾に `,` や空白が存在しないこと）。
- **ケース 2 (既存プロンプト・追加テキスト双方に境界カンマ・空白が重複)**:
  - 入力: 既存プロンプト = `"1girl, solo,  "`、追加テキスト = `"  , sitting, smile  "`
  - 期待値: 厳密に `"1girl, solo, sitting, smile"` と一致すること（連続カンマ `,,` や不要なスペースがないこと）。

## 3. 総合リグレッションテスト (Regression Verification)
- **コマンド**: `npm run test -- run` (frontend ディレクトリ)
- **判定基準**: 全テストスイートが Exit Code 0 で PASS すること。
