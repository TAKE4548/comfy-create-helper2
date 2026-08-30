import { MangaTextEffectConfig, MultiStrokeLayer, SpeechBubble } from '../types/speechBubble'
import { clampTailApexOutsideBubble, getTailContactPositions, sampleCurveArcLength, getDefaultPathPoints } from './bubbleGeometry'
import { layoutVerticalText, layoutHorizontalText, calculateCharacterTransform, calculateFitFontSize, verticalCharMap } from './bubbleTypography'

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
      const contacts = getTailContactPositions(bubble, scaleX, scaleY)
      if (contacts) {
        const clampedApex = clampTailApexOutsideBubble(bubble, bubble.tail.x, bubble.tail.y)
        const tx = clampedApex.x * scaleX
        const ty = clampedApex.y * scaleY
        const { angle1, angle2 } = { angle1: contacts.p1.angle, angle2: contacts.p2.angle }

        let diff = (angle1 - angle2) % (Math.PI * 2)
        if (diff < 0) diff += Math.PI * 2
        if (diff < 0.1) diff = Math.PI * 2 - 0.1

        ctx.ellipse(cx, cy, rx, ry, 0, angle2, angle2 + diff)
        ctx.lineTo(tx, ty)
        ctx.closePath()
      } else {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      }
    } else {
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    }
  } else if (bubble.shape === 'rounded-rect') {
    const radius = Math.min(bw, bh) * 0.15
    if (bubble.tail) {
      const clampedApex = clampTailApexOutsideBubble(bubble, bubble.tail.x, bubble.tail.y)
      const tx = clampedApex.x * scaleX
      const ty = clampedApex.y * scaleY
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
    globalIdx: number,
    customPathPos?: { x: number; y: number; tangentAngle: number }
  ) => {
    const trans = calculateCharacterTransform(charIdxInSeq, totalSeqChars, bubble, fx, globalIdx)
    const pathPos = customPathPos || trans.pathPos

    let targetX = anchorX + trans.offsetX
    let targetY = anchorY + trans.offsetY

    if (fx?.pathPreset && fx.pathPreset !== 'none' && pathPos) {
      targetX = bx + pathPos.x * bw + trans.offsetX
      targetY = by + pathPos.y * bh + trans.offsetY
    }

    ctx.save()
    ctx.translate(targetX, targetY)

    if (trans.shearAngle !== 0) {
      const rad = (trans.shearAngle * Math.PI) / 180
      ctx.transform(1, 0, Math.tan(rad), 1, 0, 0)
    }

    let rot = trans.rotateRad
    if (fx?.pathFollowRotation && pathPos) {
      if (bubble.orientation === 'vertical') {
        rot += (pathPos.tangentAngle - Math.PI / 2)
      } else {
        rot += pathPos.tangentAngle
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
    const isVertical = bubble.orientation === 'vertical'
    const mappedText = isVertical
      ? Array.from(bubble.text.replace(/\n/g, '')).map((ch) => verticalCharMap[ch] || ch)
      : Array.from(bubble.text.replace(/\n/g, ''))
    const totalChars = mappedText.length

    if (fx.pathPreset === 'stepped') {
      mappedText.forEach((ch, idx) => {
        drawCharacter(ch, cx, cy, idx, totalChars, idx)
      })
    } else {
      const defaultPts = getDefaultPathPoints(fx.pathPreset, bubble.orientation)
      const requiredCount = fx.pathPreset === 'arc' ? 3 : fx.pathPreset === 'wave' ? 4 : 2
      const pts = fx.pathPoints && fx.pathPoints.length >= requiredCount ? fx.pathPoints : defaultPts
      const sampler = sampleCurveArcLength(fx.pathPreset, pts, bw, bh)
      const letterSpacing = fx.letterSpacing ?? 0

      // Calculate each character's scale and width contribution
      const scales = mappedText.map((_, i) =>
        calculateCharacterTransform(i, totalChars, bubble, fx, i).scale
      )
      const distances: number[] = [0]
      for (let i = 0; i < totalChars - 1; i++) {
        const step = ((scales[i] + scales[i + 1]) / 2) * fontSize + letterSpacing
        distances.push(distances[i] + step)
      }
      const totalTextLen = distances[totalChars - 1] || 0

      let startD = 0
      let scaleFactor = 1
      if (totalChars === 1) {
        startD = sampler.totalLength / 2
      } else if (totalTextLen <= sampler.totalLength && sampler.totalLength > 0) {
        startD = (sampler.totalLength - totalTextLen) / 2
      } else if (sampler.totalLength > 0 && totalTextLen > 0) {
        scaleFactor = sampler.totalLength / totalTextLen
      }

      mappedText.forEach((ch, idx) => {
        const targetD = startD + distances[idx] * scaleFactor
        const pos = sampler.evaluateDistance(targetD)
        drawCharacter(ch, cx, cy, idx, totalChars, idx, pos)
      })
    }
  } else if (bubble.orientation === 'vertical') {
    const availH = bh * 0.8
    const columns = layoutVerticalText(bubble.text, fontSize, availH)
    const letterSpacing = fx?.letterSpacing ?? 0
    const lineHeightRatio = fx?.lineHeightRatio ?? 1.15
    const colStep = fontSize * 1.3 + letterSpacing
    const totalW = (columns.length - 1) * colStep
    const startX = cx + totalW / 2

    let globalCharIdx = 0
    columns.forEach((col, colIdx) => {
      const currentX = startX - colIdx * colStep
      const chars = Array.from(col)
      const n = chars.length

      const scales = chars.map((_, i) =>
        calculateCharacterTransform(i, n, bubble, fx, globalCharIdx + i).scale
      )

      const yOffsets: number[] = [0]
      for (let i = 0; i < n - 1; i++) {
        const step = ((scales[i] + scales[i + 1]) / 2) * (fontSize * lineHeightRatio) + letterSpacing
        yOffsets.push(yOffsets[i] + step)
      }
      const totalColH = yOffsets[n - 1] || 0
      const startY = cy - totalColH / 2

      chars.forEach((char, charIdx) => {
        const currentY = startY + yOffsets[charIdx]
        drawCharacter(char, currentX, currentY, charIdx, n, globalCharIdx)
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
      const n = chars.length

      const scales = chars.map((_, i) =>
        calculateCharacterTransform(i, n, bubble, fx, globalCharIdx + i).scale
      )

      const xOffsets: number[] = [0]
      for (let i = 0; i < n - 1; i++) {
        const step = ((scales[i] + scales[i + 1]) / 2) * fontSize + letterSpacing
        xOffsets.push(xOffsets[i] + step)
      }
      const totalLineW = xOffsets[n - 1] || 0
      const startX = cx - totalLineW / 2

      chars.forEach((char, charIdx) => {
        const currentX = startX + xOffsets[charIdx]
        drawCharacter(char, currentX, currentY, charIdx, n, globalCharIdx)
        globalCharIdx++
      })
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
      const clampedApex = clampTailApexOutsideBubble(bubble, bubble.tail.x, bubble.tail.y)
      const tx = clampedApex.x * scaleX
      const ty = clampedApex.y * scaleY

      ctx.setLineDash([])
      ctx.fillStyle = '#3b82f6'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(tx, ty, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // 微調整モード時の2接点ハンドル描画
      if (bubble.tail.isFineTuning) {
        const contacts = getTailContactPositions(bubble, scaleX, scaleY)
        if (contacts) {
          ctx.setLineDash([3, 3])
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(contacts.p1.x, contacts.p1.y)
          ctx.lineTo(tx, ty)
          ctx.moveTo(contacts.p2.x, contacts.p2.y)
          ctx.lineTo(tx, ty)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.fillStyle = '#f59e0b'
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2

          ctx.beginPath()
          ctx.arc(contacts.p1.x, contacts.p1.y, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(contacts.p2.x, contacts.p2.y, 6, 0, Math.PI * 2)
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
