# PBI-REQ-060 実行可能テスト計画

## 対象PBI

REQ-060: ワークフローアップロード時のマッピング機能の改善

---

## 1. 自動テスト (CLI Verification)

### T1a/T1b: バックエンド 静的チェック

```bash
cd backend
python -m py_compile app/models.py
python -m py_compile app/schemas/workflow.py
python -m py_compile app/routers/mapping_masters.py
python -m py_compile app/routers/workflows.py
python -m py_compile app/main.py
```

**期待値**: いずれもエラーなく終了すること（exit code 0）。

### T2〜T6: フロントエンド 型チェック

```bash
cd frontend
npx tsc --noEmit
```

**期待値**: TypeScriptコンパイルエラーが0件であること。

---

## 2. ツール主導監査 (Tool-Driven Audit)

### API仕様確認

```bash
# バックエンドを起動後に実行
python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json list-endpoints
```

**期待値**: 以下の2エンドポイントが追加されていること：
- `PUT /api/mapping-masters/reorder`

```bash
# MappingMasterスキーマに sort_order が含まれていること
python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json get-schema MappingMasterRead
```

**期待値**: `sort_order: integer` フィールドが含まれること。

---

## 3. ブラウザ検証 (Browser Agent Verification)

### AC-1: DBマイグレーション確認

- **前提**: 旧バージョン（sort_orderカラムなし）のDBが存在する状態でバックエンドを起動する。
- **操作**: バックエンド起動ログを確認。
- **判定基準**: `Migrated: Added 'sort_order' column to 'mapping_master' table.` ログが出力されること。

### AC-2: D&D並び替え（設定画面）

- **対象URL**: `http://localhost:5173/settings`
- **操作手順**:
  1. 「Node Mapping Masters」セクションに複数のマスタが並んでいることを確認。
  2. 任意の行のドラッグハンドル（`GripVertical`アイコン）をドラッグし、別の位置にドロップ。
  3. ページをリロードする。
- **判定基準**: リロード後も並び替えた順序が保持されていること。
- **エビデンス**: 並び替え前後のスクリーンショット（`.gemini/` 配下に保存）。

### AC-3: マスタ主体のマッピングUI（アップロードモーダル）

- **対象URL**: `http://localhost:5173/`（Generate画面）
- **操作手順**:
  1. 新規ワークフローJSONファイルをアップロードする。
  2. マッピング確認モーダルが表示されたことを確認。
  3. モーダル内のリストが「マスタ定義の役割名（display_name）」を主軸として縦並びになっていることを確認。
- **判定基準**: マッピングリストの行が `sort_order` の昇順で並んでいること（設定画面で確認した順序と一致）。

### AC-4: コンボボックスの動作確認

- **操作手順**:
  1. スキャン結果で `duplicated`（複数候補）となる役割の行を特定。
  2. コンボボックスをクリックし、候補リストが表示されることを確認。
  3. 候補から1つを選択できることを確認。
  4. 候補にないノードIDを直接テキスト入力できることを確認（例: `"999"` など）。
- **判定基準**: 候補からの選択と直接入力の両方が機能し、入力値がフィールドに反映されること。

### AC-5: 未検出項目の下部配置確認

- **操作手順**:
  1. スキャンAPIが `not_found` を返す役割が存在するワークフローJSONをアップロード。
  2. モーダルを確認する。
- **判定基準**:
  - `not_found` の役割が「未検出の役割」セクション（画面下部）にのみ表示されること。
  - 「未検出の役割」セクションの行にも、コンボボックス（初期値：空）が表示されること。
  - メインリストに `not_found` の行が**存在しない**こと。

### AC-6: 保存と登録確認

- **操作手順**:
  1. マッピングを適宜設定し、「登録・保存」ボタンをクリック。
  2. モーダルが閉じることを確認。
  3. ワークフローセレクタに新規ワークフロー名が表示されることを確認。
  4. 新規ワークフローを選択し、Generate画面が正常に表示されることを確認。
- **判定基準**: エラーなく登録が完了し、Generate画面でパラメータ入力欄が表示されること。

### RescanModal 確認（AC-3〜6 共通検証）

- **対象URL**: `http://localhost:5173/`
- **操作手順**:
  1. 既存ワークフローを選択し、「再スキャン」ボタン（RescanModal）を開く。
  2. AC-3〜AC-6 と同様の項目をRescanModalでも確認する。
- **判定基準**: UploadWorkflowModalと同じUIパターンで表示・動作すること。

---

## 4. リグレッションテスト

以下が既存機能に影響しないことを確認すること：

- [ ] 既存ワークフローの`GET /api/workflows/{id}`が正常にレスポンスを返すこと。
- [ ] 設定画面でのマスタ追加（Create）・編集（Edit）・削除（Delete）が引き続き機能すること。
- [ ] 削除モーダルで使用中ワークフローの警告表示が正常に動作すること。
