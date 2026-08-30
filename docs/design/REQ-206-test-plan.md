# REQ-206 テスト計画書

## 1. 自動テスト (Unit / Component Tests)

### 1.1 レンダラー幾何計算 & 描画テスト (`speechBubbleRenderer.test.ts`)
- **`clampTailApexOutsideBubble` の境界値テスト**:
  - 楕円（`w=200, h=100, cx=100, cy=50, rx=100, ry=50`）に対し、内部座標 `(tx=100, ty=50)` を入力した場合、出力が `(x=100, y=102.5)`（`1.05 * ry` の外周外側）に押し出されること。
  - 外側座標 `(tx=100, ty=120)` を入力した場合、座標が変更されず `(x=100, y=120)` のまま返ること。
- **`getTailContactPositions` の2接点取得テスト**:
  - `baseAngle1 = 0, baseAngle2 = Math.PI`（`0 rad`, `3.14159 rad`）、`w=200, h=100`（`rx=100, ry=50`）入力時、`p1 = (200, 50)`, `p2 = (0, 50)`（許容誤差 ±0.01px）が返ること。
  - `baseAngle1, baseAngle2` 未指定で `baseAngleOffset = 0, baseSpreadRatio = 1.0, tx=100, ty=120`（真下 `PI/2`）の時、`angle1 = PI/2 - 0.25`, `angle2 = PI/2 + 0.25` が算出されること。
- **`drawBubbleShape` のパス生成テスト**:
  - 楕円・角丸において `isFineTuning: true, baseAngle1, baseAngle2` 指定時、`ctx.ellipse` または `ctx.lineTo` が正しく呼び出され例外なくパスが閉じられること。

### 1.2 エディタモーダル操作テスト (`SpeechBubbleEditorModal.test.tsx`)
- **吹き出し移動時の微調整プロパティ保持テスト**:
  - `bubble = { id: 'b1', x: 100, y: 100, tail: { x: 100, y: 220, isFineTuning: true, baseAngle1: 1.2, baseAngle2: 1.8 } }` の状態で、吹き出しドラッグ移動（`dx = 50, dy = 30`）を実行。
  - 移動後の `bubbles[0].tail` が `{ x: 150, y: 250, isFineTuning: true, baseAngle1: 1.2, baseAngle2: 1.8 }` となり、`isFineTuning`, `baseAngle1`, `baseAngle2` が完全一致で維持されること。
- **2接点ハンドルのドラッグテスト**:
  - 接点1ハンドル（`p1` 座標）で `mousedown` し、マウスを `(cx + rx * cos(2.0), cy + ry * sin(2.0))` へ `mousemove` した時、`bubble.tail.baseAngle1` が `2.0`（±0.01）に更新されること。
- **接点リセットテスト**:
  - 「🔄 接点初期化」ボタンクリック時、`baseAngle1: undefined, baseAngle2: undefined, baseAngleOffset: 0, baseSpreadRatio: 1.0` にリセットされること。

## 2. 実行コマンド
```bash
npm run test -- frontend/src/utils/__tests__/speechBubbleRenderer.test.ts frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx
```

## 3. 手動検証シナリオ (Manual Verification)
1. **設定保持の確認**:
   - セリフ編集モーダルを開き、「🎯 しっぽ微調整モード」をONにして橙色の接点ハンドルをドラッグ移動。
   - 吹き出し本体を掴んで大きく移動させた後、接点および微調整ON状態が維持されていることを目視確認。
2. **先端侵入防止の確認**:
   - しっぽ先端（青丸）を吹き出し中心に向かってドラッグし、外周より内側に入り込まず外周直前でクランプされることを確認。
3. **2接点独立操作の確認**:
   - 2つの橙色ハンドルをそれぞれドラッグし、左右非対称に広げたり片側のみ動かせることを確認。