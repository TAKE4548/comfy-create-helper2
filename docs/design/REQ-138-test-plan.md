# REQ-138 テスト計画書: アルバム詳細画面からのセリフ編集モーダル起動

## 1. 自動テスト (Unit & Integration Tests)

### テストファイル
- `frontend/src/pages/__tests__/HistoryPage.test.tsx`

### テスト項目
1. **セリフ編集ボタンの表示確認**:
   - アルバム詳細ビューにおいて、`image_path` を持つ各アイテムカード上に `item-speech-edit-${snapshot_id}` ボタンが存在すること。
   - 一括選択モード（`albumItemMultiSelect.isMultiSelectMode === true`）時はボタンが非表示になること。
2. **モーダル起動の連動確認**:
   - ボタンクリック時に `SpeechBubbleEditorModal` が渡された `snapshot_id` と `image_path` でレンダリングされること。
   - クリックイベントが親要素に伝播せず、カード選択状態が変わらないこと。
3. **保存時のクエリキャッシュ無効化確認**:
   - `SpeechBubbleEditorModal` の `onSaved` 発火時に `snapshots`、`['album', selectedAlbumId]`、`albums` のクエリキャッシュが無効化されること。

### 実行コマンド
```powershell
npm --prefix frontend test -- HistoryPage.test.tsx
```

---

## 2. 手動検証 (Manual Verification Plan)
1. ブラウザで History ページを開き、アルバムタブに切り替える。
2. 任意のアルバムを開き、アイテム一覧を表示する。
3. 画像カードにマウスホバーし、「セリフ編集・吹き出し追加」アイコンボタンが表示されることを確認。
4. アイコンボタンをクリックし、`SpeechBubbleEditorModal` が正常に起動することを確認。
5. セリフ追加・編集を行って「保存」を実行し、モーダルが閉じてアルバム画面上で最新画像が反映されることを確認。
