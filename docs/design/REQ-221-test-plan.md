# REQ-221 実行可能テスト計画: 生成ページ無限再描画エラー解消

## 1. 自動テスト (CLI Verification)

以下の自動テストコマンドを `frontend/` ディレクトリ配下で実行し、終了コード 0 かつ全テスト合格を確認する：

### 1.1 MobileLayout 統合テスト（無限ループ解消確認）
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - `Tests  5 passed (5)` が出力されること。
  - `Error: Maximum update depth exceeded` が一切出力されないこと。

### 1.2 TagChipEditor 単体テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - すべてのテストケース（少なくとも 10 件以上）が passed となり、failed が 0 件であること。

### 1.3 GeneratePage 回帰テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/__tests__/GeneratePage.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - `Tests  11 passed (11)` が出力されること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 画面マウント検証
- **検証手順**:
  1. `frontend/` にて `npm run dev` を起動し、ブラウザでアクセスする。
  2. DOM検証: `document.getElementById('root').children.length > 0` かつ `#prompt-mobile-Main_Positive_Prompt` または `#prompt-Main_Positive_Prompt` 要素が存在すること（`<div id="root"></div>` が空洞化していない客観的証明）。
  3. ブラウザ開発者ツールの Console に `Uncaught Error` または `Maximum update depth exceeded` が 0 件であること。

### 2.2 Red Teaming（境界値・異常系検証）
- **シナリオ 1（大量タグ）**:
  - 50 個のタグ（カンマ区切り文字列）を入力し、モバイル/デスクトップ切り替えを行った際、全 50 個がチップとして欠落なく描画されること。
- **シナリオ 2（高速多重トグル）**:
  - 100ms 間隔で同一タグの有効/無効トグルを 5 回連続クリックした際、状態が整合し `Maximum update depth exceeded` が発生しないこと。
- **シナリオ 3（障害隔離フォールバック）**:
  - 子コンポーネントが例外をスローした場合、`<div id="root"></div>` が空にならず、`GeneratePageErrorBoundary` により「画面の表示中にエラーが発生しました」および「再読み込み」ボタンが画面に描画されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\artifact_linter.py <task_dir>` を実行し、PASS となること。
- `python ${GLOBAL_SCRIPTS}\workflow_validator.py validate REQ-221` を実行し、Validation successful となること。


