# REQ-027 詳細設計書: フロントエンドテスト環境(Vitest)の導入とタグチップエディタのテスト実装

## 1. 目的・背景
フロントエンドにおける自動テスト環境が存在しないため、コードの変更や機能追加時におけるデグレーション（バグの混入や先祖返り）のリスクが高い状態にあります。
特にタグチップエディタ（`TagChipEditor`）はドラッグ＆ドロップ、インライン編集、Undo/Redo履歴管理、カスタムウィンドウイベントによる同期などの複雑なUIロジックを含んでおり、自動テストによる品質担保が不可欠です。
本設計書では、Viteとシームレスに動作するテストランナーとして `Vitest` を導入し、`React Testing Library` を用いたユニットテストおよびコンポーネントテストの実行環境を構築するとともに、タグチップエディタのテストスイートを実装します。

## 2. システム設計
### 2.1 テスト環境の構成 (Vitest + React Testing Library)
- **テストランナー**: `Vitest`
- **DOMエミュレーション**: `jsdom` (React Testing Libraryとの高い親和性と安定したブラウザAPIサポートのため)
- **テストユーティリティ**:
  - `@testing-library/react` (Reactコンポーネントのレンダリング・インタラクションテスト用)
  - `@testing-library/jest-dom` (DOM要素に対するカスタムアサーションの提供)
  - `@testing-library/user-event` (より現実のユーザー操作に近いブラウザイベントシミュレーション用)

### 2.2 設定ファイル
#### 2.2.1 `frontend/vite.config.ts` の拡張
既存の `vite.config.ts` に `test` プロパティを追加し、`vitest` の型参照を追加します。
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true, // CSSスタイルの考慮が必要な場合
  },
  // server config...
})
```

#### 2.2.2 `frontend/src/test/setup.ts` の作成 [NEW]
テスト実行前に自動で読み込まれ、`@testing-library/jest-dom` のアサーションを登録するセットアップファイルを配置します。
```typescript
import '@testing-library/jest-dom';
```

#### 2.2.3 `tsconfig` 類の調整
テストコードがグローバルな `vitest` の型定義を参照できるよう、`frontend/tsconfig.app.json` もしくはテストファイル内で適切な型解決を行います。
※型汚染を防ぐため、テストファイル内での `import { describe, it, expect, vi, beforeEach } from 'vitest';` の明示的インポートを推奨します。

### 2.3 対象ロジックとテスト設計
タグチップエディタを構成する各部品に対して以下のテストを設計・実装します。

#### 2.3.1 ユニットテスト (Pure Logic & Custom Hooks)
1. **`useChipParser.ts`**
   - `parseToChips(text: string)` の検証:
     - 空文字列、undefined、null 入力時に `[]` を返すこと。
     - カンマ区切りの文字列から適切な `TagChip` 配列（ID付き、`enabled: true`）が生成されること。
     - 余分な前後の空白がトリムされること。
     - 連続するカンマや空要素が除外されること。
   - `chipsToString(chips: TagChip[])` の検証:
     - チップ配列をカンマ＋スペース区切りの文字列に変換できること。
     - `enabled === false` の非活性チップが文字列出力から除外されること。
     - すべて非活性または空配列の場合、空文字列を返すこと。

2. **`useChipHistory.ts`**
   - 初期状態が正しくセットされること。
   - `setChips(newChips, pushToHistory = true)` の動作:
     - `pushToHistory = true` のとき、以前の状態が `past` に保存され、`future` がクリアされること。
     - `pushToHistory = false` のときは `present` のみが更新されること。
     - 履歴数が50件を超えた場合、古い履歴（先頭）がシフトされて削除されること（上限50件のクリップ検証）。
   - `undo()` と `redo()` の動作:
     - `undo` で過去の状態に戻り、現在状態が `future` に移動すること。
     - `redo` で未来の状態に進み、現在状態が `past` に移動すること。
     - `canUndo` および `canRedo` フラグが履歴状態に応じて正しく `true`/`false` になること。

#### 2.3.2 コンポーネントテスト (UI & Interaction)
1. **`TagChip.tsx`**
   - レンダリング:
     - 指定されたテキストが表示されること。
     - `enabled: false` の場合、非活性状態のスタイル（取り消し線など）が適用されること。
     - 編集モードでない場合、ドラッグハンドルが表示されること。
   - インタラクション:
     - チップをクリック（またはテキストダブルクリック）して編集モードへ切り替わること。
     - 編集用インプットに入力し、Enterキーの押下またはフォーカスアウト(blur)で編集が確定し `onEdit` が呼ばれること。
     - 編集時に Escape キーを押すとキャンセルされ、元のテキストに戻ること。
     - 編集で空文字にした場合、自動的に `onDelete` が呼ばれること。
     - 削除ボタンをクリックすると `onDelete` が呼ばれること。
   - キーボードショートカット:
     - 非編集時に `Space` を押すと `onToggle` が呼ばれること。
     - `Delete`/`Backspace` を押すと `onDelete` が呼ばれること。
     - `Ctrl+D` (または `Cmd+D`) を押すと `onDuplicate` が呼ばれること。

2. **`TagInput.tsx`**
   - レンダリング:
     - プレースホルダーが正しく表示されること。
   - インタラクション:
     - テキストを入力してカンマ `,` を打ち込んだ際、自動的にトリムされて `onAddTags` が呼ばれ、インプットがクリアされること。
     - テキスト入力中に `Enter` または `Tab` キーを押した際、`onAddTags` が呼ばれ、インプットがクリアされること。
     - 空入力の状態で `Backspace` キーを押した際、`onRemoveLast` が呼ばれること。
     - 貼り付け(Paste)時にカンマ区切りの文字列を適切に分割し、複数タグとして `onAddTags` へ渡せること。

3. **`TagChipEditor/index.tsx` (統合コンポーネント)**
   - レンダリング:
     - 初期値 "apple, banana" でチップが2つ描画されること。
     - デフォルトで「チップモード」であり、切替ボタンで「テキスト入力モード」へ遷移すること。
   - モード切替:
     - テキスト入力モードでは `textarea` が表示され、入力値がカンマ区切りで表示されること。
     - テキストエリアを編集してチップモードに戻した際、新しいテキスト内容に基づきチップが再生成・更新されること。
   - グローバルイベント:
     - ウィンドウイベント `tag-chip-editor:disable-tag` を受信した際、該当するタグが非活性化されること。
     - ウィンドウイベント `tag-chip-editor:add-tag` を受信した際、新規タグが追加されること。
   - ショートカットキー:
     - コンテナ上で `Ctrl+Z` を押すと `undo` が実行されること。
     - `Ctrl+Y` または `Ctrl+Shift+Z` を押すと `redo` が実行されること。

## 3. 影響範囲
### フロントエンド
- `frontend/package.json` [MODIFY]
- `frontend/vite.config.ts` [MODIFY]
- `frontend/src/test/setup.ts` [NEW]
- `frontend/src/components/TagChipEditor/__tests__/useChipParser.test.ts` [NEW]
- `frontend/src/components/TagChipEditor/__tests__/useChipHistory.test.ts` [NEW]
- `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` [NEW]
- `frontend/src/components/TagChipEditor/__tests__/TagInput.test.tsx` [NEW]
- `frontend/src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx` [NEW]

### バックエンド / API
- 影響なし
