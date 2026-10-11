import React, { useState, useRef, useEffect, useCallback } from 'react'

export interface CurtainCompareViewProps {
  imageA: string
  imageB?: string
  initialSplit?: number // 0 - 100, default: 50
  onClose?: () => void
  onKeep?: (image: string) => void
  onDiscard?: (image: string) => void
}

export const CurtainCompareView: React.FC<CurtainCompareViewProps> = ({
  imageA,
  imageB,
  initialSplit = 50,
  onClose,
  onKeep,
  onDiscard,
}) => {
  const [zoom, setZoom] = useState<number>(1.0)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [splitPercent, setSplitPercent] = useState<number>(() =>
    Math.max(0, Math.min(100, initialSplit))
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const isDraggingSplitRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    if (initialSplit !== undefined) {
      setSplitPercent(Math.max(0, Math.min(100, initialSplit)))
    }
  }, [initialSplit])

  const getActiveImage = useCallback(() => {
    if (!imageB) return imageA
    return splitPercent <= 50 ? imageA : imageB
  }, [imageA, imageB, splitPercent])

  // Mouse wheel zoom (1.0 to 4.0)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const step = 0.2
    const delta = e.deltaY < 0 ? step : -step
    setZoom((prevZoom) => {
      const nextZoom = Math.min(4.0, Math.max(1.0, parseFloat((prevZoom + delta).toFixed(2))))
      if (nextZoom === 1.0) {
        setPan({ x: 0, y: 0 })
      }
      return nextZoom
    })
  }

  // Pan handlers
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-testid="curtain-split-divider"]')) {
      return
    }
    if ((e.target as HTMLElement).closest('button')) {
      return
    }
    if (e.button !== undefined && e.button !== 0) return

    isPanningRef.current = true
    panStartRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 }
    initialPanRef.current = { ...pan }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement> | PointerEvent) => {
    if (!isPanningRef.current) return
    const dx = (e.clientX ?? 0) - panStartRef.current.x
    const dy = (e.clientY ?? 0) - panStartRef.current.y
    setPan({
      x: initialPanRef.current.x + dx,
      y: initialPanRef.current.y + dy,
    })
  }

  const handleContainerPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    isPanningRef.current = false
    if (e) {
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  // Split drag handlers
  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingSplitRef.current = true
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }

  const updateSplitFromClientX = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width > 0) {
      const rawPercent = ((clientX - rect.left) / rect.width) * 100
      const clamped = Math.max(0, Math.min(100, rawPercent))
      setSplitPercent(Math.round(clamped * 10) / 10)
    }
  }, [])

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplitRef.current) return
    updateSplitFromClientX(e.clientX)
  }

  const handleSplitPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSplitRef.current = false
    if (e) {
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  // Global window listeners for smooth dragging outside element bounds
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (isPanningRef.current) {
        handleContainerPointerMove(e)
      } else if (isDraggingSplitRef.current) {
        updateSplitFromClientX(e.clientX)
      }
    }

    const onWindowPointerUp = () => {
      isPanningRef.current = false
      isDraggingSplitRef.current = false
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [updateSplitFromClientX])

  // Keyboard shortcuts: [Esc] Close, [Space] Toggle, [K] Keep, [D] Discard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (imageB) {
          setSplitPercent((prev) => (prev >= 50 ? 0 : 100))
        }
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        onKeep?.(getActiveImage())
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        onDiscard?.(getActiveImage())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [imageB, getActiveImage, onClose, onKeep, onDiscard])

  const resetZoomAndPan = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      data-testid="curtain-compare-container"
      className="relative w-full h-full overflow-hidden flex items-center justify-center select-none cursor-default"
      onWheel={handleWheel}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onDoubleClick={resetZoomAndPan}
    >
      {/* Base Image A */}
      <img
        src={imageA}
        alt="A"
        data-testid="curtain-image-a"
        style={{
          transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
        }}
        className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-75"
      />

      {/* Overlaid Image B with clip-path */}
      {imageB && (
        <div
          data-testid="curtain-image-b-wrapper"
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
        >
          <img
            src={imageB}
            alt="B"
            data-testid="curtain-image-b"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            }}
            className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-75"
          />
        </div>
      )}

      {/* Split Divider */}
      {imageB && (
        <div
          data-testid="curtain-split-divider"
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          style={{ left: `${splitPercent}%` }}
          className="absolute top-0 bottom-0 w-1 bg-accent-green cursor-ew-resize -translate-x-1/2 flex items-center justify-center z-20"
        >
          <div
            data-testid="curtain-split-handle"
            className="w-8 h-8 rounded-full bg-accent-green text-black flex items-center justify-center text-xs font-bold shadow-lg pointer-events-auto"
          >
            ◀▶
          </div>
        </div>
      )}

      {/* Toolbar Overlay */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 bg-zinc-900/90 border border-zinc-700/60 rounded-full shadow-xl text-xs text-zinc-200">
        <span data-testid="zoom-indicator" className="font-mono text-zinc-400">
          {Math.round(zoom * 100)}%
        </span>

        {zoom !== 1.0 && (
          <button
            type="button"
            data-testid="reset-zoom-button"
            onClick={resetZoomAndPan}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            Reset
          </button>
        )}

        {imageB && (
          <>
            <span className="text-zinc-600">|</span>
            <span data-testid="split-indicator" className="font-mono text-accent-green">
              Split: {Math.round(splitPercent)}%
            </span>
            <button
              type="button"
              data-testid="toggle-split-button"
              onClick={() => setSplitPercent((prev) => (prev >= 50 ? 0 : 100))}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="Space to toggle"
            >
              Toggle (Space)
            </button>
          </>
        )}

        {(onKeep || onDiscard) && <span className="text-zinc-600">|</span>}

        {onKeep && (
          <button
            type="button"
            data-testid="keep-button"
            onClick={() => onKeep(getActiveImage())}
            className="px-2.5 py-0.5 rounded bg-accent-green text-black font-semibold hover:opacity-90"
            title="Press [K] to Keep"
          >
            Keep [K]
          </button>
        )}

        {onDiscard && (
          <button
            type="button"
            data-testid="discard-button"
            onClick={() => onDiscard(getActiveImage())}
            className="px-2.5 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white font-semibold"
            title="Press [D] to Discard"
          >
            Discard [D]
          </button>
        )}

        {onClose && (
          <>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              data-testid="close-button"
              onClick={onClose}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
              title="Press [Esc] to Close"
            >
              Close [Esc]
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default CurtainCompareView
