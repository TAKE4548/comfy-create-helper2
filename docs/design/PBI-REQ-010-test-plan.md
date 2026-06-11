# PBI-REQ-010 実行可能テスト計画

## 1. 前提条件 (Setup & Environment)
- バックエンド (`uvicorn app.main:app`) およびフロントエンド (`npm run dev`) が起動していること。
- テスト用のワークフローが登録されており、少なくとも positive/negative prompts および cfg, steps などのパラメータ（`MappingMaster` に紐づくもの）がマッピング定義されていること。

## 2. 自動テスト & ツール主導検証 (CLI & Tool-Driven Audit)
- 変更後のアーティファクト整合性と構文チェックを実行します。
```bash
python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design
```
- 期待値: 出力レポートの `<status>` タグが `PASS` であること。

## 3. ブラウザ検証 (Browser Verification)
- **対象URL**: `http://localhost:5173`

### 3.1 初回ロード時の動作検証 (AC-3)
1. ブラウザの開発者ツールを開き、`Application` タブから `localStorage` の全データをクリアする。
2. 画面をリロードし、対象ワークフローを選択する。
3. **Assertion 1**:
   - `localStorage` に `prompt-surgeon-params-wf-{workflowId}` キーが存在し、その値がシリアライズされたオブジェクト形式であることを確認する。
   - **数値厳密比較**:
     1. API `GET /api/workflows/{workflowId}` を呼び出し、DBの初期値（`json_body`）を取得する。
     2. UI上の対応する各パラメータ入力要素（例: `id="cfg-input"`、`id="steps-input"`など）の値をDOMから抽出する。
     3. 取得したDB値とUI表示値を数値型 (`number`) にキャストして比較し、完全に一致していることを確認する。

### 3.2 セッション維持・リロード検証 (AC-3)
1. パラメータ入力欄の値をいくつか手動で変更する（例: CFGを `8.5` に変更、ステップ数を `25` に変更、プロンプトに `"1girl"` などを追加）。
2. **Assertion 2**:
   - `localStorage` の `prompt-surgeon-params-wf-{workflowId}` の値が、変更された値（CFG `8.5`, Steps `25`, etc.）にリアルタイムで更新されていること。
3. ブラウザをリロードする。
4. **Assertion 3**:
   - リロード後も、入力欄の値が変更後の状態（CFG `8.5`, Steps `25`, etc.）を維持しており、DB の初期デフォルト値に戻っていないこと。

### 3.3 デフォルト値リセット検証 (AC-3)
1. ワークフロー設定カード内の「デフォルトにリセット」ボタンをクリックする。
2. **Assertion 4**:
   - **UI状態確認**: UI上の各パラメータ入力要素の値が、DBに保存されている最新のデフォルト値（`GET /api/workflows/{workflowId}` の `json_body`）と一致することを確認する（数値は `number` にキャストして比較する）。
   - **データ整合性確認**:
     1. リセット直後に再度 `localStorage` から `prompt-surgeon-params-wf-{workflowId}` を読み込む。
     2. このセッションパラメータ履歴も、DBデフォルト値の内容に完全に同期して上書きされていることを確認する。

### 3.4 現在のパラメータをデフォルトとして保存する検証 (AC-1, AC-2)
1. パラメータ値を変更する（例: CFG = `12.0`, Denoise = `0.6`, Steps = `40`）。
2. ワークフロー設定カード内の「デフォルト保存」ボタンをクリックする。
3. **Assertion 5 (AC-2)**:
   - ネットワークタブで `PUT /api/workflows/{workflowId}` のリクエストが発生し、レスポンスコード 200 (成功) が返されること。
   - 送信データ内の `json_body` にて、変更したパラメータ値（CFG `12.0`, Denoise `0.6`, Steps `40`）が該当ノードのインプット値に上書きされていること。
4. 一度他のワークフローを選択してから、再度元のワークフローを選択し、「デフォルトにリセット」ボタンをクリックする。
5. **Assertion 6**:
   - 入力値が、先ほどデフォルトとして保存した値（CFG `12.0`, Denoise `0.6`, Steps `40`）にリセットされること（DB上のデフォルト値が更新されていることの証明）。
