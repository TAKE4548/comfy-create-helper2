# REQ-226 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト (CLI Verification)
- **バックエンド自動テスト**:
  - **コマンド**: `cd backend && python -m pytest tests/test_logging.py -v`
  - **期待値**: 全テストケースが PASS すること。
    1. JSON Lines 出力形式の妥当性（`timestamp`, `level`, `source`, `logger`, `message` 等のキー存在、JSONとして正しくパース可能）
    2. `TimedRotatingFileHandler` の動作と `backupCount=7`（1週間分保持）
    3. `RequestLoggingMiddleware` による `X-Request-ID` ヘッダー付与、およびレイテンシ・ステータスコードの構造化ログ記録
    4. 未処理例外（HTTP 500）発生時のスタックトレースとエラー情報のログ記録
    5. `POST /api/system/client-logs` のエンドポイント検証（正常受信とログファイルへの `source: "frontend"` 書き込み）
- **フロントエンド自動テスト**:
  - **コマンド**: `cd frontend && npm test -- src/__tests__/logger.test.tsx`
  - **期待値**: 全テストケースが PASS すること。
    1. `logClientError` のペイロード構築と API 送信（モック fetch 検証）
    2. `addBreadcrumb` による直近100件のリングバッファ管理（101件追加時に最古の1件が押し出され、最新100件が維持されること）
    3. `logClientError` 呼出時に蓄積された `breadcrumbs` が `context.breadcrumbs` に自動同封されること
    4. `logClientEvent` による単発重要イベントの正常送信
    5. `GlobalErrorBoundary` による子コンポーネント例外の捕捉とフォールバック UI 表示
    6. 連続エラーのデバウンス・重複抑止（過剰リクエスト防止）
    7. ログ送信 API 自体が失敗した際のフェイルセーフ（UIクラッシュやエラー無限ループが発生しないこと）

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ**:
  1. バックエンドを起動し、APIリクエスト（例: `GET /health`、`GET /api/config`）を実行後、`logs/app.jsonl` に該当リクエストの JSON ログ（`http` メタ情報、`request_id`）が追記されていることを確認。
  2. `POST /api/system/client-logs` にテスト用フロントエンドエラーを送信し、`logs/app.jsonl` に `source: "frontend"` の JSON ログが追記されることを確認。
  3. `docs/system/` や Swagger UI（`http://localhost:8000/docs`）からスキーマを確認。
- **ブラウザ検証**:
  - 対象URL: `http://localhost:5173/`
  - 意図的にテストエラーを発生させ（またはコンポーネント描画エラー時）、画面全体がクラッシュせず `GlobalErrorBoundary` の再読み込み画面が表示され、バックエンドの `logs/app.jsonl` にエラーが記録されることを確認。
- **Red Teaming (境界値・異常系)**:
  1. **ログディレクトリ欠如**: `logs/` フォルダが存在しない状態で起動した場合でも自動生成され、書き込みが継続すること。
  2. **日本語・特殊文字・長大スタックトレース**: 日本語例外メッセージや改行を含むスタックトレースが文字化けせず、1行1レコードの JSON Lines として破損なく記録されること。
  3. **オフライン耐性**: バックエンドが停止している最中にフロントエンドで例外が発生しても、エラーハンドラが二重例外を起こさず安全にフォールバックすること。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit` を実行し、客観的証明を得ること。
