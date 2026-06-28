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
}

export function ResizableSplitLayout({
  direction,
  first,
  second,
  initialSize,
  minSize,
  maxSize,
  storageKey,
  className = ''
}: ResizableSplitLayoutProps) {
  const [size, setSize] = useState<number>(() => {
    const stored = localStorage.getItem(storageKey)
    return stored ? parseInt(stored, 10) : initialSize
  })
  
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(storageKey, size.toString())
  }, [size, storageKey])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      
      let newSize = size
      if (direction === 'horizontal') {
        newSize = e.clientX - containerRect.left
      } else {
        newSize = e.clientY - containerRect.top
      }

      if (newSize < minSize) newSize = minSize
      if (maxSize && newSize > maxSize) newSize = maxSize
      
      const maxBound = direction === 'horizontal' ? containerRect.width : containerRect.height
      if (newSize > maxBound - minSize) newSize = maxBound - minSize

      setSize(newSize)
    }

    const handlePointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [size, direction, minSize, maxSize])

  const isH = direction === 'horizontal'

  return (
    <div 
      ref={containerRef} 
      className={`flex ${isH ? 'flex-row' : 'flex-col'} w-full h-full overflow-hidden ${className}`}
    >
      <div 
        style={{ [isH ? 'width' : 'height']: `${size}px` }} 
        className="flex-shrink-0 overflow-hidden"
      >
        {first}
      </div>
      
      {/* 分割線（ドラッグ領域） */}
      <div
        onPointerDown={handlePointerDown}
        className={`flex-shrink-0 relative group transition-colors duration-150 z-30
          ${isH ? 'w-[5px] cursor-col-resize hover:bg-accent-green/50 bg-border' : 'h-[5px] cursor-row-resize hover:bg-accent-green/50 bg-border'}
        `}
      >
        {/* 当たり判定拡張 */}
        <div className={`absolute inset-0 ${isH ? '-left-1 -right-1' : '-top-1 -bottom-1'}`} />
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {second}
      </div>
    </div>
  )
}
