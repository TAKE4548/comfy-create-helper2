# PBI-REQ-002 実行可能テスト計画

## 1. 前提条件 (Setup & Environment)
- データベース `db/prompt_surgeon.db` に少なくとも1つ以上の LoRA レコード（例: `id=1`）が存在すること。
- バックエンドが起動されていること（`uvicorn app.main:app`）、およびフロントエンド開発サーバーが起動されていること（`npm run dev`）。

## 2. API動作確認 (CLI Verification)
API動作確認用のPythonスクリプトを実行し、バックエンドの `PUT /api/loras/{id}` APIの変更を検証します。

### 2.1 LoRA情報更新 (PUT) のシミュレーション
- **コマンド**:
  ```bash
  cd backend
  python -c "
  from app.database import SessionLocal
  from app import models, schemas
  from app.routers.loras import update_lora
  db = SessionLocal()
  try:
      lora = db.query(models.Lora).filter(models.Lora.id == 1).first()
      if not lora:
          print('WARNING: No LoRA with ID 1 found for testing. Skipping assert.')
      else:
          payload = schemas.LoraCreate(
              model_name='test/updated_model.safetensors',
              description='Updated description for testing',
              recommended_strength_min=0.2,
              recommended_strength_max=0.9,
              category_id=lora.category_id,
              file_path=lora.file_path,
              trigger_word_sets=[
                  {'name': tws.name, 'words': tws.words} for tws in lora.trigger_word_sets
              ]
          )
          res = update_lora(lora_id=1, payload=payload, db=db)
          assert res.model_name == 'test/updated_model.safetensors', 'Model name update failed'
          print('PASS: update_lora completed successfully for ID 1.')
  finally:
      db.close()
  "
  ```
- **期待値**: `PASS: update_lora completed successfully for ID 1.` が出力されること。

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
- **対象URL**: `http://localhost:5173/loras`
- **確認手順と確認事項 (Assertions)**:
  1. フロントエンドとバックエンドを起動し、ブラウザで `http://localhost:5173/loras` にアクセスする。
  2. 登録されているLoRAカード上にマウスを乗せる。
     - **Assertion 1 (AC-1)**: LoRAカードの右上に `lora-edit-{id}` （鉛筆アイコン）が表示されること。
  3. 鉛筆アイコン `lora-edit-{id}` をクリックする。
     - **Assertion 2 (AC-2)**: 編集モーダル「Edit LoRA Model」が開き、対象LoRAの `model_name`・`description`・`recommended_strength_min/max`・`category_id` が初期入力されていること。
  4. Model Name 入力欄（ID: `#edit-lora-model-name`）の中身を空にする。
     - **Assertion 3 (AC-3)**: 保存ボタン（ID: `#save-edit-lora-btn`）が `disabled`（非活性）状態になり、クリックできなくなること。
  5. Model Name を有効な値に修正し、Description（ID: `#edit-lora-description`）などの値を変更して、保存ボタン（ID: `#save-edit-lora-btn`）をクリックする。
     - **Assertion 4 (AC-4)**: 保存が成功し、編集モーダルが閉じ、LoRA一覧が自動更新されて変更した内容（新しいDescription等）が表示されること。
  6. 再度、別のLoRAの鉛筆アイコンをクリックして編集モーダルを開き、内容を変更した上で「Cancel」ボタン（ID: `#cancel-edit-lora-btn`）をクリックする。
     - **Assertion 5 (AC-5)**: モーダルが閉じ、一覧上のデータが変わっていない（変更が破棄されている）ことを確認。
  7. 生成履歴画面（HistoryPage）にアクセスする。
     - **Assertion 6 (AC-6)**: 過去の生成履歴に含まれるLoRAデータ（`snapshots.params`）が、今回のLoRA編集による影響を受けておらず、元データのままであることを確認。
