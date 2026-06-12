# PBI-REQ-011 実行可能テスト計画

## 0. テスト環境の事前準備 (Prerequisites)
- **必須**: `sdxl_base` 等の既存ワークフローが少なくとも 1 つ登録されていること。
- **推奨**: シナリオ 4 のテスト用に、「他のワークフローで使用されていない」マスタを 1 つ事前に作成しておく（または、システムデフォルトで存在する未使用マスタがあることを確認）。

## 1. 自動テスト / 検証コマンド
フロントエンドのリンターとビルドを実行し、エラーが発生しないことを確認します。また、バックエンドのテストや動作確認を行います。

### フロントエンドの検証
```bash
cd frontend
npm run lint
npm run build
```

### バックエンドの検証
```bash
cd backend
.venv\Scripts\activate
# 1. サーバー起動 (別プロセスで起動)
# python -m uvicorn app.main:app --reload --port 8000
# 2. 健康状態確認コマンド
curl -X GET http://localhost:8000/health
# 【判定基準】: HTTP 200 OK が返り、レスポンスに "healthy" (またはそれに類する成功メッセージ) が含まれていること。
```

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: 
  1. `openapi_parser.py` を使用し、スキーマ定義を取得する：
     `python ${GLOBAL_SCRIPTS}\openapi_parser.py backend\openapi.json list-endpoints`
  2. 出力されたリストに以下のエンドポイントが含まれていることを確認する：
     - `GET | /api/mapping-masters/{master_id}/usages`
  - **【判定基準】**: 上記のエンドポイント名が一覧に含まれている場合【合格】、そうでない場合【不合格】。

- **コード監査**: 
  1. `local_model_adapter.py` を実行し、コードの整合性を監査する。
  - **【判定基準】**: 構文エラーや例外が発生しない場合【合格】、発生した場合【不合格】。

## 3. 手動検証シナリオ

### シナリオ 1: マッピングマスタ一覧の表示確認（AC-1）
1. 設定画面（Settings）を開く。
2. 「LLM System Prompts」セクションの下に「Node Mapping Masters」セクションが表示されていることを確認する。
3. 登録済みのマッピングマスタ一覧が、テーブル形式で各フィールド（Role, Display Name, Param Name, Input Type, Class Types, Patterns）も含めて正しく表示されることを確認する。

### シナリオ 2: 新規マスタの追加（AC-2）
1. 「+ Add Master」ボタンをクリックし、新規登録ダイアログを開く。
2. 各入力欄にテストデータを入力する：
   - Role: `test_role`
   - Display Name: `テスト表示名`
   - Parameter Name: `test_param`
   - Input Type: `textarea`
   - Expected Class Types: `KSampler, CLIPTextEncode` (カンマ区切り)
   - Title Patterns: `test_pattern`
3. 「Save」をクリックし、ダイアログが閉じ、一覧に `test_role` が追加されていることを確認する。

### シナリオ 3: マスタの編集（AC-3）
1. 追加した `test_role` の右側にある「編集（✏️）」ボタンをクリックする。
2. ダイアログに既存の値が入力されていることを確認し、Display Name を `編集後テスト表示名` に書き換える。
3. 「Save」をクリックし、一覧上の表示名が即座に更新されていることを確認する。

### シナリオ 4: カスケード警告付き削除（AC-4）
1. 他のワークフローで現在マッピングされていないマスタの「削除（🗑️）」ボタンをクリックする。
2. 通常の確認ダイアログ（「本当に削除しますか？」）が表示され、「Delete」をクリックすると物理削除され、一覧から消えることを確認する。
3. 既存のワークフロー（例: `sdxl_base`等）で利用されているマッピングマスタ（例: `positive` 等）の「削除」ボタンをクリックする。
4. ダイアログに「警告：このマスタは以下のワークフローで利用されています」と表示され、対象ワークフロー名（例: `sdxl_base` 等）が表示されることを確認する。
5. 「Cancel」をクリックすると削除が中断され、「Delete」をクリックすると削除され、関連するワークフローのマッピングも連動して消去されることを確認する。
