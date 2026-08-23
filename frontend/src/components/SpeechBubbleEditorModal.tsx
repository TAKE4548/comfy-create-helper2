import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Save, Image as ImageIcon } from 'lucide-react'
import { snapshotsApi, albumsApi, llmPromptsApi, fontsApi } from '../api/client'
import { useAlbums } from '../hooks/useAlbums'
import { STALE_TIMES } from '../constants/staleTimes'
import type { SnapshotSummary, BubbleCandidate, ServerFont } from '../api/types'
import type { SpeechBubble, BubbleStyleConfig } from '../types/speechBubble'
import {
  DEFAULT_BUBBLE_BOUNDS,
  extractBubbleStyle,
  loadLastUsedBubbleStyle,
  saveLastUsedBubbleStyle,
} from '../types/speechBubble'
import { drawSpeechBubble } from '../utils/speechBubbleRenderer'
import { SpeechBubbleControls } from './SpeechBubbleControls'
import { BaseImageSelectModal, type BaseImageOption } from './BaseImageSelectModal'
import { LS_KEYS } from '../utils/localStorageKeys'

export type MobileTab = 'preview' | 'controls'

export interface SpeechBubbleEditorModalProps {
  snapshot: SnapshotSummary
  initialAlbumId?: number
  onClose: () => void
  onSaved: () => void
}

