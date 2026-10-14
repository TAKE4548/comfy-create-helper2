# REQ-356 実行可能テスト計画 (SPEC-TESTING v2.1 準拠)

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック & 高速単体テスト (Typecheck & Fast Unit Baseline)
- **コマンド**: `cd frontend && npm run typecheck && npx vitest run src/utils src/components/**/__tests__ src/hooks/**/__tests__ && cd .. && mypy backend && backend\.venv\Scripts\python -m pytest backend/tests/unit backend/tests/governance`
- **期待値**: 型エラー 0 件、テスト失敗 0 件 (Exit code 0、所要時間目安 3〜5秒)。DBや重厚jsdom環境を排した高速フィードバック。

### Gate 2: ユニット＆結合テスト (Unit / Integration Full Suite Baseline)
- **コマンド**: `cd frontend && npm test && cd .. && backend\.venv\Scripts\python -m pytest backend/tests/integration`
- **期待値**: 全テスト PASS (Exit code 0)。SAVEPOINT ロールバックによりDBクリーン状態を維持し、`respx` によるトランスポート遮断が機能すること。
- **実行時間目標**: 旧113秒未満 (AC-12 達成)。

### Gate 3: E2E ブラウザ＆Red Team (E2E & Red Teaming Baseline)
- **コマンド**: `cd frontend && npx playwright test e2e/stickyHeader.spec.ts`
- **期待値**: 実ブラウザ (Headless) においてデスクトップ (1280x800) とモバイル (375x667) の2種類の viewport で sticky 追従および実スクロールが PASS すること (AC-8 達成)。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 テスト配置計画 (Test Placement Plan) [MUST [W-DD-PLACE]]
- **チケット名ファイルの完全禁止**: `req[0-9]+` / `REQ-[0-9]+` をファイル名に含むテストファイル新設を全面禁止。
- **Backend 配置先**:
  - `backend/tests/conftest.py`: SAVEPOINT Interceptor, `tmp_path` snapshot, `respx` 遮断
  - `backend/tests/unit/test_schemas.py`: `[REQ-356/AC-11]` スキーマ検証
  - `backend/tests/integration/api/test_workflows.py`: `[REQ-356/AC-4]` ワークフロー API + SAVEPOINT ロールバック
  - `backend/tests/integration/services/test_snapshot_service.py`: `[REQ-356/AC-5]` スナップショット I/O 隔離
  - `backend/tests/governance/test_no_req_naming.py`: `[REQ-356/AC-1]`, `[REQ-356/AC-2]` ファイル名規約
- **Frontend 配置先**:
  - `frontend/src/test/utils/storeHelpers.ts`, `queryHelpers.ts`, `wsHelpers.ts`, `networkGuard.ts`: `[REQ-356/AC-6]`, `[REQ-356/AC-7]`
  - `frontend/src/utils/**/__tests__/*`: `[REQ-356/AC-3]` 単体計算ロジック
  - `frontend/src/pages/**/__tests__/*`: `[REQ-356/AC-3]` 画面結合
  - `frontend/e2e/stickyHeader.spec.ts`: `[REQ-356/AC-8]` Playwright 実スクロール検証

### 2.2 Seam Map 適用マッピング [MUST [W-DD-SEAM]]
- **統合対象 (本物のコード)**: FastAPI Router, Pydantic, SQLAlchemy ORM, React Component, Hooks, Zustand, QueryClient
- **切断境界 (外部I/Oのみ)**:
  - SQLite: `sqlite:///:memory:` + SAVEPOINT Commit Interceptor
  - 外部HTTP: `respx` (ComfyUI :8188 / LM Studio :1234 を遮断)
  - ディスク: `tmp_path` サンドボックス
  - Frontend 通信: `MockWebSocketController`, `api/client.ts` 遮断
- **PBT (Property-Based Testing)**: `PromptTokenEngine`, `workflow_scanner`, `seedBatch` 等の入力空間検証に fast-check / Hypothesis を適用。
- **Fault Injection**:
  - 外部HTTP 未許可URLアクセス時の即時 503 / 拒絶
  - WebSocket 突発切断時の再接続ハンドリング

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### シナリオ 1: 外部通信漏洩検出 (Network Breach Injection)
- **手順**: テストコード内で allowlist にない外部 URL (例: `http://127.0.0.1:9999` または実外部ドメイン) への通信を試行する。
- **期待結果**: Backend では `respx` 未定義アクセス例外を送出して即時遮断。Frontend では `networkGuard` が例外を throw してテストが fail すること (漏洩ゼロの検証)。

### シナリオ 2: DB 永続化汚染検出 (DB Mutation Bleed Injection)
- **手順**: 統合テスト内でレコードを作成し `db.commit()` を明示実行した後、例外を発生させて中断する。次のテストで DB をクエリする。
- **期待結果**: SAVEPOINT インターセプターにより、中断後であっても後続テスト開始時の DB テーブルが完全に空であり、本番 `db/prompt_surgeon.db` が一切変更されていないこと。

### シナリオ 3: jsdom 擬似スクロール禁止ガード (No Fake Scroll in jsdom)
- **手順**: `frontend/src` 内の Vitest/jsdom テストにおいて `fireEvent.scroll` や擬似 sticky 判定を行うコードが存在しないことを静的スキャンする。
- **期待結果**: 擬似スクロールテスト 0 件 (AC-8 厳守)。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-356-test-plan.md`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

