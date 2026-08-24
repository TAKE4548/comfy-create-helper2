import { MangaTextEffectConfig, MultiStrokeLayer, PathPoint, PathPresetType, SpeechBubble, TextOrientation } from '../types/speechBubble'

export const verticalCharMap: Record<string, string> = {
  'ー': '｜', '―': '｜', '–': '｜', '-': '｜', '~': '｜', '～': '｜',
  '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄',
  '（': '︵', '）': '︶', '(': '︵', ')': '︶',
  '【': '︻', '】': '︼', '〔': '︹', '〕': '︺',
  '［': '﹇', '］': '﹈', '{': '︷', '}': '︸', '｛': '︷', '｝': '︸',
  '…': '⋮', '..': '︰', '：': '︓', '；': '︔',
  '、': '︑', '。': '︒', '.': '︒', ',': '︑',
}

/**
 * 軌道プリセットのデフォルト制御点を取得（縦書き/横書き対応）
 */
export function getDefaultPathPoints(
  preset: PathPresetType,
  orientation: TextOrientation = 'horizontal'
): PathPoint[] {
  if (orientation === 'vertical') {
    switch (preset) {
      case 'line':
        return [
          { x: 0.5, y: 0.1 },
          { x: 0.5, y: 0.9 },
        ]
      case 'arc':
        return [
          { x: 0.7, y: 0.1 },
          { x: 0.3, y: 0.5 },
          { x: 0.7, y: 0.9 },
        ]
      case 'wave':
        return [
          { x: 0.5, y: 0.1 },
          { x: 0.2, y: 0.35 },
          { x: 0.8, y: 0.65 },
          { x: 0.5, y: 0.9 },
        ]
      case 'stepped':
        return [
          { x: 0.7, y: 0.1 },
          { x: 0.3, y: 0.9 },
        ]
      default:
        return []
    }
  } else {
    switch (preset) {
      case 'line':
        return [
          { x: 0.1, y: 0.5 },
          { x: 0.9, y: 0.5 },
        ]
      case 'arc':
        return [
          { x: 0.1, y: 0.7 },
          { x: 0.5, y: 0.3 },
          { x: 0.9, y: 0.7 },
        ]
      case 'wave':
        return [
          { x: 0.1, y: 0.5 },
          { x: 0.35, y: 0.2 },
          { x: 0.65, y: 0.8 },
          { x: 0.9, y: 0.5 },
        ]
      case 'stepped':
        return [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ]
      default:
        return []
    }
  }
}

/**
 * 軌道制御点を反転（縦書き: X座標ミラー 1.0 - x, 横書き: Y座標ミラー 1.0 - y）
 */
export function flipPathPoints(points: PathPoint[], orientation: TextOrientation): PathPoint[] {
  return points.map((pt) => ({
    x: orientation === 'vertical' ? Math.round((1.0 - pt.x) * 1000) / 1000 : pt.x,
    y: orientation === 'horizontal' ? Math.round((1.0 - pt.y) * 1000) / 1000 : pt.y,
  }))
}

/**
 * 縦書き用の文字列折り返しレイアウト
 * 改行および最大高さに応じて縦列（右から左へ並ぶ各列）配列を生成
 */
export function layoutVerticalText(text: string, fontSize: number, maxHeight: number): string[] {
  if (!text) return []

  const lineHeight = fontSize * 1.15
  const maxCharsPerColumn = Math.max(1, Math.floor(maxHeight / lineHeight))

  const paragraphs = text.split('\n')
  const columns: string[] = []

  for (const para of paragraphs) {
    if (para.length === 0) {
      columns.push('')
      continue
    }

    // 縦書き文字変換
    const mappedChars = Array.from(para).map(char => verticalCharMap[char] || char)

    for (let i = 0; i < mappedChars.length; i += maxCharsPerColumn) {
      columns.push(mappedChars.slice(i, i + maxCharsPerColumn).join(''))
    }
  }

  return columns
}

/**
 * 横書き用の文字列折り返しレイアウト
 * 改行および最大幅に応じて行配列を生成
 */
export function layoutHorizontalText(
  text: string,
  fontSize: number,
  maxWidth: number,
  ctx?: CanvasRenderingContext2D
): string[] {
  if (!text) return []

  const paragraphs = text.split('\n')
  const lines: string[] = []

  const measureTextWidth = (str: string): number => {
    if (ctx) {
      ctx.font = `${fontSize}px sans-serif`
      return ctx.measureText(str).width
    }
    // Contextがない場合のフォールバック（全角1文字=fontSize, 半角=0.55*fontSize）
    let w = 0
    for (const ch of str) {
      w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55
    }
    return w
  }

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('')
      continue
    }

    let currentLine = ''
    for (const char of Array.from(para)) {
      const testLine = currentLine + char
      if (measureTextWidth(testLine) > maxWidth && currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = char
      } else {
        currentLine = testLine
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine)
    }
  }

  return lines
}

export interface CharacterTransform {
  scale: number
  rotateRad: number
  shearAngle: number
  offsetX: number
  offsetY: number
  pathPos?: { x: number; y: number; tangentAngle: number }
}

/**
 * 文字単位の変形（スケールカーブ、サイズ揺らぎ、縦中横回転、シアー、パス配置、ガタつき）を計算
 */
