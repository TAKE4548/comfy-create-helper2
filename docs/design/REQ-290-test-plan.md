# REQ-290 実行可能テスト計画: リソース監視 GPU使用率算出是正 (全エンジンMAX採用)

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド自動テスト (Gate 2: Unit & Regression)
- **コマンド**: `backend\.venv\Scripts\python -m pytest backend/tests/test_ws.py`
- **合否判定基準 (PASS Criteria)**:
  - 既存の WebSocket 配信テストおよび例外ハンドリングテストがすべて成功（PASS）すること。
  - テスト失敗（Failure）0件、エラー（Error）0件、終了コード 0 であること。

### 1.2 WindowsGpuMonitor 全エンジンMAX集計ユニット検証
- **コマンド**:
  ```powershell
  & "c:\Users\audih\ws\comfy-create-helper2\backend\.venv\Scripts\python.exe" -c "
  import sys; sys.path.insert(0, 'backend')
  from app.services.resource_monitor import WindowsGpuMonitor
  import time
  m = WindowsGpuMonitor()
  assert m.primary_luid_hex is not None, 'primary_luid_hex must be detected'
  assert m._initialized is True, 'PDH must be initialized'
  time.sleep(0.5)
  gpu_pct, vram_used, vram_total, vram_pct = m.collect()
  print(f'Sampled: gpu_pct={gpu_pct}, vram={vram_used}/{vram_total}GB ({vram_pct}%)')
  assert gpu_pct is not None and 0.0 <= gpu_pct <= 100.0, 'gpu_pct out of range'
  m.close()
  print('Unit verification PASS')
  "
  ```
- **合否判定基準**:
  - `primary_luid_hex` が正常に取得されていること。
  - `gpu_pct` が None ではなく `0.0 <= gpu_pct <= 100.0` の範囲に収まること。
  - 終了コード 0 で完了すること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 シナリオ 1: WebSocket経由でのGPU使用率配信検証
- **手順**:
  1. `TestClient(app).websocket_connect("/api/ws")` で WebSocket 接続を確立。
  2. ブロードキャストされる `SYSTEM_STATS` メッセージを受信。
- **合否判定基準 (定量定義)**:
  - 受信 JSON の `type` が `"SYSTEM_STATS"` であること。
  - `data.gpu_pct` が `float` 型であり、`0.0 <= gpu_pct <= 100.0` の範囲であること。
  - `data.vram_used_gb`, `data.vram_total_gb`, `data.vram_pct` が正常に取得できていること。

### 2.2 シナリオ 2: AI推論/画像生成負荷時の追従性検証 (手動/運用E2E)
- **手順**:
  1. ComfyUI または ローカル LLM（LM Studio / Ollama）で推論/生成処理を実行。
  2. Windows タスクマネージャーの「パフォーマンス > GPU」グラフと Prompt Surgeon のリソースゲージ表示を比較観察。
- **合否判定基準 (定量定義)**:
  - タスクマネージャー上で Compute エンジンが 80〜100% 稼働している際、Prompt Surgeon 側の GPU 使用率も 80〜100% の負荷上昇を捉え、0.0% のまま放置されないこと（AC-1, AC-2）。
  - 生成完了後、2.5 秒以内の次サンプリングで 0.0〜数% のアイドル値に速やかに復帰すること（AC-3）。

---

## 3. Red Teaming (境界値・異常系)

### 3.1 PDH API エラー時の安全なフォールバック
- **シナリオ**: PDH クエリ開設失敗、または `PdhCollectQueryData` / `PdhGetFormattedCounterArrayW` がエラーコードを返却した場合。
- **検証手順**:
  - `WindowsGpuMonitor.collect` または `_get_engine_max` にモック例外（RuntimeError）を注入した状態で WebSocket クライアントから受信を試行。
- **合否判定基準**:
  - バックエンドがプロセス異常終了（クラッシュ）せず、`gpu_pct: null` としてフォールバックし、CPU/RAM の監視配信が安全に継続すること。

### 3.2 不明なエンジン名やアダプター不一致のフィルタリング
- **シナリオ**: プライマリ GPU と異なる LUID を持つカウンターインスタンス（例: CPU 内蔵グラフィックス / ソフトウェアレンダラ）、または `engtype_` を含まないカウンター名が存在する場合。
- **検証手順**:
  - 異なる LUID のダミーデータが `engine_totals` に加算されず、正しく除外されることを検証。
- **合否判定基準**:
  - 他アダプターの負荷がプライマリ GPU の `gpu_pct` に混入・汚染しないこと。

### 3.3 サンプリングオーバーヘッド検証 (性能境界)
- **シナリオ**: 500 件以上のエンジンインスタンスが存在する環境下での `_get_engine_max` 実行時間計測。
- **合否判定基準**:
  - 1 回のサンプリング処理時間が 1.0ms 未満（目標 0.5ms 未満）に収まり、イベントループのブロッキングが発生しないこと（AC-4）。
