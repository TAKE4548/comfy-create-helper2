import React, { useState, useEffect, useRef } from 'react'
import type { BubbleCandidate } from '../../../api/types'
import type { SpeechBubble, BubbleStyleConfig } from '../../../types/speechBubble'
import {
  DEFAULT_BUBBLE_BOUNDS,
  extractBubbleStyle,
  saveLastUsedBubbleStyle,
} from '../../../types/speechBubble'
import {
  drawSpeechBubble,
  clampTailApexOutsideBubble,
  getTailContactPositions,
} from '../../../utils/speechBubbleRenderer'
import type { MobileTab, DraggingState, ROI } from '../types'

export interface UseBubbleCanvasInteractionOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  miniCanvasRef: React.RefObject<HTMLCanvasElement | null>
  imageObj: HTMLImageElement | null
  bubbles: SpeechBubble[]
  setBubbles: React.Dispatch<React.SetStateAction<SpeechBubble[]>>
  selectedBubbleId: string | null
  setSelectedBubbleId: (id: string | null) => void
  activeFontFamily: string
  scaleX: number
  scaleY: number
  showDebugPanel: boolean
  candidates: BubbleCandidate[]
  hoveredCandidate: BubbleCandidate | null
  activeMobileTab: MobileTab
  createBubbleFromStyle: (params: {
    id?: string
    x: number
    y: number
    w?: number
    h?: number
    text?: string
    tail?: { x: number; y: number }
  }) => SpeechBubble
  setLastUsedStyle: React.Dispatch<React.SetStateAction<BubbleStyleConfig>>
  onROISubmit: (roi: ROI) => Promise<void>
  isDrafting?: boolean
}

export interface UseBubbleCanvasInteractionReturn {
  draggingState: DraggingState | null
  setDraggingState: React.Dispatch<React.SetStateAction<DraggingState | null>>
  cursorStyle: string
  setCursorStyle: React.Dispatch<React.SetStateAction<string>>
  isDrawingROI: boolean
  setIsDrawingROI: React.Dispatch<React.SetStateAction<boolean>>
  dragStart: { x: number; y: number } | null
  setDragStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  currentROI: ROI | null
  setCurrentROI: React.Dispatch<React.SetStateAction<ROI | null>>
  lastUsedROI: ROI | null
  setLastUsedROI: React.Dispatch<React.SetStateAction<ROI | null>>
  miniPreviewHeight: number
  setMiniPreviewHeight: React.Dispatch<React.SetStateAction<number>>
  handleResizeStart: (clientY: number) => void
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleMouseUp: () => Promise<void>
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void
  handleTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void
  handleTouchEnd: () => Promise<void>
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseUp: () => Promise<void>
  onDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void
  onTouchEnd: () => Promise<void>
}

