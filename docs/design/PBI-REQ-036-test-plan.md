# REQ-036 実行可能テスト計画 (修正版)

## 1. 自動テスト (CLI Verification)
- **バックエンドユニットテストの実行**:
  - **対象ファイル**: `backend/tests/test_loras.py`（存在しない場合は新規作成）
  - **実装要件**: 
    1. ComfyUI API 呼び出しを Mock 化し、以下の 3 つのケースをテストする。
       a) 未登録モデルがソート順の先頭（インデックス 0）に配置されること。
       b) 既登録モデルはリスト末尾に移動され、かつ `is_registered` フラグが `True` になること。
       c) パス名の正規化処理が正しく動作すること。
    2. テスト実行時に実際の API 呼び出しを行わないよう、`unittest.mock.patch` を適切に適用する。
  - **実行コマンド**:
    ```bash
    cd backend
    .venv\Scripts\activate
    pytest tests/test_loras.py -v --tb=short
    ```

- **フロントエンドビルド検証**:
  - **実行コマンド**:
    ```bash
    cd frontend
    npm run build
    ```
  - **判定基準**: ビルドプロセスが完了し、エラーログが出力されないこと。

## 2. ツール主導監査 (Tool-Driven Audit)
- **リンター検証**:
  - **実行コマンド**:
    ```bash
    python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active/
    ```

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象 URL**: `http://localhost:5173/loras`
- **検証手順**（厳密な判定基準付き）:
  1. LoRA 管理ページを開き、「Register Model」ボタンをクリックして登録モーダルを表示する。
  2. 「Model Path (File Path)」入力欄がコンボボックス形式であることを確認する。
  3. ドロップダウンを展開し、以下の条件を満たすことを確認する:
     - 未登録のモデルがリストの先頭（インデックス 0）に配置されていること。
     - 登録済みのモデル（例: `test_lora.safetensors`）がリストの最後尾に配置され、かつ「登録済み」バッジ付きで表示されていること。
  4. **クリック不可判定**: リスト内の「登録済み」バッジ付き要素に対して `click` イベントを送信しても、何らかのレスポンス（アラートや遷移）が返ってこないことを確認する。
  5. **自動入力判定**: 未登録のモデルを選択した際、「Model Name」入力欄の値が「[選択されたモデル名]」と一致することを確認する。
  6. **直接入力判定**: キーボードからリストにない任意のパス（例: `custom/path/new_model.safetensors`）を入力し、「Register」ボタンをクリックする。
     - 判定基準: HTTP ステータスコードが `200 OK` であることを確認し、ページリロード後にリストに新しい項目が追加されていることを確認する。
