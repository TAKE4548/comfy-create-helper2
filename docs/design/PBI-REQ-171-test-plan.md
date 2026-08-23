# PBI-REQ-171 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **テストコマンド**: `npm test -- speechBubbleRenderer.test.ts` (or `npx vitest run src/utils/__tests__/speechBubbleRenderer.test.ts`)
- **期待値**: 全テストケースが PASS すること。
- **検証項目**:
  1. `getDefaultPathPoints`: 縦書き（`vertical`）および横書き（`horizontal`）における各プリセット（`line`, `arc`, `wave`, `stepped`）の座標配列が正しく返却されること。
  2. `calculateCharacterTransform`: 縦書きセリフ（`bubble.orientation = 'vertical'`）で `pathPoints` 未指定時に、Y座標が 0.1 → 0.9 に進行すること。
  3. `calculateCharacterTransform`: 縦書きセリフで `pathFollowRotation: true` 時の回転角が縦書き基準角（下向き 0°）で正しく補正計算されること。
  4. 横書きセリフ（`bubble.orientation = 'horizontal'`）における既存の動作・後方互換性が維持されること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード整合性監査**: `local_model_adapter.py` を実行し、設計整合性の確認を得ること。

## 3. UI/ブラウザ検証 (Manual / Browser Verification)
- **対象画面**: セリフ編集モーダル (`SpeechBubbleEditor`)
- **操作手順**:
  1. セリフを「縦書き」に設定する。
  2. 「3. パス・軌道レイアウト」で「直線」「円弧」「S字波」「階段」を順次選択する。
  3. 各プリセットにおいて文字が上から下へ自然に流れて配置されることを確認する。
  4. 「パス接線方向に文字を回転追従させる」をチェックし、文字の傾きが不自然に横倒しにならず、軌道の曲がりに合わせて綺麗に追従することを確認する。

