import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import JSZip from 'jszip'
import {
  Clock,
  Trash2,
  Download,
  BookOpen,
  ImageOff,
  ArrowLeft,
  Square,
  Move,
  SortAsc,
  SortDesc,
  SlidersHorizontal,
  Check,
  MessageSquarePlus
} from 'lucide-react'
import { snapshotsApi, albumsApi, workflowsApi, lorasApi, tagSetsApi } from '../api/client'
import type { SnapshotSummary, Album, Lora, TagSet } from '../api/types'
import { HistoryModalPreview } from '../components/HistoryModalPreview'
import { AddSnapshotToAlbumModal } from '../components/AddSnapshotToAlbumModal'
import { SpeechBubbleEditorModal } from '../components/SpeechBubbleEditorModal'

import { useMultiSelect } from '../hooks/useMultiSelect'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'

// DnD Kit Imports
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LS_KEYS } from '../utils/localStorageKeys'

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
    touchAction: isDragging ? 'none' : 'pan-y'
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
  const [isDownloading, setIsDownloading] = useState(false)

  const handleBulkDownload = async (snapshotIds: number[], zipFilename: string, isAlbum = false) => {
    setIsDownloading(true)
    try {
      const zip = new JSZip()
      const usedNames = new Set<string>()

      const getUniqueFilename = (originalName: string, usedNames: Set<string>) => {
        if (!usedNames.has(originalName)) {
          usedNames.add(originalName);
          return originalName;
        }
        const extIndex = originalName.lastIndexOf('.');
        const base = extIndex !== -1 ? originalName.slice(0, extIndex) : originalName;
        const ext = extIndex !== -1 ? originalName.slice(extIndex) : '';
        let counter = 1;
        let newName = `${base}_${counter}${ext}`;
        while (usedNames.has(newName)) {
          counter++;
          newName = `${base}_${counter}${ext}`;
        }
        usedNames.add(newName);
        return newName;
      };

      const getFilenameFromPath = (imagePath: string, snapshotId: number) => {
        const parts = imagePath.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart === 'image' || !lastPart.includes('.')) {
          return `snapshot_${snapshotId}.png`;
        }
        return lastPart;
      };

      let orderedIds = [...snapshotIds]
      if (isAlbum) {
        // Sort snapshotIds to match their appearance order in sortedAlbumItems
        const idToIndex = new Map(sortedAlbumItems.map((item, idx) => [item.snapshot_id, idx]))
        orderedIds.sort((a, b) => (idToIndex.get(a) ?? 0) - (idToIndex.get(b) ?? 0))
      }

      let fileIndex = 1
      for (const id of orderedIds) {
        let imgPath: string | null = null
        const snap = snapshots?.find(s => s.id === id)
        if (snap) {
          imgPath = snap.image_path
        } else if (currentAlbum) {
          const albumItem = currentAlbum.items.find(item => item.snapshot_id === id)
          if (albumItem) {
            imgPath = albumItem.image_path
          }
        }

        if (!imgPath) continue

        try {
          const response = await fetch(imgPath)
          if (!response.ok) {
            console.error(`Failed to fetch image for snapshot ${id}: ${response.statusText}`)
            continue
          }
          const blob = await response.blob()
          let originalName = getFilenameFromPath(imgPath, id)
          if (isAlbum) {
            originalName = `${String(fileIndex).padStart(3, '0')}_${originalName}`
            fileIndex++
          }
          const uniqueName = getUniqueFilename(originalName, usedNames)
          zip.file(uniqueName, blob)
        } catch (e) {
          console.error(`Error downloading snapshot ${id}:`, e)
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = zipFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Failed to create ZIP package: ' + error)
    } finally {
      setIsDownloading(false)
    }
  }

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedLoraId, setSelectedLoraId] = useState<number | null>(null)
  const [selectedTagSetId, setSelectedTagSetId] = useState<number | null>(null)
  const [isAddToAlbumModalOpen, setIsAddToAlbumModalOpen] = useState(false)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)
  const [selectedForSpeech, setSelectedForSpeech] = useState<SnapshotSummary | null>(null)

  // Album Detail specific states
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'custom' | 'date-asc' | 'date-desc'>('custom')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [activeId, setActiveId] = useState<number | null>(null)

  // Infinite scroll / lazy limit states
  const [snapshotLimit, setSnapshotLimit] = useState(24)
  const [albumItemLimit, setAlbumItemLimit] = useState(24)

  // Refs for sentinels
  const snapshotSentinelRef = useRef<HTMLDivElement | null>(null)
  const albumItemSentinelRef = useRef<HTMLDivElement | null>(null)

  // Reset snapshot limit on filter/sort changes
  useEffect(() => {
    setSnapshotLimit(24)
  }, [selectedWorkflowId, selectedLoraId, selectedTagSetId, sortOrder])

  // Reset album item limit when selected album changes
  useEffect(() => {
    setAlbumItemLimit(24)
  }, [selectedAlbumId])

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
    queryFn: () => snapshotsApi.list({
      workflow_id: selectedWorkflowId ?? undefined,
      lora_id: selectedLoraId ?? undefined,
      tag_set_id: selectedTagSetId ?? undefined,
    }) as Promise<SnapshotSummary[]>,
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

  const visibleAlbumItems = useMemo(() => {
    return sortedAlbumItems.slice(0, albumItemLimit)
  }, [sortedAlbumItems, albumItemLimit])

  const snapshotMultiSelect = useMultiSelect({ items: snapshots ?? [] })
  const albumItemMultiSelect = useMultiSelect({ items: sortedAlbumItems.map(i => ({ id: i.snapshot_id })) })

  const isAnyMultiSelect = snapshotMultiSelect.isMultiSelectMode || albumItemMultiSelect.isMultiSelectMode

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: isAnyMultiSelect
        ? { distance: 8 }
        : {
            delay: (() => {
              const stored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE);
              const parsed = stored !== null ? parseFloat(stored) : NaN;
              return !isNaN(parsed) ? parsed * 1000 : 500;
            })(),
            tolerance: 5
          }
    })
  )

  const deleteSnapshot = useMutation({
    mutationFn: (id: number) => snapshotsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }),
  })

  const addToAlbumMutation = useMutation({
    mutationFn: async ({ albumId, newAlbumName }: { albumId: number | null; newAlbumName?: string }) => {
      const selectedIdsArray = [...snapshotMultiSelect.selectedIds]
      if (albumId !== null) {
        await albumsApi.addItems(albumId, selectedIdsArray)
      } else if (newAlbumName) {
        await albumsApi.create({
          name: newAlbumName,
          snapshot_ids: selectedIdsArray,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums'] })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      setIsAddToAlbumModalOpen(false)
      snapshotMultiSelect.exitMultiSelectMode()
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
      albumItemMultiSelect.exitMultiSelectMode()
    },
    onError: (err: any) => {
      alert('Failed to delete items: ' + err.message)
    }
  })

  const handleBackToAlbums = () => {
    setSelectedAlbumId(null)
    albumItemMultiSelect.exitMultiSelectMode()
    setSortBy('custom')
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id || !currentAlbum) return

    if (albumItemMultiSelect.isMultiSelectMode && albumItemMultiSelect.selectedIds.has(active.id as number) && albumItemMultiSelect.selectedIds.size > 1) {
      // グループ移動
      const selected = sortedAlbumItems.filter(item => albumItemMultiSelect.selectedIds.has(item.snapshot_id))
      const nonSelected = sortedAlbumItems.filter(item => !albumItemMultiSelect.selectedIds.has(item.snapshot_id))

      const overIndexInNonSelected = nonSelected.findIndex(item => item.snapshot_id === over.id)
      if (overIndexInNonSelected === -1) return

      const activeIndexInSorted = sortedAlbumItems.findIndex(item => item.snapshot_id === active.id)
      const overIndexInSorted = sortedAlbumItems.findIndex(item => item.snapshot_id === over.id)

      const insertAt = activeIndexInSorted < overIndexInSorted ? overIndexInNonSelected + 1 : overIndexInNonSelected

      const newItems = [
        ...nonSelected.slice(0, insertAt),
        ...selected,
        ...nonSelected.slice(insertAt)
      ]
      
      const updatedSnapshotIds = newItems.map(item => item.snapshot_id)
      updateAlbumOrder.mutate({
        id: currentAlbum.id,
        snapshotIds: updatedSnapshotIds
      })
    } else {
      const oldIndex = sortedAlbumItems.findIndex(item => item.snapshot_id === active.id)
      const newIndex = sortedAlbumItems.findIndex(item => item.snapshot_id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = [...sortedAlbumItems]
        const [movedItem] = newItems.splice(oldIndex, 1)
        newItems.splice(newIndex, 0, movedItem)

        const updatedSnapshotIds = newItems.map(item => item.snapshot_id)
        updateAlbumOrder.mutate({
          id: currentAlbum.id,
          snapshotIds: updatedSnapshotIds
        })
      }
    }
  }

  const handleItemClick = (snapshotId: number, event: React.MouseEvent) => {
    if (albumItemMultiSelect.isMultiSelectMode || event.ctrlKey || event.metaKey) {
      albumItemMultiSelect.handleItemClick(snapshotId, event)
    } else {
      const idx = sortedAlbumItems.findIndex(item => item.snapshot_id === snapshotId)
      if (idx !== -1) {
        setModalPreviewIndex(idx)
        setIsModalPreviewOpen(true)
      }
    }
  }

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

  // IntersectionObserver for snapshots infinite scroll
  useEffect(() => {
    const sentinel = snapshotSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setSnapshotLimit((prev) => prev + 24)
      }
    }, {
      rootMargin: '200px',
    })

    observer.observe(sentinel)
    return () => {
      observer.unobserve(sentinel)
    }
  }, [snapshots, snapshotLimit])

  // IntersectionObserver for album items infinite scroll
  useEffect(() => {
    const sentinel = albumItemSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setAlbumItemLimit((prev) => prev + 24)
      }
    }, {
      rootMargin: '200px',
    })

    observer.observe(sentinel)
    return () => {
      observer.unobserve(sentinel)
    }
  }, [currentAlbum, albumItemLimit])

  const lightboxImages = selectedAlbumId !== null
    ? sortedAlbumItems.map(item => item.image_path ?? '')
    : (sortedSnapshots.map((s) => s.image_path ?? '') ?? [])

  const lightboxSnapshotIds = selectedAlbumId !== null
    ? sortedAlbumItems.map(item => item.snapshot_id)
    : (sortedSnapshots.map((s) => s.id) ?? [])

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

              {!albumItemMultiSelect.isMultiSelectMode && (
                <button
                  id="toggle-bulk-mode"
                  onClick={() => {
                    albumItemMultiSelect.enterMultiSelectMode()
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
                >
                  <Square size={13} />
                  選択モード
                </button>
              )}
            </div>
          </div>

          {/* MultiSelect Toolbar inside Album Detail */}
          {albumItemMultiSelect.isMultiSelectMode && (
            <MultiSelectToolbar
              selectedCount={albumItemMultiSelect.selectedIds.size}
              totalCount={sortedAlbumItems.length}
              onSelectAll={albumItemMultiSelect.selectAll}
              onClearSelection={albumItemMultiSelect.clearSelection}
              onExitMode={albumItemMultiSelect.exitMultiSelectMode}
              actions={
                <div className="flex gap-2">
                  <button
                    id="bulk-download-btn"
                    onClick={() => {
                      handleBulkDownload([...albumItemMultiSelect.selectedIds], `${currentAlbum?.name || 'album'}.zip`, true)
                    }}
                    disabled={albumItemMultiSelect.selectedIds.size === 0 || isDownloading}
                    className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Download size={12} />
                    {isDownloading ? 'ダウンロード中...' : '一括ダウンロード'}
                  </button>
                  <button
                    id="bulk-delete-confirm-btn"
                    disabled={albumItemMultiSelect.selectedIds.size === 0 || deleteAlbumItems.isPending || isDownloading}
                    onClick={() => {
                      if (confirm(`Remove ${albumItemMultiSelect.selectedIds.size} items from this album?`)) {
                        deleteAlbumItems.mutate({
                          id: selectedAlbumId!,
                          snapshotIds: [...albumItemMultiSelect.selectedIds]
                        })
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-all flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    {deleteAlbumItems.isPending ? 'Removing...' : '一括削除実行'}
                  </button>
                </div>
              }
            />
          )}

          {/* Grid Area with DnD Context */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedAlbumItems.map((item) => item.snapshot_id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {visibleAlbumItems.map((item) => {
                    const isSelected = albumItemMultiSelect.isSelected(item.snapshot_id)
                    const isDndEnabled = sortBy === 'custom' && !updateAlbumOrder.isPending
                    const longPressHandlers = albumItemMultiSelect.getLongPressHandlers(item.snapshot_id)

                    const cardContent = (
                      <div
                        id={`album-item-card-${item.snapshot_id}`}
                        onClick={(e) => handleItemClick(item.snapshot_id, e)}
                        onMouseDown={longPressHandlers.onMouseDown}
                        onMouseUp={longPressHandlers.onMouseUp}
                        onMouseLeave={longPressHandlers.onMouseLeave}
                        onTouchStart={longPressHandlers.onTouchStart}
                        onTouchEnd={longPressHandlers.onTouchEnd}
                        className={`group aspect-square bg-surface-2 border rounded-xl overflow-hidden relative flex items-center justify-center transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30 bg-surface-2'
                            : 'border-transparent hover:border-zinc-700'
                        }`}
                      >
                        {item.image_path || item.thumbnail_path ? (
                          <img
                            src={item.thumbnail_path || item.image_path!}
                            alt=""
                            loading="lazy"
                            className="max-w-full max-h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                             <ImageOff size={20} strokeWidth={1} />
                          </div>
                        )}

                        {/* Selection Checkbox */}
                        {albumItemMultiSelect.isMultiSelectMode && (
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

                        {/* Hover single delete / Drag indicator */}
                        {!albumItemMultiSelect.isMultiSelectMode && (
                          <>
                            {isDndEnabled && (
                              <div className="absolute top-2 left-2 p-1.5 rounded-md bg-black/60 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <Move size={12} />
                              </div>
                            )}
                            {item.image_path && (
                              <a
                                href={item.image_path}
                                download
                                id={`item-download-${item.snapshot_id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-2 right-9 p-1.5 rounded-md bg-black/60 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
                              >
                                <Download size={12} />
                              </a>
                            )}
                            <button
                              id={`item-delete-btn-${item.snapshot_id}`}
                              onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm('Remove this image from album?')) {
                                    deleteAlbumItems.mutate({
                                      id: selectedAlbumId!,
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
                  {visibleAlbumItems.length < sortedAlbumItems.length && (
                    <div ref={albumItemSentinelRef} className="col-span-full h-8 flex items-center justify-center text-xs text-zinc-500">
                      Loading more...
                    </div>
                  )}
                  {sortedAlbumItems.length === 0 && (
                    <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
                      <BookOpen size={40} strokeWidth={1} />
                      <p className="mt-3 text-sm">No images in this album.</p>
                    </div>
                  )}
                </div>
              </SortableContext>

              {/* Drag Overlay for Album Detail */}
              <DragOverlay>
                {activeId && (
                  <div className="relative">
                    {albumItemMultiSelect.isMultiSelectMode && albumItemMultiSelect.selectedIds.size > 1 && (
                      <>
                        {albumItemMultiSelect.selectedIds.size > 2 && (
                          <div className="absolute inset-0 bg-surface-2 border border-zinc-700/80 rounded-xl transform translate-x-2 translate-y-2 -rotate-6 pointer-events-none opacity-60 w-[120px] h-[120px]" />
                        )}
                        <div className="absolute inset-0 bg-surface-2 border border-zinc-700/90 rounded-xl transform translate-x-1 translate-y-1 rotate-3 pointer-events-none opacity-75 w-[120px] h-[120px]" />
                      </>
                    )}
                    <div className="relative z-10 opacity-90 scale-105 ring-2 ring-[#7C6FDD] rounded-xl pointer-events-none bg-surface-2 border border-zinc-700 flex items-center justify-center w-[120px] h-[120px]">
                      {(() => {
                        const item = currentAlbum?.items.find((x) => x.snapshot_id === activeId)
                        return item?.image_path ? (
                          <img src={item.image_path} alt="" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <ImageOff size={20} />
                        )
                      })()}
                    </div>
                    {albumItemMultiSelect.isMultiSelectMode && albumItemMultiSelect.selectedIds.size > 1 && (
                      <div className="absolute -bottom-2 -right-2 z-20 bg-[#7C6FDD] text-white text-xs font-bold
                                      rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                        +{albumItemMultiSelect.selectedIds.size - 1}
                      </div>
                    )}
                  </div>
                )}
              </DragOverlay>
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
              {!snapshotMultiSelect.isMultiSelectMode && view === 'snapshots' && (
                <button
                  id="start-create-album"
                  onClick={() => snapshotMultiSelect.enterMultiSelectMode()}
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

          {/* MultiSelectToolbar for Snapshot List (Replacement for Album Create Bar) */}
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
                      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
                      handleBulkDownload([...snapshotMultiSelect.selectedIds], `${dateStr}.zip`, false)
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
                </div>
              }
            />
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
                      sortOrder === order ? 'bg-surface-2 text-zinc-200' : 'text-zinc-550 hover:text-zinc-350'
                    }`}
                  >
                    {order === 'desc' ? '新しい順' : '古い順'}
                  </button>
                ))}
              </div>

              <span className="text-xs text-zinc-600">{sortedSnapshots.length} snapshots</span>
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
                      className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                        snapshotMultiSelect.isMultiSelectMode && isSelected
                          ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30 bg-surface-2'
                          : isModalPreviewOpen && sortedSnapshots && sortedSnapshots[modalPreviewIndex]?.id === snap.id
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
                      <div className="aspect-square bg-surface-2">
                        {snap.image_path || snap.thumbnail_path ? (
                          <img src={snap.thumbnail_path || snap.image_path!} alt={`Snapshot ${snap.id}`} loading="lazy" className="w-full h-full object-cover" />
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
                        {snap.image_path && !snapshotMultiSelect.isMultiSelectMode && (
                          <button
                            id={`snap-speech-edit-${snap.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedForSpeech(snap)
                            }}
                            title="セリフ編集・吹き出し追加"
                            className="p-1.5 rounded-md bg-surface/80 text-zinc-400 hover:text-accent-green"
                          >
                            <MessageSquarePlus size={12} />
                          </button>
                        )}
                        {!snapshotMultiSelect.isMultiSelectMode && (
                          <button
                            id={`snap-delete-${snap.id}`}
                            onClick={(e) => { e.stopPropagation(); if (confirm('Delete snapshot?')) deleteSnapshot.mutate(snap.id) }}
                            className="p-1.5 rounded-md bg-surface/80 text-zinc-400 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-zinc-300">
                          {new Date(snap.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {visibleSnapshots.length < sortedSnapshots.length && (
                  <div ref={snapshotSentinelRef} className="col-span-full h-8 flex items-center justify-center text-xs text-zinc-500">
                    Loading more...
                  </div>
                )}
                {(sortedSnapshots.length === 0) && (
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
                          {item.image_path || item.thumbnail_path ? (
                            <img src={item.thumbnail_path || item.image_path!} alt="" loading="lazy" className="w-full h-full object-cover" />
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
      {selectedForSpeech && (
        <SpeechBubbleEditorModal
          snapshot={selectedForSpeech}
          onClose={() => setSelectedForSpeech(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['snapshots'] })
          }}
        />
      )}
    </div>
  )
}
