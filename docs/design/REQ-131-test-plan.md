# Test Plan: REQ-131 アルバムページでの複数選択画像の一括D&D順番入れ替え機能

## Automated Testing Strategy
- **Frontend Component Tests**:
  - `HistoryPage` の並び替えロジック単位テストまたは既存テストスイートの実行。
- **Type-Check & Build Verification**:
  - `npm run check` または `npm run test` (Vitest)

```bash
cd frontend && npm run test
```

## Manual Verification Steps
1. アルバム詳細画面を開く。
2. 「複数選択」ボタンを押下して複数選択モードを有効化。
3. 2つ以上の画像を選択（例: 画像A, 画像B）。
4. 画像Aをドラッグし、束になった重ね合わせプレビューおよびバッジ表示を確認。
5. 非選択の画像Cの位置へドロップ。
6. 画像A, 画像Bが相対順序を保って画像Cの位置に移動し、選択状態が維持されることを確認。
7. 画面をリロードし、変更した並び順が保持されていることを確認。
