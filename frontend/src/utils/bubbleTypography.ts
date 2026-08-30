import { MangaTextEffectConfig, SpeechBubble, TextOrientation } from '../types/speechBubble'
import { getDefaultPathPoints } from './bubbleGeometry'

export const verticalCharMap: Record<string, string> = {
  'ー': '｜', '―': '｜', '–': '｜', '-': '｜', '~': '｜', '～': '｜',
  '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄',
  '（': '︵', '）': '︶', '(': '︵', ')': '︶',
  '【': '︻', '】': '︼', '〔': '︹', '〕': '︺',
  '［': '﹇', '］': '﹈', '{': '︷', '}': '︸', '｛': '︷', '｝': '︸',
  '…': '⋮', '..': '︰', '：': '︓', '；': '︔',
  '、': '︑', '。': '︒', '.': '︒', ',': '︑',
}

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

      const indicesInThisStep: number[] = []
      for (let j = 0; j < totalChars; j++) {
        const tj = totalChars > 1 ? j / (totalChars - 1) : 0.5
        const sIdx = Math.min(steps - 1, Math.floor(tj * steps))
        if (sIdx === stepIdx) {
          indicesInThisStep.push(j)
        }
      }
      const posInStep = indicesInThisStep.indexOf(charIndex)
      const countInStep = indicesInThisStep.length
      let subT = 0.5
      if (countInStep > 1 && posInStep !== -1) {
        subT = 0.2 + 0.6 * (posInStep / (countInStep - 1))
      }
      const stepT = (stepIdx + subT) / steps
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
