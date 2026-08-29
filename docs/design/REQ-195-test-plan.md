# Test Plan: REQ-195 生成キュー投入および生成進行時のUI応答性・パフォーマンス改善

## 1. 概要 (Test Overview)
本テスト計画は、REQ-195における履歴取得最適化（件数縮小・重複呼び出し排除）、描画ループ内同期ストレージアクセスのインメモリキャッシュ化、および生成進行時・連続生成時のUI応答性維持を検証するものである。

---

## 2. 自動テスト計画 (Automated Tests)

### 2.1 フロントエンド単体テスト (`frontend/src/store/__tests/useGenerationStore.test.ts` & `frontend/src/utils/__tests__/promptToSetMapCache.test.ts`)
実行コマンド:
```bash
cd frontend && npm test -- src/store/__tests/useGenerationStore.test.ts src/utils/__tests__/promptToSetMapCache.test.ts
```

テストケースと判定基準:
1. `test_fetch_history_optimized_limit`:
   - `fetchHistory` 実行時に `comfyApi.getHistory(30)` が呼ばれ、100件ではなく30件の取得に限定されていること。
2. `test_websocket_events_no_redundant_fetch_history`:
   - `executing` (node: null) 受信時: `fetchHistory` は呼ばれず `fetchQueue` のみ実行されること。
   - `executed` 受信時: `data.output.images` によりステート（`batchImages` / `comfyHistoryImages`）が即時更新され、500ms 後の不要な `fetchHistory` は発火しないこと。
   - `execution_complete` 受信時: 不要な `fetchHistory` は発火しないこと。
3. `test_prompt_to_set_map_cache_in_memory_lookup`:
   - `promptToSetMapCache.getSetName(promptId)` 呼び出し時に `localStorage.getItem` が発火せず、インメモリキャッシュから即時解決されること。
4. `test_prompt_to_set_map_cache_trim_limit`:
   - 250件のマッピングを追加した場合、`localStorage` に保存される件数が最新 200 件に自動トリムされていること。

---

## 3. 手動テスト・検証シナリオ (Manual Verification)

### シナリオ 1: 連続生成（複数回バッチ）時のキュー投入待ち時間とUI応答性
1. ComfyUIおよびアプリを起動し、Generate 画面を開く。
2. バッチサイズ `2` または `4` で連続して複数回（10回以上）生成を実行する。
3. 10回目の生成完了後、新たに「Generate Batch」ボタンをクリックする。
4. **合否判定基準**:
   - キュー投入からジョブ受付完了までの所要時間がComfyUI起動直後と同等（通常 1 秒未満）であり、数秒以上の停滞が発生しないこと。
   - キュー投入中および進行中に、画面内のタブ切り替えやテキスト入力・パラメータスライダー操作がスムーズに行えること。

### シナリオ 2: 生成進行中の高速再描画時におけるUI応答性
1. バッチ生成を開始し、サンプリング進捗（プログレスバー）が更新されている最中に、ギャラリーサムネイル（History Strip）にマウスホバー・クリックを行う。
2. **合否判定基準**:
   - サムネイルにプロファイル/セット名バッジが正しく表示されること。
   - プログレス更新によって画面操作がカクついたりマウスイベントがドロップしたりしないこと。

### シナリオ 3: 既存機能・ギャラリー表示のデグレーション検証
1. 生成完了時に生成画像が即座にメインプレビューおよびサムネイル一覧に追加されること。
2. 過去の生成画像を選択・切り替え可能であること。
