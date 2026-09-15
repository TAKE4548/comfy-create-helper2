# REQ-262 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest tests/test_spa_static.py -v`
- **対象環境**: Python 3.12+, FastAPI, pytest
- **期待値**: 以下の全 6 テストケースが PASS（脳内推論での代用は厳禁、実プロセス実行出力を必須とする）:
  1. `test_root_serves_index_html`: `GET /` -> Status 200, Content-Type に `text/html` を含み、`<div id="root">` を含むこと。
  2. `test_static_asset_serves_file`: `GET /assets/test.js` -> Status 200, Content-Type に `javascript` を含み、ファイル内容と一致すること。
  3. `test_spa_route_fallback`: `GET /presets` および `GET /generate/123` -> Status 200, `index.html` の内容が返却されること。
  4. `test_missing_asset_returns_404`: `GET /assets/missing.js` -> Status 404（HTML へのフォールバックが阻止されること）。
  5. `test_missing_api_returns_404_json`: `GET /api/nonexistent` -> Status 404, JSON `{"detail": "Not Found"}` が返却されること。
  6. `test_actual_app_health_and_config`: `GET /health` -> Status 200 `{"status": "ok", "version": "2.0.0"}`、`GET /api/config` -> Status 200 `{"comfy_url": ...}`（回帰防止）。
- **コマンド**: `pytest tests/test_config.py`
- **期待値**: `1 passed`。新設の `frontend_dist_path` プロパティが正常に解決されること。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ 1 (単一プロセス Web UI アクセス)**:
  1. `cd backend && uvicorn app.main:app --port 8000` を起動。
  2. `curl -s -i http://localhost:8000/` を実行。
     - 判定基準: Status 200, `Content-Type: text/html`, レスポンス内に `<div id="root">` が含まれること。
- **シナリオ 2 (SPA 直接遷移およびリロード)**:
  1. `curl -s -i http://localhost:8000/presets` を実行。
     - 判定基準: Status 200, `Content-Type: text/html`, レスポンス内に `index.html` の DOM 構造が含まれ、404 にならないこと。
- **シナリオ 3 (エージェント向け /build スラッシュコマンド検証)**:
  1. `.agents/skills/build/SKILL.md` の指示に基づきビルドを実行。
     - 判定基準: `frontend/dist/index.html` および assets が更新され、Backend 設定 `settings.frontend_dist_path.exists()` が `True` となること。
- **シナリオ 4 (Server Manager 自動判別＆オンデマンドVite起動)**:
  1. `frontend/dist/index.html` が存在する状態で `powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json` を実行。
     - 判定基準: `fe.status` が `"BUNDLED"`、`fe.name` が `"React FE (Bundled on 8000)"` であり、エラー（STOPPED）扱いされないこと。
  2. Web Manager または `server-manager.ps1 -Action start -Service frontend` を実行。
     - 判定基準: Port 5173 で Vite が起動し、ステータスが `"LISTEN"` に遷移すること。
  3. `server-manager.ps1 -Action stop -Service frontend` を実行。
     - 判定基準: Port 5173 が解放され、ステータスが再び正常な `"BUNDLED"` に復帰すること。
- **シナリオ 5 (既存 Dev サーバー併用検証)**:
  1. Vite 起動状態で `curl -s -i http://localhost:5173/` を実行。
     - 判定基準: Status 200, Vite 開発サーバーが正常に応答すること。

## 3. Red Teaming (境界値・異常系)
- **境界値 1: 未定義 API 呼び出しの漏れ防止**:
  - `curl -s -o - -w "%{http_code}" http://localhost:8000/api/nonexistent_route`
  - 判定基準: HTTP ステータスコードが `404` であり、レスポンスボディが `{"detail":"Not Found"}` であること（HTML が返らないこと）。
- **境界値 2: 欠損アセットの MIME エラー防止**:
  - `curl -s -o - -w "%{http_code}" http://localhost:8000/assets/missing_chunk.js`
  - 判定基準: HTTP ステータスコードが `404` であること（Status 200 の HTML が返らないこと）。
- **異常系 3: ビルド未生成時のバックエンド起動**:
  - `frontend_dist_dir` を存在しない一時パスに退避してバックエンドを起動。
  - `curl -s http://localhost:8000/`
  - 判定基準: プロセスが例外クラッシュせず、案内 JSON が返却されること。
- **境界値 4: ファイアウォールルールの冪等性**:
  - `tools/server-manager/allow_firewall_8000.bat` を複数回実行。
  - 判定基準: エラーコード 0 で正常終了し、重複ルールで競合しないこと。

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-262-test-plan.md` を実行し、Reasoning モデルによる客観的評価ログ（Trace）を取得すること。
