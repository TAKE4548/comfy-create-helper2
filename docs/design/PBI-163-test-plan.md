# PBI-163: テスト計画書 (Test Plan)

## 1. 自動テスト計画 (Automated Tests)

### 1.1 バックエンドテスト
以下のテストスイートを実行し、BE 楽観的ロック（OCC）およびプリセットAPI全般が正しく動作することを確認する。

```bash
$env:PYTHONPATH="backend"; python -m pytest backend/tests/test_presets.py -v
$env:PYTHONPATH="backend"; python -m pytest backend/tests/ -v
```

#### バックエンド検証項目:
1. `GET /api/workflow-presets` が各プリセットの `updated_at` (ISO 8601 文字列) を含んだスキーマで返却すること（`TestPresetOCC::test_preset_read_includes_updated_at`）。
2. `PUT /api/workflow-presets/{id}` で `base_updated_at` が現在の DB の `updated_at` と一致している場合、正常に更新（HTTP 200 OK）され、レスポンスに新しい `updated_at` が返却されること（`TestPresetOCC::test_preset_update_with_valid_base_updated_at`）。
3. `PUT /api/workflow-presets/{id}` で `base_updated_at` が DB の `updated_at` より古い場合、`HTTP 409 Conflict` が返され、レスポンスの detail にエラーメッセージが含まれ、DB レコードが更新されずに保護されること（`TestPresetOCC::test_preset_update_conflict_raises_409`）。
4. `base_updated_at` が指定されていない場合は従来通り更新されること（`TestPresetsAPI::test_update_preset`）。

### 1.2 フロントエンドテスト
以下のテストスイートを実行し、フロントエンドの全機能およびプロンプト独立性・OCCが正常に動作することを確認する。

```bash
cd frontend; npm test -- src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx --run
cd frontend; npm test -- --run
```

#### フロントエンド検証項目:
1. **`useWorkflowParams.test.ts`**:
   - ワークフロー読み込み時に `getInitialParams` からデフォルト値が抽出され、単一LocalStorageキーによる無差別上書きが行われないこと。
2. **`useGeneratePageState.test.tsx`**:
   - バックエンドのプリセットデータが初期同期時に正しくロードされること。
   - プリセット切り替え時に各プリセット固有のプロンプトがロードされ、他プリセットのデータで汚染されないこと。
   - オートセーブ時に `base_updated_at` が付与されて送信されること。
   - 409 Conflict 発生時に `workflow-presets` クエリが invalidate されてサーバーの最新データが再取得されること。
3. **`useGenerationStore.test.ts`**:
   - `setParamValues`, `addAppliedAsset` 等がアクティブセット内のステートを正しく更新すること。

---

## 2. 手動・実機検証計画 (Manual Verification)

### シナリオ 1: 複数プリセットの編集と独立性検証
1. ワークフローを選択し、「Set 1」でプロンプトを `prompt_for_set1` に変更する（1秒デバウンス後に PUT API が送信され、DB 保存されることを確認）。
2. 「Set 2」タブに切り替え、プロンプトが `Set 2` 独自の内容で表示されることを確認する。
3. 「Set 2」のプロンプトを `prompt_for_set2` に変更する。
4. 再び「Set 1」タブに切り替え、プロンプトが `prompt_for_set1` のままであり、`prompt_for_set2` に汚染されていないことを確認する。

### シナリオ 2: PC開きっぱなし＋モバイル編集による競合保護（過去帰り防止）検証
1. PCで「Set 1」を開いたまま放置する（取得時の `updated_at` = `T1`）。
2. モバイル端末で同一ワークフローの「Set 1」を開き、プロンプトを編集して保存する（DB の `updated_at` が `T2` に更新される）。
3. PC側で「Set 1」の保存が試行された際、送信される `base_updated_at` (`T1`) が DB の `updated_at` (`T2`) より古いため、BE が `HTTP 409 Conflict` を返して古いPCデータによる上書きをブロックすること。
4. PC側が自動的に `workflow-presets` を再取得し、モバイルで編集された最新プロンプト（`T2` の内容）に画面を更新することを確認する。