export function SpeechBubbleEditorModal({
  snapshot,
  initialAlbumId,
  onClose,
  onSaved,
}: SpeechBubbleEditorModalProps) {
  const qc = useQueryClient()
  const { albums } = useAlbums(true)
  const { data: fontList = [] } = useQuery<ServerFont[]>({
    queryKey: ['fonts'],
    queryFn: fontsApi.list,
    staleTime: STALE_TIMES.FONTS,
  })

  const [bubbles, setBubbles] = useState<SpeechBubble[]>([])
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null)
  const [selectedFont, setSelectedFont] = useState<string>('')
  const [lastUsedStyle, setLastUsedStyle] = useState<BubbleStyleConfig>(() => loadLastUsedBubbleStyle())
  const [activeFontFamily, setActiveFontFamily] = useState<string>('sans-serif')
  const [isFontLoading, setIsFontLoading] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('preview')
  const [currentSourceSnapshotId, setCurrentSourceSnapshotId] = useState<number>(snapshot.id)
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(snapshot.image_path || '')
  const [isImageSelectOpen, setIsImageSelectOpen] = useState<boolean>(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [candidates, setCandidates] = useState<BubbleCandidate[]>([])
  const [isDebugLoading, setIsDebugLoading] = useState(false)
  const [hoveredCandidate, setHoveredCandidate] = useState<BubbleCandidate | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('pass')
  const [sortBy, setSortBy] = useState<'area_desc' | 'area_asc' | 'brightness_desc' | 'distance_center' | 'id'>('area_desc')
  const [lastUsedROI, setLastUsedROI] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // Save mode and album settings
  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new')
  const [targetAlbumId, setTargetAlbumId] = useState<number | 'new' | ''>(() => {
    try {
      const saved = localStorage.getItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH)
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved)
      }
    } catch {}
    if (initialAlbumId !== undefined) return initialAlbumId
    return 'new'
  })
  const [newAlbumName, setNewAlbumName] = useState('')

  useEffect(() => {
    if (typeof targetAlbumId === 'number' && albums && albums.length > 0) {
      const exists = albums.some((a) => a.id === targetAlbumId)
      if (!exists) {
        if (initialAlbumId !== undefined && albums.some((a) => a.id === initialAlbumId)) {
          setTargetAlbumId(initialAlbumId)
        } else {
          setTargetAlbumId('new')
        }
      }
    }
  }, [albums, targetAlbumId, initialAlbumId])


  // Canvas interaction state
  const [draggingState, setDraggingState] = useState<{
    bubbleId: string
    type: 'bubble' | 'tail' | 'resize' | 'rotate'
    handle?: 'nw' | 'ne' | 'se' | 'sw'
    startX: number
    startY: number
    initialBubble: SpeechBubble
  } | null>(null)


  const [cursorStyle, setCursorStyle] = useState<string>('default')
  const [isDrawingROI, setIsDrawingROI] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [currentROI, setCurrentROI] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [miniPreviewHeight, setMiniPreviewHeight] = useState<number>(180)
  const resizeStartYRef = useRef<number | null>(null)
  const startHeightRef = useRef<number>(180)
  const copiedBubbleRef = useRef<SpeechBubble | null>(null)

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 500, height: 500 })

  // Scale factors
  const scaleX = imageObj ? canvasDimensions.width / imageObj.naturalWidth : 1
  const scaleY = imageObj ? canvasDimensions.height / imageObj.naturalHeight : 1

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

  const fetchDebugCandidates = async (roi: { x: number; y: number; w: number; h: number } | null = null) => {
    setIsDebugLoading(true)
    try {
      const res = await snapshotsApi.detectBubbleDebug(snapshot.id, roi)
      setCandidates(res.candidates)
    } catch (err) {
      console.error('Failed to fetch debug candidates:', err)
    } finally {
      setIsDebugLoading(false)
    }
  }

  // Load image when currentImageUrl changes
  useEffect(() => {
    if (!currentImageUrl) return
    const img = new Image()
    img.src = currentImageUrl
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageObj(img)
      const maxW = typeof window !== 'undefined' ? Math.min(500, window.innerWidth - 48) : 500
      const maxH = 500
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      setCanvasDimensions({ width: w, height: h })
    }
  }, [currentImageUrl])

  // Load font list on mount
  useEffect(() => {
    if (fontList.length > 0 && !selectedFont) {
      const msgothic = fontList.find((f) => f.file_name.toLowerCase() === 'msgothic.ttc')
      const initialFont = msgothic ? msgothic.file_name : fontList[0].file_name
      setSelectedFont(initialFont)
      setLastUsedStyle((prev) => (prev.fontFamily === 'sans-serif' ? { ...prev, fontFamily: initialFont } : prev))
    }
  }, [fontList, selectedFont])

  // Create bubble helper with last used style
  const createBubbleFromStyle = (params: {
    id?: string
    x: number
    y: number
    w?: number
    h?: number
    text?: string
    tail?: { x: number; y: number }
  }): SpeechBubble => {
    return {
      id: params.id || `bubble-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      x: params.x,
      y: params.y,
      w: params.w ?? DEFAULT_BUBBLE_BOUNDS.w,
      h: params.h ?? DEFAULT_BUBBLE_BOUNDS.h,
      text: params.text ?? '',
      shape: lastUsedStyle.shape,
      orientation: lastUsedStyle.orientation,
      fontFamily: lastUsedStyle.fontFamily || selectedFont || 'sans-serif',
      fontSize: lastUsedStyle.fontSize ?? 0,
      textColor: lastUsedStyle.textColor,
      backgroundColor: lastUsedStyle.backgroundColor,
      borderColor: lastUsedStyle.borderColor,
      borderWidth: lastUsedStyle.borderWidth,
      tail: params.tail,
    }
  }

  // Load all selected fonts for bubbles dynamically
  useEffect(() => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return

    // Collect all font files used across bubbles
    const fontsToLoad = new Set<string>()
    bubbles.forEach((b) => {
      if (b.fontFamily && b.fontFamily !== 'sans-serif' && b.fontFamily !== 'serif') {
        fontsToLoad.add(b.fontFamily)
      }
    })

    fontsToLoad.forEach((fontFileName) => {
      const familyName = `server-font-${fontFileName.replace(/\./g, '-')}`
      let isAlreadyLoaded = false
      if (typeof document.fonts.forEach === 'function') {
        document.fonts.forEach((font) => {
          if (font.family === familyName) {
            isAlreadyLoaded = true
          }
        })
      }

      if (!isAlreadyLoaded) {
        setIsFontLoading(true)
        const fontUrl = `/api/fonts/${encodeURIComponent(fontFileName)}`
        const fontFace = new FontFace(familyName, `url(${fontUrl})`)
        fontFace
          .load()
          .then((loadedFace) => {
            document.fonts.add(loadedFace)
            // Trigger canvas redraw by updating activeFontFamily counter
            setActiveFontFamily(`${familyName}-${Date.now()}`)
            setIsFontLoading(false)
          })
          .catch((err) => {
            console.error(`Failed to load font ${fontFileName}:`, err)
            setIsFontLoading(false)
          })
      }
    })
  }, [bubbles])


  // Snapshot initialization and metadata restore / auto-detection
  useEffect(() => {
    let active = true
    const initEditor = async () => {
      try {
        const fullSnapshot = await snapshotsApi.get(snapshot.id)
        const params = fullSnapshot.params as Record<string, any> | undefined
        const savedBubbles = params?.speech_bubbles as SpeechBubble[] | undefined
        const baseSnapId = (params?.base_snapshot_id as number) || fullSnapshot.source_snapshot_id || fullSnapshot.id
        const baseImgPath = (params?.base_image_path as string) || fullSnapshot.image_path

        if (!active) return

        if (savedBubbles && Array.isArray(savedBubbles) && savedBubbles.length > 0) {
          setBubbles(savedBubbles)
          setSelectedBubbleId(savedBubbles[0]?.id || null)
          setCurrentSourceSnapshotId(baseSnapId)
          setCurrentImageUrl(baseImgPath || fullSnapshot.image_path || '')
        } else {
          setCurrentSourceSnapshotId(fullSnapshot.id)
          setCurrentImageUrl(fullSnapshot.image_path || '')
          // Initial auto detection
          setIsDrafting(true)
          try {
            const res = await snapshotsApi.detectBubble(fullSnapshot.id)
            if (active && res.bounding_box) {
              const newBubble = createBubbleFromStyle({
                id: `bubble-${Date.now()}`,
                x: res.bounding_box.x,
                y: res.bounding_box.y,
                w: res.bounding_box.w,
                h: res.bounding_box.h,
                tail: {
                  x: res.bounding_box.x + res.bounding_box.w / 2 - 20,
                  y: res.bounding_box.y + res.bounding_box.h + 30
                }
              })
              setBubbles([newBubble])
              setSelectedBubbleId(newBubble.id)
            }
            if (active && showDebugPanel) {
              fetchDebugCandidates(null)
            }
          } catch (e) {
            console.error(e)
          } finally {
            if (active) setIsDrafting(false)
          }
        }
      } catch (err) {
        console.error('Failed to init editor:', err)
        setCurrentImageUrl(snapshot.image_path || '')
      }
    }
    initEditor()
    return () => {
      active = false
    }
  }, [snapshot.id])

  const handleSelectNewBaseImage = (selectedSnapshot: BaseImageOption) => {
    if (selectedSnapshot.image_path) {
      setCurrentSourceSnapshotId(selectedSnapshot.id)
      setCurrentImageUrl(selectedSnapshot.image_path)
      setIsImageSelectOpen(false)
    }
  }


  const handleDuplicateBubble = (targetBubble?: SpeechBubble) => {
    const source = targetBubble || bubbles.find((b) => b.id === selectedBubbleId)
    if (!source) return

    const offset = 20
    const newBubble: SpeechBubble = {
      ...source,
      id: `bubble-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      x: source.x + offset,
      y: source.y + offset,
      tail: source.tail ? { x: source.tail.x + offset, y: source.tail.y + offset } : undefined,
    }

    setBubbles((prev) => [...prev, newBubble])
    setSelectedBubbleId(newBubble.id)
    const style = extractBubbleStyle(newBubble)
    setLastUsedStyle((prev) => {
      const next = { ...prev, ...style }
      saveLastUsedBubbleStyle(next)
      return next
    })
  }

  // Keyboard shortcuts (Delete, Backspace, Ctrl+C / Cmd+C, Ctrl+V / Cmd+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBubbleId) {
        setBubbles((prev) => prev.filter((b) => b.id !== selectedBubbleId))
        setSelectedBubbleId(null)
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      if (isCtrlOrCmd && e.key.toLowerCase() === 'c' && selectedBubbleId) {
        const active = bubbles.find((b) => b.id === selectedBubbleId)
        if (active) {
          copiedBubbleRef.current = { ...active }
          e.preventDefault()
        }
      } else if (isCtrlOrCmd && e.key.toLowerCase() === 'v' && copiedBubbleRef.current) {
        handleDuplicateBubble(copiedBubbleRef.current)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedBubbleId, bubbles])

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

