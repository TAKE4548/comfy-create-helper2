# REQ-385 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `mypy backend`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_generation_service.py backend/tests/integration/legacy/test_comfy_generation_bridge.py`
- **期待値**: 全テスト PASS (Exit code 0)。

---

## 2. 結合・単体検証 (Integration & Unit Verification)
- **テスト配置 (Test Placement)**:
  - `backend/tests/integration/legacy/test_generation_service.py`
  - `backend/tests/integration/legacy/test_comfy_generation_bridge.py`
- **ケース名タグ**:
  - `[REQ-385/AC-1]` in `test_generation_service.py`: `test_executing_null_node_triggers_immediate_history_and_succeeded_snapshot`
  - `[REQ-385/AC-2]` in `test_generation_service.py`: `test_executing_null_node_with_interrupted_history_transitions_to_cancelled`
  - `[REQ-385/AC-3]` in `test_comfy_generation_bridge.py`: `test_interrupt_performs_single_queue_check_before_post`
  - `[REQ-385/AC-4]` in `test_comfy_generation_bridge.py`: `test_executing_null_node_clears_latest_preview_cache`
- **Seam Map**:
  - 結合対象: `GenerationService`, `ComfyGenerationBridge`, `GenerationRepository`
  - 切断対象: ComfyUI HTTP/WS 外部I/O（`httpx.AsyncClient` トランスポートモック、`_FakeSocket` イベントストリーム）
- **シナリオ 1 (AC-1/AC-2 即時完了検知)**:
  - ジョブが `running` 状態のとき、WebSocketイベント `{"type": "executing", "data": {"node": None, "prompt_id": "prompt-1"}}` を送信する。
  - バックエンドが 2.5 秒のポーリングを待たずに即座に `history("prompt-1")` を呼び出し、ジョブが `succeeded` に遷移して出力画像URLを含む最新スナップショットが配信されることを検証する。
- **シナリオ 2 (AC-3 割り込み要求の即時性)**:
  - 実行中ジョブに対して `bridge.interrupt("prompt-1")` を呼び出したとき、冗長な多重 `queue()` 呼び出しを行わず、1回の `queue()` 確認後に速やかに POST `/interrupt` が送信されることを検証する。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]
- **手順**: `executing` (node: null) 受信時に、ComfyUIの `/history` エンドポイントが一時的に 404 または 503 エラーを返す異常系をシミュレートする。
- **期待結果**: 例外でサービスがクラッシュせず、エラーログを記録して安全に処理をスキップし、後続の定期ポーリング `_reconcile_locked` により自動復帰すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-385-test-plan.md`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

