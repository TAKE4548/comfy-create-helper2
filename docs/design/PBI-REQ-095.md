# 設計書 - REQ-095: snapshots.py及びloras.pyの例外エラー応答テストの追加

## 1. 目的と概要
`snapshots.py` や `loras.py` の API ルーターにおいて、存在しない ID や無効なアセット ID に対する例外・エラーハンドリング（HTTP 400 / 404 応答）が適切に動作していることを検証する pytest 用のユニットテストを追加します。これにより、予期せぬ例外が発生することなく設計通りのエラーレスポンスがクライアントに返されることを保証します。

## 2. テスト設計と例外挙動の定義

### AC-1: `PATCH /api/snapshots/{snapshot_id}` において、存在しない Lora ID または TagSet ID 送信時のエラー検証
- **挙動定義**: 
  - 有効な `snapshot_id` に対し、存在しない `lora_ids` (例: `[99999]`) を送信した場合、`HTTP 400 Bad Request` (Detail: `Lora with ID 99999 does not exist`) が返却される。
  - 有効な `snapshot_id` に対し、存在しない `tag_set_ids` (例: `[99999]`) を送信した場合、`HTTP 400 Bad Request` (Detail: `TagSet with ID 99999 does not exist`) が返却される。
- **検証手順**:
  1. `test_snapshots.py` にテストケースを追加。
  2. 事前に有効なスナップショットを作成する。
  3. 存在しない `lora_ids` を含む payload を用いて `PATCH /api/snapshots/{snapshot_id}` を呼び出し、`HTTP 400` が返ることを確認する。
  4. 存在しない `tag_set_ids` を含む payload を用いて `PATCH /api/snapshots/{snapshot_id}` を呼び出し、`HTTP 400` が返ることを確認する。

### AC-2: `PUT /api/loras/{lora_id}` において、存在しない ID 送信時のエラー検証
- **挙動定義**: 存在しない LoRA ID (例: `99999`) に対し `PUT /api/loras/{lora_id}` を実行した場合、`HTTP 404 Not Found` (Detail: `LoRA not found`) が返却される。
- **検証手順**:
  1. `test_loras.py` にテストケースを追加。
  2. 存在しないID (`99999`) に対して、ダミーの LoRA 作成ペイロードを送信して `PUT /api/loras/99999` を呼び出す。
  3. ステータスコードが `404` であることを確認し、レスポンス詳細が `"LoRA not found"` であることを検証する。

### AC-3: `DELETE /api/loras/{lora_id}` において、存在しない ID 削除試行時のエラー検証
- **挙動定義**: 存在しない LoRA ID (例: `99999`) に対し `DELETE /api/loras/{lora_id}` を実行した場合、`HTTP 404 Not Found` (Detail: `LoRA not found`) が返却される。
- **検証手順**:
  1. `test_loras.py` にテストケースを追加。
  2. 存在しないID (`99999`) に対して `DELETE /api/loras/99999` を呼び出す。
  3. ステータスコードが `404` であることを確認し、レスポンス詳細が `"LoRA not found"` であることを検証する。
