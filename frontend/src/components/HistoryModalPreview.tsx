import { useRef, useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Loader2, Info, Maximize2 } from 'lucide-react'
import { snapshotsApi, lorasApi, tagSetsApi } from '../api/client'
import type { Snapshot, Lora, TagSet } from '../api/types'

interface HistoryModalPreviewProps {
  isOpen: boolean
  onClose: () => void
  images: string[]
  currentIndex: number
  onChangeIndex: (index: number) => void
  snapshotIds?: (number | null)[]
}

export function HistoryModalPreview({
  isOpen,
  onClose,
  images,
  currentIndex,
  onChangeIndex,
  snapshotIds,
}: HistoryModalPreviewProps) {
  const [viewMode, setViewMode] = useState<'full' | 'info'>('full')
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      setViewMode('full')
    }
  }, [isOpen])

  const activeSnapshotId = snapshotIds && currentIndex >= 0 && currentIndex < snapshotIds.length
    ? snapshotIds[currentIndex]
    : null

  // Fetch snapshot metadata if snapshot ID exists
  const { data: snapshot, isLoading } = useQuery<Snapshot>({
    queryKey: ['snapshot', activeSnapshotId],
    queryFn: () => snapshotsApi.get(activeSnapshotId!) as Promise<Snapshot>,
    enabled: !!activeSnapshotId && isOpen,
  })

  // Fetch all loras and tagsets to resolve IDs
  const { data: loras } = useQuery<Lora[]>({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
    enabled: !!activeSnapshotId && isOpen,
  })

  const { data: tagSets } = useQuery<TagSet[]>({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
    enabled: !!activeSnapshotId && isOpen,
  })

  // キーボードイベント監視 (ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) onChangeIndex(currentIndex - 1)
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < images.length - 1) onChangeIndex(currentIndex + 1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, images.length, onChangeIndex])

  const loraStacks = useMemo(() => {
    if (!snapshot?.params) return []
    const roles: string[] = []
    Object.keys(snapshot.params).forEach((key) => {
      const match = key.match(/^(.+)_lora_count$/)
      if (match) {
        roles.push(match[1])
      }
    })

    return roles.map((role) => {
      const count = parseInt(String(snapshot.params[`${role}_lora_count`]), 10) || 0
      const items = []
      for (let i = 1; i <= count; i++) {
        const filePath = String(snapshot.params[`${role}_lora_name_${i}`] || '')
        if (!filePath) continue
        
        const registered = loras?.find((l) => l.file_path === filePath)
        const displayName = registered?.description ? registered.description : filePath

        items.push({
          index: i,
          displayName,
          wt: String(snapshot.params[`${role}_lora_wt_${i}`] ?? '0.0'),
          model_str: String(snapshot.params[`${role}_model_str_${i}`] ?? '1.0'),
          clip_str: String(snapshot.params[`${role}_clip_str_${i}`] ?? '1.0'),
        })
      }
      return {
        role,
        items,
      }
    }).filter((stack) => stack.items.length > 0)
  }, [snapshot?.params, loras])

  if (!isOpen || images.length === 0) return null

  const activeImage = images[currentIndex]

  // Swipe gesture handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX

    if (diff > 50) {
      // Swipe left -> Next image
      if (currentIndex < images.length - 1) {
        onChangeIndex(currentIndex + 1)
      }
    } else if (diff < -50) {
      // Swipe right -> Prev image
      if (currentIndex > 0) {
        onChangeIndex(currentIndex - 1)
      }
    }
    touchStartX.current = null
  }

  // Helper to extract values from params dictionary
  const getParamValue = (keys: string[], excludeKeys: string[] = []): string => {
    if (!snapshot?.params) return ''
    const matchKey = Object.keys(snapshot.params).find((key) => {
      const k = key.toLowerCase()
      const matchesInclude = keys.some((target) => k.includes(target.toLowerCase()))
      const matchesExclude = excludeKeys.some((target) => k.includes(target.toLowerCase()))
      return matchesInclude && !matchesExclude
    })
    return matchKey ? String(snapshot.params[matchKey]) : ''
  }

  const positivePrompt = getParamValue(['prompt', 'positive'], ['negative'])
  const negativePrompt = getParamValue(['negative'])
  const cfgScale = getParamValue(['cfg'])
  const steps = getParamValue(['step'])
  const seed = getParamValue(['seed'])

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" onClick={onClose}>
      {/* Header with Close Button */}
      <div className="relative h-12 flex items-center justify-end px-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          aria-label="Close preview"
        >
          <X size={20} />
        </button>
      </div>

      {/* Image Display Area */}
      <div
        className={`w-full flex items-center justify-center bg-black/40 relative cursor-pointer min-h-0 ${
          viewMode === 'full' ? 'flex-1' : ''
        }`}
        style={viewMode === 'info' ? { height: '60vh' } : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          // Only close if clicking the background area of the container, not the image itself
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        {currentIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex - 1) }}
            className="absolute left-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            &lt;
          </button>
        )}
        <img
          src={activeImage}
          alt={`Preview ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain pointer-events-none select-none"
        />
        {currentIndex < images.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex + 1) }}
            className="absolute right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            &gt;
          </button>
        )}

        {/* Carousel indicators */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 pointer-events-none">
          {currentIndex + 1} / {images.length}
        </div>

        {activeSnapshotId && (
          viewMode === 'full' ? (
            <button
              onClick={(e) => { e.stopPropagation(); setViewMode('info') }}
              className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Show info"
            >
              <Info size={20} />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setViewMode('full') }}
              className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Hide info"
            >
              <Maximize2 size={20} />
            </button>
          )
        )}
      </div>

      {/* Metadata Panel */}
      {viewMode === 'info' && (
        <div
          className="flex-1 overflow-y-auto p-5 bg-surface border-t border-[rgba(255,255,255,0.06)]"
          onClick={(e) => e.stopPropagation()}
        >
          {activeSnapshotId ? (
            isLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-zinc-400 text-xs">
                <Loader2 size={16} className="animate-spin text-accent-green" />
                <span>Loading snapshot metadata...</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs text-zinc-300">
                {/* Prompt */}
                {positivePrompt && (
                  <div>
                    <h4 className="text-zinc-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Prompt</h4>
                    <div className="bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] text-zinc-200 select-all whitespace-pre-wrap break-all">
                      {positivePrompt}
                    </div>
                  </div>
                )}

                {/* Negative Prompt */}
                {negativePrompt && (
                  <div>
                    <h4 className="text-zinc-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Negative Prompt</h4>
                    <div className="bg-surface-2 p-3 rounded-lg border border-[rgba(255,255,255,0.04)] text-zinc-200 select-all whitespace-pre-wrap break-all">
                      {negativePrompt}
                    </div>
                  </div>
                )}

                {/* Grid of basic variables */}
                <div className="grid grid-cols-3 gap-3">
                  {cfgScale && (
                    <div className="bg-surface-2 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)]">
                      <span className="text-[10px] text-zinc-500 block mb-0.5 font-medium uppercase">CFG Scale</span>
                      <span className="font-mono text-zinc-200 font-semibold">{cfgScale}</span>
                    </div>
                  )}
                  {steps && (
                    <div className="bg-surface-2 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)]">
                      <span className="text-[10px] text-zinc-500 block mb-0.5 font-medium uppercase">Steps</span>
                      <span className="font-mono text-zinc-200 font-semibold">{steps}</span>
                    </div>
                  )}
                  {seed && (
                    <div className="bg-surface-2 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] col-span-1">
                      <span className="text-[10px] text-zinc-500 block mb-0.5 font-medium uppercase">Seed</span>
                      <span className="font-mono text-zinc-200 font-semibold select-all break-all">{seed}</span>
                    </div>
                  )}
                </div>

                {/* LoRA Stack */}
                {loraStacks.map((stack) => (
                  <div key={stack.role} className="space-y-1.5">
                    <h4 className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                      LoRA Stack ({stack.role})
                    </h4>
                    <div className="bg-surface-2 rounded-lg border border-[rgba(255,255,255,0.04)] overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-500">
                            <th className="p-2 font-medium">Model</th>
                            <th className="p-2 font-medium text-right w-16">Weight</th>
                            <th className="p-2 font-medium text-right w-16">Model Str</th>
                            <th className="p-2 font-medium text-right w-16">Clip Str</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stack.items.map((item) => (
                            <tr key={item.index} className="border-b border-[rgba(255,255,255,0.02)] last:border-0 text-zinc-300">
                              <td className="p-2 truncate max-w-[200px]" title={item.displayName}>
                                {item.displayName}
                              </td>
                              <td className="p-2 text-right font-mono">{item.wt}</td>
                              <td className="p-2 text-right font-mono">{item.model_str}</td>
                              <td className="p-2 text-right font-mono">{item.clip_str}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Loras & Tag Sets */}
                {((snapshot?.loras && snapshot.loras.length > 0) || (snapshot?.tag_sets && snapshot.tag_sets.length > 0)) && (
                  <div className="space-y-2.5">
                    <h4 className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Applied Assets</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {snapshot?.loras?.map((loraItem, idx) => {
                        const loraDetail = loras?.find((l) => l.id === loraItem.lora_id)
                        return (
                          <div
                            key={`lora-${idx}`}
                            className="px-2.5 py-1 rounded bg-accent-green/5 text-accent-green border border-accent-green/10 text-[10px] font-medium"
                          >
                            LoRA: {loraDetail?.description || loraDetail?.model_name || `ID ${loraItem.lora_id}`} (Str: {loraItem.strength})
                          </div>
                        )
                      })}
                      {snapshot?.tag_sets?.map((tagSetItem, idx) => {
                        const tagSetDetail = tagSets?.find((t) => t.id === tagSetItem.tag_set_id)
                        return (
                          <div
                            key={`tagset-${idx}`}
                            className="px-2.5 py-1 rounded bg-[#7C6FDD]/5 text-[#a99ef7] border border-[#7C6FDD]/10 text-[10px] font-medium"
                          >
                            TagSet: {tagSetDetail?.name || `ID ${tagSetItem.tag_set_id}`}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="text-zinc-500 italic text-center py-6 text-xs">
              一時生成画像（スナップショット未保存）またはメタデータがありません。
            </div>
          )}
        </div>
      )}
    </div>
  )
}
