# REQ-222 実行可能テスト計画: TagChipEditorの外部プロンプト文字列同期不全およびプリセット切替時の消失バグ解消

## 1. 自動テスト (CLI Verification)

以下の自動テストコマンドを `frontend/` ディレクトリ配下で実行し、終了コード 0 かつ全テスト合格を確認する：

### 1.1 TagChipEditor 外部同期・コールバック単体テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - `chips` prop（例: `[{ id: '1', text: 'apple', enabled: true }]`）が渡された状態でも親から `value="banana, orange"` が渡された際にチップが `banana`, `orange` の2件に再パース・更新されるテストケースを含む全テストが PASS すること。

### 1.2 GeneratePage プリセット切替・セクションコピペ回帰テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/__tests__/GeneratePage.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - プリセット A（`1girl, solo`）から プリセット B（`cat, cute`）への切り替え、およびセクションコピペによる貼り付け操作で入力欄が即時同期されるテストケースを含む全テストが PASS すること。

### 1.3 MobileLayout 統合テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx
  ```
- **終了コード**: `0`
- **出力判定基準**:
  - 全 5 件以上のテストケースが PASS すること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 プリセット切替プロンプト保持検証
- **検証手順**:
  1. プリセット A でプロンプト `1girl, solo, smile` を入力。
  2. プリセット B へ切り替える（プロンプトが空文字列 `""` または別の値）。
  3. 再び プリセット A へ切り替える。
  4. プリセット A の入力欄に `1girl`, `solo`, `smile` のタグチップが維持され、空欄化しないこと。

### 2.2 セクションコピペ検証
- **検証手順**:
  1. プロンプト欄に `cat, cute, fluffy` を入力。
  2. セクションヘッダーのコピーボタン（`PromptSectionClipboardMenu`）をクリックしてコピー。
  3. 入力欄のタグをクリア（空文字列 `""`）にし、クリップボードメニューから「クリップボードから貼り付け」または履歴をクリック。
  4. 入力欄に即時 `cat`, `cute`, `fluffy` のタグチップが復元されること。

### 2.3 Red Teaming（境界値・異常系検証）
- **シナリオ 1（空文字・カンマのみ文字列ペースト）**:
  - 外部から `", , , "` などの無効トークンのみがペーストされた場合、TagChipEditor が不正な空チップを生成せず安全に空状態（チップ数 0）を維持すること。
- **シナリオ 2（未保存プリセットの高速連続切替）**:
  - プリセット切替を 100ms 間隔で連続して行った際、前後のチップ状態が混濁せず、選択中プリセットの `paramValues` とチップ表示が完全一致すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\artifact_linter.py <task_dir>` を実行し、`PASS` となること。
- `python ${GLOBAL_SCRIPTS}\workflow_validator.py validate REQ-222` を実行し、`Validation successful` となること。

