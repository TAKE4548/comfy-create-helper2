# PBI-REQ-212 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### (1) バックエンド単体・API結合テスト (Backend Integration)
- **コマンド**: `pytest tests/test_speech_batch.py -v`
- **判定基準**: 
  - 終了コード `0`。
  - FastAPI TestClient を用いたエンドポイント連携、バックグラウンド非同期タスク実行、DBセッション取得、排他制御・メモリプルーニングの全テストケースが `PASSED` となること。
- **バックエンド全件回帰テスト**: `pytest`
- **判定基準**: 終了コード `0`（204件以上の既存テスト全件 PASS）。

### (2) フロントエンド結合テスト (Frontend Integration)
- **コマンド**: `npm test src/components/__tests__/BatchSpeechTransformModal.test.tsx src/pages/__tests__/HistoryPage.test.tsx`
- **判定基準**: 
  - 終了コード `0`。
  - バッチジョブの作成、ポーリング更新、リトライ、キャンセルUI連携が正常に動作すること。
- **フロントエンド全件回帰テスト**: `npm test`
- **判定基準**: 終了コード `0`（468件以上の全件 PASS）。

## 2. ツール主導監査 (Tool-Driven Audit)
- **API整合性検証**: 
  - コマンド: `python scripts/openapi_parser.py backend/openapi.json list-endpoints`
  - 判定基準: 終了コード `0` かつ `/api/speech-batch/jobs` などのエンドポイントが維持されていること。

## 3. シナリオ検証 (Concrete Acceptance Criteria)
1. **並行リトライ・キャンセル競合検証**:
   - テストケース名: `test_speech_batch_concurrency_and_cancellation`
   - 条件: 5件以上のアイテムを持つバッチジョブを実行中、`asyncio.gather` を用いてキャンセルリクエストと個別アイテムのリトライリクエストを同時に発火。
   - 判定基準: 例外（500 Internal Server Error や Deadlock）が発生せず、ジョブおよびアイテムのステータスが `cancelled` または `completed` に整合的に遷移すること。
2. **履歴上限プルーニング・メモリリーク防止検証**:
   - テストケース名: `test_speech_batch_memory_pruning`
   - 条件: `max_history`（デフォルト100件、テスト検証用には `max_history=5` など小さな値も設定可能）に設定した `SpeechBatchManager` に対し、上限超過分のジョブを作成・完了させる。
   - 判定基準: 保持件数が `max_history` 以下に保たれ、最古の完了ジョブが `_jobs` から安全に削除（プルーニング）されていること。
3. **同期I/Oブロッキング解消・非同期オフロード検証**:
   - テストケース名: `test_speech_batch_async_thread_offloading`
   - 条件: 画像読み込みを含むアイテム処理を実行。
   - 判定基準: `asyncio.to_thread` が `_sync_load_item_image` および `_sync_fetch_batch_prerequisites` の実行に利用されていること（モックによる呼び出し検証）。
