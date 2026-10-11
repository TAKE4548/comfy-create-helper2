# REQ-339: プレビューエリアのアスペクト比非依存・高さ基準動的マルチ表示レイアウトおよびリソースモニタ移設 テスト計画

## 1. 概要
本テスト計画は、REQ-339におけるプレビューエリアの動的レイアウト計算、アスペクト比追従、リソースモニタのヘッダー移設、および既存機能との互換性を自動テストで定量検証する。
自動テスト実装: `frontend/src/test/e2e_req339_preview_layout.test.tsx`, `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx`, `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx`

## 2. 統合テスト・シナリオテスト（Gate 2 & Gate 3）

### 2.1 シナリオ 1: アスペクト比に応じた動的表示枚数（AC-1, AC-2, AC-3）
- **前提**: プレビューコンテナのサイズが高さ $H = 600\text{px}$、要素間ギャップ $G = 12\text{px}$。
- **計算式**:
  - $W_i = \max(80, H \times AR_i)$
  - 累積幅 $S_k = \sum_{j=0}^{k-1} W_j + (k-1) \times 12 \le W_{\text{container}}$
- **テストケース**:
  1. $W_{\text{container}} = 1200\text{px}$, 画像セット `[16:9, 1:1, 2:3]`
     - 16:9 幅 $\approx 1067\text{px}$
     - 2枚目（1:1, 600px）を含む幅: $1067 + 12 + 600 = 1679\text{px} > 1200\text{px}$
     - **期待値**: レンダリング画像数 `toHaveLength(1)`、カード高さ $600\text{px}$、カード幅 $1067\text{px} \pm 1\text{px}$
  2. $W_{\text{container}} = 1800\text{px}$, 画像セット `[16:9, 1:1, 2:3]`
     - 2枚目まで: $1679\text{px} \le 1800\text{px}$
     - 3枚目（2:3, 400px）を含む幅: $1679 + 12 + 400 = 2091\text{px} > 1800\text{px}$
     - **期待値**: レンダリング画像数 `toHaveLength(2)`
  3. $W_{\text{container}} = 2200\text{px}$, 画像セット `[16:9, 1:1, 2:3]`
     - 3枚すべて: $2091\text{px} \le 2200\text{px}$
     - **期待値**: レンダリング画像数 `toHaveLength(3)`

### 2.2 シナリオ 2: ペインリサイズへの動的追従（AC-4）
- **前提**: プレビューコンテナに2:3画像（幅400px）を表示。
- **検証手順**:
  - $W = 811\text{px}$ ($400 \times 2 + 12 = 812\text{px} > 811\text{px}$): 表示数 1枚
  - $W = 812\text{px}$: 表示数 2枚へ即時遷移
  - $W = 1224\text{px}$ ($400 \times 3 + 24 = 1224\text{px}$): 表示数 3枚へ即時遷移
  - $W = 812\text{px}$ へ縮小: 表示数 2枚へ安全に縮小

### 2.3 シナリオ 3: リソースモニタのヘッダー配置とプレビュー遮蔽排除（AC-6, AC-7）
- **検証手順**:
  - `container.querySelector('.bg-grid')`（プレビュー領域）内に `.bg-[#18181C]/80`（旧HUDオーバーレイ）が存在しないこと（`toBeNull()`）。
  - `screen.getByText('Generate').closest('.bg-surface/50')`（Global Header）内に `CPU`, `RAM`, `GPU`, `VRAM` がレンダリングされていること。

## 3. Red Team 境界・異常系テストケース（Gate 3 Baseline）

### 3.1 RT-1: 極端なアスペクト比（超横長パノラマ / 超縦長バナー）
- **条件**: $AR_0 = 16/9$ 等の横長画像において、単一画像幅がコンテナ幅を超える場合（例: $W = 500\text{px}, H = 600\text{px}$）。
- **判定基準**: $H_{\text{target}} = \min(H, (W - 16) / AR)$ によりカード高さが縮小され、コンテナ幅を超えるオーバーフローが発生しないこと。

### 3.2 RT-2: 画像サイズ未取得時のフォールバック
- **条件**: `naturalWidth` 未解決状態。
- **判定基準**: フォールバック値 $AR = 2/3$ を適用し、既存の列幅計算を100%維持してレンダリングクラッシュを起こさないこと。

### 3.3 RT-3: 空配列および単一画像表示
- **条件**: `images = []` または `images = ['single.png']`。
- **判定基準**: 
  - 空配列時は「No image yet」が画面中央に表示されること。
  - 単一画像時はナビゲーション矢印が無効化（disabled / 非表示）されること。
