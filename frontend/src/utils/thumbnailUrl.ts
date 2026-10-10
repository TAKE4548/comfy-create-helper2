/**
 * ComfyUI の /view URL をバックエンドの軽量 WebP サムネイルプロキシ URL に変換する。
 * スナップショット等の既存サムネイルパスや通常画像 URL はそのまま透過的に返却する。
 */
export function toThumbnailUrl(url: string | null | undefined, size: number = 256): string {
  if (!url) return ''
  try {
    if (url.includes('/view?') || url.includes('/view/')) {
      const parsed = new URL(url, window.location.origin)
      const filename = parsed.searchParams.get('filename')
      if (filename) {
        const subfolder = parsed.searchParams.get('subfolder') || ''
        const type = parsed.searchParams.get('type') || 'output'
        const t = parsed.searchParams.get('t')
        const cacheBust = t === null ? '' : `&t=${encodeURIComponent(t)}`
        return `/api/comfy/thumbnail?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}&size=${size}${cacheBust}`
      }
    }
  } catch (e) {
    // URL 解析に失敗した場合は元 URL をフォールバック返却
  }
  return url
}

/** Normalize legacy Comfy hosts to same-origin while preserving view parameters. */
export function toSameOriginViewUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname !== '/view' || !parsed.searchParams.has('filename')) return url
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}