export function calculateCharacterTransform(
  charIndex: number,
  totalChars: number,
  bubble: SpeechBubble,
  effects?: MangaTextEffectConfig,
  charGlobalIndex?: number
): CharacterTransform {
  const fx = effects || bubble.effects
  const t = totalChars > 1 ? charIndex / (totalChars - 1) : 0
  const gIdx = charGlobalIndex ?? charIndex

  // 1. スケールカーブ
  let scale = 1.0
  const start = fx?.scaleStart ?? 1.0
  const end = fx?.scaleEnd ?? 1.0
  const curve = fx?.scaleCurve ?? 'none'

  if (curve === 'linear') {
    scale = start + (end - start) * t
  } else if (curve === 'ease-in') {
    scale = start + (end - start) * (t * t)
  } else if (curve === 'ease-out') {
    scale = start + (end - start) * (1 - (1 - t) * (1 - t))
  } else if (curve === 'bezier') {
    scale = start + (end - start) * (t * t * (3 - 2 * t))
  } else {
    scale = 1.0
  }

  // サイズ揺らぎ (Jitter)
  if (fx?.sizeJitter && fx.sizeJitter > 0) {
    const hash = Math.sin(gIdx * 997 + totalChars * 31)
    const jitter = (hash * fx.sizeJitter) / 100
    scale *= (1 + jitter)
  }

  // 2. 縦中横（90度回転）
  let rotateRad = 0
  if (bubble.orientation === 'vertical' && fx?.rotate90Indices?.includes(gIdx)) {
    rotateRad = Math.PI / 2
  }

  // 3. 傾斜（シアー）
  const shearAngle = fx?.shearAngle ?? 0

  // 4. ベースラインガタつき
  let offsetX = 0
  let offsetY = 0
  if (fx?.baselineJitter && fx.baselineJitter > 0) {
    offsetX = Math.cos(gIdx * 433 + totalChars) * fx.baselineJitter
    offsetY = Math.sin(gIdx * 577 + totalChars) * fx.baselineJitter
  }

  // 5. パス・軌道レイアウト
  let pathPos: { x: number; y: number; tangentAngle: number } | undefined = undefined
  if (fx?.pathPreset && fx.pathPreset !== 'none') {
    let px = 0
    let py = 0
    let dx = 1
    let dy = 0

    if (fx.pathPreset === 'line') {
      const defaultPts = getDefaultPathPoints('line', bubble.orientation)
      const pts = fx.pathPoints && fx.pathPoints.length >= 2 ? fx.pathPoints : defaultPts
      const p0 = pts[0]
      const p1 = pts[1] || pts[0]
      px = p0.x + (p1.x - p0.x) * t
      py = p0.y + (p1.y - p0.y) * t
      dx = p1.x - p0.x
      dy = p1.y - p0.y
    } else if (fx.pathPreset === 'arc') {
      const defaultPts = getDefaultPathPoints('arc', bubble.orientation)
      const pts = fx.pathPoints && fx.pathPoints.length >= 3 ? fx.pathPoints : defaultPts
      const p0 = pts[0]
      const p1 = pts[1] || pts[0]
      const p2 = pts[2] || pts[1] || pts[0]
      const it = 1 - t
      px = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x
      py = it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y
      dx = 2 * it * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
      dy = 2 * it * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
    } else if (fx.pathPreset === 'wave') {
      const defaultPts = getDefaultPathPoints('wave', bubble.orientation)
      const pts = fx.pathPoints && fx.pathPoints.length >= 4 ? fx.pathPoints : defaultPts
      const p0 = pts[0]
      const p1 = pts[1] || pts[0]
      const p2 = pts[2] || pts[1] || pts[0]
      const p3 = pts[3] || pts[2] || pts[1] || pts[0]
      const it = 1 - t
      px = it * it * it * p0.x + 3 * it * it * t * p1.x + 3 * it * t * t * p2.x + t * t * t * p3.x
      py = it * it * it * p0.y + 3 * it * it * t * p1.y + 3 * it * t * t * p2.y + t * t * t * p3.y
      dx = 3 * it * it * (p1.x - p0.x) + 6 * it * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
      dy = 3 * it * it * (p1.y - p0.y) + 6 * it * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
    } else if (fx.pathPreset === 'stepped') {
      const defaultPts = getDefaultPathPoints('stepped', bubble.orientation)
      const pts = fx.pathPoints && fx.pathPoints.length >= 2 ? fx.pathPoints : defaultPts
      const steps = Math.max(1, fx.pathSteppedCount ?? 3)
      const stepIdx = Math.min(steps - 1, Math.floor(t * steps))
      const p0 = pts[0]
      const p1 = pts[1] || pts[0]
      const stepT = (stepIdx + 0.5) / steps
      px = p0.x + (p1.x - p0.x) * stepT
      py = p0.y + (p1.y - p0.y) * stepT
      dx = p1.x - p0.x
      dy = p1.y - p0.y
    }

    const tangentAngle = Math.atan2(dy, dx)
    pathPos = { x: px, y: py, tangentAngle }
  }

  return {
    scale,
    rotateRad,
    shearAngle,
    offsetX,
    offsetY,
    pathPos,
  }
}

/**
 * 多層フチ（MultiStroke）描画
 */
