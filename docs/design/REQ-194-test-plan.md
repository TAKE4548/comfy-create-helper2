# PBI-REQ-194 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### フロントエンド単体テスト
- **コマンド**: `npm run test -- useMultiSelect`
- **期待値**: 全テストケース PASS。特に以下のテストケースが含まれ、すべて合格すること：
  1. `should not cancel long press on micro-movement within 15px during touch`
  2. `should cancel long press if touch movement exceeds 15px`
  3. `should ignore synthetic click immediately following successful long press`
  4. 既存の `useMultiSelect` テストケース（Ctrl/Metaクリック、範囲選択、長押し遅延設定の読み込み等）がすべて PASS すること。

## 2. 手動 / ブラウザ検証 (Manual Verification)
- **対象画面**: 生成履歴（HistoryPage）
  1. モバイル端末（または開発者ツールのモバイルエミュレーション/タッチ操作）にて、履歴画像をロングタップ（長押し）。
  2. 複数選択モードに遷移し、対象カードにチェックアイコンが表示されることを確認。
  3. 指を離した直後に選択が解除されないことを確認。
  4. 別の画像をタップして複数選択に追加できることを確認。
  5. 画面スクロール（15px以上のドラッグ）時は長押しがキャンセルされ、通常スクロールできることを確認。
