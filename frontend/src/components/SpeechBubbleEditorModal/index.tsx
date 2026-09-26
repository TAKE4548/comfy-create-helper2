import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Image as ImageIcon } from 'lucide-react'
import { snapshotsApi, fontsApi } from '../../api/client'
import { useAlbums } from '../../hooks/useAlbums'
import { STALE_TIMES } from '../../constants/staleTimes'
import type { BubbleCandidate, ServerFont } from '../../api/types'
import type { SpeechBubble, BubbleStyleConfig } from '../../types/speechBubble'
import {
  DEFAULT_BUBBLE_BOUNDS,
  extractBubbleStyle,
  loadLastUsedBubbleStyle,
  saveLastUsedBubbleStyle,
} from '../../types/speechBubble'
import { SpeechBubbleControls } from '../SpeechBubbleControls'
import { BaseImageSelectModal, type BaseImageOption } from '../BaseImageSelectModal'
import type { SpeechBubbleEditorModalProps, MobileTab, ROI, FilterStatus, SortBy } from './types'
import { useBubbleCanvasInteraction } from './hooks/useBubbleCanvasInteraction'
import { useSpeechBubblePersistence } from './hooks/useSpeechBubblePersistence'
import { CanvasViewportSection } from './sections/CanvasViewportSection'
import { BubbleSaveExportBar } from './sections/BubbleSaveExportBar'
import { CandidateDebugDrawer } from './sections/CandidateDebugDrawer'

export type { SpeechBubbleEditorModalProps, MobileTab } from './types'

