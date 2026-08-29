import React, { useState } from 'react'
import { ImageOff } from 'lucide-react'

interface ImageCarouselProps {
  thumbnailPath?: string | null
  snapshotPaths?: string[] | null
  alt: string
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

export function ImageCarousel({
  thumbnailPath,
  snapshotPaths,
  alt,
  className = '',
  style,
  children,
}: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

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

  if (images.length === 0) {
    return (
      <div
        className={`bg-surface-2 flex flex-col items-center justify-center text-zinc-600 relative overflow-hidden ${className}`}
        style={style}
      >
        <ImageOff size={28} strokeWidth={1} />
        <span className="text-[10px] mt-1">No Preview</span>
        {children}
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden group ${className}`}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {/* Active Image */}
      <img
        src={images[activeIndex]}
        alt={`${alt} preview ${activeIndex + 1}`}
        className="w-full h-full object-cover transition-all duration-300 pointer-events-none select-none"
      />

      {/* Hover scrubbing zones */}
      {images.length > 1 && isHovered && (
        <div className="absolute inset-0 flex z-10">
          {images.map((_, idx) => (
            <div
              key={idx}
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
