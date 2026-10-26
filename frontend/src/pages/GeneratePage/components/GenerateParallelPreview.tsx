import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { toThumbnailUrl } from '../../../utils/thumbnailUrl'

export interface GenerateParallelPreviewCenterRequest {
  image: string
  seq: number
}

export interface GenerateParallelPreviewProps {
  images: string[]
  selectedImage: string | null
  aspectRatios?: Record<string, number>
  onSelect: (image: string) => void
  onOpen: () => void
  onImageUnavailable?: (image: string) => void
  previewAutoFollow?: boolean
  onToggleAutoFollow?: () => void
  filterOwnSession?: boolean
  onToggleFilterOwnSession?: (checked: boolean) => void
  isHistoryExpanded?: boolean
  onToggleHistoryExpanded?: () => void
  isMultiSelectMode?: boolean
  centerRequest?: GenerateParallelPreviewCenterRequest | null
}

const GAP = 12

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

interface ProgressivePreviewImageProps {
  image: string
  alt: string
  onAspectRatioLoaded: (ar: number) => void
  onUnavailable?: () => void
}

function ProgressivePreviewImage({ image, alt, onAspectRatioLoaded, onUnavailable }: ProgressivePreviewImageProps) {
  const thumbnailUrl = toThumbnailUrl(image)
  const isProgressive = thumbnailUrl !== image

  const [isFullLoaded, setIsFullLoaded] = useState(false)
  const [thumbError, setThumbError] = useState(false)
  const [fullError, setFullError] = useState(false)

  useEffect(() => {
    setIsFullLoaded(false)
    setThumbError(false)
    setFullError(false)
  }, [image])

  useEffect(() => {
    if (fullError && (!isProgressive || thumbError)) {
      onUnavailable?.()
    }
  }, [fullError, thumbError, isProgressive, onUnavailable])

  if (!isProgressive) {
    return (
      <img
        src={image}
        alt={alt}
        className="h-full w-full object-contain"
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget
          if (naturalWidth && naturalHeight) {
            onAspectRatioLoaded(naturalWidth / naturalHeight)
          }
        }}
        onError={() => setFullError(true)}
      />
    )
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* 先行プレースホルダー: サムネイル */}
      {(!isFullLoaded || fullError) && !thumbError && (
        <img
          src={thumbnailUrl}
          alt={`${alt} (サムネイル)`}
          data-testid="preview-thumbnail"
          onError={() => setThumbError(true)}
          onLoad={(e) => {
            const { naturalWidth, naturalHeight } = e.currentTarget
            if (naturalWidth && naturalHeight) {
              onAspectRatioLoaded(naturalWidth / naturalHeight)
            }
          }}
          className="absolute inset-0 h-full w-full object-contain filter blur-sm transition-opacity duration-200"
        />
      )}
      {!isFullLoaded && thumbError && !fullError && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
          Loading preview...
        </div>
      )}
      {/* メインプレビュー: フルサイズWebP */}
      {!fullError && (
        <img
          src={image}
          alt={alt}
          data-testid="preview-full"
          onLoad={(e) => {
            setIsFullLoaded(true)
            const { naturalWidth, naturalHeight } = e.currentTarget
            if (naturalWidth && naturalHeight) {
              onAspectRatioLoaded(naturalWidth / naturalHeight)
            }
          }}
          onError={() => setFullError(true)}
          className={`h-full w-full object-contain transition-opacity duration-200 ${
            isFullLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}

export function GenerateParallelPreview({
  images,
  selectedImage,
  aspectRatios,
  onSelect,
  onOpen,
  onImageUnavailable,
  previewAutoFollow = false,
  onToggleAutoFollow,
  filterOwnSession = false,
  onToggleFilterOwnSession,
  isHistoryExpanded = false,
  onToggleHistoryExpanded,
  isMultiSelectMode = false,
  centerRequest = null,
}: GenerateParallelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reelRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [loadedAspectRatios, setLoadedAspectRatios] = useState<Record<string, number>>({})

  const velocityRef = useRef(0)
  const inertiaFrameRef = useRef(0)
  const lastCenterSeqRef = useRef<number | null>(null)
  const prevImagesRef = useRef<string[]>(images)

  // Measure container dimensions
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
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

  // Layout metrics calculation (AC-4 & AC-2)
  const availableHeight = Math.max(80, (containerSize.height || 340) - 24)
  const viewportWidth = Math.max(240, containerSize.width || 640)
  const maxWidth = Math.max(120, viewportWidth * 0.86)

  const getTileMetrics = (img: string) => {
    const rawAr = aspectRatios?.[img] ?? loadedAspectRatios[img] ?? (2 / 3)
    const ar = clamp(typeof rawAr === 'number' && !isNaN(rawAr) && rawAr > 0 ? rawAr : 2 / 3, 0.3, 3.0)
    const widthFromHeight = availableHeight * ar
    const widthConstrained = widthFromHeight > maxWidth
    const tileWidth = Math.round(Math.max(80, Math.min(widthFromHeight, maxWidth)))
    const tileHeight = Math.round(Math.max(80, widthConstrained ? tileWidth / ar : availableHeight))
    return { ar, tileWidth, tileHeight, widthConstrained }
  }

  const allMetrics = images.map((img) => getTileMetrics(img))
  const firstTileWidth = allMetrics[0]?.tileWidth ?? 0
  const lastTileWidth = allMetrics[allMetrics.length - 1]?.tileWidth ?? 0

  const firstMarginLeft = images.length > 0 ? Math.max(0, Math.round(viewportWidth / 2 - firstTileWidth / 2 - 14)) : 0
  const lastMarginRight = images.length > 0 ? Math.max(0, Math.round(viewportWidth / 2 - lastTileWidth / 2 - 14)) : 0

  const calculateTileCenterOffset = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= images.length) return 0
    let offset = firstMarginLeft
    for (let i = 0; i < targetIndex; i++) {
      offset += (allMetrics[i]?.tileWidth ?? 80) + GAP
    }
    return offset + (allMetrics[targetIndex]?.tileWidth ?? 80) / 2
  }

  const stopInertia = () => {
    velocityRef.current = 0
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current)
      inertiaFrameRef.current = 0
    }
  }

  const centerTileByIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const reel = reelRef.current
    if (!reel || index < 0 || index >= images.length) return

    let target = 0
    if (index === 0) {
      target = 0
    } else {
      const tile = reel.querySelector<HTMLElement>(`[data-generate-reel-tile="true"][data-index="${index}"]`)
      if (tile && tile.offsetWidth > 0) {
        target = tile.offsetLeft + tile.offsetWidth / 2 - reel.clientWidth / 2
      } else {
        target = calculateTileCenterOffset(index) - viewportWidth / 2
      }
    }

    target = Math.max(0, Math.round(target))
    if (typeof reel.scrollTo === 'function') {
      try {
        reel.scrollTo({ left: target, behavior })
      } catch {
        reel.scrollLeft = target
      }
    }
    reel.scrollLeft = target
    setScrollLeft(target)
  }

  const centerNearestTile = () => {
    if (images.length === 0) return
    const reel = reelRef.current
    const currentScroll = reel ? reel.scrollLeft : scrollLeft
    const vWidth = reel && reel.clientWidth > 0 ? reel.clientWidth : viewportWidth
    const viewportCenter = currentScroll + vWidth / 2

    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < images.length; i++) {
      const tile = reel?.querySelector<HTMLElement>(`[data-generate-reel-tile="true"][data-index="${i}"]`)
      let center = 0
      if (tile && tile.offsetWidth > 0) {
        center = tile.offsetLeft + tile.offsetWidth / 2
      } else {
        center = calculateTileCenterOffset(i)
      }
      const distance = Math.abs(center - viewportCenter)
      if (distance < nearestDistance) {
        nearestIndex = i
        nearestDistance = distance
      }
    }

    centerTileByIndex(nearestIndex, 'smooth')
    if (images[nearestIndex]) {
      onSelect(images[nearestIndex])
    }
  }

  // Wheel inertia loop (AC-3)
  const runInertia = () => {
    const reel = reelRef.current
    if (!reel) {
      inertiaFrameRef.current = 0
      return
    }

    const before = reel.scrollLeft
    reel.scrollLeft += velocityRef.current
    const after = reel.scrollLeft

    if (after === before && Math.abs(velocityRef.current) > 0.1) {
      velocityRef.current = 0
    } else {
      velocityRef.current *= 0.89
    }

    setScrollLeft(reel.scrollLeft)

    if (Math.abs(velocityRef.current) < 0.35) {
      velocityRef.current = 0
      inertiaFrameRef.current = 0
      centerNearestTile()
      return
    }

    inertiaFrameRef.current = requestAnimationFrame(runInertia)
  }

  // Attach non-passive wheel listener for impulse accumulation (AC-3)
  useEffect(() => {
    const reel = reelRef.current
    if (!reel) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const clientW = reel.clientWidth || 640
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? clientW : 1
      const horizontalInput = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      const dominantDelta = horizontalInput ? event.deltaX : event.deltaY
      const impulse = dominantDelta * unit * (horizontalInput ? 0.28 : 0.38)
      const maxVelocity = Math.max(28, clientW * 0.08)
      velocityRef.current = clamp(velocityRef.current + impulse, -maxVelocity, maxVelocity)

      if (!inertiaFrameRef.current) {
        inertiaFrameRef.current = requestAnimationFrame(runInertia)
      }
    }

    reel.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      reel.removeEventListener('wheel', handleWheel)
    }
  }, [images, viewportWidth])

  // Track scroll position for header button visibility
  useEffect(() => {
    const reel = reelRef.current
    if (!reel) return

    const onScroll = () => {
      setScrollLeft(reel.scrollLeft)
    }

    reel.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      reel.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Cleanup inertia on unmount
  useEffect(() => {
    return () => {
      stopInertia()
    }
  }, [])

  // Handle centerRequest (AC-7, AC-8)
  useEffect(() => {
    if (!centerRequest) return
    if (centerRequest.seq === lastCenterSeqRef.current) return
    lastCenterSeqRef.current = centerRequest.seq

    if (isMultiSelectMode) return

    stopInertia()
    const targetIndex = images.indexOf(centerRequest.image)
    if (targetIndex >= 0) {
      centerTileByIndex(targetIndex, 'smooth')
    }
  }, [centerRequest, isMultiSelectMode, images])

  // New image insertion & previewAutoFollow handling (AC-1, AC-10, RT-4)
  useEffect(() => {
    const prevImages = prevImagesRef.current
    prevImagesRef.current = images

    if (prevImages.length > 0 && images.length > prevImages.length) {
      const isPrepended = images[1] === prevImages[0] || (images.length === prevImages.length + 1 && images[0] !== prevImages[0])
      if (isPrepended) {
        if (previewAutoFollow) {
          stopInertia()
          centerTileByIndex(0, 'smooth')
          onSelect(images[0])
        } else {
          const reel = reelRef.current
          if (reel) {
            const newFirstMetrics = getTileMetrics(images[0])
            const oldFirstMetrics = getTileMetrics(prevImages[0])
            const shift = newFirstMetrics.tileWidth + GAP + (
              Math.max(0, Math.round(viewportWidth / 2 - newFirstMetrics.tileWidth / 2 - 14)) -
              Math.max(0, Math.round(viewportWidth / 2 - oldFirstMetrics.tileWidth / 2 - 14))
            )
            reel.scrollLeft += Math.max(0, shift)
            setScrollLeft(reel.scrollLeft)
          }
        }
      }
    }
  }, [images, previewAutoFollow, viewportWidth])

  // Active index calculation for indicator
  const foundIndex = selectedImage ? images.indexOf(selectedImage) : -1
  const activeIndex = foundIndex >= 0 ? foundIndex : 0

  // Keyboard navigation (Home, End, ArrowLeft, ArrowRight)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    const target = event.target as HTMLElement
    const editable = target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')
    if (editable) return

    event.stopPropagation()
    event.preventDefault()
    stopInertia()

    if (images.length === 0) return

    if (event.key === 'Home') {
      centerTileByIndex(0, 'smooth')
      onSelect(images[0])
    } else if (event.key === 'End') {
      const oldestIndex = images.length - 1
      centerTileByIndex(oldestIndex, 'smooth')
      onSelect(images[oldestIndex])
    } else if (event.key === 'ArrowLeft') {
      const prevIndex = Math.max(0, activeIndex - 1)
      centerTileByIndex(prevIndex, 'smooth')
      onSelect(images[prevIndex])
    } else if (event.key === 'ArrowRight') {
      const nextIndex = Math.min(images.length - 1, activeIndex + 1)
      centerTileByIndex(nextIndex, 'smooth')
      onSelect(images[nextIndex])
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="generate-parallel-preview"
      data-generate-reel-proposal="true"
      role="group"
      aria-label="並列画像プレビュー"
      className="relative flex flex-col w-full h-full min-h-0 min-w-0 overflow-hidden select-none outline-none"
    >
      {/* Top Header & Shared Reel Toolbar */}
      <div className="flex w-full items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-surface/50 text-xs shrink-0 select-none min-w-0 overflow-hidden">
        <div data-testid="parallel-preview-page-indicator" className="text-zinc-400 truncate text-xs">
          連続プレビュー · 左端が最新 / 右へ過去 · {images.length === 0 ? '0 / 0 枚' : `${activeIndex + 1} / ${images.length} 枚`}
        </div>
        <div data-testid="generate-reel-toolbar" className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-generate-reel-latest="true"
            aria-label="最新の生成画像へ戻る"
            hidden={scrollLeft < 72}
            style={{ display: scrollLeft < 72 ? 'none' : undefined }}
            onClick={() => {
              stopInertia()
              if (images.length > 0) {
                centerTileByIndex(0, 'smooth')
                onSelect(images[0])
              }
            }}
            className="px-2 py-0.5 rounded text-xs transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            ← 最新へ
          </button>
          <button
            type="button"
            data-generate-reel-oldest="true"
            aria-label="最古の生成画像へ移動"
            disabled={images.length <= 1}
            onClick={() => {
              stopInertia()
              if (images.length > 0) {
                const oldestIndex = images.length - 1
                centerTileByIndex(oldestIndex, 'smooth')
                onSelect(images[oldestIndex])
              }
            }}
            className="px-2 py-0.5 rounded text-xs transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            最古へ →
          </button>
          <button
            type="button"
            data-generate-reel-auto-follow="true"
            aria-pressed={Boolean(previewAutoFollow)}
            title="最新画像の自動追従"
            onClick={() => {
              onToggleAutoFollow?.()
            }}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              previewAutoFollow
                ? 'bg-accent-green/20 text-accent-green font-medium border border-accent-green/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
            }`}
          >
            {previewAutoFollow ? '● 最新追従' : '○ 最新追従'}
          </button>
          <button
            type="button"
            data-generate-reel-session-filter="true"
            aria-pressed={Boolean(filterOwnSession)}
            onClick={() => {
              onToggleFilterOwnSession?.(!filterOwnSession)
            }}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              filterOwnSession
                ? 'bg-accent-blue/20 text-accent-blue font-medium border border-accent-blue/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
            }`}
          >
            {filterOwnSession ? '✓ 自セッション' : '自セッション'}
          </button>
          <button
            type="button"
            data-generate-reel-history-toggle="true"
            aria-expanded={Boolean(isHistoryExpanded)}
            onClick={() => {
              onToggleHistoryExpanded?.()
            }}
            className="px-2 py-0.5 rounded text-xs transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            {isHistoryExpanded ? '履歴を閉じる' : '履歴を展開'}
          </button>
        </div>
      </div>

      {/* Reel Viewport Container */}
      <div
        ref={reelRef}
        role="listbox"
        tabIndex={0}
        aria-label="生成画像の連続プレビュー。左端が最新です"
        data-testid="generate-reel-viewport"
        onKeyDown={onKeyDown}
        className="flex-1 min-h-0 w-full flex items-center gap-3 px-3.5 overflow-x-auto overflow-y-hidden outline-none select-none"
        style={{ overscrollBehaviorX: 'contain' }}
      >
        {images.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            画像がありません
          </div>
        ) : (
          images.map((image, index) => {
            const metrics = allMetrics[index] ?? getTileMetrics(image)
            const isSelected = image === selectedImage

            return (
              <div
                key={`${index}-${image}`}
                role="option"
                aria-selected={isSelected}
                aria-label={index === 0 ? '最新の生成画像' : `${index + 1}枚前の生成画像`}
                data-generate-reel-tile="true"
                data-index={index}
                data-testid={`parallel-preview-item-${index}`}
                className={`group relative shrink-0 overflow-hidden rounded-lg border bg-surface-2 shadow-2xl transition-[border-color,box-shadow] ${
                  isSelected ? 'border-accent-green ring-1 ring-accent-green/50' : 'border-zinc-800 hover:border-zinc-700'
                }`}
                style={{
                  width: metrics.tileWidth,
                  height: metrics.tileHeight,
                  marginLeft: index === 0 ? firstMarginLeft : undefined,
                  marginRight: index === images.length - 1 ? lastMarginRight : undefined,
                }}
              >
                <button
                  type="button"
                  aria-label={`画像 ${image} を開く`}
                  onClick={() => {
                    stopInertia()
                    onSelect(image)
                    onOpen()
                  }}
                  className="absolute inset-0 flex h-full w-full items-center justify-center outline-none"
                >
                  <ProgressivePreviewImage
                    image={image}
                    alt={index === 0 ? '最新の生成画像' : `生成画像 ${index + 1}`}
                    onAspectRatioLoaded={(calculatedAR) => {
                      setLoadedAspectRatios((prev) => {
                        if (prev[image] === calculatedAR) return prev
                        return { ...prev, [image]: calculatedAR }
                      })
                    }}
                    onUnavailable={() => onImageUnavailable?.(image)}
                  />
                </button>
                <span
                  data-generate-reel-meta="true"
                  className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-300 backdrop-blur-sm"
                >
                  {index === 0 ? 'LATEST' : `−${index}`}
                </span>
                <a
                  href={image}
                  download="generated.png"
                  id={images.length === 1 ? 'download-btn' : undefined}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute bottom-2 right-2 z-10 rounded-md border border-white/10 bg-surface/90 px-3 py-1.5 text-xs text-zinc-200 opacity-0 transition-opacity hover:bg-surface focus:opacity-100 group-hover:opacity-100"
                >
                  Download
                </a>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

