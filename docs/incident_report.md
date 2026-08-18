# インシデントレポート: REQ-136 モバイルモードにおける SpeechBubbleEditorModal 表示切れ・操作不可

## 概要 (Overview)
`SpeechBubbleEditorModal`（REQ-136: 任意位置へのセリフ手動追加および吹き出し・テキスト装飾機能）をモバイル端末または画面幅が狭いビューポート（例: 768px未満）で開いた際、キャンバス領域（プレビューエリア）とコントロールパネル（入力・調整エリア）が横並び（`flex-row`）で固定配置されているため、コントロールパネルが画面外へはみ出す、または水平方向に著しく圧迫されて入力・編集操作を行えない事象が発生しています。

---

## 再現手順 (Reproduction Steps)
1. ブラウザのデベロッパーツール等を開き、ビューポートをモバイルサイズ（幅 768px 未満）に設定する。
2. 履歴ページ等からスナップショットの「セリフ編集・吹き出し追加」ボタンをクリックし、`SpeechBubbleEditorModal` を開く。
3. モーダル内のレイアウトおよび操作感を確認する。
   - キャンバス（プレビューエリア）が画面幅の大半を占有し、右側のコントロールパネル（テキスト入力、形状・文字方向・フォント・カラーピッカー等）が画面外にはみ出る、または潰れて表示される。
   - スクロールを行っても入力欄や設定ボタンの操作が困難または不可能となる。
   - キャンバス上の吹き出し操作においてタッチドラッグ (`Touch` イベント) に対応していない。

---

## 影響範囲 (Affected Area)
- **フロントエンドコンポーネント**:
  - `frontend/src/components/SpeechBubbleEditorModal.tsx`:
    - L692: `max-h-[90vh]` のモーダルコンテナ。
    - L713: `flex flex-1 overflow-y-auto p-6 gap-6 min-h-[450px]` (ビューポート幅に応じた `flex-col` / `flex-row` 切り替えが存在しない)。
    - L715, L742: `flex-[3]` (キャンバスエリア) と `flex-[2]` (コントロールパネル) の横並び固定比率配置。
    - L723: キャンバス解像度計算 (`maxW = 500, maxH = 500`) がモバイル端末の画面幅に合わせた動的縮小に対応していない。
    - L729-732: キャンバス要素が `onMouseDown` / `onMouseMove` / `onMouseUp` のみで、`onTouchStart` / `onTouchMove` / `onTouchEnd` を持たない。
  - `frontend/src/components/SpeechBubbleControls.tsx`:
    - モバイル画面表示時にプレビューとコントロールを切り替えるタブ表示・ドロワー等の専用UI構造が存在しない。

---

## 原因分類 (Root Cause Classification)
- **分類**: **Type B (仕様欠落・設計不備 / Specification Flaw)**
- **理由**: REQ-136 の詳細設計書 (`docs/design/REQ-136.md`) および実装において、デスクトップ表示（横並びレイアウト・マウスドラッグ操作）のみが想定されており、モバイル画面でのレイアウト構造（縦積みまたはタブ切り替え、タッチ操作対応）に関する要件・仕様が定義されていなかったため。

---

## 調査詳細 (Deep Dive Analysis)

### 1. コード検証結果
`SpeechBubbleEditorModal.tsx` の L713-742 周辺:
```tsx
<div className="flex flex-1 overflow-y-auto p-6 gap-6 min-h-[450px]">
  {/* Left: Canvas Area */}
  <div className="flex-[3] flex flex-col items-center justify-center bg-black/40 rounded-lg p-4 border border-[rgba(255,255,255,0.04)] relative">
    ...
  </div>

  {/* Right: Controls Pane */}
  <div className="flex-[2] flex flex-col justify-between gap-6 border-l border-[rgba(255,255,255,0.08)] pl-6 overflow-y-auto">
    ...
  </div>
</div>
```
- `flex`（標準は `flex-row`）で指定されており、レスポンシブ修飾子（例: `flex-col md:flex-row`）が存在しません。
- 幅の狭い画面では `flex-[3]` と `flex-[2]` によりコントロールパネルの幅が極小化・画面外へ溢れる構造になっています。

---

## 次のステップ提案 (Next Action)
本調査結果（Type B 仕様欠落）に基づき、モバイルモード対応（縦積みレイアウト/タブ切り替えUIおよびタッチ操作対応）の仕様策定とUI設計を行うため、`/sys-design`（または `/dev-design`）へ進むことを提案します。

- **承認の確認**: 次のステップへ進んでよろしいですか？ (YES / NO)
