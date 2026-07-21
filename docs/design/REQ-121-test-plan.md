# テスト計画書: REQ-121 生成画面のプロファイルタブおよびアコーディオン展開状態の永続化・保持機能

- **作成日**: 2026-07-21
- **対象PBI**: [REQ-121](../backlog/pbi/archive/REQ-121.md)

---

## 1. 単体テスト (Unit Tests)

### テスト対象
- [frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx](../../frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx)

### 検証コマンド
```bash
npx vitest run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
```

### テストケース
1. **`activeSetId` のリロード時復元テスト**:
   - `localStorage` に `prompt-surgeon-active-set-wf-1 = "12"` を事前にセットした状態でフックをレンダリング。
   - `presets` 取得後、`activeSetId` が `12`（厳密等価 `=== 12`）に維持されていることを検証。
2. **`activePromptTab` のモバイル環境復元テスト**:
   - `localStorage` に `prompt-surgeon-active-prompt-tab-1 = "negative"` をセットした状態でフックをレンダリング。
   - `activePromptTab` が `"negative"`（厳密等価 `=== "negative"`）に復元されることを検証。
3. **アコーディオン `collapsedRoles` 復元テスト**:
   - `localStorage` に `prompt-surgeon-collapsed-positive = "true"` をセットした状態で `getIsRoleCollapsed('positive')` が `true`（`=== true`）を返すことを検証。

---

## 2. 統合・受入テスト (Integration / Manual Tests)

1. **前提条件**: `npm run dev` でローカルサーバー（`http://localhost:5173`）を起動。
2. **Set選択状態維持の検証**:
   - ブラウザで `http://localhost:5173/generate` を開く。
   - プロファイルタブで「Set 2」をクリック（DOM要素のクラスに `bg-accent-green/10 border-accent-green/40` が付与される）。
   - `F5` またはブラウザ更新を実行。
   - **期待結果**: リロード後も「Set 2」タブがクラス `bg-accent-green/10 border-accent-green/40` を保持したアクティブ表示状態で復元されること。
3. **モバイルタブおよびアコーディオン展開維持の検証**:
   - ビューポート幅を768px未満にし、モバイル表示（`/mobile/generate`）にする。
   - プロンプトタブ「Negative」を選択（`border-accent-green` が付与される）。
   - 「Negative」入力領域のアコーディオンヘッダーをクリックして折りたたむ（`isCollapsed === true`）。
   - `F5` でリロードを実行。
   - **期待結果**: 「Negative」タブが選択状態で復元され、入力エリアが折りたたまれた状態で表示されること（`localStorage.getItem('prompt-surgeon-collapsed-negative') === 'true'`）。
