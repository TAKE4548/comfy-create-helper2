# REQ-247 実行可能テスト計画: useGalleryInteraction

## 1. 自動テスト (CLI Verification)
- **コマンド**: 
pm test -- useGalleryInteraction (フロントエンド単体テスト)
- **コマンド**: 
pm test -- MobileLayout (既存コンポーネントリグレッションテスト)
- **期待値**:
  - useGalleryInteraction.test.ts の全テストケースが PASS すること。
    - Desktop モードでのサムネイル通常クリック時: setSelectedImg が呼ばれ、モーダルプレビューは起動しないこと。
    - Mobile モードでのサムネイル通常クリック時: setSelectedImg および onOpenModalPreview が呼ばれること。
    - 複数選択モード時または修飾キー（Ctrl, Shift, Meta）押下時: setSelectedImg は呼ばれず multiSelect.handleItemClick のみが呼ばれること。
    - getThumbnailItemProps が返すマウス・タッチ・コンテキストメニューハンドラが正常に multiSelect.getLongPressHandlers および onClick にディスパッチされること。
    - handleSnapshotClick が正しく onLoadSnapshot を呼び出すこと。
  - MobileLayout.test.tsx の既存 6 テストがすべて PASS すること。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ**:
  1. フロントエンド (
pm run dev) を起動し、ブラウザで生成ページ (GeneratePage) を表示。
  2. 履歴サムネイル（DesktopLayout）をクリックした際、中央のメインプレビュー画像が選択したサムネイルに切り替わることを確認。
  3. モバイルビュー（画面幅 640px 未満、または DevTools モバイルエミュレーション）にて、履歴サムネイルをタップした際、モーダル拡大プレビューが表示されることを確認。
  4. サムネイル長押し操作にて複数選択モード（紫色リングおよびチェックボックス）が起動し、一括操作バーが表示されることを確認。
- **Red Teaming (境界値・異常系)**:
  - onOpenModalPreview や onLoadSnapshot が未定義（undefined）の場合にサムネイルやスナップショットをクリックしても、実行時エラー（TypeError: is not a function）が発生せず安全にハンドリングされること。
  - 空配列（displayImages や snapshots が 0 件）の状態で各ハンドラが呼び出されても例外がスローされないこと。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-247-test-plan.md を実行し、客観的証明を得ること。
