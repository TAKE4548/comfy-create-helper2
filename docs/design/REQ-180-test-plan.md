# REQ-180 Test Plan: セリフ・吹き出し編集機能の強化およびモーダルUIの最適化

## 1. 自動テスト (Automated CLI Tests)

### テストコマンド
```bash
npm test -- frontend/src/components/__tests__/SpeechBubbleControls.test.tsx frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx frontend/src/utils/__tests__/speechBubbleRenderer.test.ts
```

### 検証項目
- [ ] **TC-1-1 (プリセット順序)**: `SpeechBubbleControls` において、`withoutTextPresets` セクションが DOM 上で `withTextPresets` セクションより前にレンダリングされること。
- [ ] **TC-1-2 (修飾反転)**: `MangaTextEffectConfig` の反転操作により、縦書きでX座標、横書きでY座標のカーブ方向、およびスケール増減方向が反転すること。
- [ ] **TC-1-3 (しっぽ微調整レンダリング)**: `BubbleTail` の `isCustomBase` が有効な場合、カスタム接点角度・幅に基づいて吹き出し外周としっぽが結合描画されること。
- [ ] **TC-1-4 (キャンバス表示サイズ)**: `SpeechBubbleEditorModal` において、ウィンドウサイズに応じた拡大された canvasDimensions が計算されること。
- [ ] **TC-1-5 (微調整モードUI・ハンドル)**: モーダル内で微調整モードをONにした際、先端ハンドルに加えて基部接点ハンドルが操作対象として認識されること。

---

## 2. 手動・ブラウザ検証 (Manual Verification)

1. **モーダルプレビュー表示**:
   - セリフ編集モーダルを開き、従来よりプレビューエリアの余白が小さく、画像が大きく鮮明に表示されることを確認。
2. **プリセット一覧**:
   - プリセット一覧で「🎨 スタイル専用プリセット（テキストなし）」が上部に、「💬 テキスト付きプリセット」が下部に表示されることを確認。
3. **修飾の反転**:
   - 円弧（arc）や波（wave）のパスを設定し、「反転」ボタンを押して屈折方向が逆転することを確認。
   - スケール変化を設定し、開始と終了の拡大率が反転することを確認。
4. **しっぽ微調整モード**:
   - 吹き出しにしっぽを追加し、「微調整モード」をONにする。
   - 吹き出し本体との接点ハンドルをドラッグして、接点位置や幅が変化することを確認。
   - 微調整モードをOFFにすると従来通りのシンプルな先端操作に戻ることを確認。
   - 保存してスナップショットやプリセットで再現されることを確認。
