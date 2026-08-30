import { PathPoint, PathPresetType, SpeechBubble, TextOrientation } from '../types/speechBubble'

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
  const mirrored = points.map((pt) => ({
    x: orientation === 'vertical' ? Math.round((1.0 - pt.x) * 1000) / 1000 : pt.x,
    y: orientation === 'horizontal' ? Math.round((1.0 - pt.y) * 1000) / 1000 : pt.y,
  }))
  const isUnchanged = mirrored.every((pt, idx) => pt.x === points[idx]?.x && pt.y === points[idx]?.y)
  if (isUnchanged) {
    return [...points].reverse()
  }
  return mirrored
}

/**
 * 吹き出し本体内部へしっぽ先端が入り込まないよう、外周外側にクランプする
 */
export function clampTailApexOutsideBubble(
  bubble: SpeechBubble,
  tx: number,
  ty: number
): { x: number; y: number } {
  const cx = bubble.x + bubble.w / 2
  const cy = bubble.y + bubble.h / 2
  const rx = Math.max(1, bubble.w / 2)
  const ry = Math.max(1, bubble.h / 2)
  const dx = tx - cx
  const dy = ty - cy

  if (bubble.shape === 'oval' || bubble.shape === 'burst' || bubble.shape === 'cloud') {
    const normDistSq = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
    if (normDistSq < 1.05 * 1.05) {
      const dist = Math.sqrt(normDistSq)
      const factor = dist > 0.001 ? 1.05 / dist : 1.05
      return {
        x: cx + dx * factor,
        y: cy + (dist > 0.001 ? dy * factor : ry * 1.05),
      }
    }
  } else if (bubble.shape === 'rounded-rect') {
    const hw = rx
    const hh = ry
    const normX = Math.abs(dx) / hw
    const normY = Math.abs(dy) / hh
    const maxNorm = Math.max(normX, normY)
    if (maxNorm < 1.05) {
      const factor = maxNorm > 0.001 ? 1.05 / maxNorm : 1.05
      return {
        x: cx + dx * factor,
        y: cy + (maxNorm > 0.001 ? dy * factor : hh * 1.05),
      }
    }
  }
  return { x: tx, y: ty }
}

export interface TailContactPoint {
  x: number
  y: number
  angle: number
}

/**
 * 吹き出し本体と尻尾の2つの外周接点座標を計算
 */
export function getTailContactPositions(
  bubble: SpeechBubble,
  scaleX: number = 1,
  scaleY: number = 1
): { p1: TailContactPoint; p2: TailContactPoint } | null {
  if (!bubble.tail) return null

  const bx = bubble.x * scaleX
  const by = bubble.y * scaleY
  const bw = bubble.w * scaleX
  const bh = bubble.h * scaleY
  const cx = bx + bw / 2
  const cy = by + bh / 2
  const tx = bubble.tail.x * scaleX
  const ty = bubble.tail.y * scaleY

  const defaultTailAngle = Math.atan2(ty - cy, tx - cx)
  const defaultSpread = 0.25

  let angle1: number
  let angle2: number

  if (bubble.tail.baseAngle1 !== undefined && bubble.tail.baseAngle2 !== undefined) {
    angle1 = bubble.tail.baseAngle1
    angle2 = bubble.tail.baseAngle2
  } else if (bubble.tail.baseAngleOffset !== undefined || bubble.tail.baseSpreadRatio !== undefined) {
    const offset = bubble.tail.baseAngleOffset ?? 0
    const spread = defaultSpread * (bubble.tail.baseSpreadRatio ?? 1.0)
    angle1 = defaultTailAngle + offset - spread
    angle2 = defaultTailAngle + offset + spread
  } else {
    angle1 = defaultTailAngle - defaultSpread
    angle2 = defaultTailAngle + defaultSpread
  }

  const rx = bw / 2
  const ry = bh / 2

  if (bubble.shape === 'oval' || bubble.shape === 'burst' || bubble.shape === 'cloud') {
    return {
      p1: { x: cx + rx * Math.cos(angle1), y: cy + ry * Math.sin(angle1), angle: angle1 },
      p2: { x: cx + rx * Math.cos(angle2), y: cy + ry * Math.sin(angle2), angle: angle2 },
    }
  } else if (bubble.shape === 'rounded-rect') {
    const getRectPoint = (angle: number): { x: number; y: number } => {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const tX = cos !== 0 ? (cos > 0 ? rx / cos : -rx / cos) : Infinity
      const tY = sin !== 0 ? (sin > 0 ? ry / sin : -ry / sin) : Infinity
      const t = Math.min(Math.abs(tX), Math.abs(tY))
      return {
        x: Math.max(bx, Math.min(bx + bw, cx + cos * t)),
        y: Math.max(by, Math.min(by + bh, cy + sin * t)),
      }
    }
    const pt1 = getRectPoint(angle1)
    const pt2 = getRectPoint(angle2)
    return {
      p1: { x: pt1.x, y: pt1.y, angle: angle1 },
      p2: { x: pt2.x, y: pt2.y, angle: angle2 },
    }
  }
  return null
}

