import React, { useState, useEffect, useRef } from 'react'

export interface ResizableSplitLayoutProps {
  direction: 'horizontal' | 'vertical';
  first: React.ReactNode;
  second: React.ReactNode;
  initialSize: number;
  minSize: number;
  maxSize?: number;
  storageKey: string;
  className?: string;
  persistenceMode?: 'pixel' | 'ratio';
  resetCycle?: boolean;
}

export function ResizableSplitLayout({
  direction, first, second, initialSize, minSize, maxSize, storageKey,
  className = '', persistenceMode = 'pixel', resetCycle = false
}: ResizableSplitLayoutProps) {
  const readStored = () => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return initialSize
      if (persistenceMode === 'pixel') {
        const parsed = Number.parseInt(stored, 10)
        return Number.isFinite(parsed) ? parsed : initialSize
      }
      const value = JSON.parse(stored) as { version?: number; ratio?: number }
      return value.version === 1 && Number.isFinite(value.ratio) && value.ratio! >= 0 && value.ratio! <= 1
        ? Math.min(0.8, Math.max(0.2, value.ratio!))
        : initialSize
    } catch {
      return initialSize
    }
  }
  const [size, setSize] = useState<number>(readStored)
  const [measuredDimension, setMeasuredDimension] = useState(0)
  const [displayOverride, setDisplayOverride] = useState<number | null>(null)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const customSize = useRef(size)
  const cycle = useRef(0)
  const isRatio = persistenceMode === 'ratio'
  const isH = direction === 'horizontal'

  const getDimension = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    return rect ? (isH ? rect.width : rect.height) : 0
  }
  const bounds = (dimension: number) => {
    const upper = Math.max(minSize, Math.min(maxSize ?? dimension, dimension - minSize))
    return [minSize, upper] as const
  }
  const toPixels = (value: number, dimension: number) => {
    if (dimension <= 0) return isRatio ? initialSize : value
    const [lower, upper] = bounds(dimension)
    return Math.min(upper, Math.max(lower, isRatio ? value * dimension : value))
  }
  useEffect(() => {
    const measure = () => setMeasuredDimension(getDimension())
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' || !containerRef.current
      ? undefined
      : new ResizeObserver(measure)
    if (observer && containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [isH])

  const dimension = measuredDimension
  const pixelSize = displayOverride ?? toPixels(size, dimension)

  useEffect(() => {
    if (displayOverride !== null) return
    try {
      localStorage.setItem(storageKey, isRatio
        ? JSON.stringify({ version: 1, ratio: Math.min(0.8, Math.max(0.2, size)) })
        : size.toString())
    } catch {
      // Storage can be disabled by browser policy; the in-memory split remains usable.
    }
  }, [size, storageKey, isRatio, displayOverride])

  const releaseDrag = () => {
    if (!isDragging.current) return
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const extent = isH ? rect.width : rect.height
      if (extent <= 0) return
      const raw = isH ? e.clientX - rect.left : e.clientY - rect.top
      const [lower, upper] = bounds(extent)
      const next = Math.min(upper, Math.max(lower, raw))
      const value = isRatio ? Math.min(0.8, Math.max(0.2, next / extent)) : next
      setDisplayOverride(null)
      cycle.current = 0
      customSize.current = value
      setSize(value)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', releaseDrag)
    window.addEventListener('pointercancel', releaseDrag)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', releaseDrag)
      window.removeEventListener('pointercancel', releaseDrag)
      releaseDrag()
    }
  }, [isH, isRatio, minSize, maxSize])

  const adjust = (key: string) => {
    const extent = getDimension()
    if (extent <= 0) return
    const current = displayOverride ?? toPixels(size, extent)
    const [lower, upper] = bounds(extent)
    const step = key === 'PageUp' || key === 'PageDown' ? 50 : 16
    let next = current
    if (key === 'Home') next = lower
    else if (key === 'End') next = upper
    else if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageDown') next -= step
    else if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageUp') next += step
    else return
    next = Math.min(upper, Math.max(lower, next))
    const value = isRatio ? next / extent : next
    setDisplayOverride(null)
    cycle.current = 0
    customSize.current = value
    setSize(value)
  }

  const cycleReset = () => {
    if (!resetCycle || dimension <= 0) return
    const [lower, upper] = bounds(dimension)
    if (cycle.current === 0) {
      customSize.current = size
      setDisplayOverride(upper)
      cycle.current = 1
    } else if (cycle.current === 1) {
      setDisplayOverride(lower)
      cycle.current = 2
    } else {
      setDisplayOverride(null)
      setSize(customSize.current)
      cycle.current = 0
    }
  }

  return (
    <div ref={containerRef} className={`flex ${isH ? 'flex-row' : 'flex-col'} w-full h-full overflow-hidden ${className}`}>
      <div style={{ [isH ? 'width' : 'height']: `${pixelSize}px` }} className="flex-shrink-0 overflow-hidden">
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={isH ? 'vertical' : 'horizontal'}
        aria-valuemin={minSize}
        aria-valuemax={dimension > 0 ? bounds(dimension)[1] : maxSize}
        aria-valuenow={Math.round(pixelSize)}
        tabIndex={0}
        onKeyDown={e => adjust(e.key)}
        onDoubleClick={cycleReset}
        onPointerDown={e => {
          e.preventDefault()
          isDragging.current = true
          document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
          document.body.style.userSelect = 'none'
        }}
        className={`flex-shrink-0 relative group transition-colors duration-150 z-30 ${isH ? 'w-[5px] cursor-col-resize hover:bg-accent-green/50 bg-border' : 'h-[5px] cursor-row-resize hover:bg-accent-green/50 bg-border'}`}
      >
        <div className={`absolute inset-0 ${isH ? '-left-1 -right-1' : '-top-1 -bottom-1'}`} />
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">{second}</div>
    </div>
  )
}
