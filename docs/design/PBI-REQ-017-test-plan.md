# PBI-REQ-017 実行可能テスト計画

## 1. 静的検証・単体テスト (Static & Unit Test Verification)
- **単体テストコマンド (Backend)**:
  ```bash
  cd backend
  .\.venv\Scripts\python.exe -m unittest discover tests
  ```
- **期待値**: 既存の全テストがパスし、エラーが発生しないこと。

- **静的検証・ビルドテスト (Frontend)**:
  ```bash
  cd frontend
  npm run lint
  npm run build
  ```
- **期待値**: エラーなくLintおよびビルドが完了すること。

## 2. ブラウザ・手動検証 (Manual Verification)

### 2.1 シードデータの確認 (SQLite検証スクリプトの実行)
バックエンドサーバーを起動した後、以下のPythonワンライナー（またはスクリプト）を実行し、正しくシードデータが挿入され、`ume_`ワークフローのマッピングが補正されていることを客観的にアサートします。
- **実行コマンド**:
  ```bash
  .\backend\.venv\Scripts\python.exe -c "
  import sqlite3
  conn = sqlite3.connect('db/prompt_surgeon.db')
  cursor = conn.cursor()
  # 1. 新規マスタ定義の登録数を確認
  cursor.execute(\"SELECT COUNT(*) FROM mapping_master WHERE role IN ('Prompt_Char_Lora_Face', 'Prompt_Char_Lora_Other');\")
  count = cursor.fetchone()[0]
  assert count == 2, f'Expected 2 roles, found {count}'
  # 2. ume_ (ID: 1) のノードマッピング補正を確認
  cursor.execute(\"\"\"
      SELECT wm.node_id, mm.role 
      FROM workflow_mappings wm 
      JOIN mapping_master mm ON wm.master_id = mm.id 
      WHERE wm.workflow_id = 1 AND wm.node_id IN ('366:344', '366:345', '366:361', '366:351');
  \"\"\")
  results = dict(cursor.fetchall())
  expected = {
      '366:344': 'Prompt_Char_Lora_Face',
      '366:345': 'Prompt_Char_Lora_Other',
      '366:361': 'Prompt_Composition',
      '366:351': 'Prompt_Background_Environment'
  }
  for node_id, expected_role in expected.items():
      assert results.get(node_id) == expected_role, f'Mismatch for node {node_id}: expected {expected_role}, found {results.get(node_id)}'
  print('SEED_AND_MIGRATION_CHECK: PASS')
  conn.close()
  "
  ```
- **期待値**: コンソールに `SEED_AND_MIGRATION_CHECK: PASS` と出力されること。

### 2.2 自動スキャンの検証
1. フロントエンドとバックエンドの開発サーバーを起動する。
2. Generate画面（`http://localhost:5173/`）にアクセスし、`ume_` ワークフローを選択する。
3. `id="rescan-btn"` のボタンをクリックし、スキャンモーダルを開く。
4. モーダル内の matched リストにおいて、`Prompt_Char_Lora_Face` と `Prompt_Char_Lora_Other` の役割がそれぞれノード ID `366:344` と `366:345` に自動マッチングされていることを確認する。
5. `id="rescan-confirm-btn"` をクリックしマッピングを保存する。

### 2.3 生成画面での動的表示とComfyUI連携検証
1. `ume_` ワークフロー選択時、左カラムに「Character LoRA Face」と「Character LoRA Other」というプロンプト入力欄（TagChipEditor）が表示されていることを確認する。
2. それぞれの入力欄にテスト用テキストを入力し、`Add Asset` ボタンから LoRA やタグセットを追加してアセットチップがレンダリングされることを確認する。
3. ブラウザの開発者ツール（Networkタブ）を開き、`id="generate-btn"` をクリックして生成を実行する。
4. 送信される `POST /api/workflows/scan` または ComfyUI へのキュー送信リクエスト（`/prompt`）のペイロード JSON において、ノード `366:344` および `366:345` の `inputs.value` （または `text`）に画面に入力した文字列が正しくインジェクトされて送信されていることを確認する。
