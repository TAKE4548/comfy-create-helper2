# REQ-146 テスト計画書: セリフ編集画像の上書き保存オプションおよび保存時アルバム選択・登録機能

## 1. 自動テスト計画 (Automated Tests)

### 1.1 Backend Unit / Integration Tests
- **対象ファイル**: `backend/tests/test_snapshots.py`
- **テスト内容**:
  1. `test_update_snapshot_image_and_params`:
     - 既存スナップショットに対して `PATCH /api/snapshots/{id}` を実行し、`image_path`, `thumbnail_path`, `params` が正常に上書き更新されることを検証。
     - 既存の `loras` や `tag_sets` が指定されない場合は現状維持、または正常に部分更新されることを確認。

#### CLI コマンド
```bash
pytest backend/tests/test_snapshots.py -v
```

### 1.2 Frontend Component Tests
- **対象ファイル**: `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx`
- **テスト内容**:
  1. **保存モード切り替えの検証**:
     - デフォルトで「新規保存」モードが選択されており、ボタン文言が「新規保存して履歴へ追加」になっていること。
     - 「上書き保存」を選択した際、ボタン文言が「上書き保存」に切り替わること。
  2. **新規保存処理の検証**:
     - 「新規保存」モードで保存実行時、`snapshotsApi.create` が呼び出されること。
  3. **上書き保存処理の検証**:
     - 「上書き保存」モードで保存実行時、`snapshotsApi.patch` が `snapshot.id` および更新画像・パラメータで呼び出されること。
  4. **アルバム初期選択の優先順位とフォールバック検証**:
     - `localStorage` に `LS_KEYS.LAST_SAVE_ALBUM_ID`（例: ID `2`）がある場合、`initialAlbumId={5}` が渡されていても ID `2` が最優先で選択されること。
     - `localStorage` に情報がない場合、`initialAlbumId={5}` が渡されていれば ID `5` が初期選択されること。
     - `localStorage` に情報がなく、`initialAlbumId` も未指定の場合、「新規アルバム作成 (`'new'`)」が初期選択されること。
  5. **アルバム登録処理の検証**:
     - 既存アルバム選択時: 保存完了後に `albumsApi.addItems` が実行され、`LS_KEYS.LAST_SAVE_ALBUM_ID` に保存されること。
     - 新規アルバム作成時: 新規アルバム名を入力して保存実行時、`albumsApi.create` が実行され、作成されたアルバムIDが `LS_KEYS.LAST_SAVE_ALBUM_ID` に保存されること。

#### CLI コマンド
```bash
npm run test frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx
```

---

## 2. 手動検証計画 (Manual Verification)

1. **通常履歴画面からの編集・保存**:
   - 履歴一覧から任意の画像カードの「セリフ編集」ボタンをクリック。
   - 吹き出しを追加・編集し、フッターの保存設定を確認。
   - 「上書き保存」を選択して保存を実行 -> 元の画像カードがセリフ付き画像に更新され、新規カードが増えていないことを確認。
   - 再度セリフ編集を開き、今度は「新規保存」を選択して保存を実行 -> 新たな画像カードが履歴に追加されることを確認。
2. **アルバム選択の優先順位・前回保存先記憶の確認**:
   - セリフ編集画面で保存先アルバムに「アルバムA」を選択して保存。
   - アルバム詳細画面で「アルバムB」を開き、その中の画像からセリフ編集を開く -> 前回保存先である「アルバムA」が最優先で初期選択されていることを確認。
   - ブラウザの localStorage をクリアして再度「アルバムB」の画像からセリフ編集を開く -> フォールバックとして「アルバムB」が初期選択されることを確認。
   - 通常履歴画面からセリフ編集を開く（localStorage クリア時） -> フォールバックとして「新規アルバムを作成」が初期選択されることを確認。
3. **新規アルバム作成と同時登録**:
   - セリフ編集画面で「+ 新規アルバムを作成」を選択し、アルバム名を入力して保存。
   - 新規アルバムが作成され、編集後画像が登録されていることを確認。