export function getLocalBubblePoint(
  x: number,
  y: number,
  bubble: SpeechBubble,
  scaleX: number,
  scaleY: number
): { x: number; y: number } {
  const rotation = bubble.rotation || 0
  if (rotation === 0) return { x, y }
  const cx = (bubble.x + bubble.w / 2) * scaleX
  const cy = (bubble.y + bubble.h / 2) * scaleY
  const rad = (-rotation * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  return {
    x: cx + (dx * Math.cos(rad) - dy * Math.sin(rad)),
    y: cy + (dx * Math.sin(rad) + dy * Math.cos(rad)),
  }
}

export function useBubbleCanvasInteraction({
  canvasRef,
  miniCanvasRef,
  imageObj,
  bubbles,
  setBubbles,
  selectedBubbleId,
  setSelectedBubbleId,
  activeFontFamily,
  scaleX,
  scaleY,
  showDebugPanel,
  candidates,
  hoveredCandidate,
  activeMobileTab,
  createBubbleFromStyle,
  setLastUsedStyle,
  onROISubmit,
  isDrafting = false,
}: UseBubbleCanvasInteractionOptions): UseBubbleCanvasInteractionReturn {
  // Canvas interaction state
  const [draggingState, setDraggingState] = useState<DraggingState | null>(null)
  const [cursorStyle, setCursorStyle] = useState<string>('default')
  const [isDrawingROI, setIsDrawingROI] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [currentROI, setCurrentROI] = useState<ROI | null>(null)
  const [lastUsedROI, setLastUsedROI] = useState<ROI | null>(null)

  // Mini preview resize state
  const [miniPreviewHeight, setMiniPreviewHeight] = useState<number>(180)
  const resizeStartYRef = useRef<number | null>(null)
  const startHeightRef = useRef<number>(180)

  // Double submit / drag suppression guard
  const isSubmittingRef = useRef<boolean>(false)

  // Handle mini preview resize drag
  const handleResizeStart = (clientY: number) => {
    resizeStartYRef.current = clientY
    startHeightRef.current = miniPreviewHeight
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (resizeStartYRef.current !== null) {
        const delta = e.clientY - resizeStartYRef.current
        setMiniPreviewHeight(Math.max(100, Math.min(380, startHeightRef.current + delta)))
      }
    }
    const onMouseUp = () => {
      resizeStartYRef.current = null
    }
    const onTouchMove = (e: TouchEvent) => {
      if (resizeStartYRef.current !== null && e.touches.length > 0) {
        const delta = e.touches[0].clientY - resizeStartYRef.current
        setMiniPreviewHeight(Math.max(100, Math.min(380, startHeightRef.current + delta)))
      }
    }
    const onTouchEnd = () => {
      resizeStartYRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Draw loop
  useEffect(() => {
    if (!imageObj) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw background image
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height)

    // Draw all speech bubbles
    bubbles.forEach((bubble) => {
      const isSelected = bubble.id === selectedBubbleId
      drawSpeechBubble(ctx, bubble, isSelected, scaleX, scaleY, activeFontFamily)
    })

    // Draw all debug candidates if panel is open
    if (showDebugPanel && candidates) {
      candidates.forEach((c) => {
        if (hoveredCandidate && hoveredCandidate.id === c.id) return
        ctx.strokeStyle = c.status === 'PASS' ? 'rgba(62, 207, 142, 0.4)' : 'rgba(239, 68, 68, 0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([2, 2])
        ctx.strokeRect(c.x * scaleX, c.y * scaleY, c.w * scaleX, c.h * scaleY)
        ctx.setLineDash([])
      })
    }

    // Draw hovered candidate box in orange
    if (hoveredCandidate) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2.5
      ctx.strokeRect(
        hoveredCandidate.x * scaleX,
        hoveredCandidate.y * scaleY,
        hoveredCandidate.w * scaleX,
        hoveredCandidate.h * scaleY
      )
      ctx.fillStyle = '#f59e0b'
      ctx.font = 'bold 10px sans-serif'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(
        `#${hoveredCandidate.id} (${hoveredCandidate.status})`,
        hoveredCandidate.x * scaleX + 4,
        hoveredCandidate.y * scaleY + 4
      )
    }

    // Draw ROI selection rect
    if (isDrawingROI && dragStart && currentROI) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.strokeRect(currentROI.x, currentROI.y, currentROI.w, currentROI.h)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'
      ctx.fillRect(currentROI.x, currentROI.y, currentROI.w, currentROI.h)
      ctx.setLineDash([])
    }

    // Draw on mini preview canvas (if rendered in DOM)
    if (miniCanvasRef.current && imageObj) {
      const miniCtx = miniCanvasRef.current.getContext('2d')
      if (miniCtx) {
        miniCtx.clearRect(0, 0, miniCanvasRef.current.width, miniCanvasRef.current.height)
        miniCtx.drawImage(imageObj, 0, 0, miniCanvasRef.current.width, miniCanvasRef.current.height)
        bubbles.forEach((bubble) => {
          const isSelected = bubble.id === selectedBubbleId
          drawSpeechBubble(miniCtx, bubble, isSelected, scaleX, scaleY, activeFontFamily)
        })
      }
    }
  }, [
    canvasRef,
    miniCanvasRef,
    imageObj,
    bubbles,
    selectedBubbleId,
    activeFontFamily,
    isDrawingROI,
    dragStart,
    currentROI,
    scaleX,
    scaleY,
    showDebugPanel,
    candidates,
    hoveredCandidate,
    activeMobileTab,
    miniPreviewHeight,
  ])

  // Canvas Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrafting || isSubmittingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const activeBubble = bubbles.find((b) => b.id === selectedBubbleId)

    // 1. Check if clicking rotation handle or any resize handle on the selected bubble
    if (activeBubble) {
      const localPt = getLocalBubblePoint(x, y, activeBubble, scaleX, scaleY)
      const bx = activeBubble.x * scaleX
      const by = activeBubble.y * scaleY
      const bw = activeBubble.w * scaleX
      const bh = activeBubble.h * scaleY
      const hs = 10

      // Check rotation handle (top center offset -20px)
      const rotHx = bx + bw / 2
      const rotHy = by - 20
      if (Math.hypot(localPt.x - rotHx, localPt.y - rotHy) <= 10) {
        setDraggingState({
          type: 'rotate',
          bubbleId: activeBubble.id,
          startX: x,
          startY: y,
          initialBubble: { ...activeBubble },
        })
        return
      }

      const handles: { handle: 'nw' | 'ne' | 'se' | 'sw'; hx: number; hy: number }[] = [
        { handle: 'nw', hx: bx, hy: by },
        { handle: 'ne', hx: bx + bw, hy: by },
        { handle: 'se', hx: bx + bw, hy: by + bh },
        { handle: 'sw', hx: bx, hy: by + bh },
      ]

      for (const h of handles) {
        if (Math.hypot(localPt.x - h.hx, localPt.y - h.hy) <= hs) {
          setDraggingState({
            type: 'resize',
            handle: h.handle,
            bubbleId: activeBubble.id,
            startX: x,
            startY: y,
            initialBubble: { ...activeBubble },
          })
          return
        }
      }

      // Check tail base handles if fine tuning
      if (activeBubble.tail && activeBubble.tail.isFineTuning) {
        const contacts = getTailContactPositions(activeBubble, scaleX, scaleY)
        if (contacts) {
          if (Math.hypot(localPt.x - contacts.p1.x, localPt.y - contacts.p1.y) <= 12) {
            setDraggingState({
              type: 'tail-base-1',
              bubbleId: activeBubble.id,
              startX: x,
              startY: y,
              initialBubble: { ...activeBubble },
            })
            return
          }
          if (Math.hypot(localPt.x - contacts.p2.x, localPt.y - contacts.p2.y) <= 12) {
            setDraggingState({
              type: 'tail-base-2',
              bubbleId: activeBubble.id,
              startX: x,
              startY: y,
              initialBubble: { ...activeBubble },
            })
            return
          }
        }
      }

      // Check tail handle of activeBubble
      if (activeBubble.tail) {
        const tx = activeBubble.tail.x * scaleX
        const ty = activeBubble.tail.y * scaleY
        const dist = Math.hypot(localPt.x - tx, localPt.y - ty)
        if (dist <= 12) {
          setDraggingState({
            type: 'tail',
            bubbleId: activeBubble.id,
            startX: x,
            startY: y,
            initialBubble: { ...activeBubble },
          })
          return
        }
      }
    }

    // 2. Check if clicking inside any bubble (in reverse order to hit top-most)
    const reversedBubbles = [...bubbles].reverse()
    for (const b of reversedBubbles) {
      const localPt = getLocalBubblePoint(x, y, b, scaleX, scaleY)
      const bx = b.x * scaleX
      const by = b.y * scaleY
      const bw = b.w * scaleX
      const bh = b.h * scaleY

      if (localPt.x >= bx && localPt.x <= bx + bw && localPt.y >= by && localPt.y <= by + bh) {
        setSelectedBubbleId(b.id)
        const style = extractBubbleStyle(b)
        setLastUsedStyle((prev) => ({ ...prev, ...style }))
        saveLastUsedBubbleStyle(style)
        setDraggingState({
          type: 'bubble',
          bubbleId: b.id,
          startX: x,
          startY: y,
          initialBubble: { ...b },
        })
        return
      }
    }

    // 3. Otherwise start ROI selection or deselect
    setSelectedBubbleId(null)
    setIsDrawingROI(true)
    setDragStart({ x, y })
    setCurrentROI({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrafting || isSubmittingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (draggingState) {
      const dx = Math.round((x - draggingState.startX) / scaleX)
      const dy = Math.round((y - draggingState.startY) / scaleY)
      const initB = draggingState.initialBubble

      if (draggingState.type === 'rotate') {
        const cx = (initB.x + initB.w / 2) * scaleX
        const cy = (initB.y + initB.h / 2) * scaleY
        const rad = Math.atan2(y - cy, x - cx)
        let deg = (rad * 180) / Math.PI + 90
        while (deg > 180) deg -= 360
        while (deg < -180) deg += 360
        const rounded = Math.round(deg)
        setBubbles((prev) =>
          prev.map((b) => (b.id === draggingState.bubbleId ? { ...b, rotation: rounded } : b))
        )
        return
      }

      if (draggingState.type === 'bubble') {
        setBubbles((prev) =>
          prev.map((b) => {
            if (b.id !== draggingState.bubbleId) return b
            return {
              ...b,
              x: initB.x + dx,
              y: initB.y + dy,
              tail: initB.tail
                ? {
                    ...initB.tail,
                    x: initB.tail.x + dx,
                    y: initB.tail.y + dy,
                  }
                : undefined,
            }
          })
        )
      } else if (draggingState.type === 'tail') {
        const rawTx = Math.round(x / scaleX)
        const rawTy = Math.round(y / scaleY)
        const clamped = clampTailApexOutsideBubble(initB, rawTx, rawTy)
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === draggingState.bubbleId ? { ...b, tail: { ...b.tail, x: clamped.x, y: clamped.y } } : b
          )
        )
      } else if (draggingState.type === 'tail-base-1') {
        const localPt = getLocalBubblePoint(x, y, initB, scaleX, scaleY)
        const cx = (initB.x + initB.w / 2) * scaleX
        const cy = (initB.y + initB.h / 2) * scaleY
        const angle = Math.atan2(localPt.y - cy, localPt.x - cx)
        setBubbles((prev) =>
          prev.map((b) => {
            if (b.id !== draggingState.bubbleId || !b.tail) return b
            return {
              ...b,
              tail: {
                ...b.tail,
                baseAngle1: Math.round(angle * 1000) / 1000,
              },
            }
          })
        )
      } else if (draggingState.type === 'tail-base-2') {
        const localPt = getLocalBubblePoint(x, y, initB, scaleX, scaleY)
        const cx = (initB.x + initB.w / 2) * scaleX
        const cy = (initB.y + initB.h / 2) * scaleY
        const angle = Math.atan2(localPt.y - cy, localPt.x - cx)
        setBubbles((prev) =>
          prev.map((b) => {
            if (b.id !== draggingState.bubbleId || !b.tail) return b
            return {
              ...b,
              tail: {
                ...b.tail,
                baseAngle2: Math.round(angle * 1000) / 1000,
              },
            }
          })
        )
      } else if (draggingState.type === 'resize' && draggingState.handle) {
        let newX = initB.x
        let newY = initB.y
        let newW = initB.w
        let newH = initB.h

        const minSize = 30

        if (draggingState.handle === 'se') {
          newW = Math.max(minSize, initB.w + dx)
          newH = Math.max(minSize, initB.h + dy)
        } else if (draggingState.handle === 'sw') {
          const wCandidate = initB.w - dx
          if (wCandidate >= minSize) {
            newX = initB.x + dx
            newW = wCandidate
          } else {
            newX = initB.x + (initB.w - minSize)
            newW = minSize
          }
          newH = Math.max(minSize, initB.h + dy)
        } else if (draggingState.handle === 'ne') {
          newW = Math.max(minSize, initB.w + dx)
          const hCandidate = initB.h - dy
          if (hCandidate >= minSize) {
            newY = initB.y + dy
            newH = hCandidate
          } else {
            newY = initB.y + (initB.h - minSize)
            newH = minSize
          }
        } else if (draggingState.handle === 'nw') {
          const wCandidate = initB.w - dx
          if (wCandidate >= minSize) {
            newX = initB.x + dx
            newW = wCandidate
          } else {
            newX = initB.x + (initB.w - minSize)
            newW = minSize
          }
          const hCandidate = initB.h - dy
          if (hCandidate >= minSize) {
            newY = initB.y + dy
            newH = hCandidate
          } else {
            newY = initB.y + (initB.h - minSize)
            newH = minSize
          }
        }

        setBubbles((prev) =>
          prev.map((b) => (b.id === draggingState.bubbleId ? { ...b, x: newX, y: newY, w: newW, h: newH } : b))
        )
      }
      return
    }

    // Cursor style update on hover
    const activeBubble = bubbles.find((b) => b.id === selectedBubbleId)
    if (activeBubble) {
      const localPt = getLocalBubblePoint(x, y, activeBubble, scaleX, scaleY)
      const bx = activeBubble.x * scaleX
      const by = activeBubble.y * scaleY
      const bw = activeBubble.w * scaleX
      const bh = activeBubble.h * scaleY
      const hs = 10

      // Rotation handle hover
      const rotHx = bx + bw / 2
      const rotHy = by - 20
      if (Math.hypot(localPt.x - rotHx, localPt.y - rotHy) <= 10) {
        setCursorStyle('grab')
        return
      }

      if (Math.hypot(localPt.x - bx, localPt.y - by) <= hs || Math.hypot(localPt.x - (bx + bw), localPt.y - (by + bh)) <= hs) {
        setCursorStyle('nwse-resize')
        return
      } else if (Math.hypot(localPt.x - (bx + bw), localPt.y - by) <= hs || Math.hypot(localPt.x - bx, localPt.y - (by + bh)) <= hs) {
        setCursorStyle('nesw-resize')
        return
      } else if (
        activeBubble.tail &&
        activeBubble.tail.isFineTuning &&
        (() => {
          const contacts = getTailContactPositions(activeBubble, scaleX, scaleY)
          return (
            contacts &&
            (Math.hypot(localPt.x - contacts.p1.x, localPt.y - contacts.p1.y) <= 12 ||
              Math.hypot(localPt.x - contacts.p2.x, localPt.y - contacts.p2.y) <= 12)
          )
        })()
      ) {
        setCursorStyle('pointer')
        return
      } else if (activeBubble.tail && Math.hypot(localPt.x - activeBubble.tail.x * scaleX, localPt.y - activeBubble.tail.y * scaleY) <= 12) {
        setCursorStyle('pointer')
        return
      } else if (localPt.x >= bx && localPt.x <= bx + bw && localPt.y >= by && localPt.y <= by + bh) {
        setCursorStyle('move')
        return
      }
    }

    setCursorStyle('crosshair')

    if (isDrawingROI && dragStart) {
      const roiX = Math.min(dragStart.x, x)
      const roiY = Math.min(dragStart.y, y)
      const roiW = Math.abs(dragStart.x - x)
      const roiH = Math.abs(dragStart.y - y)
      setCurrentROI({ x: roiX, y: roiY, w: roiW, h: roiH })
    }
  }

  const handleMouseUp = async () => {
    if (draggingState) {
      setDraggingState(null)
      return
    }

    if (!isDrawingROI || !dragStart || !currentROI) return
    setIsDrawingROI(false)
    setDragStart(null)

    if (currentROI.w < 10 || currentROI.h < 10) {
      setCurrentROI(null)
      return
    }

    if (isDrafting || isSubmittingRef.current) {
      setCurrentROI(null)
      return
    }

    const originalROI: ROI = {
      x: Math.round(currentROI.x / scaleX),
      y: Math.round(currentROI.y / scaleY),
      w: Math.round(currentROI.w / scaleX),
      h: Math.round(currentROI.h / scaleY),
    }

    setLastUsedROI(originalROI)
    isSubmittingRef.current = true
    try {
      await onROISubmit(originalROI)
    } finally {
      isSubmittingRef.current = false
      setCurrentROI(null)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrafting || isSubmittingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const cx = Math.round(x / scaleX)
    const cy = Math.round(y / scaleY)

    const newBubble = createBubbleFromStyle({
      x: Math.max(0, cx - 80),
      y: Math.max(0, cy - 70),
      w: DEFAULT_BUBBLE_BOUNDS.w,
      h: DEFAULT_BUBBLE_BOUNDS.h,
      tail: { x: cx - 30, y: cy + 90 },
    })

    setBubbles((prev) => [...prev, newBubble])
    setSelectedBubbleId(newBubble.id)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const fakeMouseEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
    } as unknown as React.MouseEvent<HTMLCanvasElement>
    handleMouseDown(fakeMouseEvent)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const fakeMouseEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
    } as unknown as React.MouseEvent<HTMLCanvasElement>
    handleMouseMove(fakeMouseEvent)
  }

  const handleTouchEnd = async () => {
    await handleMouseUp()
  }

  return {
    draggingState,
    setDraggingState,
    cursorStyle,
    setCursorStyle,
    isDrawingROI,
    setIsDrawingROI,
    dragStart,
    setDragStart,
    currentROI,
    setCurrentROI,
    lastUsedROI,
    setLastUsedROI,
    miniPreviewHeight,
    setMiniPreviewHeight,
    handleResizeStart,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    // Event handler aliases
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onDoubleClick: handleDoubleClick,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }
}
