# REQ-017 実行可能テスト計画

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

### 2.1 シードデータの確認
1. バックエンドサーバーを起動する。
2. SQLiteデータベース（`db/prompt_surgeon.db`）に接続し、`mapping_master` テーブルに `Prompt_Char_Lora_Face` と `Prompt_Char_Lora_Other` のレコードが正しく挿入されていることを確認する。
3. `workflow_mappings` テーブルにおいて、既存のワークフロー `ume_` (ID: 1) のノード `366:344`、`366:345`、`366:361`、`366:351` の `master_id` が正しいIDに修正されていることを確認する。

### 2.2 自動スキャンの検証
1. フロントエンドとバックエンドの開発サーバーを起動する。
2. Generate画面にアクセスし、`ume_` ワークフローを選択する。
3. 「マッピングを再スキャン（スキャンアイコン）」をクリックし、スキャンモーダルを開く。
4. `Prompt_Char_Lora_Face` と `Prompt_Char_Lora_Other` の役割が対応するノード ID （`366:344` と `366:345`）に自動マッチングされていることを確認する。
5. 「確定・保存」を実行する。

### 2.3 生成画面での動的表示とComfyUI連携検証
1. `ume_` ワークフロー選択時、左カラムに「Character LoRA Face」と「Character LoRA Other」という入力欄が TagChipEditor 形式で表示されていることを確認する。
2. それぞれの入力欄にテスト用のテキストを入力し、`Add Asset` ボタンから LoRA やタグセットを追加できることを確認する。
3. 「Generate Batch」をクリックして生成を実行する。
4. 送信される ComfyUI ワークフロー JSON の `366:344` および `366:345` の `inputs.value` （または `text`）に、画面で入力した値が正しくインジェクトされていることをデバッグログ等で確認する。
