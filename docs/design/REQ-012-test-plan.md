# PBI-REQ-012 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **ビルド・コンパイル検証**: `frontend` ディレクトリにおいて、ビルドおよびTypeScript型チェックが正常に通ることを検証する。
  ```bash
  cd frontend
  npm run build
  npm run lint
  ```

## 2. ツール主導監査 (Tool-Driven Audit)
- **タスクカード監査 (自己完結性チェック)**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-012.md
  ```
- **テスト計画監査 (実行可能性チェック)**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/PBI-REQ-012-test-plan.md
  ```

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/` (Frontend開発用ローカルURL)
- **操作・検証項目**:
  1. **タグチップ入力の操作検証**:
     - `Generate` ページを開き、ワークフローを選択する。
     - プロンプト入力欄に文字（例: `1girl`）を入力し、`,`（カンマ）または `Enter` を押下して視覚的にチップ化されることを確認する。
     - テキストをコピペ（例: `black hair, red ribbon, school uniform`）し、自動的に3つのチップに分割されることを確認する。
     - チップの `×` ボタンをクリックして削除できることを確認する。
     - 入力枠が空の状態で `Backspace` を押し、末尾のチップが削除されることを確認する。
  2. **アセットの追加操作検証**:
     - プロンプトエリア右上の `+ Add Asset` ボタンから LoRA（推奨強度設定のあるもの）およびタグセットを選択する。
     - LoRA/タグセットの名前が「アセットチップ」としてエリア下部に表示されることを確認する。
  3. **アセット強度算出の検証**:
     - 例: `BunnyGarden/rin_iilustrious.safetensors`（推奨強度: min 1.0, max 1.0）を適用した際、強度が `1.0` になることを確認する。
     - 例: 推奨強度が min 0.8, max 0.8 のものを適用した際、強度が `0.8` になることを確認する。
     - 例: 推奨強度 min 0.8, max 1.0 のものを適用した際、その中間値である `0.9` になることを確認する。
  4. **生成ペイロードの検証**:
     - `Generate Batch` ボタンを押下した際、ブラウザのデベロッパーツール（Networkタブ）またはWebSocketメッセージ、または ComfyUI 側のコンソールログにて、送信されるプロンプトパラメータの末尾に `<lora:filename:strength>` および適用されたタグセットのタグ文字列が正しく結合されていることを検証する。
     - トグルボタンでアセットチップを無効（グレーアウト）にした状態で再度 `Generate Batch` を押下し、送信パラメータから対象アセットの文字列が完全に除外されていることを検証する。
- **期待結果**: 上記の挙動がすべて不具合なく動作し、UI表示と送信ペイロードの完全な連動が確認できること。
