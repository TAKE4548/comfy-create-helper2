import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Trash2,
  Download,
  BookOpen,
  ImageOff,
  X,
  ArrowLeft,
  CheckSquare,
  Square,
  Move,
  SortAsc,
  SortDesc,
  SlidersHorizontal,
  Check
} from 'lucide-react'
import { snapshotsApi, albumsApi, workflowsApi } from '../api/client'
import type { SnapshotSummary, Album } from '../api/types'
import { HistoryModalPreview } from '../components/HistoryModalPreview'
import { AddSnapshotToAlbumModal } from '../components/AddSnapshotToAlbumModal'

// DnD Kit Imports
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Sortable wrapper component
function SortableItem({
  id,
  children,
  disabled
}: {
  id: number
  children: React.ReactNode
  disabled?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled })

  const style = {
    transform: transform
      ? `${CSS.Transform.toString(transform)} scale(1.05)`
      : isDragging
      ? 'scale(1.05)'
      : undefined,
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)' : undefined,
    touchAction: 'none'
  }

  return (
    <div ref={setNodeRef} style={style} className="h-full w-full relative">
      <div {...attributes} {...listeners} className="h-full w-full">
        {children}
      </div>
    </div>
  )
}

export function HistoryPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<'snapshots' | 'albums'>('snapshots')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedForAlbum, setSelectedForAlbum] = useState<Set<number>>(new Set())
  const [createAlbumMode, setCreateAlbumMode] = useState(false)
  const [isAddToAlbumModalOpen, setIsAddToAlbumModalOpen] = useState(false)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)

  // Album Detail specific states
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedItemsForDelete, setSelectedItemsForDelete] = useState<Set<number>>(new Set())
  const [sortBy, setSortBy] = useState<'custom' | 'date-asc' | 'date-desc'>('custom')

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8 // Prevents drag-and-drop triggers on simple clicks
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5
      }
    })
  )

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId ?? undefined) as Promise<SnapshotSummary[]>,
  })

  const { data: albums } = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<Album[]>,
  })

  // Selected Album details query
  const { data: currentAlbum } = useQuery({
    queryKey: ['album', selectedAlbumId],
    queryFn: () => albumsApi.get(selectedAlbumId!) as Promise<Album>,
    enabled: selectedAlbumId !== null,
  })

  const deleteSnapshot = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  const addToAlbumMutation = useMutation({
    mutationFn: async ({ albumId, newAlbumName }: { albumId: number | null; newAlbumName?: string }) => {
      if (albumId !== null) {
        await albumsApi.addItems(albumId, [...selectedForAlbum])
      } else if (newAlbumName) {
        await albumsApi.create({
          name: newAlbumName,
          snapshot_ids: [...selectedForAlbum],
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      setIsAddToAlbumModalOpen(false)
      setCreateAlbumMode(false)
      setSelectedForAlbum(new Set())
    },
  })

  const deleteAlbum = useMutation({
    mutationFn: (id: number) => albumsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['albums'] }),
  })

  // Order Update mutation with optimistic update support
  const updateAlbumOrder = useMutation({
    mutationFn: ({ id, snapshotIds }: { id: number; snapshotIds: number[] }) =>
      albumsApi.updateOrder(id, snapshotIds),
    onMutate: async ({ id, snapshotIds }) => {
      await qc.cancelQueries({ queryKey: ['album', id] })
      const previousAlbum = qc.getQueryData<Album>(['album', id])
      if (previousAlbum) {
        const sortedItems = [...previousAlbum.items].sort((a, b) => {
          const idxA = snapshotIds.indexOf(a.snapshot_id)
          const idxB = snapshotIds.indexOf(b.snapshot_id)
          return idxA - idxB
        })
        qc.setQueryData<Album>(['album', id], {
          ...previousAlbum,
          items: sortedItems.map((item, idx) => ({ ...item, sequence_order: idx })),
        })
      }
      return { previousAlbum }
    },
    onError: (err: any, variables, context) => {
      if (context?.previousAlbum) {
        qc.setQueryData(['album', variables.id], context.previousAlbum)
      }
      alert('Failed to update order: ' + err.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
    },
  })

  // Delete items mutation
  const deleteAlbumItems = useMutation({
    mutationFn: ({ id, snapshotIds }: { id: number; snapshotIds: number[] }) =>
      albumsApi.deleteItems(id, snapshotIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['album', selectedAlbumId] })
      setSelectedItemsForDelete(new Set())
    },
    onError: (err: any) => {
      alert('Failed to delete items: ' + err.message)
    }
  })

  const toggleSelectForAlbum = (id: number) => {
    setSelectedForAlbum((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBackToAlbums = () => {
    setSelectedAlbumId(null)
    setBulkSelectMode(false)
    setSelectedItemsForDelete(new Set())
    setSortBy('custom')
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !currentAlbum) return

    const oldIndex = currentAlbum.items.findIndex(item => item.snapshot_id === active.id)
    const newIndex = currentAlbum.items.findIndex(item => item.snapshot_id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = [...currentAlbum.items]
      const [movedItem] = newItems.splice(oldIndex, 1)
      newItems.splice(newIndex, 0, movedItem)

      const updatedSnapshotIds = newItems.map(item => item.snapshot_id)
      updateAlbumOrder.mutate({
        id: currentAlbum.id,
        snapshotIds: updatedSnapshotIds
      })
    }
  }

  const handleItemClick = (snapshotId: number) => {
    if (bulkSelectMode) {
      setSelectedItemsForDelete((prev) => {
        const next = new Set(prev)
        next.has(snapshotId) ? next.delete(snapshotId) : next.add(snapshotId)
        return next
      })
    } else {
      const idx = sortedAlbumItems.findIndex(item => item.snapshot_id === snapshotId)
      if (idx !== -1) {
        setModalPreviewIndex(idx)
        setIsModalPreviewOpen(true)
      }
    }
  }

  // Sort items based on local select
  const sortedAlbumItems = currentAlbum
    ? [...currentAlbum.items].sort((a, b) => {
        if (sortBy === 'date-asc') {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateA - dateB
        }
        if (sortBy === 'date-desc') {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateB - dateA
        }
        return a.sequence_order - b.sequence_order
      })
    : []

  // Lightbox Image & ID array bindings
  const lightboxImages = selectedAlbumId !== null
    ? sortedAlbumItems.map(item => item.image_path ?? '')
    : (snapshots?.map((s) => s.image_path ?? '') ?? [])

  const lightboxSnapshotIds = selectedAlbumId !== null
    ? sortedAlbumItems.map(item => item.snapshot_id)
    : (snapshots?.map((s) => s.id) ?? [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {selectedAlbumId !== null ? (
        // Album Detail View
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBackToAlbums}
                className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
                  <BookOpen size={17} className="text-zinc-400" />
                  {currentAlbum?.name || 'Loading Album...'}
                </h1>
                <p className="text-xs text-zinc-500 mt-0.5">{sortedAlbumItems.length} images</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sort Selector */}
              <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
                <button
                  id="sort-custom"
                  onClick={() => setSortBy('custom')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'custom' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <SlidersHorizontal size={12} />
                  カスタム順
                </button>
                <button
                  id="sort-date-asc"
                  onClick={() => setSortBy('date-asc')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'date-asc' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <SortAsc size={12} />
                  古い順
                </button>
                <button
                  id="sort-date-desc"
                  onClick={() => setSortBy('date-desc')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'date-desc' ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <SortDesc size={12} />
                  新しい順
                </button>
              </div>

              {/* Bulk Mode Toggle */}
              <button
                id="toggle-bulk-mode"
                onClick={() => {
                  setBulkSelectMode(!bulkSelectMode)
                  setSelectedItemsForDelete(new Set())
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  bulkSelectMode
                    ? 'bg-[#7C6FDD]/20 border-[#7C6FDD] text-[#a99ef7]'
                    : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                }`}
              >
                {bulkSelectMode ? <CheckSquare size={13} /> : <Square size={13} />}
                選択モード
              </button>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {bulkSelectMode && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] animate-slide-up">
              <span className="text-xs text-red-400">{selectedItemsForDelete.size} items selected</span>
              <div className="flex gap-2">
                <button
                  id="bulk-delete-confirm-btn"
                  disabled={selectedItemsForDelete.size === 0 || deleteAlbumItems.isPending}
                  onClick={() => {
                    if (confirm(`Remove ${selectedItemsForDelete.size} items from this album?`)) {
                      deleteAlbumItems.mutate({
                        id: selectedAlbumId,
                        snapshotIds: [...selectedItemsForDelete]
                      })
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-all"
                >
                  {deleteAlbumItems.isPending ? 'Removing...' : '一括削除実行'}
                </button>
                <button
                  onClick={() => {
                    setBulkSelectMode(false)
                    setSelectedItemsForDelete(new Set())
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* Grid Area with DnD Context */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedAlbumItems.map((item) => item.snapshot_id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sortedAlbumItems.map((item) => {
                    const isSelected = selectedItemsForDelete.has(item.snapshot_id)
                    const isDndEnabled = sortBy === 'custom' && !bulkSelectMode && !updateAlbumOrder.isPending
                    
                    const cardContent = (
                      <div
                        id={`album-item-card-${item.snapshot_id}`}
                        onClick={() => handleItemClick(item.snapshot_id)}
                        className={`group aspect-square bg-surface-2 border rounded-xl overflow-hidden relative flex items-center justify-center transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30'
                            : 'border-transparent hover:border-zinc-700'
                        }`}
                      >
                        {item.image_path ? (
                          <img
                            src={item.image_path}
                            alt=""
                            className="max-w-full max-h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <ImageOff size={20} strokeWidth={1} />
                          </div>
                        )}

                        {/* Selection Checkbox */}
                        {bulkSelectMode && (
                          <div className="absolute top-2 left-2 z-20">
                            {isSelected ? (
                              <div className="p-1 rounded-md bg-[#7C6FDD] text-white">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-md bg-black/60 border border-[rgba(255,255,255,0.2)]" />
                            )}
                          </div>
                        )}

                        {/* Hover single delete / Drag indicator */}
                        {!bulkSelectMode && (
                          <>
                            {isDndEnabled && (
                              <div className="absolute top-2 left-2 p-1.5 rounded-md bg-black/60 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <Move size={12} />
                              </div>
                            )}
                            <button
                              id={`item-delete-btn-${item.snapshot_id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Remove this image from album?')) {
                                  deleteAlbumItems.mutate({
                                    id: selectedAlbumId,
                                    snapshotIds: [item.snapshot_id]
                                  })
                                }
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    )

                    return (
                      <div key={item.snapshot_id} className="aspect-square">
                        {isDndEnabled ? (
                          <SortableItem id={item.snapshot_id}>
                            {cardContent}
                          </SortableItem>
                        ) : (
                          cardContent
                        )}
                      </div>
                    )
                  })}
                  {sortedAlbumItems.length === 0 && (
                    <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                      <BookOpen size={40} strokeWidth={1} />
                      <p className="mt-3 text-sm">No images in this album.</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </>
      ) : (
        // Standard View (Snapshots vs Albums list)
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
            <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Clock size={17} className="text-zinc-400" />
              History
            </h1>
            <div className="flex items-center gap-2">
              {!createAlbumMode && view === 'snapshots' && (
                <button
                  id="start-create-album"
                  onClick={() => setCreateAlbumMode(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
                >
                  <BookOpen size={13} />
                  Add to Album
                </button>
              )}
              {/* View Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
                {(['snapshots', 'albums'] as const).map((v) => (
                  <button
                    key={v}
                    id={`view-${v}`}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      view === v ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {v === 'snapshots' ? 'Snapshots' : 'Albums'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Create Album Bar */}
          {createAlbumMode && (
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[rgba(124,111,221,0.3)] bg-[rgba(124,111,221,0.05)] animate-slide-up">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-[#7C6FDD] flex-shrink-0" />
                <span className="text-xs text-zinc-300">アルバムに追加するスナップショットを選択してください</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">{selectedForAlbum.size} selected</span>
                <button
                  id="save-album-btn"
                  onClick={() => setIsAddToAlbumModalOpen(true)}
                  disabled={selectedForAlbum.size === 0}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#7C6FDD] text-white font-medium disabled:opacity-50 hover:bg-[#6b5ec7] transition-all"
                >
                  アルバムへ追加
                </button>
                <button onClick={() => { setCreateAlbumMode(false); setSelectedForAlbum(new Set()) }}>
                  <X size={16} className="text-zinc-500" />
                </button>
              </div>
            </div>
          )}

          {/* Workflow Filter (snapshots only) */}
          {view === 'snapshots' && (
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
              <select
                id="history-workflow-filter"
                value={selectedWorkflowId ?? ''}
                onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40"
              >
                <option value="">All Workflows</option>
                {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <span className="text-xs text-zinc-600">{snapshots?.length ?? 0} snapshots</span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            {view === 'snapshots' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {snapshots?.map((snap) => (
                  <div
                    key={snap.id}
                    id={`snap-card-${snap.id}`}
                    className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      createAlbumMode && selectedForAlbum.has(snap.id)
                        ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30'
                        : isModalPreviewOpen && snapshots && snapshots[modalPreviewIndex]?.id === snap.id
                          ? 'border-accent-green'
                          : 'border-transparent hover:border-zinc-700'
                    }`}
                    onClick={() => {
                      if (createAlbumMode) {
                        toggleSelectForAlbum(snap.id)
                      } else {
                        const idx = snapshots?.findIndex((s) => s.id === snap.id) ?? 0
                        setModalPreviewIndex(idx >= 0 ? idx : 0)
                        setIsModalPreviewOpen(true)
                      }
                    }}
                  >
                    <div className="aspect-square bg-surface-2">
                      {snap.image_path ? (
                        <img src={snap.image_path} alt={`Snapshot ${snap.id}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <ImageOff size={20} strokeWidth={1} />
                        </div>
                      )}
                    </div>
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      {snap.image_path && (
                        <a
                          href={snap.image_path}
                          download
                          id={`snap-download-${snap.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md bg-surface/80 text-zinc-300 hover:text-white"
                        >
                          <Download size={12} />
                        </a>
                      )}
                      <button
                        id={`snap-delete-${snap.id}`}
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete snapshot?')) deleteSnapshot.mutate(snap.id) }}
                        className="p-1.5 rounded-md bg-surface/80 text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-zinc-300">
                        {new Date(snap.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {(snapshots?.length === 0) && (
                  <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                    <Clock size={40} strokeWidth={1} />
                    <p className="mt-3 text-sm">No snapshots yet.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {albums?.map((album) => (
                  <div
                    key={album.id}
                    id={`album-card-${album.id}`}
                    onClick={() => setSelectedAlbumId(album.id)}
                    className="group rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.1)] transition-all cursor-pointer"
                  >
                    {/* Album thumbnail grid */}
                    <div className="grid grid-cols-3 gap-0.5 aspect-[3/1] bg-surface-2">
                      {album.items.slice(0, 3).map((item, i) => (
                        <div key={i} className="bg-surface-2 overflow-hidden">
                          {item.image_path ? (
                            <img src={item.image_path} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                              <ImageOff size={16} strokeWidth={1} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{album.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{album.items.length} images</p>
                      </div>
                      <button
                        id={`album-delete-${album.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Delete album?')) deleteAlbum.mutate(album.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {(albums?.length === 0) && (
                  <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                    <BookOpen size={40} strokeWidth={1} />
                    <p className="mt-3 text-sm">No albums yet.</p>
                  </div>
                )}
              </div>
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
        onConfirm={(data) => addToAlbumMutation.mutate(data)}
        isPending={addToAlbumMutation.isPending}
        title="選択した画像をアルバムに追加"
        confirmText="追加"
        allowNone={false}
      />
    </div>
  )
}
