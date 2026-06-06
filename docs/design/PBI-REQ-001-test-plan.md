# PBI-REQ-001 実行可能テスト計画

## 1. 前提条件 (Setup & Environment)
- データベース `db/prompt_surgeon.db` が初期化されており、`workflow` テーブルに `id=1` のテスト用ワークフローが存在し、`workflow_mappings` テーブルに `master_id` が存在しないデータ（例: `master_id=22`, `node_id="334"`）が含まれていることを確認すること。
- バックエンドが起動されていること、または Python テストコードがバックエンドのコンテキストにアクセス可能であること。

## 2. 自動テスト (CLI Verification)
API動作確認用のPythonワンライナー（APIエミュレーション）を実行し、バックエンドの変更を検証します。

### 2.1 ワークフロー詳細取得 (GET) のシミュレーション
- **コマンド**:
  ```bash
  cd backend
  python -c "
  from app.database import SessionLocal
  from app.routers.workflows import get_workflow
  db = SessionLocal()
  try:
      result = get_workflow(workflow_id=1, db=db)
      assert result.id == 1, 'Workflow ID mismatch'
      print('PASS: get_workflow completed successfully.')
  finally:
      db.close()
  "
  ```
- **期待値**: `PASS: get_workflow completed successfully.` が表示され、例外が発生しないこと。

### 2.2 ワークフロー更新 (PUT) のシミュレーション
- **コマンド**:
  ```bash
  cd backend
  python -c "
  from app.database import SessionLocal
  from app import models, schemas
  from app.routers.workflows import update_workflow
  db = SessionLocal()
  try:
      wf = db.query(models.Workflow).filter(models.Workflow.id == 1).first()
      payload = schemas.WorkflowUpdate(
          mappings=[
              schemas.WorkflowMappingCreate(
                  master_id=17 if m.master_id == 22 else m.master_id,
                  node_id=m.node_id
              ) for m in wf.mappings
          ]
      )
      res = update_workflow(workflow_id=1, payload=payload, db=db)
      print(f'PASS: update_workflow completed successfully for ID {res.id}.')
  finally:
      db.close()
  "
  ```
- **期待値**: `PASS: update_workflow completed successfully for ID 1.` が出力されること。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  # 変数 GLOBAL_SCRIPTS は .agents/context.md で定義された値を使用
  # Windows環境: %GLOBAL_SCRIPTS%
  python %GLOBAL_SCRIPTS%\artifact_linter.py docs/backlog
  ```
- **期待値**:
  出力に含まれる `<status>` タグの値が `PASS` であること。
  ```xml
  <linter_report>
    <status>PASS</status>
  </linter_report>
  ```

## 4. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173`
- **確認手順と確認事項 (Assertions)**:
  1. アプリ（`npm run dev` と `uvicorn app.main:app`）を起動し、ブラウザで `http://localhost:5173` にアクセスする。
  2. 生成画面（Generate）でワークフローを選択する。
  3. **Assertion 1**: パラメータ列最上部に、警告クラス `.alert` または「マッピングエラー検出」テキストを含む警告コンポーネントが表示されること。
  4. 警告コンポーネント内のセレクトボックス（ID: `#param-error-select-334` 等）で「Character LoRA Model」を選択し、「修正」ボタンをクリックする。
  5. **Assertion 2**: API更新が成功し、警告パネルが画面から非表示になること。
  6. **Assertion 3**: サイドバーに「Character LoRA Model」に対応する入力項目（セレクトボックス等）が動的に生成されていること。
