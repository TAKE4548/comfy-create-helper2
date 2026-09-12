# REQ-256 実行可能テスト計画: タグチップサブメニューでの強度直接入力時Backspaceキー誤削除の防止

## 1. 自動テスト (CLI Verification)

- **ユニットテストコマンド**:
  ```bash
  npm --prefix frontend test -- src/components/TagChipEditor/__tests__/TagChip.test.tsx --run
  ```
- **期待値**: 全テストケースが PASS すること。
- **追加テストケース**:
  1. **強度入力欄での Backspace 押下保護**:
     - サブメニューを開き、強度入力欄（`spinbutton`）にフォーカス。
     - `Backspace` キーイベント（`keyDown`）を発火。
     - 親の `mockOnDelete` が呼び出されないこと。
  2. **強度入力欄での各種ショートカットキー（Delete, Space, Ctrl+D）の非伝播**:
     - 強度入力欄で `Delete` を押下しても `mockOnDelete` が呼ばれないこと。
     - 強度入力欄で `Space` を押下しても `mockOnToggle` が呼ばれないこと。
     - 強度入力欄で `Ctrl+D` を押下しても `mockOnDuplicate` が呼ばれないこと。
  3. **サブメニューコンテナ全体のイベント遮断**:
     - サブメニュー内のボタン等にフォーカスがある状態で `Space` や `Delete` を押しても、親チップのショートカット（トグルや削除）に漏洩しないこと。
  4. **既存キーボードショートカットの後退確認**:
     - サブメニューが閉じており、チップ本体にフォーカスがある状態で `Space`、`Delete`、`Backspace`、`Ctrl+D` を押下した場合は、意図通り `onToggle`、`onDelete`、`onDuplicate` が発火すること。

---

## 2. 結合・手動検証シナリオ (Integration & Manual Verification)

- **対象UI**: タグチップエディタ（`TagChipEditor`）を含む画面（GeneratePage 等）
- **検証手順**:
  1. アプリケーション（フロントエンド）を起動し、ブラウザでプロンプト入力欄（タグチップエディタ）を表示。
  2. 任意のタグチップをクリックし、サブメニュー（ポップオーバー）を開く。
  3. 「強度 (Weight)」入力欄（数値フィールド）をクリックしてキャレットを置く。
  4. `Backspace` キーを複数回入力して既存の数値を削除する。
  5. **検証**: チップが削除されず、数値がクリア／変更可能であること。
  6. 新しい強度（例: `1.4`）を入力し、Enter または外側クリックで確定できること。

---

## 3. Red Teaming (境界値・異常系テスト)

- **シナリオ 1 (境界値・フォーカス漏れ)**:
  - 強度入力欄で値を空文字にした状態で `Backspace` を連打する。
  - **期待挙動**: 入力欄が空になっても、直前のチップや自チップの削除は一切発生しないこと。
- **シナリオ 2 (複合キー操作)**:
  - 強度入力欄で `Ctrl+A`（全選択）→ `Backspace` または `Delete` を押下する。
  - **期待挙動**: 数値が全削除されるのみで、チップ自体は削除されないこと。
- **シナリオ 3 (サブメニュー展開中の Escape)**:
  - 強度入力欄フォーカス時に `Escape` を押下する。
  - **期待挙動**: サブメニューが閉じ、チップ本体が削除されたりトグルされたりしないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)

- `python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit`
- `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit`
- `python ${GLOBAL_SCRIPTS}\artifact_linter.py`
- `python ${GLOBAL_SCRIPTS}\workflow_validator.py`

