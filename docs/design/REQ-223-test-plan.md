# REQ-223 実行可能テスト計画: サーバ再起動・初期ロード時のTagChipEditorプロンプト消失バグ解消

## 1. 自動テスト (CLI Verification)

以下の自動テストコマンドを `frontend/` ディレクトリ配下で実行し、終了コード 0 かつ全テスト合格を確認する：

### 1.1 TagChipEditor マウント時非通知・外部値遅延到着・手動削除テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx
  ```
- **終了コード**: `0`
- **判定基準**:
  - マウント時に親へ `onChipsChange` が空配列で呼ばれないこと。
  - 親からの遅延 `value` 到着時に `onChange("")` が発火せず、正常にタグチップがパース・表示されること。
  - ユーザーが手動で全削除した場合にのみ `onChange("")` が発火すること。

### 1.2 multiSetSlice `loadPresetData` チップ復元テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/store/__tests/useGenerationStore.test.ts
  ```
- **終了コード**: `0`
- **判定基準**:
  - すでにセットに空配列 `{ role: [] }` が存在している状態でも、`loadPresetData` 実行時にプリセットの `param_values` からパースされた初期チップ（`initialPromptChips`）が優先復元されること。

### 1.3 MobileLayout タブ切り替え・マウント時プロンプトチップ保持テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx
  ```
- **終了コード**: `0`
- **判定基準**:
  - モバイルレイアウトでのプロンプトタブ切り替え時、およびマウント時に他ロールやアクティブロールのプロンプトが空文字・空チップ配列で上書きされず、正常に維持されること。

### 1.4 GeneratePage サーバ再起動・初期同期・Autosave ロック回帰テスト
- **作業ディレクトリ**: `frontend/`
- **実行コマンド**:
  ```bash
  npx vitest run src/pages/__tests__/GeneratePage.test.tsx
  ```
- **終了コード**: `0`
- **判定基準**:
  - 初期同期完了前は autosave が発火しないこと、およびアクティブプリセットの初期マウント時にプロンプトが空文字破壊されないこと。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 サーバ再起動・リロード時のプロンプト保持検証
- **検証手順**:
  1. プリセットにプロンプト `1girl, solo, masterpiece` を入力・保存し、アクティブにする。
  2. バックエンドサーバを再起動、またはブラウザをリロード（F5）する。
  3. リロード完了後、アクティブプリセットのプロンプト入力欄に `1girl`, `solo`, `masterpiece` がそのまま表示されていること。
  4. 画面上のプロンプトが空欄化せず、DB内のプリセットデータも空文字で上書きされないこと。

### 2.2 デバイス跨ぎ・レイアウト切り替え時の同期検証
- **検証手順**:
  1. Desktop 画面でプロンプトを編集後、ウィンドウ幅を狭めて MobileLayout へ切り替える。
  2. MobileLayout 上で各ロールタブを切り替え、入力内容が正確に保持されていることを確認する。
  3. 再度ウィンドウ幅を広げて DesktopLayout へ戻した際、プロンプトが欠落なく表示されることを確認する。
  4. 別ブラウザ（または別端末シミュレーション）で同一プリセットを開き、IDの型（string / number）に起因する autosave の沈黙や同期漏れが発生しないことを確認する。

### 2.3 プリセット切替およびセクションコピペの非退行検証
- **検証手順**:
  1. プリセット A と プリセット B を相互に切り替え、固有プロンプトが正常表示されること。
  2. セクションコピペ機能からクリップボード貼り付けを実行し、即時反映されること。

### 2.4 Red Teaming（意図的な全削除操作の検証）
- **検証手順**:
  1. ユーザーが手動で全チップを削除、またはテキストモードで全選択削除する。
  2. 正常に `onChange("")` が発火し、空文字列として保存されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active` を実行し、`PASS` となること。
- `python ${GLOBAL_SCRIPTS}\workflow_validator.py validate REQ-223` を実行し、`Validation successful` となること。\n