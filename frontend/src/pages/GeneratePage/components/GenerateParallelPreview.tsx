import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface GenerateParallelPreviewProps {
  images: string[]
  selectedImage: string | null
  onSelect: (image: string) => void
  onOpen: () => void
  aspectRatios?: Record<string, number>
}

const GAP = 12

export function GenerateParallelPreview({
  images,
  selectedImage,
  onSelect,
  onOpen,
  aspectRatios,
}: GenerateParallelPreviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [loadedAspectRatios, setLoadedAspectRatios] = useState<Record<string, number>>({})

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
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [])

  const getAspectRatio = (img: string): number => {
    const raw = aspectRatios?.[img] ?? loadedAspectRatios[img] ?? (2 / 3)
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) {
      return Math.max(0.1, Math.min(10.0, raw))
    }
    return 2 / 3
  }

  // Precompute pages greedily based on size.width and size.height
  const pages: { start: number; count: number; items: string[] }[] = []
  if (size.width > 0 && size.height > 0 && images.length > 0) {
    let currentStart = 0
    while (currentStart < images.length) {
      let count = 1
      while (currentStart + count < images.length) {
        const nextCount = count + 1
        let totalW = 0
        for (let j = 0; j < nextCount; j++) {
          const img = images[currentStart + j]
          const ar = getAspectRatio(img)
          const w = Math.max(80, size.height * ar)
          totalW += w
        }
        totalW += (nextCount - 1) * GAP
        if (totalW <= size.width) {
          count = nextCount
        } else {
          break
        }
      }
      pages.push({
        start: currentStart,
        count,
        items: images.slice(currentStart, currentStart + count),
      })
      currentStart += count
    }
  }

  const foundIndex = selectedImage === null ? -1 : images.indexOf(selectedImage)
  const activeIndex = foundIndex < 0 ? 0 : foundIndex
  const currentPageIndex = Math.max(
    0,
    pages.findIndex((p) => activeIndex >= p.start && activeIndex < p.start + p.count),
  )
  const currentPage = pages[currentPageIndex] ?? {
    start: 0,
    count: 0,
    items: [],
  }

  const page = currentPage.items
  const visibleCount = currentPage.count

  // Calculate pageHeight: scale down if a single image exceeds container width
  let pageHeight = size.height
  if (page.length === 1 && size.width > 0 && size.height > 0) {
    const singleAR = getAspectRatio(page[0])
    if (pageHeight * singleAR > size.width) {
      pageHeight = Math.max(50, Math.min(size.height, (size.width - 16) / singleAR))
    }
  }

  const movePage = (step: -1 | 1) => {
    if (pages.length === 0) return
    const nextIndex = Math.max(0, Math.min(pages.length - 1, currentPageIndex + step))
    if (nextIndex !== currentPageIndex) {
      const targetPage = pages[nextIndex]
      if (targetPage && targetPage.items.length > 0) {
        onSelect(targetPage.items[0])
      }
    }
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
    <div
      ref={ref}
      data-testid="generate-parallel-preview"
      role="group"
      aria-label="並列画像プレビュー"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-accent-green/50"
    >
      <div className="flex h-full max-w-full items-center justify-center" style={{ gap: GAP }}>
        {page.map((image, offset) => {
          const ar = getAspectRatio(image)
          const tileWidth = Math.max(80, Math.min(size.width, pageHeight * ar))
          return (
            <div
              key={`${currentPage.start + offset}-${image}`}
              className="group relative flex-shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-surface-2 shadow-2xl"
              style={{ width: tileWidth, height: pageHeight }}
            >
              <button
                type="button"
                aria-label={`画像 ${image} を開く`}
                aria-pressed={image === selectedImage}
                onClick={() => {
                  onSelect(image)
                  queueMicrotask(onOpen)
                }}
                className="absolute inset-0 flex h-full w-full items-center justify-center"
              >
                <img
                  src={image}
                  alt={`生成画像 ${currentPage.start + offset + 1}`}
                  className="h-full w-full object-contain"
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget
                    if (naturalWidth && naturalHeight) {
                      const calculatedAR = naturalWidth / naturalHeight
                      setLoadedAspectRatios((prev) => {
                        if (prev[image] === calculatedAR) return prev
                        return { ...prev, [image]: calculatedAR }
                      })
                    }
                  }}
                />
              </button>
              <a
                href={image}
                download="generated.png"
                id={page.length === 1 ? 'download-btn' : undefined}
                onClick={(event) => event.stopPropagation()}
                className="absolute bottom-2 right-2 z-10 rounded-md border border-white/10 bg-surface/90 px-3 py-1.5 text-xs text-zinc-200 opacity-0 transition-opacity hover:bg-surface focus:opacity-100 group-hover:opacity-100"
              >
                Download
              </a>
            </div>
          )
        })}
      </div>
      {visibleCount > 0 && (
        <>
          <button
            type="button"
            aria-label="前の画像ページ"
            disabled={currentPageIndex === 0}
            onClick={() => movePage(-1)}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <button
            type="button"
            aria-label="次の画像ページ"
            disabled={currentPageIndex >= pages.length - 1}
            onClick={() => movePage(1)}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-2 text-white disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </>
      )}
    </div>
  )
}
