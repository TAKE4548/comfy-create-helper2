import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface GenerateParallelPreviewProps {
  images: string[]
  selectedImage: string | null
  onSelect: (image: string) => void
  onOpen: () => void
}

const GAP = 12

export function GenerateParallelPreview({ images, selectedImage, onSelect, onOpen }: GenerateParallelPreviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize({ width, height })
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(element)
    return () => { window.removeEventListener('resize', measure); observer?.disconnect() }
  }, [])

  let columns = 1
  for (let count = Math.min(4, images.length); count >= 2; count -= 1) {
    if (size.width - GAP * (count - 1) >= size.height * (2 / 3) * count) {
      columns = count
      break
    }
  }
  const visibleCount = Math.min(columns, images.length)
  const foundIndex = selectedImage === null ? -1 : images.indexOf(selectedImage)
  const index = foundIndex < 0 ? 0 : foundIndex
  const pageStart = Math.floor(index / Math.max(1, visibleCount)) * Math.max(1, visibleCount)
  const page = images.slice(pageStart, pageStart + visibleCount)
  const tileWidth = visibleCount ? Math.max(0, Math.min(size.height * 2 / 3, (size.width - GAP * (visibleCount - 1)) / visibleCount)) : 0
  const tileHeight = Math.max(0, Math.min(size.height, tileWidth * 1.5))

  const movePage = (step: -1 | 1) => {
    if (!visibleCount) return
    const lastStart = Math.floor((images.length - 1) / visibleCount) * visibleCount
    const nextStart = Math.max(0, Math.min(lastStart, pageStart + step * visibleCount))
    if (nextStart !== pageStart) onSelect(images[nextStart])
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const target = event.target as HTMLElement
    const editable = target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')
    event.stopPropagation()
    if (editable) return
    event.preventDefault()
    movePage(event.key === 'ArrowLeft' ? -1 : 1)
  }

  return (
    <div ref={ref} data-testid="generate-parallel-preview" role="group" aria-label="並列画像プレビュー" tabIndex={0} onKeyDown={onKeyDown} className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-accent-green/50">
      <div className="flex h-full max-w-full items-center justify-center" style={{ gap: GAP }}>
        {page.map((image, offset) => (
          <div key={`${pageStart + offset}-${image}`} className="group relative flex-shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-surface-2 shadow-2xl" style={{ width: tileWidth, height: tileHeight }}>
            <button type="button" aria-label={`画像 ${image} を開く`} aria-pressed={image === selectedImage} onClick={() => { onSelect(image); queueMicrotask(onOpen) }} className="absolute inset-0 flex h-full w-full items-center justify-center">
              <img src={image} alt={`生成画像 ${pageStart + offset + 1}`} className="h-full w-full object-contain" />
            </button>
            <a href={image} download="generated.png" id={page.length === 1 ? 'download-btn' : undefined} onClick={(event) => event.stopPropagation()} className="absolute bottom-2 right-2 z-10 rounded-md border border-white/10 bg-surface/90 px-3 py-1.5 text-xs text-zinc-200 opacity-0 transition-opacity hover:bg-surface focus:opacity-100 group-hover:opacity-100">Download</a>
          </div>
        ))}
      </div>
      {visibleCount > 0 && <>
        <button type="button" aria-label="前の画像ページ" disabled={pageStart === 0} onClick={() => movePage(-1)} className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white disabled:pointer-events-none disabled:opacity-0"><ChevronLeft aria-hidden="true" size={20} /></button>
        <button type="button" aria-label="次の画像ページ" disabled={pageStart + visibleCount >= images.length} onClick={() => movePage(1)} className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white disabled:pointer-events-none disabled:opacity-0"><ChevronRight aria-hidden="true" size={20} /></button>
      </>}
    </div>
  )
}
