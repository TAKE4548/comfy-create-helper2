# REQ-266 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 ユニット・統合テスト
- **実行コマンド**:
  ```bash
  npx vitest run src/store/__tests__/slices/connectionSlice.test.ts
  npx vitest run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
  ```
- **期待値**: 全テストケースが PASS すること（脳内推論での代用は厳禁）。
- **検証項目**:
  1. `comfyWebSocketService` のハートビートタイマー（25秒間隔）が `onopen` で起動し、`onclose` / `disconnect` で正常にクリアされること。
  2. `onClose` だけでなく `onError` 発生時にも確実に再接続タイマーがスケジュールされること。
  3. 指数バックオフ計算（1s, 2s, 4s, 8s... 最大15s）が正しく進行し、接続成功時にリセットされること。
  4. ドキュメントの `visibilitychange`（`visible`）および `window focus` 時に `!isConnected` であれば即座に `store.initialize({ force: true })` がトリガーされること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 シナリオ検証
- **シナリオ 1 (正常系・キープアライブ)**:
  1. フロントエンドを起動し、ComfyUI との接続を確立（インジケーター緑）。
  2. 25秒間操作を行わずに待機し、WebSocket で定期 Ping メッセージ（`{"type":"ping"}`）が送信されていることを確認。
  3. インジケーターが緑色のまま維持され、切断が発生しないことを確認（AC-1）。
- **シナリオ 2 (異常系・切断からの自動復旧)**:
  1. WebSocket 接続確立状態で擬似的に切断イベント（`onclose` または `onerror`）を発生させる。
  2. インジケーターがグレー（未接続）へ遷移し、指数バックオフで再接続が試行されることを確認（AC-2, AC-3）。
  3. 再接続確立後、インジケーターが緑色に復帰し、最新のキュー・履歴が同期されることを確認（AC-5）。
- **シナリオ 3 (タブ復帰時の即時回復)**:
  1. WebSocket 切断状態のままタブをバックグラウンドにする。
  2. タブを再度アクティブ（フォアグラウンド）に切り替える。
  3. 待機タイマーを待たずに即座に再接続初期化が発火し、ComfyUI 接続が復元することを確認（AC-4, AC-6）。

### 2.2 Red Teaming (境界値・異常系テスト)
- **テストケース 1: Ping 送信時のソケット切断例外ハンドリング**:
  - WebSocket が予期せず切断された瞬間にハートビートタイマーが発火し `ws.send()` が例外をスローした場合、アプリケーションがクラッシュせず安全に例外を補足し、切断クリーンアップおよび再接続フローへフォールバックすること。
- **テストケース 2: タブのアクティブ/非アクティブ高速トグル時の競合防御**:
  - `visibilitychange` や `focus` イベントが短時間に連続発火した場合でも、`initialize()` の多重実行ガード（`isInitializing` / ソケット状態チェック）により重複した WebSocket インスタンスが乱立しないこと。
- **テストケース 3: ComfyUI 停止中の長期間指数バックオフ上限チェック**:
  - ComfyUI が停止している状態で再接続が連続失敗した場合、再試行間隔が無限に増大せず上限（15秒）で頭打ちになり、ComfyUI 再起動後に自動復旧すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **エンジニア監査**:
  `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit`
- **QA 監査**:
  `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit`
- **アーティファクト整合性確認**:
  `python ${GLOBAL_SCRIPTS}\artifact_linter.py`