/**
 * 吹き出し本体としっぽの接合基部中心座標を計算
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

export interface SampledPathPoint {
  t: number
  x: number
  y: number
  dx: number
  dy: number
  cumLength: number
}

export function sampleCurveArcLength(
  preset: PathPresetType,
  points: PathPoint[],
  bw: number,
  bh: number,
  samples = 200
): { totalLength: number; evaluateDistance: (d: number) => { x: number; y: number; tangentAngle: number } } {
  const sampled: SampledPathPoint[] = []
  let cum = 0

  const evaluateT = (t: number): { x: number; y: number; dx: number; dy: number } => {
    let px = 0
    let py = 0
    let dx = 1
    let dy = 0
    if (preset === 'line') {
      const p0 = points[0]
      const p1 = points[1] || points[0]
      px = p0.x + (p1.x - p0.x) * t
      py = p0.y + (p1.y - p0.y) * t
      dx = p1.x - p0.x
      dy = p1.y - p0.y
    } else if (preset === 'arc') {
      const p0 = points[0]
      const p1 = points[1] || points[0]
      const p2 = points[2] || points[1] || points[0]
      const it = 1 - t
      px = it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x
      py = it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y
      dx = 2 * it * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
      dy = 2 * it * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
    } else if (preset === 'wave') {
      const p0 = points[0]
      const p1 = points[1] || points[0]
      const p2 = points[2] || points[1] || points[0]
      const p3 = points[3] || points[2] || points[1] || points[0]
      const it = 1 - t
      px = it * it * it * p0.x + 3 * it * it * t * p1.x + 3 * it * t * t * p2.x + t * t * t * p3.x
      py = it * it * it * p0.y + 3 * it * it * t * p1.y + 3 * it * t * t * p2.y + t * t * t * p3.y
      dx = 3 * it * it * (p1.x - p0.x) + 6 * it * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
      dy = 3 * it * it * (p1.y - p0.y) + 6 * it * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
    }
    return { x: px, y: py, dx, dy }
  }

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const pt = evaluateT(t)
    if (i > 0) {
      const prev = sampled[i - 1]
      const segDist = Math.hypot((pt.x - prev.x) * bw, (pt.y - prev.y) * bh)
      cum += segDist
    }
    sampled.push({ t, x: pt.x, y: pt.y, dx: pt.dx, dy: pt.dy, cumLength: cum })
  }

  const totalLength = cum

  const evaluateDistance = (d: number) => {
    if (totalLength === 0 || sampled.length === 0) {
      const pt = evaluateT(0.5)
      return { x: pt.x, y: pt.y, tangentAngle: Math.atan2(pt.dy, pt.dx) }
    }
    const clampedD = Math.max(0, Math.min(totalLength, d))
    let low = 0
    let high = sampled.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (sampled[mid].cumLength < clampedD) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    const idx = Math.max(1, Math.min(sampled.length - 1, low))
    const pPrev = sampled[idx - 1]
    const pNext = sampled[idx]
    const segLen = pNext.cumLength - pPrev.cumLength
    const frac = segLen > 0 ? (clampedD - pPrev.cumLength) / segLen : 0
    const interpT = pPrev.t + (pNext.t - pPrev.t) * frac
    const pt = evaluateT(interpT)
    return { x: pt.x, y: pt.y, tangentAngle: Math.atan2(pt.dy, pt.dx) }
  }

  return { totalLength, evaluateDistance }
}