export function drawMultiStrokes(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  multiStrokes?: MultiStrokeLayer[]
): void {
  if (!multiStrokes || multiStrokes.length === 0) return

  // 太いレイヤー（外側）から順に描画
  const sorted = [...multiStrokes].sort((a, b) => (b.width || 0) - (a.width || 0))

  for (const layer of sorted) {
    ctx.save()
    ctx.lineWidth = (layer.width || 1) * 2
    ctx.strokeStyle = layer.color || 'rgba(0, 0, 0, 1)'
    if (layer.opacity !== undefined && layer.opacity < 1.0) {
      ctx.globalAlpha = (ctx.globalAlpha ?? 1.0) * layer.opacity
    }
    ctx.lineJoin = layer.lineJoin || 'round'
    if (layer.lineStyle === 'dashed') {
      ctx.setLineDash([4, 4])
    } else {
      ctx.setLineDash([])
    }
    ctx.strokeText(text, x + (layer.offsetX || 0), y + (layer.offsetY || 0))
    ctx.restore()
  }
}

/**
 * 文字塗りつぶしスタイル（グラデーション、トーン、単色）を Context に適用
 */
export function applyTextFill(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  _cx: number,
  _cy: number,
  bw: number,
  bh: number,
  effects?: MangaTextEffectConfig
): void {
  const fx = effects || bubble.effects
  const fillMode = fx?.fillMode ?? 'solid'

  if (fillMode === 'solid') {
    ctx.fillStyle = bubble.textColor || 'rgba(0, 0, 0, 1)'
  } else if (fillMode === 'gradient') {
    const gType = fx?.gradientType ?? 'linear'
    const stops = fx?.gradientStops && fx.gradientStops.length > 0
      ? fx.gradientStops
      : [
          { color: bubble.textColor || 'rgba(0, 0, 0, 1)', offset: 0 },
          { color: 'rgba(100, 100, 100, 1)', offset: 1 },
        ]

    let grad: CanvasGradient
    if (gType === 'radial') {
      const r = Math.max(bw, bh) / 2 || 50
      grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
    } else {
      const angleRad = ((fx?.gradientAngle ?? 0) * Math.PI) / 180
      const r = Math.max(bw, bh) / 2 || 50
      const x0 = -Math.cos(angleRad) * r
      const y0 = -Math.sin(angleRad) * r
      const x1 = Math.cos(angleRad) * r
      const y1 = Math.sin(angleRad) * r
      grad = ctx.createLinearGradient(x0, y0, x1, y1)
    }
    for (const stop of stops) {
      grad.addColorStop(Math.min(1, Math.max(0, stop.offset)), stop.color)
    }
    ctx.fillStyle = grad
  } else if (fillMode === 'tone') {
    if (typeof document !== 'undefined') {
      try {
        const pCanvas = document.createElement('canvas')
        pCanvas.width = 4
        pCanvas.height = 4
        const pCtx = pCanvas.getContext('2d')
        if (pCtx) {
          pCtx.fillStyle = bubble.backgroundColor || '#ffffff'
          pCtx.fillRect(0, 0, 4, 4)
          pCtx.fillStyle = bubble.textColor || '#000000'
          pCtx.fillRect(1, 1, 2, 2)
          const pattern = ctx.createPattern(pCanvas, 'repeat')
          if (pattern) {
            ctx.fillStyle = pattern
            return
          }
        }
      } catch {
        // fallback
      }
    }
    ctx.fillStyle = bubble.textColor || 'rgba(0, 0, 0, 1)'
  } else {
    ctx.fillStyle = bubble.textColor || 'rgba(0, 0, 0, 1)'
  }
}

/**
 * 吹き出し枠内に収まる自動フォントサイズを計算（漫画演出パラメータ対応）
 */
