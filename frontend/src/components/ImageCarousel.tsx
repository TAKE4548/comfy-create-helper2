import React, { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'

interface ImageCarouselProps {
  thumbnailPath?: string | null
  snapshotPaths?: string[] | null
  alt: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  imageAspectRatio?: number
  imageAreaFraction?: number
}

function getImageFrameSize(ratio: number, areaFraction: number, cardWidth: number, cardHeight: number) {
  if (![ratio, cardWidth, cardHeight].every(Number.isFinite) || ratio <= 0 || cardWidth <= 0 || cardHeight <= 0) return null
  const safeAreaFraction = Number.isFinite(areaFraction) && areaFraction > 0
    ? Math.min(areaFraction, 1)
    : 0.58
  const requestedWidth = Math.sqrt(safeAreaFraction * ratio * cardWidth * cardHeight)
  const requestedHeight = Math.sqrt(safeAreaFraction * cardWidth * cardHeight / ratio)
  const scale = Math.min(1, cardWidth / requestedWidth, cardHeight / requestedHeight)
  return { width: requestedWidth * scale, height: requestedHeight * scale }
}

export function ImageCarousel({
  thumbnailPath,
  snapshotPaths,
  alt,
  className = '',
  style,
  children,
  imageAspectRatio,
  imageAreaFraction = 0.58,
}: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)
  const measuredCardSize = useRef<{ width: number; height: number } | null>(null)
  const [imageFrameSize, setImageFrameSize] = useState(() => imageAspectRatio
    ? getImageFrameSize(imageAspectRatio, imageAreaFraction, 200, 300)
    : null)
  const touchStartX = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const clearSuppressedClick = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!imageAspectRatio || !Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0) {
      setImageFrameSize(null)
      return
    }

    const lastMeasuredSize = measuredCardSize.current ?? { width: 200, height: 300 }
    const fallback = getImageFrameSize(imageAspectRatio, imageAreaFraction, lastMeasuredSize.width, lastMeasuredSize.height)
    setImageFrameSize(fallback)
    const card = carouselRef.current?.parentElement
    if (!card || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const nextSize = getImageFrameSize(imageAspectRatio, imageAreaFraction, width, height)
      if (nextSize) {
        measuredCardSize.current = { width, height }
        setImageFrameSize(nextSize)
      }
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [imageAspectRatio, imageAreaFraction])

  // Consolidate unique, non-empty image paths
  const images = Array.from(
    new Set(
      [thumbnailPath, ...(snapshotPaths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const handleMouseLeave = () => {
    setIsHovered(false)
    setActiveIndex(0) // Reset to primary thumbnail
  }

  const handleTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }
  const handleTouchEnd = (event: TouchEvent) => {
    const startX = touchStartX.current
    touchStartX.current = null
    const endX = event.changedTouches[0]?.clientX
    if (startX === null || endX === undefined || images.length < 2 || Math.abs(endX - startX) < 35) return
    setActiveIndex((current) => Math.max(0, Math.min(images.length - 1, current + (endX < startX ? 1 : -1))))
    suppressClick.current = true
    if (clearSuppressedClick.current) clearTimeout(clearSuppressedClick.current)
    clearSuppressedClick.current = setTimeout(() => { suppressClick.current = false }, 700)
  }
  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(images.length - 1, 0)))
    const element = carouselRef.current
    if (!element) return
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
      if (clearSuppressedClick.current) clearTimeout(clearSuppressedClick.current)
    }
  }, [images.length])
  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    if (clearSuppressedClick.current) clearTimeout(clearSuppressedClick.current)
    clearSuppressedClick.current = null
    event.preventDefault()
    event.stopPropagation()
  }

  if (images.length === 0) {
    if (!imageFrameSize) {
      return (
        <div
          ref={carouselRef}
          data-testid="image-carousel"
          className={`bg-zinc-950 flex flex-col items-center justify-center text-zinc-600 relative overflow-hidden ${className}`}
          style={style}
          onClickCapture={handleClickCapture}
        >
          <ImageOff size={28} strokeWidth={1} />
          <span className="text-[10px] mt-1">No Preview</span>
          {children}
        </div>
      )
    }

    return (
      <div
        ref={carouselRef}
        data-testid="image-carousel"
        className={`group flex items-start justify-start text-zinc-600 relative overflow-hidden ${className}`}
        style={{ ...style, width: '100%', height: imageFrameSize.height, flexShrink: 0 }}
        onClickCapture={handleClickCapture}
      >
        <div
          data-testid="image-carousel-frame"
          className="bg-zinc-950 flex h-full flex-col items-center justify-center text-zinc-600 overflow-hidden"
          style={{ width: imageFrameSize.width, height: imageFrameSize.height }}
        >
          <ImageOff size={28} strokeWidth={1} />
          <span className="text-[10px] mt-1">No Preview</span>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div
      ref={carouselRef}
      className={`relative overflow-hidden group ${className}`}
      style={imageFrameSize ? { ...style, width: '100%', height: imageFrameSize.height, flexShrink: 0 } : style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClickCapture={handleClickCapture}
      data-testid="image-carousel"
    >
      {/* Active Image */}
      {imageFrameSize ? (
        <div
          data-testid="image-carousel-frame"
          className="absolute left-0 top-0 h-full overflow-hidden"
          style={{ width: imageFrameSize.width, height: imageFrameSize.height }}
        >
          <img
            src={images[activeIndex]}
            alt={`${alt} preview ${activeIndex + 1}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-all duration-300 pointer-events-none select-none"
          />
        </div>
      ) : (
        <img
          src={images[activeIndex]}
          alt={`${alt} preview ${activeIndex + 1}`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-all duration-300 pointer-events-none select-none"
        />
      )}

      {/* Hover scrubbing zones */}
      {images.length > 1 && isHovered && (
        <div className="absolute inset-0 flex z-10">
          {images.map((_, idx) => (
            <div
              key={idx}
              data-testid={`image-carousel-scrub-${idx}`}
              className="flex-1 h-full cursor-pointer"
              onMouseEnter={() => setActiveIndex(idx)}
            />
          ))}
        </div>
      )}

      {/* Progress indicators at the bottom */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-2 right-2 flex gap-1 z-20 pointer-events-none">
          {images.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                idx === activeIndex
                  ? 'bg-accent-green'
                  : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Overlays / Children (e.g. edit/delete buttons) */}
      <div className="absolute inset-0 pointer-events-auto z-30">
        {children}
      </div>
    </div>
  )
}
