# PBI-REQ-013 実行可能テスト計画

## 1. 自動テスト (pytest)
`backend/tests/test_snapshots.py` を新規作成し、以下のケースを検証する自動テストを実装します。

### 1.1 テストケース一覧

1. **`test_create_snapshot_with_assets`**:
   - 目的: スナップショットの作成時に LoRA の関連情報（LoRA ID、強度）が正しく `snapshot_loras` テーブルに保存されること。
   - 手順:
     - 事前にテスト用の `workflows` レコードと `loras` レコードを投入。
     - `POST /api/snapshots` に対して `loras` 引数（`lora_id` と `strength`）を含めた payload でリクエストを送る。
     - レスポンスステータス `201 Created` を確認。
     - DB から作成された `SnapshotLora` レコードを引き、ID と強度が一致していることをアサート。
2. **`test_create_snapshot_with_existing_album`**:
   - 目的: 既存のアルバムを指定してスナップショットを保存した際、アルバムに紐づき、末尾の `sequence_order` が設定されること。
   - 手順:
     - 事前に `workflows` と `albums` (name: "Test Album")、既存の `album_items` (例: sequence_order = 0, 1) を作成。
     - `POST /api/snapshots` に対して `album_id` を含めた payload でリクエストを送る。
     - レスポンスを確認後、`album_items` を取得。
     - 新たに追加されたレコードの `sequence_order` が `2` であることをアサート。
3. **`test_create_snapshot_with_new_album`**:
   - 目的: 新規アルバム名を指定してスナップショットを保存した際、アルバムが自動作成され、スナップショットが `sequence_order = 0` で紐づくこと。
   - 手順:
     - `POST /api/snapshots` に対して `new_album_name` を含めた payload でリクエストを送る。
     - DB 内に指定した名前 of `Album` が新たに作成されていることを確認。
     - `album_items` レコードが作成され、`sequence_order` が `0` であることをアサート。

### 1.2 テスト実行コマンド
```bash
cd backend
python -m pytest tests/test_snapshots.py
```

---

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `openapi_parser.py` を使用し、エンドポイントの差分を確認すること。
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

---

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:8000/docs` および `http://localhost:5173/`

### 3.1 手動疎通テスト手順
1. バックエンドサーバーを起動します。
   ```bash
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --reload --port 8000
   ```
2. 動作確認用のデータとして、LoRA テーブルとアルバムテーブルに何らかのレコードが存在することを確認します。
3. Swagger UI (`http://localhost:8000/docs`) より `POST /api/snapshots` の挙動を確認します。

#### 疎通検証用 payload (新規アルバム保存)
```json
{
  "workflow_id": 1,
  "image_path": "db/snapshots/manual_test_01.png",
  "params": {"positive": "1girl, solo"},
  "new_album_name": "手動テスト用新規アルバム",
  "loras": [{"lora_id": 1, "strength": 0.85}],
  "tag_sets": []
}
```

- **アサーション**:
  - レスポンスコード `201 Created`
  - 新規アルバム「手動テスト用新規アルバム」が `albums` テーブルに作られ、該当スナップショットが `album_items` に `sequence_order = 0` で登録されること。
  - `snapshot_loras` テーブルに `snapshot_id = [作成ID], lora_id = 1, strength = 0.85` が作成されること。

### 3.2 フロントエンド UI 検証手順
1. フロントエンドのプレビュー画面右下の「Save Snapshot」をクリック。
2. スナップショット保存モーダルが立ち上がることを確認。
3. 既存アルバム一覧のドロップダウンから既存のアルバム名を選択し、保存。モーダルが閉じ、「保存しました」などの通知が正しく表示されること。
4. `History` ページの `Albums` ビューを開き、該当アルバムに画像が末尾に追加されていることを確認。
5. 「新規アルバム名を入力」フィールドに `My New Album` と入力して保存。新たに `My New Album` が作成されており、その中に画像が登録されていることを確認。
