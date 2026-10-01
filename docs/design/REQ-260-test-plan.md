# REQ-260 実行可能テスト計画 (VRAM安全ガード & 設定永続化)

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンド テスト
- **コマンド**: `backend\.venv\Scripts\python -m pytest backend/tests/test_vram_guard.py -v`
- **対象ケース**:
  1. `test_app_settings_db_persistence`: `app_settings` テーブルに `vram_min_free_gb` が正しく永続化・更新・再読み込みされること。
  2. `test_get_put_settings_vram_api`: `GET /api/settings/vram` および `PUT /api/settings/vram` が正常に200 OKを返却し、即座に設定値が反映されること。
  3. `test_vram_status_dynamic_threshold`: 設定した閾値（例: 8.0GB）に基づき、`safe: true / false` が動的に切り替わること。
  4. `test_system_stats_ws_broadcast_includes_vram_guard`: `/api/ws` 経由の `SYSTEM_STATS` に設定閾値 `vram_min_free_gb`, `vram_free_gb`, `vram_safe` が含まれること。
  5. `test_vram_recovered_event_broadcast`: VRAMが危険から安全へ遷移した際に `VRAM_RECOVERED` イベントがブロードキャストされること。

### 1-2. フロントエンド 単体テスト
- **コマンド**: `cd frontend; npx vitest run src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx`
- **対象ケース**:
  1. `test_vram_guard_section_renders_current_metrics`: 現在の空きVRAMと設定閾値スライダーが正常に描画されること。
  2. `test_vram_guard_section_updates_threshold`: スライダー変更後に保存ボタンを押下すると `PUT /api/settings/vram` が呼ばれ、成功トーストが表示されること。
- **コマンド**: `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.vram.test.ts`
- **対象ケース**:
  1. `test_generate_aborts_to_vram_wait_when_insufficient`: 設定閾値未満の空きVRAM時に待機状態へ遷移すること (AC-1)。
  2. `test_vram_wait_notifies_user_after_10_seconds`: 待機が10秒継続した際に警告トーストが発行されること (AC-3)。
  3. `test_vram_wait_cancels_cleanly_on_user_abort`: 待機中にユーザーがキャンセルを実行した場合、待機ループを脱出し、アイドルに復帰すること (AC-4)。
  4. `test_vram_wait_auto_resumes_on_ws_recovery_event`: WebSocketから回復イベント受信時に即座に自動再開されること (AC-5)。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. E2E シナリオ (設定変更からVRAM待機・自動再開までの連動検証)
- **コマンド**: `cd frontend; npx vitest run src/test/e2e_req260_vram_guard.test.ts`
- **シナリオ手順**:
  1. **設定変更**: SettingsPageで安全基準値を 6.0GB から 8.0GB に変更して保存。
     - 期待値: バックエンドDBへ永続化され、WebSocketの `vram_min_free_gb` が 8.0 に更新される。
  2. **生成投入**: 空きVRAM 7.0GB（新基準 8.0GB 未満）の状態で Generate Batch を実行。
     - 期待値: 従来の4.0GB基準では通過していたが、8.0GB基準により正しく待機状態へ遷移（AC-1, AC-2）。
  3. **長時間待機通知**: 10秒待機継続。
     - 期待値: 警告トーストが表示される（AC-3）。
  4. **待機キャンセル**: 「待機キャンセル」押下。
     - 期待値: アイドル状態に安全復帰（AC-4）。
  5. **自動再開**: 再度生成投入後、他プロセス終了（空きVRAM 12.0GB）の `VRAM_RECOVERED` をWebSocket受信。
     - 期待値: 即座に待機解除され、ComfyUIへ生成プロンプトが自動投入される（AC-5）。

---

## 3. Red Teaming (境界値・異常系検証)

| テストID | 条件・入力 | 想定される異常・リスク | 期待される防御動作 |
|---|---|---|---|
| **RT-01 (境界値)** | 閾値に極端な値（0GB または GPU総容量超過の32GB）を設定 | 常時待機またはガード無効化 | 入力バリデーション（最小 1.0GB、最大 総容量-1GB）により不正値を弾くこと |
| **RT-02 (境界値)** | 空きVRAMが設定閾値ピッタリ（例: 6.0GB） | 境界判定のブレ | `>= threshold` で安全と判定され待機しないこと |
| **RT-03 (異常系)** | DBテーブル不在・マイグレーション直後 | 初回アクセス時の500エラー | `models.Base.metadata.create_all` によりテーブルが自動生成され、未設定時はデフォルト 6.0GB が返却されること |
| **RT-04 (異常系)** | 待機キャンセル直後に回復WSイベントが同時着火 | キャンセルしたはずのジョブが勝手に開始される | `abortSignal` ガードにより、キャンセル後は回復通知を破棄すること |

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA論理監査**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py ba-audit` (実行済)
- **VRAM解放確認**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py unload` (実行済、VRAM 100% 解放確認完了)
