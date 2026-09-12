# REQ-253 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### (1) フロントエンド単体テスト (useGenerateDisplayState)
- **コマンド**: `npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx --run`
- **対象ケース**:
  - `[AC-1]` ストア初期化前（`comfyHistoryImages: []`）でも、既存キャッシュが存在する場合に `displayImages` が消去されず即時表示されること。
  - `[AC-2]` `history-fetched` カスタムイベント受信時にペイロード（`allImages`, `ownImages`）から直接キャッシュが更新されること。
  - `[AC-3]` `addHistoryImage` による新規画像追加および重複排除が期待通り動作すること。
- **期待値**: 全テストケース PASS。

### (2) ジョブキュースライステスト (jobQueueSlice)
- **コマンド**: `npm --prefix frontend test -- src/store/__tests__/slices/jobQueueSlice.test.ts --run`
- **対象ケース**:
  - `fetchHistory()` 完了時に dispatch される `comfy-job-event` (`history-fetched`) に `allImages` と `ownImages` が正しく積載されていること。
- **期待値**: 全テストケース PASS。

### (3) E2E 複数端末回帰テスト
- **コマンド**: `npm --prefix frontend test -- src/test/e2e_req240_multidevice.test.ts --run`
- **期待値**: 他セッション画像受信時および自セッションジョブ完了時の同期が崩れていないこと。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **シナリオ**:
  1. 生成画面（`http://localhost:5173/`）を開き、生成履歴が数枚表示されている状態を作る。
  2. ブラウザを F5（リロード）する。
  3. リロード完了直後に履歴ストリップが空にならず、直前の画像が即座に表示されることを目視確認する。
  4. バックグラウンドで `fetchHistory()` が完了した際、画面の履歴がチラつかず維持されることを確認する。
  5. 新規ジョブを投入し、画像生成完了時に新画像が先頭に1枚追加され、過去履歴と合わせて正しく表示されることを確認する。
- **Red Teaming (境界値・異常系)**:
  - **シナリオ**: ComfyUI の履歴が 0 件（初期状態または手動全削除後）の状態でリロードする。
  - **期待挙動**: `fetchHistory()` が空配列を返し、`history-fetched` イベントで正常に空キャッシュとして同期され、コンソールエラーや無限ループ・クラッシュが発生しないこと。
  - **シナリオ**: `history-fetched` イベントの detail に `allImages` / `ownImages` が欠損している（undefined）場合のフォールバック。
  - **期待挙動**: 例外（Cannot read properties of undefined）をスローせず、安全にスキップされること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-253-test-plan.md` を実行し、客観的証明を得ること。
