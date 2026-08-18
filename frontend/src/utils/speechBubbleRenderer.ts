import { SpeechBubble, TextOrientation } from '../types/speechBubble'

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

/**
 * 吹き出し枠内に収まる自動フォントサイズを計算
 */
export function calculateFitFontSize(
  text: string,
  width: number,
  height: number,
  orientation: TextOrientation,
  ctx?: CanvasRenderingContext2D,
  minSize = 8,
  maxSize = 48
): number {
  if (!text) return maxSize

  // 吹き出し内部の有効余白（形状に応じて約80%を利用）
  const availW = Math.max(10, width * 0.8)
  const availH = Math.max(10, height * 0.8)

  let low = minSize
  let high = maxSize
  let best = minSize

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    let fits = false

    if (orientation === 'vertical') {
      const cols = layoutVerticalText(text, mid, availH)
      const colWidth = mid * 1.3
      const totalWidth = cols.length * colWidth
      const maxColLen = Math.max(...cols.map(c => c.length), 0)
      const totalHeight = maxColLen * (mid * 1.15)
      fits = totalWidth <= availW && totalHeight <= availH
    } else {
      const lines = layoutHorizontalText(text, mid, availW, ctx)
      const lineHeight = mid * 1.25
      const totalHeight = lines.length * lineHeight
      fits = totalHeight <= availH
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
 * 吹き出しの背景形状を描画（本体外周と尻尾を結合した単一連続パスによる一体描画）
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
      const tailAngle = Math.atan2(ty - cy, tx - cx)
      const spread = 0.25 // radians spread for tail root on ellipse
      const startAngle = tailAngle + spread
      const endAngle = tailAngle - spread

      // Draw ellipse arc from startAngle around to endAngle
      ctx.ellipse(cx, cy, rx, ry, 0, startAngle, endAngle + (endAngle < startAngle ? Math.PI * 2 : 0))
      // Connect to tail tip and close back to start
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
      const tailAngle = Math.atan2(ty - cy, tx - cx)
      const baseHalfWidth = Math.min(bw, bh) * 0.12

      // Determine which edge the tail exits from
      // Normalize angle to 0..2PI
      const normAngle = (tailAngle + Math.PI * 2) % (Math.PI * 2)
      // Angles of corners:
      // Bottom: PI/4 to 3PI/4
      // Left: 3PI/4 to 5PI/4
      // Top: 5PI/4 to 7PI/4
      // Right: 7PI/4 to 2PI and 0 to PI/4
      const isBottom = normAngle >= Math.PI * 0.25 && normAngle < Math.PI * 0.75
      const isLeft = normAngle >= Math.PI * 0.75 && normAngle < Math.PI * 1.25
      const isTop = normAngle >= Math.PI * 1.25 && normAngle < Math.PI * 1.75
      const isRight = !isBottom && !isLeft && !isTop

      // Start path at top-left corner
      ctx.moveTo(bx + radius, by)

      // Top edge
      if (isTop) {
        const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
        ctx.lineTo(midX - baseHalfWidth, by)
        ctx.lineTo(tx, ty)
        ctx.lineTo(midX + baseHalfWidth, by)
      }
      ctx.lineTo(bx + bw - radius, by)
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius)

      // Right edge
      if (isRight) {
        const midY = Math.max(by + radius + baseHalfWidth, Math.min(by + bh - radius - baseHalfWidth, ty))
        ctx.lineTo(bx + bw, midY - baseHalfWidth)
        ctx.lineTo(tx, ty)
        ctx.lineTo(bx + bw, midY + baseHalfWidth)
      }
      ctx.lineTo(bx + bw, by + bh - radius)
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh)

      // Bottom edge
      if (isBottom) {
        const midX = Math.max(bx + radius + baseHalfWidth, Math.min(bx + bw - radius - baseHalfWidth, tx))
        ctx.lineTo(midX + baseHalfWidth, by + bh)
        ctx.lineTo(tx, ty)
        ctx.lineTo(midX - baseHalfWidth, by + bh)
      }
      ctx.lineTo(bx + radius, by + bh)
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius)

      // Left edge
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
      // Find the closest outer peak to the tail
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

    // Draw puff 1
    ctx.beginPath()
    ctx.arc(p1x, p1y, r1, 0, Math.PI * 2)
    if (bubble.backgroundColor && bubble.backgroundColor !== 'transparent') {
      ctx.fill()
    }
    if (bubble.borderWidth > 0 && bubble.borderColor && bubble.borderColor !== 'transparent') {
      ctx.stroke()
    }

    // Draw puff 2
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
 * 吹き出し内のテキストを描画
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

  // Determine actual font family name
  let fontFamily = 'sans-serif'
  if (bubble.fontFamily === 'serif') {
    fontFamily = 'serif'
  } else if (bubble.fontFamily && bubble.fontFamily !== 'sans-serif') {
    // If it's a server font file name
    fontFamily = `server-font-${bubble.fontFamily.replace(/\./g, '-')}, sans-serif`
  } else if (activeFontFamily) {
    fontFamily = activeFontFamily
  }

  const scaleAvg = (scaleX + scaleY) / 2

  const fontSize = (bubble.fontSize && bubble.fontSize > 0)
    ? bubble.fontSize * scaleAvg
    : calculateFitFontSize(bubble.text, bw, bh, bubble.orientation, ctx)

  ctx.save()
  ctx.fillStyle = bubble.textColor || 'rgba(0, 0, 1)'
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  if (bubble.orientation === 'vertical') {
    const availH = bh * 0.8
    const columns = layoutVerticalText(bubble.text, fontSize, availH)
    const colStep = fontSize * 1.3
    const totalW = (columns.length - 1) * colStep
    // 縦書きは日本語伝統に従い、右列から左列へ
    const startX = cx + totalW / 2

    columns.forEach((col, colIdx) => {
      const currentX = startX - colIdx * colStep
      const chars = Array.from(col)
      const lineHeight = fontSize * 1.15
      const totalColH = (chars.length - 1) * lineHeight
      const startY = cy - totalColH / 2

      chars.forEach((char, charIdx) => {
        const currentY = startY + charIdx * lineHeight
        ctx.fillText(char, currentX, currentY)
      })
    })
  } else {
    const availW = bw * 0.8
    const lines = layoutHorizontalText(bubble.text, fontSize, availW, ctx)
    const lineHeight = fontSize * 1.25
    const totalLinesH = (lines.length - 1) * lineHeight
    const startY = cy - totalLinesH / 2

    lines.forEach((line, lineIdx) => {
      const currentY = startY + lineIdx * lineHeight
      ctx.fillText(line, cx, currentY)
    })
  }

  ctx.restore()
}

