# REQ-267 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド単体・結合テスト
- **実行コマンド**:
  ```bash
  pytest backend/tests/test_snapshot_service_req267.py -v
  pytest backend/tests/test_integration_snapshots.py -v
  ```
- **期待値**: 全テストケースが PASS すること。
- **検証項目**:
  1. `resolve_internal_comfy_url` が、外部 IP（`http://192.168.3.13:8188/view?...` 等）を `settings.comfy_url`（`http://localhost:8188/view?...`）へ正確に書き換えること。
  2. `POST /api/snapshots` に外部 ComfyUI URL が渡された際、内部 ComfyUI から正常に画像を取得し、`db/snapshots/` に WebP 実体およびサムネイルが生成され、DB の `image_path` / `thumbnail_path` が `/api/snapshots/images/...` になること（AC-1, AC-2）。
  3. ダウンロード失敗時（ComfyUI 停止または 404 等）に、サイレントフォールバックせず `HTTPException`（502 または 404）が返却され、不正レコードが DB に残らないこと。

### 1.2 データ修復スクリプトのドライラン・実行検証
- **実行コマンド**:
  ```bash
  python backend/scripts/repair_snapshots_req267.py --dry-run
  python backend/scripts/repair_snapshots_req267.py
  ```
- **期待値**:
  - 対象 68 件のレコードが検出され、全件正常に WebP 変換・サムネイル生成され、DB レコードが更新されること（AC-3）。
  - 修復後、`SELECT count(*) FROM snapshots WHERE thumbnail_path IS NULL` が 0 件になること。

### 1.3 フロントエンド単体テスト
- **実行コマンド**:
  ```bash
  npm --prefix frontend test -- src/pages/__tests__/HistoryPage.test.tsx
  ```
- **期待値**: 全テストケースが PASS すること。
- **検証項目**:
  - `HistoryPage` において、`thumbnail_path` がある通常スナップショットおよび万一外部 ComfyUI URL が渡された場合のフォールバックサムネイルが正しく描画されること。

---

## 2. 結合・E2Eシナリオ検証 (Scenario Verification)

### 2.1 マルチデバイス実機シナリオ
- **シナリオ 1 (外部クライアントからの保存と他端末での閲覧)**:
  1. 外部クライアント端末（`192.168.3.10`）から `http://192.168.3.13:8000` にアクセスし、画像を生成してスナップショット保存を実行。
  2. 保存が即座（1秒以内、5秒タイムアウトなし）に完了することを確認。
  3. サーバーホスト（`127.0.0.1`）および外部クライアントの双方で `/history` ページを開く。
  4. 一覧サムネイルおよびモーダルプレビューが両端末で即座に表示されることを確認（AC-1, AC-2, AC-4）。
- **シナリオ 2 (既存影響レコードの表示確認)**:
  1. 修復スクリプト実行後、サーバーホスト端末で `/history` ページを開く。
  2. 過去に表示できなかったスナップショット（ID: 4108 〜 4177）のサムネイルが一覧に表示され、クリックしてモーダルプレビューで実画像が確認できること（AC-3, AC-4, AC-5）。

### 2.2 Red Teaming (境界値・異常系テスト)
- **テストケース 1: ComfyUI 側で一時ファイルが既に消失している場合のエラー処理**:
  - 存在しない一時画像 URL（404 Not Found）で `POST /api/snapshots` を呼び出した際、サーバーがサイレントに空データや壊れた URL を保存せず、明確なエラー（HTTP 404 / 502）をクライアントへ返却すること。
- **テストケース 2: 無効な URL 形式や極端に長いクエリパラメータ**:
  - `/view?` を含まない外部画像 URL や、不正な URL 形式が渡された場合でも、内部正規化ヘルパーが例外でクラッシュせず安全にフォールバックすること。
- **テストケース 3: 修復スクリプトの再実行耐性（冪等性）**:
  - 修復スクリプトを複数回連続して実行した場合、既に修復済みのレコード（`thumbnail_path IS NOT NULL`）が安全にスキップされ、二重変換やファイル破壊が発生しないこと。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **エンジニア監査**:
  `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit`
- **QA 監査**:
  `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit`
- **アーティファクト整合性確認**:
  `python ${GLOBAL_SCRIPTS}\artifact_linter.py`
