import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Trash2,
  Download,
  BookOpen,
  ImageOff,
  Check,
  MessageSquarePlus,
  Sparkles,
} from 'lucide-react'
import { snapshotsApi, workflowsApi, lorasApi, tagSetsApi, speechBatchApi, albumsApi } from '../api/client'
import type { SnapshotSummary, Lora, TagSet } from '../api/types'
import { HistoryModalPreview } from '../components/HistoryModalPreview'
import { AddSnapshotToAlbumModal } from '../components/AddSnapshotToAlbumModal'
import { SpeechBubbleEditorModal } from '../components/SpeechBubbleEditorModal'
import { BatchSpeechTransformModal } from '../components/BatchSpeechTransformModal'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'
import { useThumbnailAspectRatio } from '../hooks/useThumbnailAspectRatio'
import { useBulkDownload } from './HistoryPage/hooks/useBulkDownload'
import { useAlbumOperations } from './HistoryPage/hooks/useAlbumOperations'
import { AlbumListView } from './HistoryPage/components/AlbumListView'
import { AlbumDetailView } from './HistoryPage/components/AlbumDetailView'
import { PageHeader } from '../components/common/PageHeader'

export function HistoryPage() {
  const qc = useQueryClient()
  const { aspectRatioStyle } = useThumbnailAspectRatio()
  const [view, setView] = useState<'snapshots' | 'albums'>('snapshots')

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedLoraId, setSelectedLoraId] = useState<number | null>(null)
  const [selectedTagSetId, setSelectedTagSetId] = useState<number | null>(null)
  const [isAddToAlbumModalOpen, setIsAddToAlbumModalOpen] = useState(false)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)
  const [selectedForSpeech, setSelectedForSpeech] = useState<SnapshotSummary | null>(null)
  const [isBatchSpeechModalOpen, setIsBatchSpeechModalOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [snapshotLimit, setSnapshotLimit] = useState(24)

  const [isDeleteSnapshotsModalOpen, setIsDeleteSnapshotsModalOpen] = useState(false)
  const [albumDeleteTarget, setAlbumDeleteTarget] = useState<{ isOpen: boolean; snapshotIds: number[] }>({
    isOpen: false,
    snapshotIds: [],
  })

  const snapshotSentinelRef = useRef<HTMLDivElement | null>(null)
  const albumItemSentinelRef = useRef<HTMLDivElement | null>(null)

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: loras } = useQuery({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
  })

  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId, selectedLoraId, selectedTagSetId],
    queryFn: () =>
      snapshotsApi.list({
        workflow_id: selectedWorkflowId ?? undefined,
        lora_id: selectedLoraId ?? undefined,
        tag_set_id: selectedTagSetId ?? undefined,
      }) as Promise<SnapshotSummary[]>,
  })

  const { data: activeBatchJob } = useQuery({
    queryKey: ['speech-batch-active-job'],
    queryFn: () => speechBatchApi.getActiveJob(),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'processing' || status === 'pending' ? 1500 : 5000
    },
  })

  // Album operations hook
  const {
    albums,
    isLoadingAlbums,
    currentAlbum,
    selectedAlbumId,
    setSelectedAlbumId,
    albumSortCriterion,
    setAlbumSortCriterion,
    albumSortDirection,
    setAlbumSortDirection,
    sortedAlbumItems,
    visibleAlbumItems,
    setAlbumItemLimit,
    deleteAlbum,
    updateAlbum,
    updateAlbumOrder,
    deleteAlbumItems,
    addToAlbumMutation,
    handleAlbumReorder,
    handleBackToAlbums,
  } = useAlbumOperations()

  // Reset snapshot limit on filter/sort changes
  useEffect(() => {
    setSnapshotLimit(24)
  }, [selectedWorkflowId, selectedLoraId, selectedTagSetId, sortOrder])

  // Reset album item limit when selected album changes
  useEffect(() => {
    setAlbumItemLimit(24)
  }, [selectedAlbumId, setAlbumItemLimit])

  // Bulk download hook
  const { isDownloading, handleBulkDownload } = useBulkDownload({
    snapshots,
    currentAlbum,
    sortedAlbumItems,
  })

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

  const snapshotMultiSelect = useMultiSelect({ items: snapshots ?? [] })
  const albumItemMultiSelect = useMultiSelect({
    items: sortedAlbumItems.map((i) => ({ id: i.snapshot_id })),
  })

  const deleteSnapshot = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  // IntersectionObserver for snapshots infinite scroll
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
  }, [snapshots, snapshotLimit])

  // IntersectionObserver for album items infinite scroll
  useEffect(() => {
    const sentinel = albumItemSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAlbumItemLimit((prev) => prev + 24)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.unobserve(sentinel)
  }, [currentAlbum, setAlbumItemLimit])

  const handleAlbumItemDragEnd = (activeId: number, overId: number) => {
    const targetAlbumId = currentAlbum?.id ?? selectedAlbumId
    if (!targetAlbumId) return

    if (
      albumItemMultiSelect.isMultiSelectMode &&
      albumItemMultiSelect.selectedIds.has(activeId) &&
      albumItemMultiSelect.selectedIds.size > 1
    ) {
      // グループ移動
      const selected = sortedAlbumItems.filter((item) =>
        albumItemMultiSelect.selectedIds.has(item.snapshot_id)
      )
      const nonSelected = sortedAlbumItems.filter(
        (item) => !albumItemMultiSelect.selectedIds.has(item.snapshot_id)
      )

      const overIndexInNonSelected = nonSelected.findIndex((item) => item.snapshot_id === overId)
      if (overIndexInNonSelected === -1) return

      const activeIndexInSorted = sortedAlbumItems.findIndex((item) => item.snapshot_id === activeId)
      const overIndexInSorted = sortedAlbumItems.findIndex((item) => item.snapshot_id === overId)

      const insertAt =
        activeIndexInSorted < overIndexInSorted
          ? overIndexInNonSelected + 1
          : overIndexInNonSelected

      const newItems = [
        ...nonSelected.slice(0, insertAt),
        ...selected,
        ...nonSelected.slice(insertAt),
      ]

      const newSnapshotIds = newItems.map((item) => item.snapshot_id)
      const updatedSnapshotIds =
        albumSortDirection === 'desc' ? [...newSnapshotIds].reverse() : newSnapshotIds
      updateAlbumOrder.mutate({
        id: targetAlbumId,
        snapshotIds: updatedSnapshotIds,
      })
    } else {
      const oldIndex = sortedAlbumItems.findIndex((item) => item.snapshot_id === activeId)
      const newIndex = sortedAlbumItems.findIndex((item) => item.snapshot_id === overId)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = [...sortedAlbumItems]
        const [movedItem] = newItems.splice(oldIndex, 1)
        newItems.splice(newIndex, 0, movedItem)

        const newSnapshotIds = newItems.map((item) => item.snapshot_id)
        const updatedSnapshotIds =
          albumSortDirection === 'desc' ? [...newSnapshotIds].reverse() : newSnapshotIds
        updateAlbumOrder.mutate({
          id: targetAlbumId,
          snapshotIds: updatedSnapshotIds,
        })
      }
    }
  }

  const handleAlbumItemClick = (snapshotId: number, event: React.MouseEvent) => {
    if (albumItemMultiSelect.isMultiSelectMode || event.ctrlKey || event.metaKey) {
      albumItemMultiSelect.handleItemClick(snapshotId, event)
    } else {
      const idx = sortedAlbumItems.findIndex((item) => item.snapshot_id === snapshotId)
      if (idx !== -1) {
        setModalPreviewIndex(idx)
        setIsModalPreviewOpen(true)
      }
    }
  }

  const lightboxImages =
    selectedAlbumId !== null
      ? sortedAlbumItems.map((item) => item.image_path ?? '')
      : sortedSnapshots.map((s) => s.image_path ?? '') ?? []

  const lightboxSnapshotIds =
    selectedAlbumId !== null
      ? sortedAlbumItems.map((item) => item.snapshot_id)
      : sortedSnapshots.map((s) => s.id) ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {selectedAlbumId !== null ? (
        <AlbumDetailView
          album={currentAlbum}
          sortedItems={sortedAlbumItems}
          visibleItems={visibleAlbumItems}
          sortCriterion={albumSortCriterion}
          sortDirection={albumSortDirection}
          onSortCriterionChange={setAlbumSortCriterion}
          onSortDirectionChange={setAlbumSortDirection}
          onBack={handleBackToAlbums}
          onRename={(newName) => {
            const targetId = currentAlbum?.id ?? selectedAlbumId
            if (targetId) updateAlbum.mutate({ id: targetId, name: newName })
          }}
          isRenaming={updateAlbum.isPending}
          onItemDragEnd={handleAlbumItemDragEnd}
          onOpenSpeechModal={setSelectedForSpeech}
          onOpenDeleteScopeModal={(snapshotIds) =>
            setAlbumDeleteTarget({ isOpen: true, snapshotIds })
          }
          onBulkDownload={(snapshotIds, zipName) =>
            handleBulkDownload(snapshotIds, zipName, true)
          }
          isDownloading={isDownloading}
          isDeletingItems={deleteAlbumItems.isPending}
          aspectRatioStyle={aspectRatioStyle}
          sentinelRef={albumItemSentinelRef as any}
          onItemClick={handleAlbumItemClick}
          isMultiSelectMode={albumItemMultiSelect.isMultiSelectMode}
          selectedIds={albumItemMultiSelect.selectedIds}
          onSelectAll={albumItemMultiSelect.selectAll}
          onClearSelection={albumItemMultiSelect.clearSelection}
          onEnterMultiSelectMode={albumItemMultiSelect.enterMultiSelectMode}
          onExitMultiSelectMode={albumItemMultiSelect.exitMultiSelectMode}
          isSelected={albumItemMultiSelect.isSelected}
          getLongPressHandlers={albumItemMultiSelect.getLongPressHandlers}
        />
      ) : (
        <>
          {/* Header */}
          <PageHeader
            title="History"
            icon={Clock}
            actions={
              <>
                <button
                  id="open-batch-speech-modal-btn"
                  onClick={() => setIsBatchSpeechModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-[#7C6FDD] hover:text-[#9084e6] hover:bg-[#7C6FDD]/10 transition-all font-medium whitespace-nowrap"
                >
                  <Sparkles size={13} />
                  <span>セリフ一括変換</span>
                  {activeBatchJob &&
                    (activeBatchJob.status === 'processing' || activeBatchJob.status === 'pending') && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-[#7C6FDD] animate-ping" />
                    )}
                </button>

                {!snapshotMultiSelect.isMultiSelectMode && view === 'snapshots' && (
                  <button
                    id="start-create-album"
                    onClick={() => snapshotMultiSelect.enterMultiSelectMode()}
                    className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all whitespace-nowrap"
                  >
                    <BookOpen size={13} />
                    <span>Add to Album</span>
                  </button>
                )}
                {/* View Toggle */}
                <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] flex-shrink-0">
                  {(['snapshots', 'albums'] as const).map((v) => (
                    <button
                      key={v}
                      id={`view-${v}`}
                      onClick={() => setView(v)}
                      className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors ${
                        view === v
                          ? 'bg-surface-2 text-zinc-200'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {v === 'snapshots' ? 'Snapshots' : 'Albums'}
                    </button>
                  ))}
                </div>
              </>
            }
          />

          {/* MultiSelectToolbar for Snapshot List */}
          {snapshotMultiSelect.isMultiSelectMode && (
            <MultiSelectToolbar
              selectedCount={snapshotMultiSelect.selectedIds.size}
              totalCount={sortedSnapshots.length}
              onSelectAll={snapshotMultiSelect.selectAll}
              onClearSelection={snapshotMultiSelect.clearSelection}
              onExitMode={snapshotMultiSelect.exitMultiSelectMode}
              actions={
                <div className="flex gap-2">
                  <button
                    id="bulk-download-btn"
                    onClick={() => {
                      const now = new Date()
                      const pad = (n: number) => n.toString().padStart(2, '0')
                      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
                        now.getDate()
                      )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
                      handleBulkDownload(
                        [...snapshotMultiSelect.selectedIds],
                        `${dateStr}.zip`,
                        false
                      )
                    }}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Download size={12} />
                    {isDownloading ? 'ダウンロード中...' : '一括ダウンロード'}
                  </button>
                  <button
                    id="save-album-btn"
                    onClick={() => setIsAddToAlbumModalOpen(true)}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#7C6FDD] text-white font-medium disabled:opacity-50 hover:bg-[#6b5ec7] transition-all"
                  >
                    アルバムへ追加
                  </button>
                  <button
                    id="bulk-delete-snapshots-btn"
                    onClick={() => setIsDeleteSnapshotsModalOpen(true)}
                    disabled={snapshotMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    一括削除
                  </button>
                </div>
              }
            />
          )}

          {/* Workflow Filter (snapshots only) */}
          {view === 'snapshots' && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-5 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
              <select
                id="history-workflow-filter"
                value={selectedWorkflowId ?? ''}
                onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All Workflows</option>
                {workflows?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>

              <select
                id="history-lora-filter"
                value={selectedLoraId ?? ''}
                onChange={(e) => setSelectedLoraId(Number(e.target.value) || null)}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All LoRAs</option>
                {loras?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.description || l.model_name}
                  </option>
                ))}
              </select>

              <select
                id="history-tagset-filter"
                value={selectedTagSetId ?? ''}
                onChange={(e) => setSelectedTagSetId(Number(e.target.value) || null)}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All Tag Sets</option>
                {tagSets?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

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
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {view === 'snapshots' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {visibleSnapshots.map((snap) => {
                  const isSelected = snapshotMultiSelect.isSelected(snap.id)
                  const longPressHandlers = snapshotMultiSelect.getLongPressHandlers(snap.id)
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
                        snapshotMultiSelect.isMultiSelectMode && isSelected
                          ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30 bg-surface-2'
                          : isModalPreviewOpen &&
                            sortedSnapshots &&
                            sortedSnapshots[modalPreviewIndex]?.id === snap.id
                          ? 'border-accent-green'
                          : 'border-transparent hover:border-zinc-700'
                      }`}
                      onClick={(e) => {
                        if (snapshotMultiSelect.isMultiSelectMode || e.ctrlKey || e.metaKey) {
                          snapshotMultiSelect.handleItemClick(snap.id, e)
                        } else {
                          const idx = sortedSnapshots.findIndex((s) => s.id === snap.id)
                          setModalPreviewIndex(idx >= 0 ? idx : 0)
                          setIsModalPreviewOpen(true)
                        }
                      }}
                    >
                      <div className="bg-surface-2 w-full" style={aspectRatioStyle}>
                        {snap.image_path || snap.thumbnail_path ? (
                          <img
                            src={snap.thumbnail_path || snap.image_path!}
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
                      {snapshotMultiSelect.isMultiSelectMode && (
                        <div className="absolute top-2 left-2 z-20">
                          {isSelected ? (
                            <div className="p-1 rounded-md bg-[#7C6FDD] text-white">
                              <Check size={12} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="p-1.5 rounded-md bg-black/60 border border-[rgba(255,255,255,0.2)] hover:bg-black/80" />
                          )}
                        </div>
                      )}

                      {/* Always visible action badges (Speech Edit -> Download -> Delete) */}
                      {!snapshotMultiSelect.isMultiSelectMode && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                          {snap.image_path && (
                            <button
                              id={`snap-speech-edit-${snap.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedForSpeech(snap)
                              }}
                              title="セリフ編集・吹き出し追加"
                              aria-label="セリフ編集・吹き出し追加"
                              className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-accent-green transition-colors shadow-sm"
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
                              className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white transition-colors shadow-sm"
                            >
                              <Download size={12} />
                            </a>
                          )}
                          <button
                            id={`snap-delete-${snap.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Delete snapshot?')) deleteSnapshot.mutate(snap.id)
                            }}
                            title="削除"
                            aria-label="削除"
                            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-red-400 transition-colors shadow-sm"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-zinc-300">
                          {new Date(snap.created_at).toLocaleDateString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
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
            ) : (
              <AlbumListView
                albums={albums}
                isLoading={isLoadingAlbums}
                onSelectAlbum={setSelectedAlbumId}
                onDeleteAlbum={(id) => deleteAlbum.mutate(id)}
                onRenameAlbum={(id, name) => updateAlbum.mutate({ id, name })}
                onReorderAlbums={handleAlbumReorder}
                isRenaming={updateAlbum.isPending}
              />
            )}
          </div>
        </>
      )}

      <HistoryModalPreview
        isOpen={isModalPreviewOpen}
        onClose={() => setIsModalPreviewOpen(false)}
        images={lightboxImages}
        currentIndex={modalPreviewIndex}
        onChangeIndex={setModalPreviewIndex}
        snapshotIds={lightboxSnapshotIds}
      />

      <AddSnapshotToAlbumModal
        isOpen={isAddToAlbumModalOpen}
        onClose={() => setIsAddToAlbumModalOpen(false)}
        onConfirm={({ albumId, newAlbumName }) => {
          addToAlbumMutation.mutate({
            albumId,
            newAlbumName,
            snapshotIds: [...snapshotMultiSelect.selectedIds],
          })
          setIsAddToAlbumModalOpen(false)
          snapshotMultiSelect.exitMultiSelectMode()
        }}
        isPending={addToAlbumMutation.isPending}
        title="選択した画像をアルバムに追加"
        confirmText="追加"
        allowNone={false}
      />

      {selectedForSpeech && (
        <SpeechBubbleEditorModal
          snapshot={selectedForSpeech}
          initialAlbumId={selectedAlbumId ?? undefined}
          onClose={() => setSelectedForSpeech(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['snapshots'] })
            if (selectedAlbumId !== null) {
              qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
            }
            qc.invalidateQueries({ queryKey: ['albums'] })
          }}
        />
      )}

      <BatchSpeechTransformModal
        isOpen={isBatchSpeechModalOpen}
        onClose={() => setIsBatchSpeechModalOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['snapshots'] })
          if (selectedAlbumId !== null) {
            qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
          }
          qc.invalidateQueries({ queryKey: ['albums'] })
        }}
      />

      {/* 履歴スナップショット一括削除確認モーダル */}
      {isDeleteSnapshotsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <Trash2 size={16} />
              スナップショットの一括削除
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              選択した{' '}
              <span className="font-bold text-white">
                {snapshotMultiSelect.selectedIds.size}
              </span>{' '}
              件のスナップショットおよび画像ファイルを完全に削除します。<br />
              この操作は取り消せません。本当によろしいですか？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteSnapshotsModalOpen(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
              >
                キャンセル
              </button>
              <button
                type="button"
                id="confirm-bulk-delete-btn"
                onClick={async () => {
                  const ids = [...snapshotMultiSelect.selectedIds]
                  await Promise.all(ids.map((id) => snapshotsApi.delete(id)))
                  qc.invalidateQueries({ queryKey: ['snapshots'] })
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  setIsDeleteSnapshotsModalOpen(false)
                  snapshotMultiSelect.exitMultiSelectMode()
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* アルバム削除スコープ選択モーダル */}
      {albumDeleteTarget.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Trash2 size={16} className="text-red-400" />
              アルバムからアイテムを削除
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {albumDeleteTarget.snapshotIds.length} 件のアイテムの削除方法を選択してください。
            </p>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                id="album-remove-only-btn"
                onClick={async () => {
                  await albumsApi.deleteItems(selectedAlbumId!, albumDeleteTarget.snapshotIds)
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
                  setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })
                  albumItemMultiSelect.exitMultiSelectMode()
                }}
                className="w-full text-left p-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 hover:bg-white/5 transition-all group"
              >
                <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                  アルバムから削除
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  アルバムの登録のみ解除し、履歴（元画像）には残します。
                </div>
              </button>
              <button
                type="button"
                id="album-delete-all-btn"
                onClick={async () => {
                  await albumsApi.deleteItems(selectedAlbumId!, albumDeleteTarget.snapshotIds)
                  await Promise.all(
                    albumDeleteTarget.snapshotIds.map((id) => snapshotsApi.delete(id))
                  )
                  qc.invalidateQueries({ queryKey: ['snapshots'] })
                  qc.invalidateQueries({ queryKey: ['albums'] })
                  qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
                  setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })
                  albumItemMultiSelect.exitMultiSelectMode()
                }}
                className="w-full text-left p-3 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 transition-all group"
              >
                <div className="text-xs font-semibold text-red-300 group-hover:text-red-200">
                  元画像ごと完全に削除
                </div>
                <div className="text-[11px] text-red-400/70 mt-0.5">
                  アルバムから解除し、履歴および元画像データも完全に削除します。
                </div>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAlbumDeleteTarget({ isOpen: false, snapshotIds: [] })}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