export function calculateFitFontSize(
  text: string,
  width: number,
  height: number,
  orientation: TextOrientation,
  effectsOrCtx?: MangaTextEffectConfig | CanvasRenderingContext2D,
  ctxOrMinSize?: CanvasRenderingContext2D | number,
  minSize = 8,
  maxSize = 48
): number {
  if (!text) return maxSize

  let effects: MangaTextEffectConfig | undefined = undefined
  let ctx: CanvasRenderingContext2D | undefined = undefined
  let effectiveMinSize = minSize
  let effectiveMaxSize = maxSize

  if (effectsOrCtx && typeof (effectsOrCtx as any).fillRect === 'function') {
    ctx = effectsOrCtx as CanvasRenderingContext2D
    if (typeof ctxOrMinSize === 'number') {
      effectiveMinSize = ctxOrMinSize
    }
  } else {
    effects = effectsOrCtx as MangaTextEffectConfig | undefined
    if (ctxOrMinSize && typeof (ctxOrMinSize as any).fillRect === 'function') {
      ctx = ctxOrMinSize as CanvasRenderingContext2D
    } else if (typeof ctxOrMinSize === 'number') {
      effectiveMinSize = ctxOrMinSize
    }
  }

  let maxScale = 1.0
  if (effects?.scaleCurve && effects.scaleCurve !== 'none') {
    maxScale = Math.max(effects.scaleStart ?? 1.0, effects.scaleEnd ?? 1.0)
  }
  if (effects?.sizeJitter && effects.sizeJitter > 0) {
    maxScale *= (1 + effects.sizeJitter / 100)
  }

  const letterSpacing = effects?.letterSpacing ?? 0
  const shearAngle = effects?.shearAngle ?? 0
  let maxStroke = 0
  if (effects?.multiStrokes && effects.multiStrokes.length > 0) {
    maxStroke = Math.max(
      ...effects.multiStrokes.map(s => (s.width || 0) + Math.max(Math.abs(s.offsetX || 0), Math.abs(s.offsetY || 0)))
    )
  }
  const extraPadding = maxStroke * 2 + (effects?.baselineJitter ?? 0) * 2

  const availW = Math.max(10, width * 0.8 - extraPadding)
  const availH = Math.max(10, height * 0.8 - extraPadding)

  let low = effectiveMinSize
  let high = effectiveMaxSize
  let best = effectiveMinSize

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const scaledMid = mid * maxScale
    let fits = false

    if (orientation === 'vertical') {
      const lineHeightRatio = effects?.lineHeightRatio ?? 1.15
      const cols = layoutVerticalText(text, scaledMid, availH)
      const colWidth = scaledMid * 1.3 + letterSpacing
      const totalWidth = cols.length * colWidth
      const maxColLen = Math.max(...cols.map(c => c.length), 0)
      const totalHeight = maxColLen * (scaledMid * lineHeightRatio + letterSpacing)
      const shearExcess = Math.abs(Math.tan((shearAngle * Math.PI) / 180)) * totalHeight
      fits = (totalWidth + shearExcess) <= availW && totalHeight <= availH
    } else {
      const lineHeightRatio = effects?.lineHeightRatio ?? 1.25
      const lines = layoutHorizontalText(text, scaledMid, availW, ctx)
      const lineHeight = scaledMid * lineHeightRatio
      const totalHeight = lines.length * lineHeight
      const maxCharsInLine = Math.max(...lines.map(l => l.length), 1)
      const shearExcess = Math.abs(Math.tan((shearAngle * Math.PI) / 180)) * totalHeight
      const extraLineW = (maxCharsInLine - 1) * letterSpacing + shearExcess
      fits = totalHeight <= availH && extraLineW <= availW
    }

    if (fits) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}

/**
 * 吹き出しの背景形状を描画
 */
