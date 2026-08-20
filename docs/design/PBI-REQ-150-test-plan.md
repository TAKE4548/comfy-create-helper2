# REQ-150 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 単体テスト実行
- **コマンド**: `npx vitest run frontend/src/utils/__tests__/profileUtils.test.ts`
- **判定基準 (Assertion)**:
  - Exit code = 0
  - テスト結果サマリーで `Tests: X passed, X total`（Failed = 0）が出力されること。
  - テストケースとして以下がすべて個別に PASS すること:
    1. `parseProfileName`: `Scene 1` -> `{ baseName: 'Scene', separator: ' ', num: 1 }`
    2. `parseProfileName`: `Scene_1` -> `{ baseName: 'Scene', separator: '_', num: 1 }`
    3. `parseProfileName`: `Scene-1` -> `{ baseName: 'Scene', separator: '-', num: 1 }`
    4. `parseProfileName`: `Scene1` -> `{ baseName: 'Scene', separator: '', num: 1 }`
    5. `parseProfileName`: `Scene` -> `{ baseName: 'Scene', separator: ' ', num: null }`
    6. `generateNextProfileName`: `sourceName = 'Scene 1', existing = ['Scene 1']` -> `'Scene 2'`
    7. `generateNextProfileName`: `sourceName = 'Scene 1', existing = ['Scene 1', 'Scene 5', 'Scene 2']` -> `'Scene 6'`
    8. `generateNextProfileName`: `sourceName = 'Scene', existing = ['Scene']` -> `'Scene 2'`
    9. `generateNextProfileName`: `sourceName = 'Scene_1', existing = ['Scene_1', 'Scene_2']` -> `'Scene_3'`
    10. `generateNextProfileName`: `sourceName = 'Char (Hero) 1', existing = ['Char (Hero) 1']` -> `'Char (Hero) 2'`
    11. `generateNextProfileName`: `sourceName = '', existing = ['Set 1']` -> `'Set 1'`
    12. `generateNextProfileName`: `sourceName = 'Set', existing = ['Set 1', 'Set 2']` -> `'Set 3'`

### 1.2 ビルド整合性チェック
- **コマンド**: `npm run build`
- **判定基準 (Assertion)**:
  - Exit code = 0
  - TypeScript 型エラー（TSxxxx）および Vite ビルドエラーが 0 件であること。

---

## 2. ツール主導監査 / コンポーネント検証 (Component / E2E Verification)
- **コマンド**: `npx vitest run frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **判定基準**: Exit code = 0、全テスト PASS。

---

## 3. UI検証 (Browser / Manual Step-by-Step Verification)
- **対象URL**: `http://localhost:5173/`
- **事前条件**: プリセットとして `Preset 1` (id=1), `Preset 2` (id=2) が存在すること。
- **検証手順と判定基準**:
  1. `button#add-set-btn` をクリック。
     - **判定**: `input#new-profile-name` の `value` が `'Set 3'`（または既存Setの最大値+1）であること。
  2. `select#copy-source-select` の値を `'1'` (`Preset 1`) に変更。
     - **判定**: `input#new-profile-name` の `value` が即時に `'Preset 3'`（既存 Preset 1, Preset 2 の最大値+1）に更新されること。
  3. `input#new-profile-name` の値を `'Custom Preset'` に手動書き換え。
     - **判定**: `input#new-profile-name` の `value` が `'Custom Preset'` になること。
  4. `button#confirm-add-set-btn` をクリック。
     - **判定**: モーダルが閉じ、新しいタブ/プロファイルが名称 `'Custom Preset'` で生成・選択されること。
