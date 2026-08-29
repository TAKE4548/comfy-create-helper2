# テスト計画書: REQ-198 プリセット・プロンプト編集のオートセーブおよび一括編集における状態同期・OCC競合解消

## 1. 自動テスト計画 (Automated Tests)

### 1-1. バックエンドテスト (`backend/tests/test_presets.py`)
- **テストコマンド**: `cd backend && python -m pytest tests/test_presets.py -v`
- **対象ケース**:
  1. `test_preset_update_with_valid_base_updated_at`: 正しいタイムスタンプ（ミリ秒精度シリアライズ含む）での更新が成功すること。
  2. `test_preset_update_conflict_raises_409`: サーバー側許容閾値（10ms = 0.01s）を超えて古いタイムスタンプでの更新時に 409 Conflict が送出されること。
  3. `test_preset_update_with_submillisecond_tolerance`: 10ms未満の微小なシリアライズ誤差があっても正常に200 OKで更新されること。

### 1-2. フロントエンドテスト (`frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`)
- **テストコマンド**: `cd frontend && npm test src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **対象ケース**:
  1. オートセーブが連続して発生した際、最新の `base_updated_at` が後続リクエストに反映され、409 エラーが発生しないこと。
  2. プリセット一括編集（`handleBulkEditApply`）を連続して実行した際、2回目の実行時に1回目の編集結果が維持された最新キャッシュをもとに演算・保存されること。
  3. 一括編集でアクティブなプリセットが変更された際、ローカルステートおよびオートセーブ用参照値（`lastSavedStateRef`）が正しく同期されること。

---

## 2. 手動検証シナリオ (Manual Verification)

### シナリオ 1: プロンプト連続入力とリロード検証 (AC-1, AC-2)
1. Generate 画面でワークフローとプリセットを選択する。
2. プロンプト欄に文字を連続して複数回編集・追記する。
3. 編集直後（1〜2秒後）にブラウザを F5 リロードする。
4. **期待結果**:
   - UIの表示内容が編集直前のテキストを完全に保持していること（UIおよびDB双方が最新状態）。
   - ブラウザのネットワークタブで 409 Conflict が一切発生していないこと。

### シナリオ 2: プリセット一括編集の連続実行検証 (AC-3, AC-4)
1. プリセット管理モーダルを開き、複数のプリセットを選択して「一括編集」を実行（例: プロンプト先頭に `masterpiece, ` を追加）。
2. 適用完了後、直ちに再度「一括編集」を開き、別の編集（例: プロンプト末尾に `, best quality` を追加）を実行。
3. **期待結果**:
   - 各プリセットのプロンプトが `masterpiece, [元のプロンプト], best quality` となり、1回目の変更が消失・上書きされずに累積反映されること。
   - 変更されたアクティブプリセットの画面上パラメータやオートセーブ参照値が即時同期され、直後に文字編集を行っても 409 Conflict なく保存されること。
