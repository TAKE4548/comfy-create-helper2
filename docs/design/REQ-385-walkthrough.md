# REQ-385 ウォークスルー & 検証報告書

## 1. 概要
- **PBI**: REQ-385 生成完了プレビュー表示遅延およびジョブキャンセル処理の遅延解消
- **種別**: バグ修正 (defect / performance)
- **対象サブシステム**: backend (`generation_service.py`, `comfy_generation_bridge.py`)

ComfyUIがプロンプト完了時に送信する `{"type": "executing", "data": {"node": null, "prompt_id": ...}}` を即時完了シグナルとして検知し、upstream history を即座に照会してプレビュー画像URLをリアルタイム配信するよう改修しました。これにより従来の2.5秒フォールバックポーリング待ちを完全に解消しました。
また、キャンセル操作（`/interrupt`）における冗長な二重 `queue()` 照会を1回に削減し、先行キャンセル予約（`_cancel_requested`）とイベントハンドラ（`on_event`）を連携させて、サンプラー停止と同時に即時 `cancelled` 状態へ確定・配信されるよう最適化しました。

---

## 2. 変更ファイルと主要修正点

1. **`backend/app/services/generation_service.py`**:
   - `on_event`: `event_type == "executing"` かつ `data.get("node") is None` の場合、即座に `_handle_prompt_completion` を実行し、history の状態に応じて `succeeded` / `cancelled` / `failed` へ遷移させて WebSocket スナップショットを即時配信。
   - `_handle_prompt_completion`: 完了レコード処理を共通化。`execution_success` および `executing` (node: null) の双方から呼び出され、先行キャンセル要求がある場合は `cancelled` へ即時確定。
   - `mypy` 厳格型チェックに準拠（`JobStatus`、`fields` の型付け安全化）。

2. **`backend/app/services/comfy_generation_bridge.py`**:
   - `interrupt()`: 連続していた冗長な二重 `self.queue()` 呼び出しを1回に削減し、速やかに ComfyUI `/interrupt` POST を送信。
   - `_handle_json_message()`: `executing` (node: null) 受信時にも `_latest_preview` キャッシュを即時破棄。

3. **`backend/tests/integration/legacy/test_generation_service.py`**:
   - `test_executing_null_node_immediately_completes_job_and_publishes_snapshot`: `executing` (node: null) による即時完了とスナップショット配信の検証 `[REQ-385/AC-1]`。
   - `test_cancel_running_job_with_executing_null_node_transitions_to_cancelled`: キャンセル要求後の `executing` (node: null) 受信による即時 `cancelled` 確定の検証 `[REQ-385/AC-3]`。

4. **`backend/tests/integration/legacy/test_comfy_generation_bridge.py`**:
   - `test_single_interrupt_preflights_target_once_and_never_interrupts_wrong_prompt`: 1回 preflight 照会による高速割り込みディスパッチ検証 `[REQ-385/AC-2]`。
   - `test_single_interrupt_posts_immediately_when_target_matches`: 対象一致時の即時 POST 検証 `[REQ-385/AC-2]`。
   - `test_executing_null_node_clears_latest_preview`: `executing` (node: null) 受信時の一時プレビュー破棄検証 `[REQ-385/AC-2]`。

---

## 3. Acceptance Matrix & Evidence

| AC ID | 受入れ基準 | 検証結果 | エビデンス |
| :--- | :--- | :--- | :--- |
| **AC-1** | ComfyUI 生成完了シグナル（`executing` node: null）受信後、2.5秒待たずに即座にジョブが `succeeded` に遷移し出力画像URLが配信されること | **PASS** | `test_generation_service.py::test_executing_null_node_immediately_completes_job_and_publishes_snapshot` |
| **AC-2** | 実行中ジョブ中断（`/interrupt`）時の不要な二重 `queue()` 呼び出しが1回に削減され、完了シグナルでプレビューキャッシュがクリアされること | **PASS** | `test_comfy_generation_bridge.py::test_single_interrupt_preflights_target_once_and_never_interrupts_wrong_prompt`, `test_executing_null_node_clears_latest_preview` |
| **AC-3** | キャンセル要求後のサンプラー停止シグナル受信時に即座に `cancelled` 状態が確定し、クライアントへスナップショットが配信されること | **PASS** | `test_generation_service.py::test_cancel_running_job_with_executing_null_node_transitions_to_cancelled` |

---

## 4. 3-Gate Baseline Verification 結果

- **Gate 1 (静的型検査・規約・UI不変条件)**:
  - `verify_test_naming.py`: File path violations 0 件 (PASS)
  - `verify_ui_invariants.py`: 0 violations across 537 files (PASS)
  - `mypy backend/app`: Success: no issues found in 89 source files (PASS)
  - `npm run typecheck`: tsc 0 エラー (PASS)
- **Gate 2 (バックエンド統合テストスイート)**:
  - `pytest backend/tests`: 483 passed in 40.59s (PASS)
- **Gate 3 (シナリオ受け入れテスト)**:
  - `pytest backend/tests/... -k 'executing_null or interrupt'`: 15 passed in 0.57s (PASS)
