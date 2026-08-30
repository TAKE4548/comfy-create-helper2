# REQ-210: 吹き出し描画サブシステム（SpeechBubbleControls/Renderer）の幾何計算・組版・Canvas描画パイプラインの分離 詳細設計書

## 1. 概要 (Overview)

本設計は、巨大モノリス化（合計5,000行超）していた吹き出し描画サブシステムにおいて、責務が混在していた speechBubbleRenderer.ts および SpeechBubbleControls.tsx を、幾何学演算（Geometry Math）、文字組版（Typography Layout）、Canvas 2D描画（Canvas Rendering）、座標系変換（Coordinate Transform）、およびUI制御コンポーネント群へ階層分離・モジュール化する。

これにより、プレビュー時と高解像度エクスポート時における丸め誤差やクリッピングなどの構造的デグレリスクを排除し、テスト容易性と保守性を飛躍的に高める。

### 主な実現機能・設計方針
1. **3層レンダリングパイプラインの確立 (AC-1)**:
   - **Layer 1: 幾何演算 (ubbleGeometry.ts)**: ベジエ・円弧軌道、カーブサンプリング、尻尾接点・外周幾何計算、各種吹き出し輪郭パス構築。
   - **Layer 2: 文字組版レイアウト (ubbleTypography.ts)**: 縦書き/横書き文字組版、フォントメトリクス、自動フィットサイズ計算、文字単位の変形（スケール、シアー、縦中横、回転、ガタつき）。
   - **Layer 3: 描画実行 (ubbleCanvasRenderer.ts)**: 多層フチ（MultiStroke）、グラデーション/トーン塗りつぶし、本体・尻尾・操作ハンドル（回転・リサイズ・選択枠）のCanvas 2Dレンダリング。
2. **座標変換コンテキスト (ubbleTransform.ts) の導入 (AC-2)**:
   - 元画像座標系（ベース解像度）、プレビュー表示（ビューポートスケール）、高解像度エクスポート（任意解像度スケール）を一元管理する TransformContext を導入。
   - 手動の座標乗除・丸め処理を集約し、アスペクト比や解像度変更に伴う位置ずれやフォント欠けを完全に防止。
3. **完全な後方互換性ファサード (speechBubbleRenderer.ts) (AC-1, AC-3)**:
   - 既存の呼び出し元（SpeechBubbleEditorModal.tsx, BatchSpeechTransformModal.tsx, 既存テストコード）を壊さないよう、speechBubbleRenderer.ts は全モジュールの型・定数・関数および speechBubbleRenderer ファサードオブジェクトを透過的に再エクスポートする。
4. **UIコントロールの責務分離 (SpeechBubbleControls.tsx) (AC-1)**:
   - SpeechBubbleControls.tsx（2,000行超）から、独立性の高い「口調変換サブセクション（SpeechBubbleToneControls.tsx）」および「漫画テキスト演出アコーディオン（SpeechBubbleMangaFxControls.tsx）」をサブコンポーネント化し、コードベースの肥大化を解消。

---

## 2. アーキテクチャとパイプライン構造 (Architecture & Pipeline)

`mermaid
flowchart TD
    subgraph UI_Layer [UI / Control Components]
        Modal[SpeechBubbleEditorModal.tsx]
        Batch[BatchSpeechTransformModal.tsx]
        Controls[SpeechBubbleControls.tsx]
        ToneCtrl[SpeechBubbleToneControls.tsx]
        MangaFxCtrl[SpeechBubbleMangaFxControls.tsx]
        
        Controls --> ToneCtrl
        Controls --> MangaFxCtrl
    end

    subgraph Facade_Layer [Facade & Backward Compatibility]
        RendererFacade[speechBubbleRenderer.ts]
    end

    subgraph Pipeline_Layer [3-Layer Rendering Pipeline]
        subgraph Layer0 [Coordinate Transformation]
            Transform[bubbleTransform.ts<br/>TransformContext / Coordinate Helpers]
        end

        subgraph Layer1 [Geometry & Path Math]
            Geometry[bubbleGeometry.ts<br/>Curve Sampling / Tail Math / Shape Paths]
        end

        subgraph Layer2 [Typography & Layout]
            Typography[bubbleTypography.ts<br/>Vertical/Horizontal Layout / Character Matrix / AutoFit]
        end

        subgraph Layer3 [Canvas 2D Rendering Execution]
            CanvasRenderer[bubbleCanvasRenderer.ts<br/>drawBubbleShape / drawBubbleText / drawSpeechBubble]
        end
    end

    Modal --> RendererFacade
    Batch --> RendererFacade
    Controls --> RendererFacade
    
    RendererFacade --> Transform
    RendererFacade --> Geometry
    RendererFacade --> Typography
    RendererFacade --> CanvasRenderer

    CanvasRenderer --> Geometry
    CanvasRenderer --> Typography
    CanvasRenderer --> Transform
    Geometry --> Transform
    Typography --> Transform
`

---

## 3. モジュール詳細仕様 (Module Specifications)

