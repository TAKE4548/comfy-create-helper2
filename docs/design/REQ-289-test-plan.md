# REQ-289 実行可能テスト計画: Windows環境リソース監視是正 & モバイルヘッダー表示

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド検証
- **コマンド**: `python -m pytest backend/tests/test_ws.py`
- **対象**:
  - `WindowsGpuMonitor` による Windows 環境でのメトリクス取得（`gpu_pct` >= 0, `vram_pct` >= 0, `vram_total_gb` == 16.0）
  - SMI/PDH 障害時のフォールバック動作
- **合否判定基準 (PASS Criteria)**: 収集された 6 件以上のテストがすべて成功し、終了コード 0 であること（Failure 0, Error 0）。

### 1.2 フロントエンド静的型検査 (Gate 1)
- **コマンド**: `cd frontend && npm run typecheck`
- **合否判定基準 (PASS Criteria)**: TypeScript コンパイラ（`tsc -b --noEmit`）がエラー 0 件で終了コード 0 を返すこと。

### 1.3 フロントエンド自動テストスイート (Gate 2)
- **コマンド**: `cd frontend && npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
- **合否判定基準 (PASS Criteria)**: `MobileLayout.test.tsx` 内の全テストケースが PASS し、失敗 0 件であること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 シナリオ 1: Windows GPU/VRAM リアルタイム配信
- **手順**:
  1. FastAPI テストクライアントまたは `TestClient(app).websocket_connect("/api/ws")` で WebSocket 接続を確立する。
  2. ブロードキャストされる `SYSTEM_STATS` メッセージを 1 件以上受信し、ペイロードを解析する。
- **合否判定基準 (定量定義)**:
  - `data.gpu_pct`: 型 `float | int`、数値範囲 `0.0 <= gpu_pct <= 100.0`
  - `data.vram_used_gb`: 型 `float | int`、`0.0 <= vram_used_gb <= 16.0`
  - `data.vram_total_gb`: 厳密に `16.0`
  - `data.vram_pct`: 型 `float | int`、`0.0 <= vram_pct <= 100.0`
  - ComfyUI 停止状態であっても上記値が取得可能であること。

### 2.2 シナリオ 2: モバイルレイアウトでの表示と接続確立
- **手順**:
  1. モバイル画面幅（ビューポート 375px）で `MobileLayout` をレンダリングする。
  2. `useSystemStats` のマウント呼び出しにより WebSocket 接続ハンドラが起動し、`systemWsConnected: true` となることを確認。
  3. ヘッダー 1 段目（タイトル `<h1>Generate</h1>` の親要素内）の DOM ツリー内に `ResourceGaugeChips` が存在することを検証。
- **合否判定基準 (DOM 定量判定)**:
  - 1段目ヘッダーコンテナ（`h1` の親コンテナ）の子要素として CPU / RAM / GPU / VRAM のチップテキスト（`StatChip`）が存在すること。
  - 2段目（`select#workflow-select-mobile` の親要素）から `ResourceGaugeChips` が完全に除去されていること。

---

## 3. Red Teaming (境界値・異常系)

### 3.1 PDH API 例外発生時の安全なフォールバック
- **シナリオ**: Windows 環境において PDH クエリの開設やカウンター取得が失敗した場合（OS 権限制限やドライバー異常）。
- **検証手順**:
  - `WindowsGpuMonitor.collect` または初期化時に例外をモック注入する。
- **合否判定基準**:
  - バックエンドが未処理例外でクラッシュせず、`(None, None, None, None)` を返却し、WebSocket 配信が CPU/RAM のみで継続すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-289-T1.md`
- `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-289-test-plan.md`
