# PBI-REQ-177 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  cd frontend && npm test -- src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx src/pages/__tests__/SettingsPage.test.tsx
  ```
- **期待値**: 全テストケースの PASS。既存の D&D イベントおよび UI 操作テストが破壊されていないこと。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード検索**: `TouchSensor` の設定箇所を grep し、`tolerance` が残存していないことを確認。
  ```bash
  grep -rn "TouchSensor" frontend/src/
  ```
- **設計整合性監査**: 各画面で `activationConstraint: { distance: 5 }` に統一されていることを確認。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象画面**:
  - `http://localhost:5173/` (タグチップエディタ - Generate画面)
  - `http://localhost:5173/tags` (TagsPage)
  - `http://localhost:5173/loras` (LoRAsPage)
  - `http://localhost:5173/history` (HistoryPage)
  - `http://localhost:5173/settings` (SettingsPage)
- **操作手順**:
  1. モバイルタッチエミュレーションを有効化。
  2. タグチップエディタにてタグチップのドラッグハンドル（`<GripVertical>`）をタッチしてドラッグ。
  3. タグの順序が入れ替わることを確認。
  4. TagsPage / LoRAsPage / HistoryPage / SettingsPage にて各アイテムのドラッグハンドルをタッチしてドラッグ並び替えが動作することを確認。
- **判定基準**:
  - タッチ操作でドラッグが即時キャンセルされず、ドロップ時に順序が入れ替わること。

