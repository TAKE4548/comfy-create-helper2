# PBI-REQ-093 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npx vitest run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx`
- **期待値**: 追加されたテストケースを含むすべてのテストが正常に PASS すること。

### 実行予定のテストケース:
1. `handles drag end and updates chip order` (AC-1):
   - `@dnd-kit/core` をモックし、`onDragEnd` イベントをトリガーしてチップ順序が更新され、`onChange` に並び替え後の値が渡されることを検証。
2. `supports Undo/Redo for drag and drop operations` (AC-2):
   - 並び替え操作の後に `Ctrl+Z` (Undo) および `Ctrl+Y` (Redo) を送信し、履歴スタックを介して順序が正常に復元されることを検証。
3. `uses deterministic and collision-resistant IDs` (AC-3):
   - ID生成器のテスト。決定論的モードと通常モードでの生成結果を検証。
4. `removes global custom event listeners on unmount` (AC-4):
   - `unmount` 時にグローバルイベント（`disable-tag` / `add-tag`）のリスナーが正常に解除されることを検証。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` による監査（実装後の verification フェーズで実行）

## 3. 手動・ブラウザ検証 (Browser Agent Verification)
本要件はコンポーネントのテストカバレッジ向上と内部 ID 生成ロジックのリファクタリングであり、画面上の新しいUI機能の追加やレイアウト変更はありません。
そのため自動テスト（`vitest`）のみで完全に検証を行います。
また、ドラッグ＆ドロップ動作そのものは自動テストでモック検証しているため、手動ブラウザ検証は不要と判断します。
