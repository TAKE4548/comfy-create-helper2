import { useState, useEffect, useRef } from 'react'
import { X, Sparkles, Loader2, Save } from 'lucide-react'
import { snapshotsApi, llmPromptsApi, fontsApi } from '../api/client'
import type { SnapshotSummary, BubbleCandidate, ServerFont } from '../api/types'

interface SpeechBubbleEditorModalProps {
  snapshot: SnapshotSummary
  onClose: () => void
  onSaved: () => void
}

const verticalCharMap: Record<string, string> = {
  'ー': '｜',
  '―': '｜',
  '–': '｜',
  '-': '｜',
  '~': '｜',
  '～': '｜',
  '「': '﹁',
  '」': '﹂',
  '『': '﹃',
  '』': '﹄',
  '（': '︵',
  '）': '︶',
  '(': '︵',
  ')': '︶',
  '【': '︻',
  '】': '︼',
  '〔': '︹',
  '〕': '︺',
  '［': '﹇',
  '］': '﹈',
  '{': '︷',
  '}': '︸',
  '｛': '︷',
  '｝': '︸',
  '…': '⋮',
  '..': '︰',
  '：': '︓',
  '；': '︔',
  '、': '︑',
  '。': '︒',
  '.': '︒',
  ',': '︑',
}

const layoutVerticalText = (text: string, fontSize: number, maxHeight: number): string[] => {
  const columns: string[] = []
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    let currentColumn = ''
    for (const char of para) {
      const mappedChar = verticalCharMap[char] || char
      if ((currentColumn.length + 1) * fontSize > maxHeight) {
        columns.push(currentColumn)
        currentColumn = mappedChar
      } else {
        currentColumn += mappedChar
      }
    }
    if (currentColumn || para === '') {
      columns.push(currentColumn)
    }
  }
  return columns
}