export function drawBubbleShape(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  scaleX = 1,
  scaleY = 1
): void {
  if (bubble.shape === 'none') return

  const bx = bubble.x * scaleX
  const by = bubble.y * scaleY
  const bw = bubble.w * scaleX
  const bh = bubble.h * scaleY
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const rx = bw / 2
  const ry = bh / 2

  ctx.save()
  ctx.fillStyle = bubble.backgroundColor || 'rgba(255, 255, 255, 0.95)'
  ctx.strokeStyle = bubble.borderColor || 'rgba(0, 0, 0, 1)'
  ctx.lineWidth = Math.max(1, bubble.borderWidth * Math.min(scaleX, scaleY))
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()

  if (bubble.shape === 'oval') {
    if (bubble.tail) {
      const tx = bubble.tail.x * scaleX
      const ty = bubble.tail.y * scaleY
      const tailAngle = Math.atan2(ty - cy, tx - cx) + (bubble.tail.isFineTuning ? (bubble.tail.baseAngleOffset ?? 0) : 0)
      const defaultSpread = 0.25
      const spread = bubble.tail.isFineTuning ? defaultSpread * (bubble.tail.baseSpreadRatio ?? 1.0) : defaultSpread
      const startAngle = tailAngle + spread
      const endAngle = tailAngle - spread

      ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle + (endAngle < startAngle ? Math.PI * 2 : 0))
      ctx.lineTo(tx, ty)
      ctx.closePath()
    } else {
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    }
  } else if (bubble.shape === 'rounded-rect') {
    const radius = Math.min(bw, bh) * 0.15
    if (bubble.tail) {
      const tx = bubble.tail.x * scaleX
      const ty = bubble.tail.y * scaleY
      const tailAngle = Math.atan2(ty - cy, tx - cx) + (bubble.tail.isFineTuning ? (bubble.tail.baseAngleOffset ?? 0) : 0)
      const defaultBaseHalfWidth = Math.min(bw, bh) * 0.12
      const baseHalfWidth = bubble.tail.isFineTuning
        ? defaultBaseHalfWidth * (bubble.tail.baseSpreadRatio ?? 1.0)
        : defaultBaseHalfWidth

      const normAngle = (tailAngle + Math.PI * 2) % (Math.PI * 2)
      const isBottom = normAngle >= Math.PI * 0.25 && normAngle < Math.PI * 0.75
      const isLeft = normAngle >= Math.PI * 0.75 && normAngle < Math.PI * 1.25
      const isTop = normAngle >= Math.PI * 1.25 && normAngle < Math.PI * 1.75
      const isRight = !isBottom && !isLeft && !isTop

      ctx.moveTo(bx + radius, by)

      if (isTop) {
        const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
        ctx.lineTo(midX - baseHalfWidth, by)
        ctx.lineTo(tx, ty)
        ctx.lineTo(midX + baseHalfWidth, by)
      }
      ctx.lineTo(bx + bw - radius, by)
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius)

      if (isRight) {
        const midY = Math.max(by + radius + baseHalfWidth, Math.min(by + bh - radius - baseHalfWidth, ty))
        ctx.lineTo(bx + bw, midY - baseHalfWidth)
        ctx.lineTo(tx, ty)
        ctx.lineTo(bx + bw, midY + baseHalfWidth)
      }
      ctx.lineTo(bx + bw, by + bh - radius)
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh)

      if (isBottom) {
        const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
        ctx.lineTo(midX + baseHalfWidth, by + bh)
        ctx.lineTo(tx, ty)
        ctx.lineTo(midX - baseHalfWidth, by + bh)
      }
      ctx.lineTo(bx + radius, by + bh)
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius)

      if (isLeft) {
        const midY = Math.max(by + radius + baseHalfWidth, Math.min(by + bh - radius - baseHalfWidth, ty))
        ctx.lineTo(bx, midY + baseHalfWidth)
        ctx.lineTo(tx, ty)
        ctx.lineTo(bx, midY - baseHalfWidth)
      }
      ctx.lineTo(bx, by + radius)
      ctx.quadraticCurveTo(bx, by, bx + radius, by)
      ctx.closePath()
    } else {
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bx, by, bw, bh, radius)
      } else {
        ctx.moveTo(bx + radius, by)
        ctx.lineTo(bx + bw - radius, by)
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius)
        ctx.lineTo(bx + bw, by + bh - radius)
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh)
        ctx.lineTo(bx + radius, by + bh)
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius)
        ctx.lineTo(bx, by + radius)
        ctx.quadraticCurveTo(bx, by, bx + radius, by)
      }
    }
  } else if (bubble.shape === 'burst') {
    const points = 16
    const outerRx = rx
    const outerRy = ry
    const innerRx = rx * 0.72
    const innerRy = ry * 0.72

    let tailPtIdx = -1
    if (bubble.tail) {
      const tx = bubble.tail.x * scaleX
      const ty = bubble.tail.y * scaleY
      const tailAngle = Math.atan2(ty - cy, tx - cx)
      let minDiff = Infinity
      for (let i = 0; i < points * 2; i += 2) {
        let angle = (i * Math.PI) / points - Math.PI / 2
        let diff = Math.abs(angle - tailAngle)
        while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI)
        if (diff < minDiff) {
          minDiff = diff
          tailPtIdx = i
        }
      }
    }

    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2
      const isOuter = i % 2 === 0
      let px: number
      let py: number

      if (i === tailPtIdx && bubble.tail) {
        px = bubble.tail.x * scaleX
        py = bubble.tail.y * scaleY
      } else {
        const currentRx = isOuter ? outerRx : innerRx
        const currentRy = isOuter ? outerRy : innerRy
        px = cx + currentRx * Math.cos(angle)
        py = cy + currentRy * Math.sin(angle)
      }

      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.closePath()
  } else if (bubble.shape === 'cloud') {
    const numPuffs = 12
    const puffRadius = Math.min(bw, bh) * 0.22

    for (let i = 0; i < numPuffs; i++) {
      const angleStart = (i * 2 * Math.PI) / numPuffs
      const angleEnd = ((i + 1) * 2 * Math.PI) / numPuffs
      const angleMid = (angleStart + angleEnd) / 2

      const pStart = {
        x: cx + rx * 0.9 * Math.cos(angleStart),
        y: cy + ry * 0.9 * Math.sin(angleStart),
      }
      const pEnd = {
        x: cx + rx * 0.9 * Math.cos(angleEnd),
        y: cy + ry * 0.9 * Math.sin(angleEnd),
      }
      const pControl = {
        x: cx + (rx * 0.9 + puffRadius * 1.3) * Math.cos(angleMid),
        y: cy + (ry * 0.9 + puffRadius * 1.3) * Math.sin(angleMid),
      }

      if (i === 0) {
        ctx.moveTo(pStart.x, pStart.y)
      }
      ctx.quadraticCurveTo(pControl.x, pControl.y, pEnd.x, pEnd.y)
    }
    ctx.closePath()
  }

  if (bubble.backgroundColor && bubble.backgroundColor !== 'transparent') {
    ctx.fill()
  }
  if (bubble.borderWidth > 0 && bubble.borderColor && bubble.borderColor !== 'transparent') {
    ctx.stroke()
  }

  // 思考吹き出し（cloud）用の丸形パフ尻尾
  if (bubble.tail && bubble.shape === 'cloud') {
    const tx = bubble.tail.x * scaleX
    const ty = bubble.tail.y * scaleY

    const p1x = cx + (tx - cx) * 0.6
    const p1y = cy + (ty - cy) * 0.6
    const p2x = cx + (tx - cx) * 0.88
    const p2y = cy + (ty - cy) * 0.88

    const r1 = Math.min(bw, bh) * 0.09
    const r2 = Math.min(bw, bh) * 0.055

    ctx.beginPath()
    ctx.arc(p1x, p1y, r1, 0, Math.PI * 2)
    if (bubble.backgroundColor && bubble.backgroundColor !== 'transparent') {
      ctx.fill()
    }
    if (bubble.borderWidth > 0 && bubble.borderColor && bubble.borderColor !== 'transparent') {
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(p2x, p2y, r2, 0, Math.PI * 2)
    if (bubble.backgroundColor && bubble.backgroundColor !== 'transparent') {
      ctx.fill()
    }
    if (bubble.borderWidth > 0 && bubble.borderColor && bubble.borderColor !== 'transparent') {
      ctx.stroke()
    }
  }

  ctx.restore()
}