function getLocalBubblePoint(
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

  // Canvas Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
            initialBubble: { ...activeBubble }
          })
          return
        }
      }
    }

    // 3. Check if clicking inside any bubble (in reverse order to hit top-most)
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
          initialBubble: { ...b }
        })
        return
      }
    }

    // 4. Otherwise start ROI selection or deselect
    setSelectedBubbleId(null)
    setIsDrawingROI(true)
    setDragStart({ x, y })
    setCurrentROI({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
              tail: initB.tail ? { x: initB.tail.x + dx, y: initB.tail.y + dy } : undefined
            }
          })
        )
      } else if (draggingState.type === 'tail') {
        const tx = Math.round(x / scaleX)
        const ty = Math.round(y / scaleY)
        setBubbles((prev) =>
          prev.map((b) => (b.id === draggingState.bubbleId ? { ...b, tail: { x: tx, y: ty } } : b))
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

    const originalROI = {
      x: Math.round(currentROI.x / scaleX),
      y: Math.round(currentROI.y / scaleY),
      w: Math.round(currentROI.w / scaleX),
      h: Math.round(currentROI.h / scaleY),
    }

    setIsDrafting(true)
    try {
      const res = await snapshotsApi.detectBubbleROI(snapshot.id, originalROI)
      if (res.bounding_box) {
        const newBubble = createBubbleFromStyle({
          id: `bubble-${Date.now()}`,
          x: res.bounding_box.x,
          y: res.bounding_box.y,
          w: res.bounding_box.w,
          h: res.bounding_box.h,
          tail: {
            x: res.bounding_box.x + res.bounding_box.w / 2 - 20,
            y: res.bounding_box.y + res.bounding_box.h + 30
          }
        })
        setBubbles((prev) => [...prev, newBubble])
        setSelectedBubbleId(newBubble.id)
      } else {
        alert('ROI指定範囲内に吹き出しを検出できませんでした。')
      }
      if (showDebugPanel) {
        setLastUsedROI(originalROI)
        setSortBy('distance_center')
        fetchDebugCandidates(originalROI)
      }
    } catch (err: any) {
      console.error(err)
      alert('エラー: ' + err.message)
    } finally {
      setIsDrafting(false)
      setCurrentROI(null)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      tail: { x: cx - 30, y: cy + 90 }
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

  const handleTouchEnd = () => {
    handleMouseUp()
  }

  const handleGenerateDraft = async () => {
    if (!selectedBubbleId) return
    setIsDrafting(true)
    try {
      const res = await llmPromptsApi.speechDraft(snapshot.id)
      setBubbles((prev) =>
        prev.map((b) => (b.id === selectedBubbleId ? { ...b, text: res.draft } : b))
      )
    } catch (err: any) {
      console.error(err)
      alert('セリフドラフト生成に失敗しました: ' + err.message)
    } finally {
      setIsDrafting(false)
    }
  }

  const handleSave = async () => {
    if (!imageObj || bubbles.length === 0) return
    if (targetAlbumId === 'new' && !newAlbumName.trim()) {
      alert('新規アルバム名を入力してください')
      return
    }

    setIsSaving(true)
    try {
      const offCanvas = document.createElement('canvas')
      offCanvas.width = imageObj.naturalWidth
      offCanvas.height = imageObj.naturalHeight
      const offCtx = offCanvas.getContext('2d')
      if (!offCtx) throw new Error('Offscreen canvas context generation failed')

      // Draw background image
      offCtx.drawImage(imageObj, 0, 0, offCanvas.width, offCanvas.height)

      // Draw all speech bubbles without selection outline at 1:1 scale
      bubbles.forEach((bubble) => {
        drawSpeechBubble(offCtx, bubble, false, 1, 1, activeFontFamily)
      })

      const blob = await new Promise<Blob | null>((resolve) => offCanvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Canvas blob generation failed')

      const uploadRes = await snapshotsApi.upload(blob)
      const parentSnapshot = await snapshotsApi.get(currentSourceSnapshotId)

      const updatedParams = {
        ...(parentSnapshot.params || {}),
        speech_bubbles: bubbles,
        base_snapshot_id: currentSourceSnapshotId,
        base_image_path: currentImageUrl,
      }

      let savedSnapshotId: number

      if (saveMode === 'overwrite') {
        await snapshotsApi.patch(snapshot.id, {
          image_path: uploadRes.image_path,
          thumbnail_path: uploadRes.thumbnail_path,
          params: updatedParams,
        })
        savedSnapshotId = snapshot.id
      } else {
        const created = await snapshotsApi.create({
          workflow_id: parentSnapshot.workflow_id,
          image_path: uploadRes.image_path,
          params: updatedParams,
          source_snapshot_id: parentSnapshot.id,
        })
        savedSnapshotId = created.id
      }

      if (targetAlbumId === 'new') {
        const createdAlbum = await albumsApi.create({
          name: newAlbumName.trim(),
          snapshot_ids: [savedSnapshotId],
        })
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, String(createdAlbum.id))
        } catch {}
      } else if (typeof targetAlbumId === 'number') {
        await albumsApi.addItems(targetAlbumId, [savedSnapshotId])
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, String(targetAlbumId))
        } catch {}
      } else {
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, '')
        } catch {}
      }

      await qc.invalidateQueries({ queryKey: ['albums'] })
      await qc.invalidateQueries({ queryKey: ['snapshots'] })

      onSaved()
      onClose()
    } catch (err: any) {
      console.error(err)
      alert('画像の保存に失敗しました: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId) || null

  // Filter and Sort Candidates
  const processedCandidates = [...candidates]
    .filter((c) => {
      if (filterStatus === 'pass') return c.status === 'PASS'
      if (filterStatus === 'fail') return c.status !== 'PASS'
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'area_desc') return b.area - a.area
      if (sortBy === 'area_asc') return a.area - b.area
      if (sortBy === 'brightness_desc') return b.mean_brightness - a.mean_brightness
      if (sortBy === 'id') return a.id - b.id

      if (sortBy === 'distance_center' && lastUsedROI) {
        const roiCx = lastUsedROI.x + lastUsedROI.w / 2
        const roiCy = lastUsedROI.y + lastUsedROI.h / 2
        const aCx = a.x + a.w / 2
        const aCy = a.y + a.h / 2
        const distA = Math.pow(aCx - roiCx, 2) + Math.pow(aCy - roiCy, 2)
        const bCx = b.x + b.w / 2
        const bCy = b.y + b.h / 2
        const distB = Math.pow(bCx - roiCx, 2) + Math.pow(bCy - roiCy, 2)
        return distA - distB
      }

      return b.area - a.area
    })

  return (
    <div className="modal-backdrop">
      <div
        className="relative w-full max-w-5xl overflow-hidden bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <div>
            <h3 className="text-lg font-semibold text-white">セリフ編集・吹き出し追加</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              画像上をダブルクリックして吹き出しを追加。ドラッグで位置や尻尾の移動、範囲（ROI）指定が可能です。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsImageSelectOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
            >
              <ImageIcon size={14} />
              <span>ベース画像差し替え</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden border-b border-[rgba(255,255,255,0.08)] bg-zinc-900/60 px-4 py-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveMobileTab('preview')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeMobileTab === 'preview'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/40'
            }`}
          >
            🖼️ プレビュー
          </button>
          <button
            type="button"
            onClick={() => setActiveMobileTab('controls')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeMobileTab === 'controls'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/40'
            }`}
          >
            ⚙️ 編集設定
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto p-3 md:p-6 gap-4 md:gap-6 min-h-[450px]">
          {/* Left: Canvas Area */}
          <div
            className={`${
              activeMobileTab === 'preview' ? 'flex' : 'hidden'
            } md:flex flex-[3] flex-col items-center justify-center bg-black/40 rounded-lg p-3 md:p-4 border border-[rgba(255,255,255,0.04)] relative`}
          >
            {!imageObj ? (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <Loader2 className="animate-spin" size={28} />
                <span>画像をロード中...</span>
              </div>
            ) : (
              <div className="relative border border-[rgba(255,255,255,0.08)] shadow-lg rounded max-w-full overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  style={{ cursor: cursorStyle }}
                  className="block touch-none max-w-full"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onDoubleClick={handleDoubleClick}
                />
              </div>
            )}
            <span className="text-[10px] text-zinc-500 mt-3 text-center">
              ※ダブルクリックで新規吹き出し追加 / バブル・尻尾・四隅ハンドルをドラッグして移動・サイズ変更 / 余白ドラッグでROI検出
            </span>
          </div>

          {/* Right: Controls Pane */}
          <div
            className={`${
              activeMobileTab === 'controls' ? 'flex' : 'hidden'
            } md:flex flex-[2] flex-col justify-between gap-6 md:border-l md:border-[rgba(255,255,255,0.08)] md:pl-6 overflow-y-auto`}
          >
            <div className="space-y-4">
              {/* Mobile Resizable Mini Preview (md:hidden) */}
              <div className="flex md:hidden flex-col bg-black/40 rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden mb-3">
                <div
                  style={{ height: `${miniPreviewHeight}px` }}
                  className="relative flex items-center justify-center p-2 bg-zinc-950/60 overflow-hidden"
                >
                  <canvas
                    ref={miniCanvasRef}
                    width={canvasDimensions.width}
                    height={canvasDimensions.height}
                    className="block max-h-full max-w-full object-contain rounded"
                    data-testid="mobile-mini-preview-canvas"
                  />
                  <button
                    type="button"
                    onClick={() => setActiveMobileTab('preview')}
                    className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 hover:bg-black/80 text-[10px] text-blue-300 border border-blue-500/30 backdrop-blur-sm transition-colors"
                  >
                    全画面操作 ↗
                  </button>
                </div>
                {/* Drag Resize Handle */}
                <div
                  className="h-4 bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 cursor-row-resize flex items-center justify-center border-t border-[rgba(255,255,255,0.08)] select-none touch-none"
                  onMouseDown={(e) => handleResizeStart(e.clientY)}
                  onTouchStart={(e) => {
                    if (e.touches.length > 0) {
                      handleResizeStart(e.touches[0].clientY)
                    }
                  }}
                  data-testid="mini-preview-resize-handle"
                >
                  <div className="w-8 h-1 bg-zinc-400/50 rounded-full" />
                </div>
              </div>

              <SpeechBubbleControls
                bubble={selectedBubble}
                bubblesCount={bubbles.length}
                fontList={fontList}
                isFontLoading={isFontLoading}
                isDrafting={isDrafting}
                onUpdate={(updated) => {
                  if (!selectedBubbleId) return
                  setBubbles((prev) =>
                    prev.map((b) => (b.id === selectedBubbleId ? { ...b, ...updated } : b))
                  )
                  const updatedStyle = extractBubbleStyle(updated)
                  if (Object.keys(updatedStyle).length > 0) {
                    setLastUsedStyle((prev) => {
                      const next = { ...prev, ...updatedStyle }
                      saveLastUsedBubbleStyle(next)
                      return next
                    })
                  }
                }}
                onDelete={() => {
                  if (!selectedBubbleId) return
                  setBubbles((prev) => prev.filter((b) => b.id !== selectedBubbleId))
                  setSelectedBubbleId(null)
                }}
                onDuplicate={() => handleDuplicateBubble()}
                onGenerateDraft={handleGenerateDraft}
              />

              {/* Debug candidates utility */}
              <div className="space-y-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">デバッグ: 全ての検出候補を表示</span>
                  <input
                    type="checkbox"
                    checked={showDebugPanel}
                    onChange={(e) => {
                      setShowDebugPanel(e.target.checked)
                      if (e.target.checked) {
                        fetchDebugCandidates(null)
                      }
                    }}
                    className="accent-accent-green cursor-pointer"
                  />
                </div>

                {showDebugPanel && (
                  <>
                    <div className="flex gap-2 text-[10px] text-zinc-400 bg-zinc-950/40 p-2 rounded-lg border border-[rgba(255,255,255,0.06)]">
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-[9px] text-zinc-500 font-semibold">判定フィルタ</span>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value as any)}
                          className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.08)] rounded px-1 py-0.5 text-zinc-200 focus:outline-none"
                        >
                          <option value="pass">OKのみ</option>
                          <option value="all">すべて</option>
                          <option value="fail">NGのみ</option>
                        </select>
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-[9px] text-zinc-500 font-semibold">並び替え</span>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.08)] rounded px-1 py-0.5 text-zinc-200 focus:outline-none"
                        >
                          {lastUsedROI && <option value="distance_center">ROI中心に近い順</option>}
                          <option value="area_desc">面積が大きい順</option>
                          <option value="area_asc">面積が小さい順</option>
                          <option value="brightness_desc">輝度が高い順</option>
                          <option value="id">検出順(ID)</option>
                        </select>
                      </div>
                    </div>

                    <div className="border border-[rgba(255,255,255,0.08)] bg-zinc-950/40 rounded-lg overflow-hidden text-[11px] font-sans max-h-40 overflow-y-auto">
                      {isDebugLoading ? (
                        <div className="p-4 text-center text-zinc-500">読み込み中...</div>
                      ) : processedCandidates.length === 0 ? (
                        <div className="p-4 text-center text-zinc-500">条件に合う候補が見つかりませんでした</div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-900 border-b border-[rgba(255,255,255,0.06)] text-zinc-400">
                              <th className="p-1.5 text-center">判定</th>
                              <th className="p-1.5">面積</th>
                              <th className="p-1.5">輝度</th>
                              <th className="p-1.5 text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {processedCandidates.map((c) => {
                              const isPass = c.status === 'PASS'
                              return (
                                <tr
                                  key={c.id}
                                  className={`border-b border-[rgba(255,255,255,0.02)] transition-colors hover:bg-white/5 cursor-pointer ${
                                    hoveredCandidate?.id === c.id ? 'bg-amber-500/10' : ''
                                  }`}
                                  onMouseEnter={() => setHoveredCandidate(c)}
                                  onMouseLeave={() => setHoveredCandidate(null)}
                                  onClick={() => {
                                    const newBubble = createBubbleFromStyle({
                                      id: `bubble-${Date.now()}`,
                                      x: c.x,
                                      y: c.y,
                                      w: c.w,
                                      h: c.h,
                                      tail: { x: c.x + c.w / 2 - 20, y: c.y + c.h + 30 }
                                    })
                                    setBubbles((prev) => [...prev, newBubble])
                                    setSelectedBubbleId(newBubble.id)
                                  }}
                                >
                                  <td className="p-1.5 text-center">
                                    <span
                                      className={`px-1 rounded text-[9px] font-bold ${
                                        isPass ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                      }`}
                                    >
                                      {isPass ? 'OK' : c.status.replace('FAIL_', '')}
                                    </span>
                                  </td>
                                  <td className="p-1.5 text-zinc-300">{c.area}</td>
                                  <td className="p-1.5 text-zinc-300">{c.mean_brightness}</td>
                                  <td className="p-1.5 text-right">
                                    <button
                                      type="button"
                                      className="px-1.5 py-0.5 bg-[#7C6FDD] hover:bg-[#6d62cc] text-white rounded text-[10px]"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const newBubble = createBubbleFromStyle({
                                          id: `bubble-${Date.now()}`,
                                          x: c.x,
                                          y: c.y,
                                          w: c.w,
                                          h: c.h,
                                          tail: { x: c.x + c.w / 2 - 20, y: c.y + c.h + 30 }
                                        })
                                        setBubbles((prev) => [...prev, newBubble])
                                        setSelectedBubbleId(newBubble.id)
                                      }}
                                    >
                                      適用
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer actions & save settings */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[rgba(255,255,255,0.08)]">
              {/* Save Options */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-zinc-800">
                  <label className="text-zinc-400 font-medium px-1">保存方法:</label>
                  <button
                    type="button"
                    data-testid="save-mode-new"
                    onClick={() => setSaveMode('new')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      saveMode === 'new'
                        ? 'bg-accent-green text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    新規保存
                  </button>
                  <button
                    type="button"
                    data-testid="save-mode-overwrite"
                    onClick={() => setSaveMode('overwrite')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      saveMode === 'overwrite'
                        ? 'bg-accent-green text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    上書き保存
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-zinc-400 font-medium">保存先アルバム:</label>
                  <select
                    data-testid="save-album-select"
                    value={targetAlbumId}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'new') setTargetAlbumId('new')
                      else if (val === '') setTargetAlbumId('')
                      else setTargetAlbumId(Number(val))
                    }}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green"
                  >
                    <option value="new">+ 新規アルバムを作成</option>
                    <option value="">なし (アルバムに追加しない)</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.items?.length ?? 0}件)
                      </option>
                    ))}
                  </select>

                  {targetAlbumId === 'new' && (
                    <input
                      type="text"
                      data-testid="new-album-name-input"
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      placeholder="新規アルバム名を入力"
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green"
                    />
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-zinc-400 hover:text-white bg-transparent hover:bg-white/5 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || bubbles.length === 0}
                  data-testid="speech-bubble-save-btn"
                  className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {saveMode === 'overwrite' ? '上書き保存' : '新規保存して履歴へ追加'} ({bubbles.length})
                </button>
              </div>
            </div>
          </div>
        </div>
        {isImageSelectOpen && (
          <BaseImageSelectModal
            workflowId={snapshot.workflow_id}
            currentSnapshotId={currentSourceSnapshotId}
            onClose={() => setIsImageSelectOpen(false)}
            onSelect={handleSelectNewBaseImage}
          />
        )}
      </div>
    </div>
  )
}
