# REQ-184: テスト計画書 (Test Plan)

## 1. ユニットテスト (Unit Tests)
- **対象ファイル**: `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
- **検証項目と客観的合否判定基準**:

### 1.1 DOM レンダリング順序の客観的検証
- **判定基準**:
  - サムネイルストリップ（履歴ビューコンテナ: `screen.getByText('履歴')` を含む要素）とプリセットタブコンテナ（`screen.getByText('Profiles')` を含む要素）に対し、`stripElement.compareDocumentPosition(profilesElement) & Node.DOCUMENT_POSITION_FOLLOWING` が真（サムネイルストリップがプリセットタブより前）であること。
  - プリセットタブコンテナとプロンプト入力エリア（`screen.getByPlaceholderText(/Enter.*Input/i)` 等）に対し、`profilesElement.compareDocumentPosition(promptElement) & Node.DOCUMENT_POSITION_FOLLOWING` が真（プリセットタブがプロンプト入力エリアより前）であること。

### 1.2 Undo/Redo ボタンの配置・状態・発火検証
- **判定基準**:
  - `#undo-btn-mobile` および `#redo-btn-mobile` が `#manage-presets-btn-mobile` と同一の親コンテナ（`parentElement`）内に存在すること。
  - `canUndo: false`, `canRedo: false` の場合、`#undo-btn-mobile` および `#redo-btn-mobile` の `disabled` 属性が `true` であること（`expect(screen.getByTitle('Undo')).toBeDisabled()`）。
  - `canUndo: true`, `canRedo: true` の場合、`#undo-btn-mobile` および `#redo-btn-mobile` の `disabled` 属性が `false` であること。
  - `#undo-btn-mobile` をクリックした際、`mockUndo` が `toHaveBeenCalledWith('default')`（アクティブな set ID）で1回以上呼び出されること。
  - `#redo-btn-mobile` をクリックした際、`mockRedo` が `toHaveBeenCalledWith('default')`（アクティブな set ID）で1回以上呼び出されること。

### 実行コマンド
```bash
npm --prefix frontend test -- src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx --run
```

## 2. 全体回帰テスト (Regression Tests)
- **コマンド**:
```bash
npm --prefix frontend test -- --run
```