export function SpeechBubbleEditorModal({
  snapshot,
  initialAlbumId,
  onClose,
  onSaved,
}: SpeechBubbleEditorModalProps) {
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
  const [isDetecting, setIsDetecting] = useState(false)
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('preview')
  const [currentSourceSnapshotId, setCurrentSourceSnapshotId] = useState<number>(snapshot.id)
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(snapshot.image_path || '')
  const [isImageSelectOpen, setIsImageSelectOpen] = useState<boolean>(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [candidates, setCandidates] = useState<BubbleCandidate[]>([])
  const [isDebugLoading, setIsDebugLoading] = useState(false)
  const [hoveredCandidate, setHoveredCandidate] = useState<BubbleCandidate | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pass')
  const [sortBy, setSortBy] = useState<SortBy>('area_desc')

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 500, height: 500 })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const copiedBubbleRef = useRef<SpeechBubble | null>(null)

  // Scale factors
  const scaleX = imageObj ? canvasDimensions.width / imageObj.naturalWidth : 1
  const scaleY = imageObj ? canvasDimensions.height / imageObj.naturalHeight : 1

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

  const handleROISubmit = async (originalROI: ROI) => {
    setIsDetecting(true)
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
            y: res.bounding_box.y + res.bounding_box.h + 30,
          },
        })
        setBubbles((prev) => [...prev, newBubble])
        setSelectedBubbleId(newBubble.id)
      } else {
        alert('ROI指定範囲内に吹き出しを検出できませんでした。')
      }
      if (showDebugPanel) {
        setSortBy('distance_center')
        fetchDebugCandidates(originalROI)
      }
    } catch (err: any) {
      console.error(err)
      alert('エラー: ' + err.message)
    } finally {
      setIsDetecting(false)
    }
  }

  const persistence = useSpeechBubblePersistence({
    snapshot,
    initialAlbumId,
    albums,
    imageObj,
    bubbles,
    setBubbles,
    selectedBubbleId,
    activeFontFamily,
    currentSourceSnapshotId,
    currentImageUrl,
    onSaved,
    onClose,
  })

  const isDrafting = persistence.isDrafting || isDetecting

  const interaction = useBubbleCanvasInteraction({
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
    onROISubmit: handleROISubmit,
    isDrafting,
  })

  // Load image when currentImageUrl changes
  useEffect(() => {
    if (!currentImageUrl) return
    const img = new Image()
    img.src = currentImageUrl
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImageObj(img)
      const maxW = typeof window !== 'undefined' ? Math.min(900, Math.floor(window.innerWidth * 0.58)) : 600
      const maxH = typeof window !== 'undefined' ? Math.min(720, Math.floor(window.innerHeight * 0.72)) : 600
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

  // Load all selected fonts for bubbles dynamically
  useEffect(() => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return

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
          setIsDetecting(true)
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
                  y: res.bounding_box.y + res.bounding_box.h + 30,
                },
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
            if (active) setIsDetecting(false)
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
      tail: source.tail
        ? {
            ...source.tail,
            x: source.tail.x + offset,
            y: source.tail.y + offset,
          }
        : undefined,
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

  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId) || null

  return (
    <div className="modal-backdrop">
      <div
        className="relative w-full max-w-7xl overflow-hidden bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl transition-all max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.08)]">
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
        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto p-2 md:p-3 gap-3 md:gap-4 min-h-[450px]">
          {/* Left: Canvas Area */}
          <CanvasViewportSection
            canvasRef={canvasRef}
            imageObj={imageObj}
            canvasDimensions={canvasDimensions}
            cursorStyle={interaction.cursorStyle}
            selectedBubble={selectedBubble}
            setBubbles={setBubbles}
            activeMobileTab={activeMobileTab}
            onMouseDown={interaction.onMouseDown}
            onMouseMove={interaction.onMouseMove}
            onMouseUp={interaction.onMouseUp}
            onTouchStart={interaction.onTouchStart}
            onTouchMove={interaction.onTouchMove}
            onTouchEnd={interaction.onTouchEnd}
            onDoubleClick={interaction.onDoubleClick}
          />

          {/* Right: Controls Pane */}
          <div
            className={`${
              activeMobileTab === 'controls' ? 'flex' : 'hidden'
            } md:flex flex-[2] flex-col justify-between gap-4 md:border-l md:border-[rgba(255,255,255,0.08)] md:pl-4 overflow-y-auto`}
          >
            <div className="space-y-4">
              {/* Mobile Resizable Mini Preview (md:hidden) */}
              <div className="flex md:hidden flex-col bg-black/40 rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden mb-3">
                <div
                  style={{ height: `${interaction.miniPreviewHeight}px` }}
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
                  onMouseDown={(e) => interaction.handleResizeStart(e.clientY)}
                  onTouchStart={(e) => {
                    if (e.touches.length > 0) {
                      interaction.handleResizeStart(e.touches[0].clientY)
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
                snapshotId={currentSourceSnapshotId}
                imagePath={currentImageUrl}
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
                onGenerateDraft={persistence.handleGenerateDraft}
              />

              <CandidateDebugDrawer
                showDebugPanel={showDebugPanel}
                setShowDebugPanel={(show) => {
                  setShowDebugPanel(show)
                  if (show) {
                    fetchDebugCandidates(null)
                  }
                }}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                sortBy={sortBy}
                setSortBy={setSortBy}
                candidates={candidates}
                isDebugLoading={isDebugLoading}
                hoveredCandidate={hoveredCandidate}
                setHoveredCandidate={setHoveredCandidate}
                hasLastUsedROI={!!interaction.lastUsedROI}
                lastUsedROI={interaction.lastUsedROI}
                onApplyCandidate={(c) => {
                  const newBubble = createBubbleFromStyle({
                    id: `bubble-${Date.now()}`,
                    x: c.x,
                    y: c.y,
                    w: c.w,
                    h: c.h,
                    tail: { x: c.x + c.w / 2 - 20, y: c.y + c.h + 30 },
                  })
                  setBubbles((prev) => [...prev, newBubble])
                  setSelectedBubbleId(newBubble.id)
                }}
              />
            </div>

            <BubbleSaveExportBar
              saveMode={persistence.saveMode}
              setSaveMode={persistence.setSaveMode}
              targetAlbumId={persistence.targetAlbumId}
              setTargetAlbumId={persistence.setTargetAlbumId}
              newAlbumName={persistence.newAlbumName}
              setNewAlbumName={persistence.setNewAlbumName}
              albums={albums || []}
              isSaving={persistence.isSaving}
              bubblesCount={bubbles.length}
              onClose={onClose}
              onSave={persistence.handleSave}
            />
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
