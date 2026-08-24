# PBI-REQ-181 実行可能テスト計画

## 1. 自動テスト (Automated Unit Tests)

### 1.1 バックエンド テスト
- **対象**: `backend/tests/test_comfy_proxy.py`
- **検証項目**:
  - `get_comfy_client()` による `httpx.AsyncClient` シングルトン取得および接続再利用
  - `close_comfy_client()` による適切なクリーンアップ
  - 各プロキシエンドポイント（`POST /prompt`, `GET /queue`, `GET /history` 等）がリグレッションなく動作すること
- **実行コマンド**:
  ```bash
  pytest backend/tests/test_comfy_proxy.py -v
  ```

### 1.2 フロントエンド テスト
- **対象**: `frontend/src/store/__tests/useGenerationStore.test.ts`, `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`
- **検証項目**:
  - WebSocket `status` メッセージ受信時に `fetchQueue` は呼ばれるが `fetchHistory` は呼ばれないこと
  - `executed` / `execution_complete` メッセージ受信時には `fetchHistory` が正常に呼ばれること
  - `handleGenerateSets` における順次キュー投入（FIFO順序）、キャンセル処理、エラー通知が正常に機能すること
- **実行コマンド**:
  ```bash
  npx vitest run src/store/__tests/useGenerationStore.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
  ```

---

## 2. 統合・全テスト検証 (Full Suite Verification)
- **バックエンド全テスト**:
  ```bash
  pytest backend/tests
  ```
- **フロントエンド全テスト**:
  ```bash
  npm test -- --run
  ```