/**
 * しっぽの本体接点（基部中心）のキャンバス座標を計算
 */
export function getTailBasePosition(
  bubble: SpeechBubble,
  scaleX: number = 1,
  scaleY: number = 1
): { x: number; y: number; baseAngle: number } | null {
  if (!bubble.tail) return null

  const bx = bubble.x * scaleX
  const by = bubble.y * scaleY
  const bw = bubble.w * scaleX
  const bh = bubble.h * scaleY
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const tx = bubble.tail.x * scaleX
  const ty = bubble.tail.y * scaleY

  const baseAngle = Math.atan2(ty - cy, tx - cx) + (bubble.tail.isFineTuning ? (bubble.tail.baseAngleOffset ?? 0) : 0)

  if (bubble.shape === 'oval') {
    const rx = bw / 2
    const ry = bh / 2
    return {
      x: cx + rx * Math.cos(baseAngle),
      y: cy + ry * Math.sin(baseAngle),
      baseAngle,
    }
  } else if (bubble.shape === 'rounded-rect') {
    const normAngle = (baseAngle + Math.PI * 2) % (Math.PI * 2)
    const isBottom = normAngle >= Math.PI * 0.25 && normAngle < Math.PI * 0.75
    const isLeft = normAngle >= Math.PI * 0.75 && normAngle < Math.PI * 1.25
    const isTop = normAngle >= Math.PI * 1.25 && normAngle < Math.PI * 1.75
    const isRight = !isBottom && !isLeft && !isTop
    const radius = Math.min(bw, bh) * 0.15
    const defaultBaseHalfWidth = Math.min(bw, bh) * 0.12
    const baseHalfWidth = bubble.tail.isFineTuning ? defaultBaseHalfWidth * (bubble.tail.baseSpreadRatio ?? 1.0) : defaultBaseHalfWidth

    if (isTop) {
      const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
      return { x: midX, y: by, baseAngle }
    } else if (isRight) {
      const midY = Math.max(by + radius + baseHalfWidth, Math.min(by + bh - radius - baseHalfWidth, ty))
      return { x: bx + bw, y: midY, baseAngle }
    } else if (isBottom) {
      const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
      return { x: midX, y: by + bh, baseAngle }
    } else {
      const midY = Math.max(by + radius + baseHalfWidth, Math.min(by + bh - radius - baseHalfWidth, ty))
      return { x: bx, y: midY, baseAngle }
    }
  }

  return null
}

/**
 * 吹き出し内のテキストを描画（漫画テキスト演出パラメータ対応）
 */
