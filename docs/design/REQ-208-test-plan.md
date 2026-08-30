# REQ-208 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. サブフック単体テスト
- **コマンド**: `npm test -- --run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **期待値**: 全テストケース PASS。`useGeneratePageState` が分割後も同一の戻り値シグネチャを維持し、すべての状態遷移・クエリ・Mutationが正常動作すること。

- **コマンド**: `npm test -- --run src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts`
- **期待値**: 全テストケース PASS。プリセットCRUD、オートセーブデバウンス、Undo/Redoが単体で動作すること。

### 1-2. コンポーネントおよびUI結合テスト
- **コマンド**: `npm test -- --run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx`
- **期待値**: 全テストケース PASS。`onTextModeToggle` コールバックが正常に発火し、テキストモード切替が動作すること。

- **コマンド**: `npm test -- --run src/pages/__tests__/GeneratePage.test.tsx`
- **期待値**: 全テストケース PASS。

- **コマンド**: `npm test -- --run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
- **期待値**: 全テストケース PASS。

### 1-3. 全テストスイート検証
- **コマンド**: `npm test -- --run`
- **期待値**: リグレッションなし。全テスト PASS。

---

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード行数・分割監査**:
  - `wc -l frontend/src/pages/GeneratePage/hooks/use*.ts` (または同等) で各サブフックが 200〜300 行以内であることを確認。
- **イベントリスナー監査**:
  - `grep -rn "tag-chip-editor:text-mode-toggle" frontend/src/` で `window` レベルのカスタムイベント参照が残存していないことを確認。

---

## 3. 手動・ブラウザ検証 (Browser Verification)
- **対象URL**: `http://localhost:5173/` (または開発サーバー)
- **操作手順**:
  1. ワークフローを選択し、プロンプトテキストエリアでチップモード ⇔ テキストモードの切替を行う。
  2. ロールの折り畳み/展開状態が維持・追従されることを確認。
  3. パラメータ入力（スライダー操作など）を行い、ページ全体のリフレッシュや入力の遅延・チラつきがないことを確認。
  4. プリセットの切替、Undo (Ctrl+Z)、Redo (Ctrl+Y) が正常に機能することを確認。
- **判定基準**: 操作時のコンソールエラー（Console Error）が 0 件であり、状態がスムーズに同期されること。