### 3.1 rontend/src/utils/bubbleTransform.ts
- **責務**: 座標系（元画像座標系、ビューポート座標系、エクスポート座標系）の変換とスケール管理の一元化。
- **主要インターフェース & 関数**:
  `	ypescript
  export interface TransformContext {
    scaleX: number
    scaleY: number
    offsetX?: number
    offsetY?: number
  }

  export function createTransformContext(scaleX?: number, scaleY?: number, offsetX?: number, offsetY?: number): TransformContext
  export function toCanvasPoint(x: number, y: number, ctx: TransformContext): { x: number; y: number }
  export function toCanvasRect(x: number, y: number, w: number, h: number, ctx: TransformContext): { x: number; y: number; w: number; h: number; cx: number; cy: number }
  export function getAverageScale(ctx: TransformContext): number
  `

### 3.2 rontend/src/utils/bubbleGeometry.ts
- **責務**: ベジエ・円弧幾何学計算、尻尾接点幾何、吹き出し形状パス定義。
- **主要関数**:
  - getDefaultPathPoints(preset, orientation): 軌道プリセットのデフォルト制御点
  - lipPathPoints(points, orientation): 軌道制御点の反転
  - clampTailApexOutsideBubble(bubble, tx, ty): しっぽ先端の外周外側クランプ
  - getTailContactPositions(bubble, scaleX, scaleY): 2接点座標の幾何計算
  - getTailBasePosition(bubble, scaleX, scaleY): しっぽ本体接点（基部中心）座標計算
  - sampleCurveArcLength(preset, points, bw, bh, samples): 曲線弧長サンプリングと等長距離マッピング
  - drawBubbleShape(ctx, bubble, scaleX, scaleY): 吹き出し背景形状の描画

### 3.3 rontend/src/utils/bubbleTypography.ts
- **責務**: 縦書き/横書き組版、フォントメトリクス、自動フィット、文字単位のマトリクス変形。
- **主要定数 & 関数**:
  - erticalCharMap: 縦書き特殊記号（句読点、括弧、長音など）変換マップ
  - layoutVerticalText(text, fontSize, maxHeight): 縦書き文字列折り返し計算
  - layoutHorizontalText(text, fontSize, maxWidth, ctx): 横書き文字列折り返し計算
  - calculateCharacterTransform(charIndex, totalChars, bubble, effects, charGlobalIndex): スケール、シアー、回転、ジッター、パス配置変形計算
  - calculateFitFontSize(...): 吹き出し枠内に収まる最大フォントサイズ二分探索
  - calculateFitBubbleDimensions(...): テキストを内包する最適バウンディングボックスサイズ計算

### 3.4 rontend/src/utils/bubbleCanvasRenderer.ts
- **責務**: Canvas 2D描画コマンド実行、スタイル適用、ハンドル・操作UI描画。
- **主要定数 & 関数**:
  - RESIZE_HANDLE_SIZE, ROTATE_HANDLE_OFFSET, ROTATE_HANDLE_RADIUS
  - drawMultiStrokes(ctx, text, x, y, multiStrokes): 多層フチ描画
  - pplyTextFill(ctx, bubble, cx, cy, bw, bh, effects): グラデーション・トーン・単色塗り適用
  - drawBubbleText(ctx, bubble, scaleX, scaleY, activeFontFamily): テキスト描画パイプライン実行
  - drawSpeechBubble(ctx, bubble, isSelected, scaleX, scaleY, activeFontFamily): 吹き出し全体および選択中ハンドルの描画

### 3.5 rontend/src/utils/speechBubbleRenderer.ts (ファサード)
- 全モジュールから型・定数・関数を再エクスポート
- 後方互換オブジェクト export const speechBubbleRenderer = { ... } の提供

### 3.6 UIコンポーネント分離
- rontend/src/components/SpeechBubbleToneControls.tsx: 口調変換アコーディオン、LLMプロンプト、場面ヒント、画像参照トグル、プレビュー・思考過程表示。
- rontend/src/components/SpeechBubbleMangaFxControls.tsx: 漫画テキスト演出アコーディオン（ダイナミックスケール、パス軌道、塗り/グラデーション/トーン、多層フチ、ラフネス）。
- rontend/src/components/SpeechBubbleControls.tsx: 吹き出し基本プロパティ（テキスト、形状、フォント、色、線幅、回転、尻尾）および上記サブコンポーネントの統合。

---

## 4. 受入基準 (AC) と検証方針

| AC ID | 受入基準 | 検証方針 |
|---|---|---|
| **AC-1** | 幾何計算、テキスト組版、Canvasレンダラーへのモジュール分割 | 各モジュール（ubbleGeometry, ubbleTypography, ubbleCanvasRenderer, ubbleTransform）が独立してインポート可能であり、単一責任原則が維持されていること。 |
| **AC-2** | 座標系変換の一元化とプレビュー/エクスポート整合性 | TransformContext を通じた座標計算により、異なるスケール係数（scaleX, scaleY）でも位置ずれやテキスト欠けが生じないこと。 |
| **AC-3** | 既存全テストの完全通過 | 
pm test にて speechBubbleRenderer.test.ts, SpeechBubbleControls.test.tsx, SpeechBubbleEditorModal.test.tsx を含む全テストが PASS すること。 |
