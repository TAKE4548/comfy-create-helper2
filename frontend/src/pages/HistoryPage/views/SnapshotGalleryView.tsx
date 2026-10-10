import React, { useMemo, useRef, useEffect, useState } from 'react'
import { Clock, Trash2, MessageSquarePlus, Download, Check, ImageOff, X } from 'lucide-react'
import type { SnapshotSummary, Lora, TagSet } from '../../../api/types'
import type { UseMultiSelectReturn } from '../../../hooks/useMultiSelect'

export function toThumbnailUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.pathname === '/view' || parsed.pathname.endsWith('/view')) {
      return `/api/comfy/thumbnail${parsed.search}`
    }
    return url
  } catch {
    return url
  }
}

export interface SnapshotGalleryViewProps {
  snapshots: SnapshotSummary[]
  workflows: { id: number; name: string }[] | undefined
  loras: Lora[] | undefined
  tagSets: TagSet[] | undefined
  selectedWorkflowId: number | null
  setSelectedWorkflowId: (id: number | null) => void
  selectedLoraId: number | null
  setSelectedLoraId: (id: number | null) => void
  selectedTagSetId: number | null
  setSelectedTagSetId: (id: number | null) => void
  sortOrder: 'desc' | 'asc'
  setSortOrder: (order: 'desc' | 'asc') => void
  snapshotLimit: number
  setSnapshotLimit: React.Dispatch<React.SetStateAction<number>>
  aspectRatioStyle: React.CSSProperties
  multiSelect: UseMultiSelectReturn
  onOpenPreview: (index: number) => void
  onOpenSpeechModal: (snapshot: SnapshotSummary) => void
  onDeleteSnapshot: (id: number) => void
}

