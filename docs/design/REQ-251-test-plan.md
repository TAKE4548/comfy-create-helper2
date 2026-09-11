# REQ-251 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm test -- src/pages/GeneratePage/components/__tests__/PromptSectionClipboardMenu.test.tsx` (frontend ディレクトリにて実行)
- **期待値**: 全テストケース（既存7件 + 新規追加テスト）が PASS すること。
- **検証項目**:
  1. 10件の履歴を投入した状態でポップオーバーメニューを展開し、10件すべての履歴ボタンが表示されること。
  2. 各履歴ボタンに `shrink-0` クラスが存在し、Flexbox による縦圧縮が防止されていること。
  3. 履歴コンテナに `overflow-y-auto`, `max-h-40`, `custom-scrollbar` が適用されていること。
  4. 10番目のアイテムをクリックした際、正しく親の `onChangeValue` に期待されるプロンプト文字列が伝播すること。

## 2. 結合・UI検証 (Integration & UI Verification)
- **ブラウザ検証**:
  1. GeneratePage を開く。
  2. Positive プロンプトで異なるプロンプト（例: `tag_1`, `tag_2`, ... `tag_10`）を連続でコピーする。
  3. クリップボード・履歴メニューを展開する。
  4. 各履歴ボタンの高さが押し潰されず均一に表示されていること、および縦スクロールバーを操作して下方の履歴まで閲覧・選択できることを目視確認する。
- **Red Teaming (境界値・異常系)**:
  - 履歴が1件の場合、0件（「履歴はありません」表示）の場合、および上限10件の場合の各境界値においてレイアウト崩れが生じないこと。
  - 非常に長いプロンプト文字列（200文字超）の履歴項目であっても、`truncate` により横方向が適切に省略され、縦方向の高さが膨張したり潰れたりしないこと。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py` を実行し、アーティファクトの妥当性を確認。
