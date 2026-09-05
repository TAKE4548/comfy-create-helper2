# REQ-162 テスト計画書 (Test Plan) - 定量検証版

## 1. 自動テスト (Automated Tests)

### 1.1 バックエンド単体・統合テスト
- **対象ファイル**: `backend/tests/test_comfy_proxy.py`
- **テストケースと定量的合否判定基準**:
  1. `test_get_comfy_object_info_success`:
     - 判定基準: HTTP status 200, レスポンスボディに `"KSampler"` キーが存在すること。
  2. `test_get_comfy_object_info_error_fallback`:
     - 判定基準: ComfyUI接続エラー（`ConnectError`）発生時、HTTP status 200 かつ `{}` が返却されること。
  3. `test_get_object_info_cached`:
     - 判定基準: 1回目リクエストで `mock_get.call_count == 1`、2回目リクエスト後も `mock_get.call_count == 1`（インメモリキャッシュヒットにより ComfyUI への追加 HTTP リクエストが 0 件であること）。
  4. `test_post_prompt_proxy_success`:
     - 判定基準: HTTP status 200, レスポンスが `{"prompt_id": "p-123", "number": 1}` と完全一致すること。
  5. `test_get_queue_proxy`:
     - 判定基準: HTTP status 200, `queue_running` および `queue_pending` がリストとして返却されること。
  6. `test_post_queue_clear_proxy`:
     - 判定基準: `{ "clear": true }` 送信時、HTTP status 200 が返却されること。
  7. `test_post_interrupt_proxy`:
     - 判定基準: HTTP status 200, レスポンス `{"status": "interrupted"}` が返却されること。
  8. `test_get_history_proxy`:
     - 判定基準: HTTP status 200, レスポンスが ComfyUI の history マップと一致すること。
- **実行コマンド**:
  ```bash
  cd backend && python -m pytest tests/test_comfy_proxy.py -v
  ```

### 1.2 フロントエンド単体・統合テスト
- **対象ファイル**:
  - `frontend/src/utils/__tests__/bypassUtils.test.ts`
  - `frontend/src/store/__tests/useGenerationStore.test.ts`
  - `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
- **テストケースと定量的合否判定基準**:
  1. `bypassUtils.test.ts`:
     - `comfyObjectInfo` が空（`{}`）の場合でも、後続ノードの入力リンク（`detailer_pipe`, `image` 等）が削除されず保持されること（`expect(result["11"].inputs.detailer_pipe).toEqual(["10", 1])`）。
  2. `useGenerationStore.test.ts`:
     - `cancelAllJobs`: `filterOwnSession: true` / `false` 問わず、`comfyApi.deleteQueue({ clear: true })` と `comfyApi.interrupt()` が各 1 回以上確実に呼び出され、`activeBatch === null`, `isGenerating === false` になること。
     - `fetchHistory`: `filterOwnSession: true` 時に自クライアント ID の画像のみが `batchImages` にマージされ、他クライアント ID の画像は除外されること。
     - `fetchHistory`: `filterOwnSession: false` 時に全クライアントの画像が `batchImages` にマージされること。
  3. `useGenerateAction.test.ts`:
     - `checkedSets.length === 0` 時に `setErrorToast` が `message: '生成対象のセットが選択されていません'` で呼び出され、キュー投入が 0 件で中断されること。
- **実行コマンド**:
  ```bash
  cd frontend && npm test
  ```

---

## 2. 異常系・境界値検証 (Red Teaming Scenarios)

### シナリオ 1: ComfyUI サーバー未起動・接続遮断
- **検証手順**: バックエンドから ComfyUI への接続が失敗（Connection Refused）した状態をシミュレート。
- **合否判定**: バックエンドプロセスが例外クラッシュせず、フォールバック空データ `{}` または 502 Bad Gateway を返却し、フロントエンドにエラートーストが表示されること。

### シナリオ 2: ノードスキーマ欠損時のバイパス配線保護
- **検証手順**: 新規カスタムノード等で `/object_info` に該当クラスタグが存在しないワークフローで Bypass を適用。
- **合否判定**: 後続ノードの必須リンクが `delete` されず保持され、ComfyUI の `Required input is missing` バリデーションエラーが回避されること。

### シナリオ 3: バッチ生成投入ループ中の即時 Abort 中断
- **検証手順**: 複数セット（例: 5件）のバッチ投入中にユーザーが中断操作を実行。
- **合否判定**: `AbortController.signal.aborted` により 2 件目以降の `queuePrompt` 発行が即座に停止し、余分なキューが ComfyUI に登録されないこと。

### シナリオ 4: 他セッション投入ジョブ混在時の完全停止
- **検証手順**: 他端末から投入されたジョブが待機キューにある状態で「一括キャンセル」を実行。
- **合否判定**: `comfyApi.deleteQueue({ clear: true })` によりサーバー上の待機キュー全件がパージされ、後続ジョブが自動開始されずに完全停止すること。
