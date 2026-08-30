export interface TransformContext {
  scaleX: number
  scaleY: number
  offsetX?: number
  offsetY?: number
}

export function createTransformContext(
  scaleX = 1,
  scaleY = 1,
  offsetX = 0,
  offsetY = 0
): TransformContext {
  return { scaleX, scaleY, offsetX, offsetY }
}

export function toCanvasPoint(
  x: number,
  y: number,
  ctx: TransformContext
): { x: number; y: number } {
  return {
    x: x * ctx.scaleX + (ctx.offsetX ?? 0),
    y: y * ctx.scaleY + (ctx.offsetY ?? 0),
  }
}

export function toCanvasRect(
  x: number,
  y: number,
  w: number,
  h: number,
  ctx: TransformContext
): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  const scaledX = x * ctx.scaleX + (ctx.offsetX ?? 0)
  const scaledY = y * ctx.scaleY + (ctx.offsetY ?? 0)
  const scaledW = w * ctx.scaleX
  const scaledH = h * ctx.scaleY
  return {
    x: scaledX,
    y: scaledY,
    w: scaledW,
    h: scaledH,
    cx: scaledX + scaledW / 2,
    cy: scaledY + scaledH / 2,
  }
}

export function getAverageScale(ctx: TransformContext): number {
  return (ctx.scaleX + ctx.scaleY) / 2
}
