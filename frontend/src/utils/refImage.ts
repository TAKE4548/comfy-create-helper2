export const REF_IMAGE_TOKEN_RE = /^refimg:([0-9a-f]{64})\.(png|jpg|webp)$/
export const ACCEPTED_REF_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_REF_IMAGE_BYTES = 20 * 1024 * 1024

export function isRefImageToken(value: unknown): value is string {
  return typeof value === 'string' && REF_IMAGE_TOKEN_RE.test(value)
}

export function refIdFromToken(token: string): string | null {
  const m = typeof token === 'string' ? REF_IMAGE_TOKEN_RE.exec(token) : null
  return m ? `${m[1]}.${m[2]}` : null
}

export function refImageThumbnailUrl(token: string): string | null {
  const refId = refIdFromToken(token)
  return refId ? `/api/ref-images/${refId}/thumbnail` : null
}

export function refImageViewUrl(token: string): string | null {
  const refId = refIdFromToken(token)
  return refId ? `/api/ref-images/${refId}` : null
}

export function parseHistoryImageUrl(
  url: string,
): { filename: string; subfolder: string; type: 'output' | 'temp' } | null {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.origin)
  } catch {
    return null
  }
  const filename = parsed.searchParams.get('filename')
  if (!filename) return null
  const type = parsed.searchParams.get('type') ?? 'output'
  if (type !== 'output' && type !== 'temp') return null
  return { filename, subfolder: parsed.searchParams.get('subfolder') ?? '', type }
}
