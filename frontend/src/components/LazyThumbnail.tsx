import React, { useState, useEffect, useRef } from 'react'

export interface LazyThumbnailProps {
  src: string
  alt: string
  containerRef?: React.RefObject<HTMLElement | null>
  className?: string
  style?: React.CSSProperties
  rootMargin?: string
  onError?: () => void
}

export function LazyThumbnail({
  src,
  alt,
  containerRef,
  className = '',
  style,
  rootMargin = '0px 150px 0px 150px',
  onError,
}: LazyThumbnailProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const elRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // IntersectionObserver 未サポート環境への安全なフォールバック
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const node = elRef.current
    if (!node) return

    const rootNode = containerRef?.current || null
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true)
            observer.unobserve(entry.target)
          }
        }
      },
      {
        root: rootNode,
        rootMargin,
        threshold: 0.01,
      }
    )

    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [containerRef, rootMargin])

  return (
    <div ref={elRef} className="w-full h-full relative overflow-hidden bg-zinc-850">
      {isVisible ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            onError?.()
          }}
          className={`${className} transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={style}
        />
      ) : null}
      {!isLoaded && (
        <div className="absolute inset-0 bg-zinc-800/50 animate-pulse pointer-events-none" />
      )}
    </div>
  )
}