export function SnapshotGalleryView({
  snapshots,
  workflows,
  loras,
  tagSets,
  selectedWorkflowId,
  setSelectedWorkflowId,
  selectedLoraId,
  setSelectedLoraId,
  selectedTagSetId,
  setSelectedTagSetId,
  sortOrder,
  setSortOrder,
  snapshotLimit,
  setSnapshotLimit,
  aspectRatioStyle,
  multiSelect,
  onOpenPreview,
  onOpenSpeechModal,
  onDeleteSnapshot,
}: SnapshotGalleryViewProps) {
  const snapshotSentinelRef = useRef<HTMLDivElement>(null)
  const [workflowSearch, setWorkflowSearch] = useState('')
  const [loraSearch, setLoraSearch] = useState('')
  const [tagSetSearch, setTagSetSearch] = useState('')

  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return []
    const copy = [...snapshots]
    return sortOrder === 'desc'
      ? copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [snapshots, sortOrder])

  const visibleSnapshots = useMemo(() => {
    return sortedSnapshots.slice(0, snapshotLimit)
  }, [sortedSnapshots, snapshotLimit])

  const visibleWorkflows = workflows?.filter((workflow) =>
    workflow.name.toLocaleLowerCase().includes(workflowSearch.toLocaleLowerCase())
  )
  const visibleLoras = loras?.filter((lora) =>
    lora.model_name.toLocaleLowerCase().includes(loraSearch.toLocaleLowerCase()) ||
    (lora.description || '').toLocaleLowerCase().includes(loraSearch.toLocaleLowerCase())
  )
  const getLoraFilterLabel = (lora: NonNullable<typeof loras>[number]) =>
    lora.description ? `${lora.model_name} — ${lora.description}` : lora.model_name
  const visibleTagSets = tagSets?.filter((tagSet) =>
    tagSet.name.toLocaleLowerCase().includes(tagSetSearch.toLocaleLowerCase())
  )
  const selectedWorkflow = workflows?.find((workflow) => workflow.id === selectedWorkflowId)
  const selectedLora = loras?.find((lora) => lora.id === selectedLoraId)
  const selectedTagSet = tagSets?.find((tagSet) => tagSet.id === selectedTagSetId)

  useEffect(() => {
    const sentinel = snapshotSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSnapshotLimit((prev) => prev + 24)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.unobserve(sentinel)
  }, [snapshots, snapshotLimit, setSnapshotLimit])

  return (
    <>
      {/* Workflow Filter (snapshots only) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-5 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
        <input
          type="search"
          aria-label="ワークフローを検索"
          value={workflowSearch}
          onChange={(event) => setWorkflowSearch(event.target.value)}
          placeholder="ワークフローを検索"
          className="min-h-11 w-40 text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 text-zinc-300"
        />
        <select
          id="history-workflow-filter"
          value={selectedWorkflowId ?? ''}
          onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
          className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
        >
          <option value="">All Workflows</option>
          {visibleWorkflows?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <input
          type="search"
          aria-label="LoRAを検索"
          value={loraSearch}
          onChange={(event) => setLoraSearch(event.target.value)}
          placeholder="LoRAを検索"
          className="min-h-11 w-40 text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 text-zinc-300"
        />
        <select
          id="history-lora-filter"
          value={selectedLoraId ?? ''}
          onChange={(e) => setSelectedLoraId(Number(e.target.value) || null)}
          className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
        >
          <option value="">All LoRAs</option>
          {visibleLoras?.map((l) => (
            <option key={l.id} value={l.id}>
              {getLoraFilterLabel(l)}
            </option>
          ))}
        </select>

        <input
          type="search"
          aria-label="タグセットを検索"
          value={tagSetSearch}
          onChange={(event) => setTagSetSearch(event.target.value)}
          placeholder="タグセットを検索"
          className="min-h-11 w-40 text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 text-zinc-300"
        />
        <select
          id="history-tagset-filter"
          value={selectedTagSetId ?? ''}
          onChange={(e) => setSelectedTagSetId(Number(e.target.value) || null)}
          className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
        >
          <option value="">All Tag Sets</option>
          {visibleTagSets?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {(selectedWorkflow || selectedLora || selectedTagSet) && (
          <div className="flex flex-wrap gap-2" aria-label="有効な絞り込み">
            {selectedWorkflow && (
              <button type="button" onClick={() => setSelectedWorkflowId(null)} className="min-h-11 px-3 rounded-full bg-surface-2 text-xs text-zinc-200">
                Workflow: {selectedWorkflow.name} <X aria-hidden="true" size={12} />
              </button>
            )}
            {selectedLora && (
              <button type="button" onClick={() => setSelectedLoraId(null)} className="min-h-11 px-3 rounded-full bg-surface-2 text-xs text-zinc-200">
                LoRA: {getLoraFilterLabel(selectedLora)} <X aria-hidden="true" size={12} />
              </button>
            )}
            {selectedTagSet && (
              <button type="button" onClick={() => setSelectedTagSetId(null)} className="min-h-11 px-3 rounded-full bg-surface-2 text-xs text-zinc-200">
                TagSet: {selectedTagSet.name} <X aria-hidden="true" size={12} />
              </button>
            )}
          </div>
        )}

        <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
          {(['desc', 'asc'] as const).map((order) => (
            <button
              key={order}
              type="button"
              onClick={() => setSortOrder(order)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sortOrder === order
                  ? 'bg-surface-2 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {order === 'desc' ? '新しい順' : '古い順'}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-600 ml-auto sm:ml-0">
          {sortedSnapshots.length} snapshots
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <div data-testid="snapshot-grid" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleSnapshots.map((snap) => {
            const isSelected = multiSelect.isSelected(snap.id)
            const longPressHandlers = multiSelect.getLongPressHandlers(snap.id)
            return (
              <div
                key={snap.id}
                id={`snap-card-${snap.id}`}
                onMouseDown={longPressHandlers.onMouseDown}
                onMouseUp={longPressHandlers.onMouseUp}
                onMouseLeave={longPressHandlers.onMouseLeave}
                onTouchStart={longPressHandlers.onTouchStart}
                onTouchEnd={longPressHandlers.onTouchEnd}
                onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
                style={{
                  touchAction: 'pan-y',
                  WebkitTouchCallout: 'none',
                  userSelect: 'none',
                }}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer select-none ${
                  multiSelect.isMultiSelectMode && isSelected
                    ? 'border-accent-green ring-1 ring-accent-green/30 bg-surface-2'
                    : 'border-transparent hover:border-zinc-700'
                }`}
                tabIndex={0}
                role="group"
                aria-label={`Snapshot ${snap.id}`}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
                  event.preventDefault()
                  if (multiSelect.isMultiSelectMode) {
                    multiSelect.handleItemClick(snap.id, event as any)
                  } else {
                    const index = sortedSnapshots.findIndex((snapshot) => snapshot.id === snap.id)
                    onOpenPreview(index >= 0 ? index : 0)
                  }
                }}
                onClick={(e) => {
                  if (multiSelect.isMultiSelectMode || e.ctrlKey || e.metaKey) {
                    multiSelect.handleItemClick(snap.id, e)
                  } else {
                    const idx = sortedSnapshots.findIndex((s) => s.id === snap.id)
                    onOpenPreview(idx >= 0 ? idx : 0)
                  }
                }}
              >
                <div className="bg-black w-full" style={{ ...aspectRatioStyle, aspectRatio: '2 / 3' }}>
                  {snap.image_path || snap.thumbnail_path ? (
                    <img
                      src={snap.thumbnail_path || toThumbnailUrl(snap.image_path)}
                      alt={`Snapshot ${snap.id}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <ImageOff size={20} strokeWidth={1} />
                    </div>
                  )}
                </div>

                {/* Checkbox for snapshots multi-select */}
                {multiSelect.isMultiSelectMode && (
                  <div className="absolute top-2 left-2 z-20">
                    {isSelected ? (
                      <div className="p-1 rounded-md bg-accent-green text-white">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded-md bg-black/60 border border-[rgba(255,255,255,0.2)] hover:bg-black/80" />
                    )}
                  </div>
                )}

                {/* Touch-visible and hover/focus-visible metadata and actions. */}
                {!multiSelect.isMultiSelectMode && (
                  <div data-testid={`snapshot-overlay-${snap.id}`} className="absolute bottom-0 inset-x-0 z-20 flex items-end justify-between gap-1 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-2 pt-8 pb-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    <p className="min-w-0 text-[11px] text-zinc-200">
                      {new Date(snap.created_at).toLocaleDateString('ja-JP', {
                        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                    {snap.image_path && (
                      <button
                        id={`snap-speech-edit-${snap.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenSpeechModal(snap)
                        }}
                        title="セリフ編集・吹き出し追加"
                        aria-label="セリフ編集・吹き出し追加"
                        className="min-h-11 min-w-11 p-2 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-accent-green transition-colors shadow-sm"
                      >
                        <MessageSquarePlus size={12} />
                      </button>
                    )}
                    {snap.image_path && (
                      <a
                        href={snap.image_path}
                        download
                        id={`snap-download-${snap.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="ダウンロード"
                        aria-label="ダウンロード"
                        className="min-h-11 min-w-11 p-2 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white transition-colors shadow-sm"
                      >
                        <Download size={12} />
                      </a>
                    )}
                    <button
                      id={`snap-delete-${snap.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('Delete snapshot?')) onDeleteSnapshot(snap.id)
                      }}
                      title="削除"
                      aria-label="削除"
                      className="min-h-11 min-w-11 p-2 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-red-400 transition-colors shadow-sm"
                    >
                      <Trash2 size={12} />
                    </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {visibleSnapshots.length < sortedSnapshots.length && (
            <div
              ref={snapshotSentinelRef}
              className="col-span-full h-8 flex items-center justify-center text-xs text-zinc-500"
            >
              Loading more...
            </div>
          )}
          {sortedSnapshots.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
              <Clock size={40} strokeWidth={1} />
              <p className="mt-3 text-sm">No snapshots yet.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
