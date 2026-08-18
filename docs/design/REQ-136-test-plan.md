# REQ-136 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd frontend && npm test -- src/utils/__tests__/speechBubbleRenderer.test.ts src/components/__tests__/SpeechBubbleControls.test.tsx src/components/__tests__/SpeechBubbleEditorModal.test.tsx`
- **期待値**: 全テストケースが PASS すること。
  - `speechBubbleRenderer`: 縦書き/横書きのテキスト折り返し、フォントサイズ計算、各形状（楕円、角丸、叫び、思考、枠なし）のパス描画関数が正常に実行されること。
  - `SpeechBubbleControls`: 形状選択、縦横切り替え、RGBAカラー変更、枠線幅変更、テキスト変更が正しくコールバックをトリガーすること。
  - `SpeechBubbleEditorModal`: ダブルクリックによるバブル追加、バブル選択、ドラッグ移動、Deleteキーによる削除、保存処理のモックが正常に動作すること。

## 2. ビルドおよび型チェック (Build & Type Check)
- **コマンド**: `cd frontend && npm run build`
- **期待値**: TypeScript のコンパイルエラーおよび Vite ビルドエラーが一切発生しないこと。

## 3. 画面インタラクション手動検証 (UI Verification)
- **対象画面**: セリフ編集・吹き出し追加モーダル (`SpeechBubbleEditorModal`)
- **判定基準 (Assertion)**:
  - 画像上の任意位置をダブルクリックして新しい吹き出しが追加されること。
  - 吹き出しをドラッグして位置を移動できること。
  - 選択中吹き出しの尻尾ハンドルをドラッグして尻尾位置を調整できること。
  - 形状セレクタで楕円、角丸、叫び、思考、枠なしの切り替えがプレビューに即座に反映されること。
  - 縦書き/横書きの切り替え、フォント変更、文字色・背景色・枠線色（RGBA）・枠線幅の変更が反映されること。
  - `Delete` キーまたは削除ボタンで選択中の吹き出しが削除されること。
  - 保存ボタン押下で、装飾付き吹き出しが合成された新規スナップショットが生成されること。