export function drawBubbleText(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  scaleX = 1,
  scaleY = 1,
  activeFontFamily?: string
): void {
  if (!bubble.text) return

  const bx = bubble.x * scaleX
  const by = bubble.y * scaleY
  const bw = bubble.w * scaleX
  const bh = bubble.h * scaleY
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const fx = bubble.effects

  // Determine actual font family name
  let fontFamily = 'sans-serif'
  if (bubble.fontFamily === 'serif') {
    fontFamily = 'serif'
  } else if (bubble.fontFamily && bubble.fontFamily !== 'sans-serif') {
    fontFamily = `server-font-${bubble.fontFamily.replace(/\./g, '-')}, sans-serif`
  } else if (activeFontFamily) {
    fontFamily = activeFontFamily
  }

  const scaleAvg = (scaleX + scaleY) / 2

  const fontSize = (bubble.fontSize && bubble.fontSize > 0)
    ? bubble.fontSize * scaleAvg
    : calculateFitFontSize(bubble.text, bw, bh, bubble.orientation, fx, ctx)

  ctx.save()
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  const drawCharacter = (
    char: string,
    anchorX: number,
    anchorY: number,
    charIdxInSeq: number,
    totalSeqChars: number,
    globalIdx: number
  ) => {
    const trans = calculateCharacterTransform(charIdxInSeq, totalSeqChars, bubble, fx, globalIdx)

    let targetX = anchorX + trans.offsetX
    let targetY = anchorY + trans.offsetY

    if (fx?.pathPreset && fx.pathPreset !== 'none' && trans.pathPos) {
      targetX = bx + trans.pathPos.x * bw + trans.offsetX
      targetY = by + trans.pathPos.y * bh + trans.offsetY
    }

    ctx.save()
    ctx.translate(targetX, targetY)

    if (trans.shearAngle !== 0) {
      const rad = (trans.shearAngle * Math.PI) / 180
      ctx.transform(1, 0, Math.tan(rad), 1, 0, 0)
    }

    let rot = trans.rotateRad
    if (fx?.pathFollowRotation && trans.pathPos) {
      if (bubble.orientation === 'vertical') {
        rot += (trans.pathPos.tangentAngle - Math.PI / 2)
      } else {
        rot += trans.pathPos.tangentAngle
      }
    }
    if (rot !== 0) {
      ctx.rotate(rot)
    }

    if (trans.scale !== 1.0) {
      ctx.scale(trans.scale, trans.scale)
    }

    // 1. 多層フチの描画
    if (fx?.multiStrokes && fx.multiStrokes.length > 0) {
      drawMultiStrokes(ctx, char, 0, 0, fx.multiStrokes)
    }

    // 2. 塗りつぶしとテキスト描画
    if (fx?.fillMode !== 'hollow') {
      applyTextFill(ctx, bubble, cx, cy, bw, bh, fx)
      ctx.fillText(char, 0, 0)
    }

    ctx.restore()
  }

  // パス配置が指定されている場合
  if (fx?.pathPreset && fx.pathPreset !== 'none') {
    const rawChars = Array.from(bubble.text.replace(/\n/g, ''))
    const totalChars = rawChars.length
    rawChars.forEach((ch, idx) => {
      drawCharacter(ch, cx, cy, idx, totalChars, idx)
    })
  } else if (bubble.orientation === 'vertical') {
    const availH = bh * 0.8
    const columns = layoutVerticalText(bubble.text, fontSize, availH)
    const letterSpacing = fx?.letterSpacing ?? 0
    const lineHeightRatio = fx?.lineHeightRatio ?? 1.15
    const lineHeight = fontSize * lineHeightRatio + letterSpacing
    const colStep = fontSize * 1.3 + letterSpacing
    const totalW = (columns.length - 1) * colStep
    const startX = cx + totalW / 2

    let globalCharIdx = 0
    columns.forEach((col, colIdx) => {
      const currentX = startX - colIdx * colStep
      const chars = Array.from(col)
      const totalColH = (chars.length - 1) * lineHeight
      const startY = cy - totalColH / 2

      chars.forEach((char, charIdx) => {
        const currentY = startY + charIdx * lineHeight
        drawCharacter(char, currentX, currentY, charIdx, chars.length, globalCharIdx)
        globalCharIdx++
      })
    })
  } else {
    const availW = bw * 0.8
    const lines = layoutHorizontalText(bubble.text, fontSize, availW, ctx)
    const letterSpacing = fx?.letterSpacing ?? 0
    const lineHeightRatio = fx?.lineHeightRatio ?? 1.25
    const lineHeight = fontSize * lineHeightRatio
    const totalLinesH = (lines.length - 1) * lineHeight
    const startY = cy - totalLinesH / 2

    let globalCharIdx = 0
    lines.forEach((line, lineIdx) => {
      const currentY = startY + lineIdx * lineHeight
      const chars = Array.from(line)

      if (letterSpacing > 0) {
        const totalLineW = (chars.length - 1) * (fontSize + letterSpacing)
        const startX = cx - totalLineW / 2
        chars.forEach((char, charIdx) => {
          const currentX = startX + charIdx * (fontSize + letterSpacing)
          drawCharacter(char, currentX, currentY, charIdx, chars.length, globalCharIdx)
          globalCharIdx++
        })
      } else {
        const startX = cx - ((chars.length - 1) * fontSize) / 2
        chars.forEach((char, charIdx) => {
          const currentX = chars.length === 1 ? cx : startX + charIdx * fontSize
          drawCharacter(char, currentX, currentY, charIdx, chars.length, globalCharIdx)
          globalCharIdx++
        })
      }
    })
  }

  ctx.restore()
}

export type ResizeHandlePosition = 'nw' | 'ne' | 'se' | 'sw'

export const RESIZE_HANDLE_SIZE = 8
export const ROTATE_HANDLE_OFFSET = 20
export const ROTATE_HANDLE_RADIUS = 6

/**
 * 選択中吹き出しのバウンディングボックスおよびリサイズハンドル・尻尾ハンドル・回転ハンドルを描画
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  isSelected = false,
  scaleX = 1,
  scaleY = 1,
  activeFontFamily?: string
): void {
  const rotation = bubble.rotation || 0
  const cx = (bubble.x + bubble.w / 2) * scaleX
  const cy = (bubble.y + bubble.h / 2) * scaleY

  ctx.save()
  if (rotation !== 0) {
    ctx.translate(cx, cy)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  drawBubbleShape(ctx, bubble, scaleX, scaleY)
  drawBubbleText(ctx, bubble, scaleX, scaleY, activeFontFamily)

  if (isSelected) {
    const bx = bubble.x * scaleX
    const by = bubble.y * scaleY
    const bw = bubble.w * scaleX
    const bh = bubble.h * scaleY

    ctx.save()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.strokeRect(bx, by, bw, bh)

    // 上部中央の回転ハンドル & ステム線
    const topCenterX = bx + bw / 2
    const topCenterY = by
    const rotateHandleY = by - ROTATE_HANDLE_OFFSET

    ctx.setLineDash([])
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(topCenterX, topCenterY)
    ctx.lineTo(topCenterX, rotateHandleY)
    ctx.stroke()

    ctx.fillStyle = '#3b82f6'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(topCenterX, rotateHandleY, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // 尻尾ハンドル
    if (bubble.tail) {
      const tx = bubble.tail.x * scaleX
      const ty = bubble.tail.y * scaleY

      ctx.setLineDash([])
      ctx.fillStyle = '#3b82f6'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tx, ty, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // 微調整モード時の本体接点（基部）ハンドル描画
      if (bubble.tail.isFineTuning) {
        const basePos = getTailBasePosition(bubble, scaleX, scaleY)
        if (basePos) {
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(basePos.x, basePos.y)
          ctx.lineTo(tx, ty)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.fillStyle = '#f59e0b'
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(basePos.x, basePos.y, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }

    // 四隅のリサイズハンドル
    ctx.setLineDash([])
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2

    const hs = RESIZE_HANDLE_SIZE
    const handles = [
      { x: bx - hs / 2, y: by - hs / 2 }, // nw
      { x: bx + bw - hs / 2, y: by - hs / 2 }, // ne
      { x: bx + bw - hs / 2, y: by + bh - hs / 2 }, // se
      { x: bx - hs / 2, y: by + bh - hs / 2 }, // sw
    ]

    handles.forEach(h => {
      ctx.fillRect(h.x, h.y, hs, hs)
      ctx.strokeRect(h.x, h.y, hs, hs)
    })

    ctx.restore()
  }

  ctx.restore()
}

/**
 * 指定されたフォントサイズ・文字方向に基づき、テキストが内包される最適な吹き出しサイズ (W, H) を算出（漫画演出パラメータ対応）
 */
