# REQ-276: テスト計画書 (Test Plan)

- **PBI**: REQ-276
- **作成日**: 2026-09-18（改訂版）
- **作成者**: Architect / QA

---

## 1. 検証ゲート概要 (3-Gate Baseline)

### Gate 1: 静的解析・型チェック
- **フロントエンド**: `npm run build` または `npx tsc --noEmit`
  - 判定基準: 0 errors
- **バックエンド**: `pytest backend/tests` または構文チェック
  - 判定基準: 0 errors

### Gate 2: フルテストスイート実行
- **フロントエンド**: `npm run test` (Vitest)
  - `usePresetState.test.ts`, `useGenerateAction.test.ts` を含む全ユニットテストの自動発見実行
  - 判定基準: 0 failures
- **バックエンド**: `pytest backend/tests`
  - `test_presets.py`, `test_mapping_masters.py` を含む全テストの実行
  - 判定基準: 0 failures

### Gate 3: 統合シナリオ & Red Teaming（境界・障害テスト）

---

## 2. 統合シナリオテスト (Integration Scenarios)

### シナリオ 1: `updated_at` 形式差異（Zの有無）による再同期防止テスト
- **手順**:
  1. `presetUpdatedAtRef` に UTC ISO 文字列（`2026-09-18T10:00:00.000Z`）が保持されている状態で、サーバーから末尾 Z なしの同一日時文字列（`2026-09-18T10:00:00`）を受信する。
  2. `isTimestampDifferent` が `false` を返し、不要な `loadPresetData` が呼ばれないことを検証。
- **期待結果**: ローカルの編集状態が保持され、再ロードによる上書きが発生しないこと。

### シナリオ 2: アスペクト比変更直後（1秒以内）の即時生成テスト
- **手順**:
  1. アスペクト比を `9:16` から `16:9` に変更する。
  2. 1秒のデバウンス待機が完了する前（例: 200ms 後）に `handleGenerateSets` を呼び出す。
- **期待結果**: 
  - 即時フラッシュが走り、ComfyUI にキュー投入されるペイロード内の `aspect_ratio` が確実に `16:9` であること。

### シナリオ 3: マッピングマスター更新時のカスケード置換テスト
- **手順**:
  1. テスト DB に `'Test Old Role': 'val'` を持つプリセットレコードを用意する。
  2. `PUT /api/mapping-masters/{id}` でロール名を `'Test New Role'` に変更する。
- **期待結果**:
  - `workflow_presets` の `param_values` 内のキーが自動的に `'Test New Role'` に置換されていること。
  - レスポンスタイムが 100ms 以内（実測 35ms レベル）であること。

### シナリオ 4: 既存 636 件の旧キー正規化マイグレーションテスト
- **手順**:
  1. `backend/scripts/migrate_resolution_selector_keys.py` を実行する。
- **期待結果**: 
  - `SELECT count(*) FROM workflow_presets WHERE param_values LIKE '%Resolution Selecto%'` が 0 件になること。
  - すべてのレコードで `'Resolution Selector'` の値が保持されていること。

---

## 3. Red Teaming (異常系・境界値テスト)

### RT-1: 実際に他端末からプリセットが更新された場合のコンフリクト検出テスト
- **内容**: タイムスタンプが 5秒以上新しい `updated_at` を受信した場合、正常に「他者更新」と判定され、未保存変更があればコンフリクトモーダルが表示され、未編集なら新データがロードされること（既存機能のデグレがないこと）。

### RT-2: 無効な日時文字列・NULL 境界値テスト
- **内容**: `updated_at` が `null`, `undefined`, 不正な文字列の場合に、アプリケーションがクラッシュせず安全にフォールバックすること。
