# REQ-149 テスト計画書: アルバム任意並び替えおよびアルバム名編集機能

## 1. 自動テスト (Automated Tests)

### 1.1 Backend Unit Tests (`backend/tests/test_albums.py`)
- **テストコマンド**:
  ```bash
  pytest backend/tests/test_albums.py -v
  ```
- **検証項目**:
  1. `test_album_sort_order_and_reorder`:
     - 複数のアルバムを作成し、`sort_order` が連番で割り当てられることを確認。
     - `PUT /api/albums/reorder` で順序を変更し、`GET /api/albums` のレスポンス順序が指定順になることを確認。
  2. `test_update_album_name_success`:
     - `PUT /api/albums/{album_id}` でアルバム名を変更し、正常に更新されることを確認。
  3. `test_update_album_name_validation`:
     - 空文字（または空白文字のみ）で更新した場合に 400 エラーになることを確認。
     - 既存の別アルバムと同名に更新しようとした場合に 400 (Duplicate) エラーになることを確認。

### 1.2 Frontend Unit Tests (`frontend`)
- **テストコマンド**:
  ```bash
  npm --prefix frontend test -- HistoryPage.test.tsx client.test.ts --run
  ```
- **検証項目**:
  1. `client.test.ts`:
     - `albumsApi.reorder([2, 1, 3])` のリクエストメソッド・URL・Bodyの検証。
     - `albumsApi.update(1, { name: 'Renamed Album' })` のリクエストメソッド・URL・Bodyの検証。
  2. `HistoryPage.test.tsx`:
     - アルバム一覧でアルバムカードの編集ボタンをクリックし、名前を変更して保存できること。
     - アルバム詳細画面ヘッダーから名前編集ができること。

---

## 2. 手動検証シナリオ (Manual Verification)

### 2.1 アルバム並び替え
1. 履歴画面の「Albums」タブを開く。
2. アルバムカードをドラッグして別の位置にドロップする。
3. 表示順序が入れ替わり、ページをリロードしても変更後の順序が保持されていることを確認する。
4. 生成画面またはセリフ編集画面から「アルバムに保存」ダイアログを開き、アルバム一覧が同じ並び順で表示されることを確認する。

### 2.2 アルバム名編集（リネーム）
1. アルバム一覧でアルバムカードの編集アイコンをクリックする。
2. 新しいアルバム名を入力して確定（Enterまたは保存ボタン）する。
3. アルバムカードの表示名が即座に更新されることを確認する。
4. アルバム詳細画面を開き、ヘッダーのアルバム名も新しい名前に更新されていることを確認する。
5. ヘッダーのリネームボタンからさらに名前を変更し、正常に反映されることを確認する。
6. 空文字や既存アルバムとの重複名を入力した際、エラーメッセージ等で適切に防止されることを確認する。
