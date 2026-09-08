# REQ-229: 端末間プリセット同期不具合の修正と競合解決モーダル - テスト計画書

## 1. テスト方針 (Test Strategy)
フロントエンドの単体テストおよびコンポーネントテストにより、端末間同期の挙動、SSoT優先マージ、キャッシュ除外、および競合解決モーダル（`PresetConflictModal`）の各解決フローが確実に動作することを検証する。

---

## 2. テストケース一覧 (Test Cases)

### 2.1 単体テスト: `usePresetState.test.ts`
1. **未保存保護（Dirty Guard）テスト**:
   - ローカル編集（`isDirty: true`）中にサーバーから新しいデータが届いても、ローカルの入力内容が勝手に上書きされないこと。
2. **外部更新同期テスト**:
   - ローカル編集がない（`isDirty: false`）状態でサーバーの `updated_at` が進んだ場合、`loadPresetData` が呼び出され、ストアの値がサーバー最新値に即時同期されること。
3. **409 Conflict 時の競合モーダル起動テスト**:
   - `updatePresetMutation` が 409 Conflict を受け取った際、勝手にリロードせず、競合データ（`conflictData`）がセットされること。

### 2.2 コンポーネントテスト: `PresetConflictModal.test.tsx`
1. **レスポンシブレンダリングテスト**:
   - デスクトップ幅で「サーバー最新版」と「この端末の編集」の左右2カラムが表示されること。
   - モバイル幅でタブ切り替えによる表示切替が機能すること。
2. **解決アクションの実行テスト**:
   - 「サーバー最新版を採用」クリック時にサーバーデータがストアにロードされ、モーダルが閉じること。
   - 「この端末の編集で上書き」クリック時に強制更新ミューテーションが発火すること。
   - 「別名で両方保存」クリック時に新規プリセット作成ミューテーションが発火すること。

### 2.3 単体テスト: `useGenerationStore.test.ts`
1. **`loadPresetData` での `promptChips` 再生成テスト**:
   - プリセットロード時、新しい `param_values` からパースされたチップが設定されること。

---

## 3. 実行コマンド (Execution Commands)

```bash
# 1. usePresetState 単体テスト
npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts --run

# 2. PresetConflictModal コンポーネントテスト
npm --prefix frontend test -- src/components/__tests__/PresetConflictModal.test.tsx --run

# 3. useGenerationStore 単体テスト
npm --prefix frontend test -- src/store/__tests/useGenerationStore.test.ts --run

# 4. フロントエンド全件リグレッションテスト
npm --prefix frontend test -- --run
```