export function calculateFitBubbleDimensions(
  text: string,
  fontSize: number,
  orientation: TextOrientation,
  effectsOrCtx?: MangaTextEffectConfig | CanvasRenderingContext2D,
  ctx?: CanvasRenderingContext2D
): { w: number; h: number } {
  if (!text) {
    return { w: 160, h: 140 }
  }

  let effects: MangaTextEffectConfig | undefined = undefined
  let actualCtx: CanvasRenderingContext2D | undefined = ctx

  if (effectsOrCtx && typeof (effectsOrCtx as any).fillRect === 'function') {
    actualCtx = effectsOrCtx as CanvasRenderingContext2D
  } else {
    effects = effectsOrCtx as MangaTextEffectConfig | undefined
  }

  let maxScale = 1.0
  if (effects?.scaleCurve && effects.scaleCurve !== 'none') {
    maxScale = Math.max(effects.scaleStart ?? 1.0, effects.scaleEnd ?? 1.0)
  }
  if (effects?.sizeJitter && effects.sizeJitter > 0) {
    maxScale *= (1 + effects.sizeJitter / 100)
  }

  const effectiveFontSize = (fontSize > 0 ? fontSize : 18) * maxScale
  const letterSpacing = effects?.letterSpacing ?? 0
  const shearAngle = effects?.shearAngle ?? 0
  const baselineJitter = effects?.baselineJitter ?? 0

  let maxStroke = 0
  if (effects?.multiStrokes && effects.multiStrokes.length > 0) {
    maxStroke = Math.max(
      ...effects.multiStrokes.map(s => (s.width || 0) + Math.max(Math.abs(s.offsetX || 0), Math.abs(s.offsetY || 0)))
    )
  }
  const extraPadding = maxStroke * 2 + baselineJitter * 2

  if (orientation === 'vertical') {
    const lineHeightRatio = effects?.lineHeightRatio ?? 1.15
    const paragraphs = text.split('\n')
    const maxChars = Math.max(...paragraphs.map(p => p.length), 1)
    const numCols = paragraphs.length

    const lineHeight = effectiveFontSize * lineHeightRatio + letterSpacing
    const colStep = effectiveFontSize * 1.3 + letterSpacing

    const textH = maxChars * lineHeight
    let textW = numCols * colStep
    const shearExcess = Math.abs(Math.tan((shearAngle * Math.PI) / 180)) * textH
    textW += shearExcess

    const w = Math.max(100, Math.round(textW * 1.4 + 40 + extraPadding))
    const h = Math.max(80, Math.round(textH * 1.3 + 35 + extraPadding))
    return { w, h }
  } else {
    const lineHeightRatio = effects?.lineHeightRatio ?? 1.25
    const paragraphs = text.split('\n')
    let maxLineWidth = 0

    if (actualCtx) {
      actualCtx.font = `${effectiveFontSize}px sans-serif`
      maxLineWidth = Math.max(...paragraphs.map(p => actualCtx!.measureText(p).width), effectiveFontSize)
    } else {
      maxLineWidth = Math.max(
        ...paragraphs.map(p => {
          let w = 0
          for (const ch of p) {
            w += ch.charCodeAt(0) > 255 ? effectiveFontSize : effectiveFontSize * 0.55
          }
          return w
        }),
        effectiveFontSize
      )
    }
    const maxCharsInLine = Math.max(...paragraphs.map(p => p.length), 1)
    maxLineWidth += (maxCharsInLine - 1) * letterSpacing

    const numLines = paragraphs.length
    const lineHeight = effectiveFontSize * lineHeightRatio
    const textH = numLines * lineHeight
    const shearExcess = Math.abs(Math.tan((shearAngle * Math.PI) / 180)) * textH
    maxLineWidth += shearExcess

    const w = Math.max(120, Math.round(maxLineWidth * 1.35 + 40 + extraPadding))
    const h = Math.max(70, Math.round(textH * 1.35 + 30 + extraPadding))
    return { w, h }
  }
}

export const speechBubbleRenderer = {
  verticalCharMap,
  getDefaultPathPoints,
  flipPathPoints,
  getTailBasePosition,
  layoutVerticalText,
  layoutHorizontalText,
  calculateCharacterTransform,
  drawMultiStrokes,
  applyTextFill,
  calculateFitFontSize,
  calculateFitBubbleDimensions,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
}


