# REQ-155 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Tests)

### ユニットテスト実行
- **テストファイル**: `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx`
- **コマンド**:
  ```bash
  npm --prefix frontend test -- src/components/TagChipEditor/__tests__/TagChip.test.tsx
  ```

### 検証項目
1. **サブメニューでの単語編集と確定**:
   - サブメニューを開いた際、`wordInput` にベーステキストが初期表示されていること。
   - `wordInput` の値を変更して Enter を押下した際、`onEdit(id, newFormatted)` が呼び出され、既存の重みが維持されていること（例: `(looking back:1.2)` → `(looking away:1.2)`）。
2. **フォーカスアウト（onBlur）での確定**:
   - `wordInput` を変更してフォーカスアウトした際に `onEdit` が呼び出されること。
3. **空文字入力時のフォールバック**:
   - `wordInput` を空にして Enter/Blur した場合、`onDelete` ではなく元のタグ名に復元され、無効な更新が行われないこと。
4. **Escapeキーによるキャンセル**:
   - `wordInput` 入力中に Escape を押下すると、元のテキストに戻りサブメニューが閉じること。
5. **入力中のキーイベント伝播防止**:
   - `wordInput` で Space キーや Delete キーを入力しても、親要素のタグトグルやタグ削除が誤発火しないこと。

---

## 2. 手動検証 (Manual Verification)
1. 生成画面のプロンプト入力欄でタグチップ表示モードにする。
2. タグチップ（例: `(looking back:1.2)`）をクリックしてサブメニューを開く。
3. サブメニュー上部のタグ名入力欄で `looking away` に書き換えて Enter を押す。
4. チップの表示およびプロンプトが `(looking away:1.2)` に更新され、重みが保持されていることを確認する。
5. サブメニュー内の強度ボタン（`+0.1` など）を押して、重みも正しく連動することを確認する。