export function SpeechBubbleEditorModal({
  snapshot,
  onClose,
  onSaved,
}: SpeechBubbleEditorModalProps) {
  const [boundingBox, setBoundingBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [speechText, setSpeechText] = useState('')
  const [fontList, setFontList] = useState<ServerFont[]>([])
  const [selectedFont, setSelectedFont] = useState<string>('')
  const [activeFontFamily, setActiveFontFamily] = useState<string>('sans-serif')
  const [isFontLoading, setIsFontLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)

  // Debug candidates states
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [candidates, setCandidates] = useState<BubbleCandidate[]>([])
  const [hoveredCandidate, setHoveredCandidate] = useState<BubbleCandidate | null>(null)
  const [isDebugLoading, setIsDebugLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('pass')
  const [sortBy, setSortBy] = useState<'area_desc' | 'area_asc' | 'brightness_desc' | 'distance_center' | 'id'>('area_desc')
  const [lastUsedROI, setLastUsedROI] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

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

  // ROI states
  const [isDrawingROI, setIsDrawingROI] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [currentROI, setCurrentROI] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 500, height: 500 })

  // Scale factors
  const scaleX = imageObj ? canvasDimensions.width / imageObj.naturalWidth : 1
  const scaleY = imageObj ? canvasDimensions.height / imageObj.naturalHeight : 1

  // Load image on mount
  useEffect(() => {
    if (!snapshot.image_path) return
    const img = new Image()
    img.src = snapshot.image_path
    img.crossOrigin = 'anonymous' // To prevent tainted canvas on saving
    img.onload = () => {
      setImageObj(img)
      // Scale image to fit inside 500x500 container while preserving aspect ratio
      const maxW = 500
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
  }, [snapshot.image_path])

  // Load font list on mount
  useEffect(() => {
    const fetchFonts = async () => {
      try {
        const list = await fontsApi.list()
        setFontList(list)
        if (list.length > 0) {
          const msgothic = list.find((f) => f.file_name.toLowerCase() === 'msgothic.ttc')
          if (msgothic) {
            setSelectedFont(msgothic.file_name)
          } else {
            setSelectedFont(list[0].file_name)
          }
        }
      } catch (err) {
        console.error('Failed to fetch font list:', err)
      }
    }
    fetchFonts()
  }, [])

  // Load selected font dynamically
  useEffect(() => {
    if (!selectedFont) return
    const fontFamilyName = `server-font-${selectedFont.replace(/\./g, '-')}`
    
    let isAlreadyLoaded = false
    document.fonts.forEach((font) => {
      if (font.family === fontFamilyName) {
        isAlreadyLoaded = true
      }
    })
    
    if (isAlreadyLoaded) {
      setActiveFontFamily(fontFamilyName)
      return
    }

    setIsFontLoading(true)
    const fontUrl = `/api/fonts/${encodeURIComponent(selectedFont)}`
    const fontFace = new FontFace(fontFamilyName, `url(${fontUrl})`)
    fontFace.load().then((loadedFace) => {
      document.fonts.add(loadedFace)
      setActiveFontFamily(fontFamilyName)
      setIsFontLoading(false)
    }).catch((err) => {
      console.error('Failed to load font:', err)
      setIsFontLoading(false)
    })
  }, [selectedFont])

  // Run bubble detection on open
  useEffect(() => {
    let active = true
    const runAutoDetect = async () => {
      setIsDrafting(true)
      try {
        const res = await snapshotsApi.detectBubble(snapshot.id)
        if (active && res.bounding_box) {
          setBoundingBox(res.bounding_box)
        }
        if (active && showDebugPanel) {
          fetchDebugCandidates(null)
        }
      } catch (err) {
        console.error('Auto detect failed:', err)
      } finally {
        if (active) setIsDrafting(false)
      }
    }
    runAutoDetect()
    return () => {
      active = false
    }
  }, [snapshot.id, showDebugPanel])

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

    // Draw bounding box and text
    if (boundingBox) {
      // Draw detection box border
      ctx.strokeStyle = '#3ECF8E'
      ctx.lineWidth = 2
      ctx.strokeRect(
        boundingBox.x * scaleX,
        boundingBox.y * scaleY,
        boundingBox.w * scaleX,
        boundingBox.h * scaleY
      )

      if (speechText) {
        // Draw white background inside the speech bubble area to print text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.fillRect(
          boundingBox.x * scaleX + 1,
          boundingBox.y * scaleY + 1,
          boundingBox.w * scaleX - 2,
          boundingBox.h * scaleY - 2
        )

        if (isFontLoading) {
          ctx.fillStyle = '#999999'
          ctx.font = '14px sans-serif'
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          ctx.fillText(
            'フォント読み込み中...',
            (boundingBox.x + boundingBox.w / 2) * scaleX,
            (boundingBox.y + boundingBox.h / 2) * scaleY
          )
        } else {
          const padding = 16
          const maxWidth = boundingBox.w * scaleX - padding
          const maxHeight = boundingBox.h * scaleY - padding

          // Step-down search for font size
          let computedFontSize = 36
          const minFontSize = 8
          for (let size = 36; size >= minFontSize; size--) {
            const cols = layoutVerticalText(speechText, size, maxHeight)
            const totalWidth = cols.length * size * 1.3
            if (totalWidth <= maxWidth) {
              computedFontSize = size
              break
            }
            if (size === minFontSize) {
              computedFontSize = minFontSize
            }
          }

          ctx.font = `bold ${computedFontSize}px ${activeFontFamily}`
          ctx.fillStyle = '#000000'
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'

          const cols = layoutVerticalText(speechText, computedFontSize, maxHeight)
          const totalWidth = cols.length * computedFontSize * 1.3
          const boxCenter = (boundingBox.x + boundingBox.w / 2) * scaleX
          const startX = boxCenter + (totalWidth - computedFontSize * 1.3) / 2

          cols.forEach((col, colIndex) => {
            const colX = startX - colIndex * (computedFontSize * 1.3)
            const colHeight = col.length * computedFontSize
            const boxMiddle = (boundingBox.y + boundingBox.h / 2) * scaleY
            const colTop = boxMiddle - colHeight / 2

            for (let i = 0; i < col.length; i++) {
              const char = col[i]
              const charY = colTop + i * computedFontSize + computedFontSize / 2
              ctx.fillText(char, colX, charY)
            }
          })
        }
      }
    }

    // Draw all debug candidates if panel is open
    if (showDebugPanel && candidates) {
      candidates.forEach((c) => {
        // Skip active bounding box and hovered candidate (we draw them separately/highlighted)
        if (boundingBox && Math.abs(boundingBox.x - c.x) < 2 && Math.abs(boundingBox.y - c.y) < 2) return;
        if (hoveredCandidate && hoveredCandidate.id === c.id) return;

        ctx.strokeStyle = c.status === 'PASS' ? 'rgba(62, 207, 142, 0.4)' : 'rgba(239, 68, 68, 0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([2, 2])
        ctx.strokeRect(
          c.x * scaleX,
          c.y * scaleY,
          c.w * scaleX,
          c.h * scaleY
        )
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
      
      // Draw status and ID
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
  }, [imageObj, boundingBox, speechText, activeFontFamily, isFontLoading, isDrawingROI, dragStart, currentROI, scaleX, scaleY, showDebugPanel, candidates, hoveredCandidate])

  // Canvas Mouse handlers for ROI selection
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setIsDrawingROI(true)
    setDragStart({ x, y })
    setCurrentROI({ x, y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingROI || !dragStart) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const roiX = Math.min(dragStart.x, x)
    const roiY = Math.min(dragStart.y, y)
    const roiW = Math.abs(dragStart.x - x)
    const roiH = Math.abs(dragStart.y - y)

    setCurrentROI({ x: roiX, y: roiY, w: roiW, h: roiH })
  }

  const handleMouseUp = async () => {
    if (!isDrawingROI || !dragStart || !currentROI) return
    setIsDrawingROI(false)
    setDragStart(null)

    if (currentROI.w < 10 || currentROI.h < 10) {
      setCurrentROI(null)
      return
    }

    // Map canvas coordinates to original image coordinates
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
        setBoundingBox(res.bounding_box)
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

  const handleGenerateDraft = async () => {
    setIsDrafting(true)
    try {
      const res = await llmPromptsApi.speechDraft(snapshot.id)
      setSpeechText(res.draft)
    } catch (err: any) {
      console.error(err)
      alert('セリフドラフト生成に失敗しました: ' + err.message)
    } finally {
      setIsDrafting(false)
    }
  }

  const handleSave = async () => {
    if (!imageObj) return

    setIsSaving(true)
    try {
      // 1. Create offscreen canvas at original image resolution
      const offCanvas = document.createElement('canvas')
      offCanvas.width = imageObj.naturalWidth
      offCanvas.height = imageObj.naturalHeight
      const offCtx = offCanvas.getContext('2d')
      if (!offCtx) throw new Error('Offscreen canvas context generation failed')

      // 2. Draw background image
      offCtx.drawImage(imageObj, 0, 0, offCanvas.width, offCanvas.height)

      // 3. Draw speech bubble text if boundingBox and speechText exist
      if (boundingBox && speechText) {
        const scaleFactor = imageObj.naturalWidth / canvasDimensions.width
        const padding = 16 * scaleFactor
        const maxWidth = boundingBox.w - padding
        const maxHeight = boundingBox.h - padding

        // Fill white background in bubble area (1px inset)
        offCtx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        offCtx.fillRect(
          boundingBox.x + 1,
          boundingBox.y + 1,
          boundingBox.w - 2,
          boundingBox.h - 2
        )

        const startFontSize = 36 * scaleFactor
        const minFontSize = 8 * scaleFactor
        let computedFontSize = startFontSize

        for (let size = startFontSize; size >= minFontSize; size--) {
          const cols = layoutVerticalText(speechText, size, maxHeight)
          const totalWidth = cols.length * size * 1.3
          if (totalWidth <= maxWidth) {
            computedFontSize = size
            break
          }
          if (size <= minFontSize) {
            computedFontSize = minFontSize
          }
        }

        offCtx.font = `bold ${computedFontSize}px ${activeFontFamily}`
        offCtx.fillStyle = '#000000'
        offCtx.textBaseline = 'middle'
        offCtx.textAlign = 'center'

        const cols = layoutVerticalText(speechText, computedFontSize, maxHeight)
        const totalWidth = cols.length * computedFontSize * 1.3
        const boxCenter = boundingBox.x + boundingBox.w / 2
        const startX = boxCenter + (totalWidth - computedFontSize * 1.3) / 2

        cols.forEach((col, colIndex) => {
          const colX = startX - colIndex * (computedFontSize * 1.3)
          const colHeight = col.length * computedFontSize
          const boxMiddle = boundingBox.y + boundingBox.h / 2
          const colTop = boxMiddle - colHeight / 2

          for (let i = 0; i < col.length; i++) {
            const char = col[i]
            const charY = colTop + i * computedFontSize + computedFontSize / 2
            offCtx.fillText(char, colX, charY)
          }
        })
      }

      // 4. Get blob from offscreen canvas
      const blob = await new Promise<Blob | null>((resolve) => offCanvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Canvas blob generation failed')

      // 5. Upload image
      const uploadRes = await snapshotsApi.upload(blob)

      // 6. Retrieve parent snapshot details
      const parentSnapshot = await snapshotsApi.get(snapshot.id)

      // 7. Create new snapshot
      await snapshotsApi.create({
        workflow_id: parentSnapshot.workflow_id,
        image_path: uploadRes.image_path,
        params: parentSnapshot.params,
        source_snapshot_id: parentSnapshot.id,
      })

      onSaved()
      onClose()
    } catch (err: any) {
      console.error(err)
      alert('画像の保存に失敗しました: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Filter and Sort Candidates
  const processedCandidates = [...candidates]
    .filter((c) => {
      if (filterStatus === 'pass') return c.status === 'PASS';
      if (filterStatus === 'fail') return c.status !== 'PASS';
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'area_desc') return b.area - a.area;
      if (sortBy === 'area_asc') return a.area - b.area;
      if (sortBy === 'brightness_desc') return b.mean_brightness - a.mean_brightness;
      if (sortBy === 'id') return a.id - b.id;
      
      if (sortBy === 'distance_center' && lastUsedROI) {
        const roiCx = lastUsedROI.x + lastUsedROI.w / 2;
        const roiCy = lastUsedROI.y + lastUsedROI.h / 2;
        
        const aCx = a.x + a.w / 2;
        const aCy = a.y + a.h / 2;
        const distA = Math.pow(aCx - roiCx, 2) + Math.pow(aCy - roiCy, 2);
        
        const bCx = b.x + b.w / 2;
        const bCy = b.y + b.h / 2;
        const distB = Math.pow(bCx - roiCx, 2) + Math.pow(bCy - roiCy, 2);
        
        return distA - distB;
      }
      
      return b.area - a.area;
    });

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
              画像上の吹き出しの自動検出、またはドラッグして検出範囲（ROI）を指定できます。
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-y-auto p-6 gap-6 min-h-[400px]">
          {/* Left: Canvas Area */}
          <div className="flex-[3] flex flex-col items-center justify-center bg-black/40 rounded-lg p-4 border border-[rgba(255,255,255,0.04)] relative">
            {!imageObj ? (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <Loader2 className="animate-spin" size={28} />
                <span>画像をロード中...</span>
              </div>
            ) : (
              <div className="relative border border-[rgba(255,255,255,0.08)] shadow-lg rounded">
                <canvas
                  ref={canvasRef}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  className="cursor-crosshair block"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                />
              </div>
            )}
            <span className="text-[10px] text-zinc-500 mt-3">
              ※画像内をドラッグして検出範囲（ROI）を絞り込むことができます。
            </span>
          </div>

          {/* Right: Controls Pane */}
          <div className="flex-[2] flex flex-col justify-between gap-6 border-l border-[rgba(255,255,255,0.08)] pl-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-zinc-200">セリフテキスト</label>
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={isDrafting || !snapshot.image_path}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-accent-green/10 text-accent-green hover:bg-accent-green/20 rounded transition-all disabled:opacity-50"
                >
                  {isDrafting ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  ドラフト生成 (LLM)
                </button>
              </div>

              <textarea
                value={speechText}
                onChange={(e) => setSpeechText(e.target.value)}
                placeholder="吹き出しに描画するセリフを入力してください。"
                className="w-full h-32 px-3.5 py-2.5 bg-zinc-900 border border-[rgba(255,255,255,0.08)] focus:border-accent-green/50 text-white rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-green/20"
              />

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">描画フォント</label>
                <select
                  value={selectedFont}
                  onChange={(e) => setSelectedFont(e.target.value)}
                  className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.08)] focus:border-accent-green/50 text-white rounded px-3 py-2 text-sm focus:outline-none"
                >
                  {fontList.length === 0 ? (
                    <option value="">フォントが見つかりません</option>
                  ) : (
                    fontList.map((f) => (
                      <option key={f.file_name} value={f.file_name}>
                        {f.name}
                      </option>
                    ))
                  )}
                </select>
                {isFontLoading && (
                  <span className="text-[10px] text-zinc-400 block mt-1 flex items-center gap-1">
                    <Loader2 className="animate-spin" size={10} />
                    フォントを読み込み中...
                  </span>
                )}
              </div>

              {boundingBox ? (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400">
                  <span className="font-semibold block mb-0.5">吹き出し検出状態: 検出済み</span>
                  検出位置: X={boundingBox.x}, Y={boundingBox.y}, W={boundingBox.w}, H={boundingBox.h}
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                  吹き出しが自動検出されていません。画像内をドラッグして指定するか、再度検出をお試しください。
                </div>
              )}

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
                    {/* Filter and Sort selectors */}
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

                    <div className="border border-[rgba(255,255,255,0.08)] bg-zinc-950/40 rounded-lg overflow-hidden text-[11px] font-sans max-h-48 overflow-y-auto">
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
                              const isPass = c.status === 'PASS';
                              return (
                                <tr
                                  key={c.id}
                                  className={`border-b border-[rgba(255,255,255,0.02)] transition-colors hover:bg-white/5 cursor-pointer ${
                                    hoveredCandidate?.id === c.id ? 'bg-amber-500/10' : ''
                                  }`}
                                  onMouseEnter={() => setHoveredCandidate(c)}
                                  onMouseLeave={() => setHoveredCandidate(null)}
                                  onClick={() => {
                                    setBoundingBox({ x: c.x, y: c.y, w: c.w, h: c.h })
                                  }}
                                >
                                  <td className="p-1.5 text-center">
                                    <span className={`px-1 rounded text-[9px] font-bold ${
                                      isPass 
                                        ? 'bg-green-500/20 text-green-400' 
                                        : 'bg-red-500/20 text-red-400'
                                    }`}>
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
                                        setBoundingBox({ x: c.x, y: c.y, w: c.w, h: c.h })
                                      }}
                                    >
                                      適用
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[rgba(255,255,255,0.08)]">
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
                disabled={isSaving || !boundingBox}
                className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-accent-green hover:bg-accent-green-hover rounded-lg transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                保存して履歴へ追加
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
