# REQ-036 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **バックエンドユニットテストの追加**:
  `backend/tests/test_loras.py` を作成（または既存テストを拡張）し、`/api/loras/comfy-models` の挙動を検証します。
  - ComfyUI API呼び出しを Mock（`unittest.mock`）化し、返り値に対して未登録優先ソート・既登録フラグ・正規化が正しく動作することをテストします。
- **ユニットテスト実行コマンド**:
  ```bash
  cd backend
  .venv\Scripts\activate
  pytest tests/test_loras.py
  ```
- **フロントエンドビルド検証コマンド**:
  ```bash
  cd frontend
  npm run build
  ```

## 2. ツール主導監査 (Tool-Driven Audit)
- **リンター検証**:
  ```bash
  python ${GLOBAL_ROOT}\scripts\artifact_linter.py docs/backlog/task/active/
  ```

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/loras` (LoRA管理ページ)
- **検証手順**:
  1. LoRA管理ページを開き、「Register Model」ボタンをクリックして登録モーダルを表示する。
  2. Model Path (File Path) 入力欄がコンボボックス形式になっていることを確認する。
  3. ドロップダウンを展開し、未登録のモデルが上位に、登録済みのモデル（例: `test_lora.safetensors`）が下位にグレーアウトされ「登録済み」バッジ付きで表示されていることを確認する。
  4. 登録済みのモデルはクリックしても選択できないことを確認する。
  5. 未登録のモデルを選択した際、Model Name 入力欄に自動的にモデル名が入力されることを確認する。
  6. 直接キーボードからリストにない任意のパス（例: `custom/path/new_model.safetensors`）を入力して、そのまま登録が完了できることを確認する。
