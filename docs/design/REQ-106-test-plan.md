# REQ-106 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: フロントエンドでの自動テスト、またはリファクタリング箇所のビルド・型チェック。
  - フロントエンドの型チェック:
    ```bash
    npm run typecheck  # もしくは tsc --noEmit
    ```
  - フロントエンドのビルド:
    ```bash
    npm run build
    ```
- **期待値**: エラーやビルドの失敗なしで完了すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py .` を実行し、アーティファクトの構造や形式に不整合がないか確認する。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/settings` および `http://localhost:5173/` (フロントエンド開発サーバー)
- **検証項目と操作手順**:
  1. **マッピングマスターへのデータ型「boolean」の追加**:
     - 設定画面 (`/settings`) にアクセスし、「Create Mapping Master」をクリックする。
     - 「Input Type」のドロップダウンに `boolean` が選択肢として表示されていることを確認する。
     - 任意の項目（例: role="detailer_enable", param_name="active"）を `boolean` 型で新規登録し、正常に登録されることを確認する。
  2. **パラメータパネルでのトグルスイッチUIの表示**:
     - 生成画面 (`/`) に戻る。
     - `boolean` 型で登録した項目が、テキスト入力欄や数値入力欄ではなく、ON/OFFのトグルスイッチとして表示されていることを確認する。
  3. **トグルスイッチによる値変更と自動保存の検証**:
     - トグルスイッチをクリックしてONにし、背景が `bg-accent-green` になり、ノブが右側に移動することを確認する。
     - ページをリロードし、トグルスイッチがONの状態を維持していることを確認する。
     - スイッチをOFFにし、背景が `bg-zinc-700` になり、ノブが左側に移動することを確認する。
  4. **デフォルトパラメータ保存とワークフロー反映の検証**:
     - 「Save Defaults」をクリックしてワークフロー定義を保存する。
     - 生成ボタンを押すか、ワークフローデータの出力を検証し、`boolean` 型でマッピングされた値が `"true"` / `"false"` の文字列ではなく、本物の真偽値 `true` または `false` (Boolean型) としてワークフローJSONに書き込まれていることを確認する。
- **必須エビデンス**: `.gemini/evidence_req_106_toggle_switch.png` (パラメータパネル上のトグルスイッチのキャプチャ)
