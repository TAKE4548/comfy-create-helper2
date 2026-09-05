# REQ-139 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: 
pm test src/components/__tests__/AddSnapshotToAlbumModal.test.tsx (frontend)
- **期待値**: 全テストケース PASS。
  - テストケース1: storageKey 未指定時、デフォルトの初期値（allowNone ? '' : 'new'）となること。
  - テストケース2: storageKey に保存されたアルバムIDが存在する場合、モーダル起動時にそのアルバムが初期選択されること。
  - テストケース3: storageKey に保存されたアルバムIDが取得アルバム一覧に存在しない場合、安全に未選択（またはデフォルト）にフォールバックすること。
  - テストケース4: 保存確定時（handleConfirm）に選択アルバムIDまたは未選択状態が storageKey に保存されること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design/REQ-139.md

## 3. 手動・E2E検証 (Manual Verification)
1. GeneratePage で生成画像の保存ボタンをクリックし、保存モーダルを開く。
2. 特定のアルバム（例: アルバムA）を選択して「保存」を実行。
3. 再度保存モーダルを開いた際、デフォルトで「アルバムA」が選択されていることを確認。
4. 「アルバムを選択しない (None)」を選択して「保存」を実行し、次回起動時に「アルバムを選択しない (None)」が維持されていることを確認。
