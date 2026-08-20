# REQ-148 テスト計画書

## 1. ユニットテスト / フロントエンドテスト (Automated Tests)

### テスト対象ファイル
- `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx`
- `frontend/src/components/__tests__/AddSnapshotToAlbumModal.test.tsx`

### テスト実行コマンド
```bash
npm run test -- frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx
npm run test -- frontend/src/components/__tests__/AddSnapshotToAlbumModal.test.tsx
```

### テストケース
1. `SpeechBubbleEditorModal.test.tsx`:
   - `LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH` から保存先アルバムIDを正しく復元できること。
   - 保存実行時に `LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH` へ選択したアルバムID（または新規作成アルバムID）が永続化されること。
   - `LS_KEYS.LAST_SAVE_ALBUM_ID_GENERATE` に影響を与えないこと。
2. `AddSnapshotToAlbumModal.test.tsx`:
   - `storageKey={LS_KEYS.LAST_SAVE_ALBUM_ID_GENERATE}` が渡された際、正しく localStorage から初期値を復元し、保存実行時にキーへ保存されること。
   - ドロップダウン開閉および検索・選択が正常に行えること。

---

## 2. 手動検証 (Manual Verification)
1. 生成画面でのスナップショット保存:
   - 生成画面でスナップショット保存モーダルを開き、モーダルのサイズおよびドロップダウンの縦幅が十分に広く見やすいことを確認。
   - アルバムAを選択して保存。`localStorage` の `prompt-surgeon-last-save-album-id-generate` にアルバムAが保存されることを確認。
2. セリフ編集画面での保存:
   - 履歴画面からスナップショットのセリフ編集モーダルを開く。
   - 保存先アルバムでアルバムBを選択し、保存。`localStorage` の `prompt-surgeon-last-save-album-id-speech` にアルバムBが保存されることを確認。
3. 独立性の確認:
   - 再度生成画面で保存モーダルを開いた際、アルバムAが初期選択されていることを確認（アルバムBで上書きされていない）。
   - 再度セリフ編集画面を開いた際、アルバムBが初期選択されていることを確認（アルバムAで上書きされていない）。
