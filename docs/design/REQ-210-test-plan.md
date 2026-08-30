# REQ-210: 吹き出し描画サブシステム（SpeechBubbleControls/Renderer）の幾何計算・組版・Canvas描画パイプラインの分離 テスト計画書

## 1. テスト概要 (Overview)

本テスト計画は、REQ-210で実施される「吹き出し描画サブシステム（speechBubbleRenderer.ts, SpeechBubbleControls.tsx）の幾何演算（bubbleGeometry.ts）・文字組版（bubbleTypography.ts）・Canvas 2D描画（bubbleCanvasRenderer.ts）・座標変換（bubbleTransform.ts）への3層パイプライン分離およびUIサブコンポーネント分割」の受入基準（AC-1 〜 AC-3）を網羅的・決定論的に検証するための自動テストおよび手動確認手順を定義する。

---

## 2. 受入基準 (AC) とテストカバレッジ対応表

| 受入基準 (AC) | 決定論的検証内容 (Expected Criteria) | テストケース / コマンド |
|---|---|---|
| **AC-1**: モジュール分割と単一責任原則 | bubbleGeometry.ts, bubbleTypography.ts, bubbleCanvasRenderer.ts, bubbleTransform.ts の各モジュールが単体でインポート可能であり、各単体テストおよびファサード speechBubbleRenderer.ts を経由した全16種の公開関数が undefined でなく関数として存在すること | bubbleGeometry.test.ts, bubbleTypography.test.ts, speechBubbleRenderer.test.ts |
| **AC-2**: 座標系変換の一元化とプレビュー/エクスポート整合性 | TransformContext を介してスケール係数（scaleX: 1, scaleY: 1）および異解像度スケール（scaleX: 2.5, scaleY: 2.5）での座標計算が行われ、toCanvasPoint / toCanvasRect で丸め誤差・スケール歪みなく一致すること | speechBubbleRenderer.test.ts, SpeechBubbleEditorModal.test.tsx |
| **AC-3**: 既存全テストの完全通過 | speechBubbleRenderer.test.ts, SpeechBubbleControls.test.tsx, SpeechBubbleEditorModal.test.tsx の既存全テストケース（117件以上）および新規テストがエラー・警告なく 100% PASS すること | npm test -- src/utils/__tests__/speechBubbleRenderer.test.ts src/components/__tests__/SpeechBubbleControls.test.tsx src/components/__tests__/SpeechBubbleEditorModal.test.tsx |

---

## 3. 自動テスト実行手順 (Automated Test Execution)

### フロントエンド単体・統合テスト
`ash
cd frontend
npm test -- --run src/utils/__tests__/speechBubbleRenderer.test.ts src/components/__tests__/SpeechBubbleControls.test.tsx src/components/__tests__/SpeechBubbleEditorModal.test.tsx
`
**判定基準**:
- 終了コード: 0
- 失敗テスト数 (Failed): 0
- パステスト数 (Passed): 117件以上

### TypeScript 型チェック検証
`ash
cd frontend
npx tsc --noEmit
`
**判定基準**:
- 終了コード: 0
- エラー出力: 0件

---

## 4. 手動・境界値検証シナリオ (Deterministic Verification Scenario)

### シナリオ1: 単体吹き出し編集モーダルでのリアルタイム描画と変形操作
1. 実行手順:
   - 履歴ページからスナップショットの「吹き出し編集」モーダルを開く。
   - テキスト入力に「テスト吹き出し」を入力。
   - 縦書き（vertical）/ 横書き（horizontal）を切り替える。
   - 吹き出し形状（oval, rounded-rect, burst, cloud）を順次切り替える。
2. 客観的判定基準:
   - キャンバス上で描画例外（Uncaught TypeError / RangeError）が一切コンソールに出力されないこと。
   - リサイズハンドル（4隅）および回転ハンドル（上部中心）が選択中バウンディングボックスの正確な座標に表示されること。

### シナリオ2: 境界値・極限値テキストテスト
1. 実行手順:
   - 空文字、1文字、改行のみ、および長文（300文字以上）を入力。
2. 客観的判定基準:
   - calculateFitFontSize が minSize（8px）以上 maxSize（48px）以下の有限整数を返すこと。
   - NaN, Infinity, マイナス値が座標・フォントサイズに設定されないこと。

### シナリオ3: 漫画演出エフェクト（Manga FX）の適用
1. 実行手順:
   - 「漫画演出 (FX)」アコーディオンを開き、スケールカーブ（ease-in）、パス配置（arc）、グラデーション塗りを設定。
2. 客観的判定基準:
   - コンソールにエラーなく、プレビューキャンバスにパス沿いに配置された文字がレンダリングされること。