export type ResizeHandlePosition = 'nw' | 'ne' | 'se' | 'sw'

export const RESIZE_HANDLE_SIZE = 8

/**
 * 選択中吹き出しのバウンディングボックスおよびリサイズハンドル・尻尾ハンドルを描画
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  isSelected = false,
  scaleX = 1,
  scaleY = 1,
  activeFontFamily?: string
): void {
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
}

/**
 * 指定されたフォントサイズ・文字方向に基づき、テキストが内包される最適な吹き出しサイズ (W, H) を算出
 */
export function calculateFitBubbleDimensions(
  text: string,
  fontSize: number,
  orientation: TextOrientation,
  ctx?: CanvasRenderingContext2D
): { w: number; h: number } {
  if (!text) {
    return { w: 160, h: 140 }
  }

  const effectiveFontSize = fontSize > 0 ? fontSize : 18

  if (orientation === 'vertical') {
    // 改行で段落に分ける
    const paragraphs = text.split('\n')
    // 最大行長（1段落あたりの最大文字数）
    const maxChars = Math.max(...paragraphs.map(p => p.length), 1)
    const numCols = paragraphs.length

    const lineHeight = effectiveFontSize * 1.15
    const colStep = effectiveFontSize * 1.3

    const textH = maxChars * lineHeight
    const textW = numCols * colStep

    // 形状余白 (楕円などの切り欠きを考慮して1.35倍 + 最小パディング)
    const w = Math.max(100, Math.round(textW * 1.4 + 40))
    const h = Math.max(80, Math.round(textH * 1.3 + 35))
    return { w, h }
  } else {
    // 横書き
    const paragraphs = text.split('\n')
    let maxLineWidth = 0

    if (ctx) {
      ctx.font = `${effectiveFontSize}px sans-serif`
      maxLineWidth = Math.max(...paragraphs.map(p => ctx.measureText(p).width), effectiveFontSize)
    } else {
      maxLineWidth = Math.max(...paragraphs.map(p => {
        let w = 0
        for (const ch of p) {
          w += ch.charCodeAt(0) > 255 ? effectiveFontSize : effectiveFontSize * 0.55
        }
        return w
      }), effectiveFontSize)
    }

    const numLines = paragraphs.length
    const lineHeight = effectiveFontSize * 1.25
    const textH = numLines * lineHeight

    const w = Math.max(120, Math.round(maxLineWidth * 1.35 + 40))
    const h = Math.max(70, Math.round(textH * 1.35 + 30))
    return { w, h }
  }
}

export const speechBubbleRenderer = {
  layoutVerticalText,
  layoutHorizontalText,
  calculateFitFontSize,
  calculateFitBubbleDimensions,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
}

