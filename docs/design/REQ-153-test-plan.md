# PBI-REQ-153 実行可能テスト計画: タッチ操作端末における並び替えドラッグ操作とOS標準挙動の競合解消

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd frontend && npm test`
- **期待値**: 既存および新規コンポーネントテスト（`TagsPage`, `LoRAsPage`, `HistoryPage`, `TagChipEditor` 等）が全件 PASS すること（Exit Code 0）。
- **ビルド・型チェック**: `cd frontend && npm run build` (tsc型エラーなし、Viteビルド成功)

## 2. ツール主導・静的コード監査 (Tool-Driven Audit)
- **CSSプロパティ監査**:
  - `TagsPage.tsx`, `LoRAsPage.tsx`, `HistoryPage.tsx`, `PresetManagerPanel.tsx`, `SettingsComponents.tsx`, `TagChip.tsx` において、すべてのドラッグハンドル要素に `touch-none` (または `touchAction: 'none'`)、`-webkit-touch-callout: none`、`onContextMenu={(e) => e.preventDefault()}` が記述されていることを確認。
  - `DesktopLayout.tsx` および `MobileLayout.tsx` の履歴サムネイルボタンに `onContextMenu={(e) => e.preventDefault()}`、`pointer-events-none`（img）が記述されていることを確認。
- **センサー整合性監査**:
  - 各画面の `DndContext` に `MouseSensor`（distance: 8）および `TouchSensor`（distance: 5, tolerance: 5）が登録されていることを確認。

## 3. ブラウザ検証・客観的判定基準 (Browser Verification)
- **対象URL**:
  1. `http://localhost:5173/tags` (TagsPage)
  2. `http://localhost:5173/loras` (LoRAsPage)
  3. `http://localhost:5173/history` (HistoryPage)
  4. `http://localhost:5173/settings` (SettingsPage)
  5. `http://localhost:5173/generate` (GeneratePage / PresetManagerPanel, TagChipEditor)

- **客観的判定基準**:
  1. **タッチドラッグ追従検証**:
     - Chrome DevTools タッチエミュレーション（Mobile View）にて、ドラッグハンドル（`<GripVertical>`）要素をタッチし、5px以上の移動でドラッグ状態（`isDragging === true` / 半透明スタイル・ドラッグオーバーレイ）へ遷移すること。
     - ドロップ完了時にリスト順序（API通信またはローカルステート）が正しく更新されること。
  2. **スクロール誤奪取防止検証**:
     - カード本体（サムネイルやタイトル領域）をスワイプした際、D&Dが発動せず（`isDragging === false`）、ページの `window.scrollY` / コンテナの `scrollTop` が変化すること。
  3. **コンテキストメニュー抑止・一括選択検証**:
     - カード本体または生成画面の履歴サムネイルを800ms長押しした際、ブラウザのコンテキストメニュー（`contextmenu` イベント）が発火せず、一括選択モード（選択ツールバー表示 / チェックボックス表示）が100%の成功率で発動すること。
  4. **PCマウス操作の検証**:
     - マウス操作時、カード上の任意の位置をクリック＆ドラッグ（8px以上）でカード全体のD&Dが動作し、クリックのみ（移動なし）で詳細モーダルが開くこと。
