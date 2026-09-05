# PBI-REQ-167 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド テスト
- **コマンド**: `pytest tests/test_comfy_proxy.py`
- **期待値**:
  - `GET /api/comfy/history` で `max_items` クエリパラメータが正しく ComfyUI に伝達されること。
  - `GET /api/comfy/history/{prompt_id}` で単一プロンプト履歴が取得できること。
  - ComfyUI 接続エラー時にも適切にハンドリングされること。

### 1.2 フロントエンド テスト
- **コマンド**: `npm test -- --run src/store/__tests/useGenerationStore.test.ts`
- **期待値**:
  - `fetchHistory` 実行時に `targetImages` が `batchImages` の先頭にマージされ、最新画像が優先表示されること。
  - 過去の画像が `batchImages` に蓄積されている場合でも、新着画像が末尾に追いやられず先頭に配置されること。
  - `filterOwnSession: true` / `false` それぞれで正しく画像が振り分けられること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py summarize` を実行し、変更点を確認。
- **リント検証**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py` を実行。

## 3. 手動・E2E検証 (Manual & Scenario Verification)
- **手順**:
  1. フロントエンドで複数枚（またはバッチ）生成を実行。
  2. 生成中にブラウザタブをバックグラウンドに移動、または別タブを開いてWebSocket切断をシミュレート。
  3. 生成完了時間経過後にタブに戻り、履歴ストリップに完了した画像が先頭に追加されてプレビュー表示されることを確認。
  4. ページをリロード（F5）しても、直前に生成された画像が履歴ストリップに保持・表示されることを確認。
