import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Edit2,
  Check,
  X,
  SlidersHorizontal,
  Clock,
  SortAsc,
  SortDesc,
  Square,
  Download,
  Trash2,
  GripVertical,
  MessageSquarePlus,
  ImageOff,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Album, SnapshotSummary } from '../../../api/types'
import { MultiSelectToolbar } from '../../../components/MultiSelectToolbar'

interface DragHandleListeners {
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => void
  onTouchStart?: (event: React.TouchEvent<HTMLButtonElement | HTMLDivElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => void
  [key: string]: any
}

interface DragHandleRenderProps {
  attributes: Record<string, any>
  listeners: DragHandleListeners
  isDragging: boolean
}

function SortableItem({
  id,
  children,
  disabled,
}: {
  id: number
  children: (handleProps: DragHandleRenderProps) => React.ReactNode
  disabled?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  const mouseListeners: React.DOMAttributes<HTMLDivElement> = {
    onMouseDown: listeners?.onMouseDown as any,
    onKeyDown: listeners?.onKeyDown as any,
  }

  const touchHandleListeners: DragHandleListeners = {
    onTouchStart: listeners?.onTouchStart as any,
    onMouseDown: listeners?.onMouseDown as any,
  }

  const style: React.CSSProperties = {
    transform: transform
      ? `${CSS.Transform.toString(transform)} scale(1.05)`
      : isDragging
      ? 'scale(1.05)'
      : undefined,
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging
      ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5)'
      : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="h-full w-full relative"
      {...attributes}
      {...mouseListeners}
    >
      {children({ attributes, listeners: touchHandleListeners, isDragging })}
    </div>
  )
}

export interface AlbumDetailViewProps {
  album?: Album | null
  sortedItems: Album['items']
  visibleItems: Album['items']
  sortCriterion: 'custom' | 'date'
  sortDirection: 'asc' | 'desc'
  onSortCriterionChange: (c: 'custom' | 'date') => void
  onSortDirectionChange: (d: 'asc' | 'desc') => void
  onBack: () => void
  onRename: (newName: string) => void
  isRenaming?: boolean
  onItemDragEnd: (activeId: number, overId: number) => void
  onOpenSpeechModal: (snapshot: SnapshotSummary) => void
  onOpenDeleteScopeModal: (snapshotIds: number[]) => void
  onBulkDownload: (snapshotIds: number[], zipName: string) => void
  isDownloading: boolean
  isDeletingItems?: boolean
  aspectRatioStyle: React.CSSProperties
  sentinelRef: React.RefObject<HTMLDivElement>
  onItemClick: (snapshotId: number, event: React.MouseEvent) => void
  isMultiSelectMode: boolean
  selectedIds: Set<number>
  onSelectAll: () => void
  onClearSelection: () => void
  onEnterMultiSelectMode: () => void
  onExitMultiSelectMode: () => void
  isSelected: (id: number) => boolean
  getLongPressHandlers: (id: number) => {
    onMouseDown: (e: React.MouseEvent) => void
    onMouseUp: () => void
    onMouseLeave: () => void
    onTouchStart: (e: React.TouchEvent) => void
    onTouchEnd: () => void
  }
}

export function AlbumDetailView({
  album,
  sortedItems,
  visibleItems,
  sortCriterion,
  sortDirection,
  onSortCriterionChange,
  onSortDirectionChange,
  onBack,
  onRename,
  isRenaming,
  onItemDragEnd,
  onOpenSpeechModal,
  onOpenDeleteScopeModal,
  onBulkDownload,
  isDownloading,
  isDeletingItems,
  aspectRatioStyle,
  sentinelRef,
  onItemClick,
  isMultiSelectMode,
  selectedIds,
  onSelectAll,
  onClearSelection,
  onEnterMultiSelectMode,
  onExitMultiSelectMode,
  isSelected,
  getLongPressHandlers,
}: AlbumDetailViewProps) {
  const [isEditingDetailName, setIsEditingDetailName] = useState(false)
  const [detailAlbumName, setDetailAlbumName] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    onItemDragEnd(active.id as number, over.id as number)
  }

  const isDndEnabled = sortCriterion === 'custom'

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            {isEditingDetailName ? (
              <div className="flex items-center gap-1.5">
                <input
                  id="album-detail-name-input"
                  type="text"
                  value={detailAlbumName}
                  onChange={(e) => setDetailAlbumName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = detailAlbumName.trim()
                      if (trimmed && trimmed !== album?.name) {
                        onRename(trimmed)
                      }
                      setIsEditingDetailName(false)
                    } else if (e.key === 'Escape') {
                      setIsEditingDetailName(false)
                    }
                  }}
                  autoFocus
                  className="text-sm bg-surface-2 border border-zinc-600 rounded px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-accent-green"
                />
                <button
                  id="album-detail-name-save"
                  onClick={() => {
                    const trimmed = detailAlbumName.trim()
                    if (trimmed && trimmed !== album?.name) {
                      onRename(trimmed)
                    }
                    setIsEditingDetailName(false)
                  }}
                  disabled={isRenaming}
                  className="p-1.5 rounded text-zinc-400 hover:text-accent-green hover:bg-zinc-700/50"
                  title="保存"
                >
                  <Check size={15} />
                </button>
                <button
                  id="album-detail-name-cancel"
                  onClick={() => setIsEditingDetailName(false)}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
                  title="キャンセル"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group/header-title">
                <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
                  <BookOpen size={17} className="text-zinc-400" />
                  {album?.name || 'Loading Album...'}
                </h1>
                {album && (
                  <button
                    id="album-detail-edit-btn"
                    onClick={() => {
                      setIsEditingDetailName(true)
                      setDetailAlbumName(album.name)
                    }}
                    title="アルバム名を変更"
                    className="opacity-0 group-hover/header-title:opacity-100 transition-opacity p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-zinc-500 mt-0.5">{sortedItems.length} images</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Sort Criterion Selector */}
          <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
            <button
              id="sort-custom"
              onClick={() => onSortCriterionChange('custom')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                sortCriterion === 'custom'
                  ? 'bg-surface-2 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <SlidersHorizontal size={12} />
              カスタム順
            </button>
            <button
              id="sort-date"
              onClick={() => onSortCriterionChange('date')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                sortCriterion === 'date'
                  ? 'bg-surface-2 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Clock size={12} />
              登録日時
            </button>
          </div>

          {/* Sort Direction Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)]">
            <button
              id="sort-dir-asc"
              onClick={() => onSortDirectionChange('asc')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                sortDirection === 'asc'
                  ? 'bg-surface-2 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="昇順"
            >
              <SortAsc size={13} />
              <span className="hidden sm:inline">昇順</span>
            </button>
            <button
              id="sort-dir-desc"
              onClick={() => onSortDirectionChange('desc')}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                sortDirection === 'desc'
                  ? 'bg-surface-2 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="降順"
            >
              <SortDesc size={13} />
              <span className="hidden sm:inline">降順</span>
            </button>
          </div>

          {!isMultiSelectMode && (
            <button
              id="toggle-bulk-mode"
              onClick={onEnterMultiSelectMode}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
            >
              <Square size={13} />
              選択モード
            </button>
          )}
        </div>
      </div>

      {/* MultiSelect Toolbar inside Album Detail */}
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={sortedItems.length}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onExitMode={onExitMultiSelectMode}
          actions={
            <div className="flex gap-2">
              <button
                id="bulk-download-btn"
                onClick={() => {
                  onBulkDownload([...selectedIds], `${album?.name || 'album'}.zip`)
                }}
                disabled={selectedIds.size === 0 || isDownloading}
                className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface border border-[rgba(255,255,255,0.08)] text-zinc-300 font-medium disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <Download size={12} />
                {isDownloading ? 'ダウンロード中...' : '一括ダウンロード'}
              </button>
              <button
                id="bulk-delete-confirm-btn"
                disabled={selectedIds.size === 0 || isDeletingItems || isDownloading}
                onClick={() => {
                  onOpenDeleteScopeModal([...selectedIds])
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-all flex items-center gap-1"
              >
                <Trash2 size={12} />
                {isDeletingItems ? 'Removing...' : '一括削除'}
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
            items={sortedItems.map((item) => item.snapshot_id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visibleItems.map((item) => {
                const isItemSelected = isSelected(item.snapshot_id)
                const longPressHandlers = getLongPressHandlers(item.snapshot_id)

                const renderCardContent = (touchHandleListeners?: DragHandleListeners) => (
                  <div
                    id={`album-item-card-${item.snapshot_id}`}
                    onClick={(e) => onItemClick(item.snapshot_id, e)}
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
                      ...aspectRatioStyle,
                    }}
                    className={`group bg-surface-2 border rounded-xl overflow-hidden relative flex items-center justify-center transition-all cursor-pointer select-none w-full ${
                      isItemSelected
                        ? 'border-[#7C6FDD] ring-1 ring-[#7C6FDD]/30 bg-surface-2'
                        : 'border-transparent hover:border-zinc-700'
                    }`}
                  >
                    {item.image_path || item.thumbnail_path ? (
                      <img
                        src={item.thumbnail_path || item.image_path!}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="max-w-full max-h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <ImageOff size={20} strokeWidth={1} />
                      </div>
                    )}

                    {/* Selection Checkbox */}
                    {isMultiSelectMode && (
                      <div className="absolute top-2 left-2 z-20">
                        {isItemSelected ? (
                          <div className="p-1 rounded-md bg-[#7C6FDD] text-white">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-md bg-black/60 border border-[rgba(255,255,255,0.2)] hover:bg-black/80" />
                        )}
                      </div>
                    )}

                    {/* Drag indicator */}
                    {!isMultiSelectMode && isDndEnabled && (
                      <button
                        type="button"
                        className="absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing touch-none select-none p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white transition-colors"
                        style={{
                          touchAction: 'none',
                          WebkitTouchCallout: 'none',
                          userSelect: 'none',
                        }}
                        onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) =>
                          e.preventDefault()
                        }
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                        {...touchHandleListeners}
                        title="ドラッグして並び替え"
                        aria-label="並び替えハンドル"
                      >
                        <GripVertical size={12} />
                      </button>
                    )}

                    {/* Always visible action badges (Speech Edit -> Download -> Delete) */}
                    {!isMultiSelectMode && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                        {item.image_path && (
                          <button
                            id={`item-speech-edit-${item.snapshot_id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenSpeechModal({
                                id: item.snapshot_id,
                                workflow_id: 0,
                                image_path: item.image_path,
                                thumbnail_path: item.thumbnail_path,
                                created_at: item.created_at || '',
                              })
                            }}
                            title="セリフ編集・吹き出し追加"
                            aria-label="セリフ編集・吹き出し追加"
                            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-accent-green transition-colors shadow-sm"
                          >
                            <MessageSquarePlus size={12} />
                          </button>
                        )}
                        {item.image_path && (
                          <a
                            href={item.image_path}
                            download
                            id={`item-download-${item.snapshot_id}`}
                            onClick={(e) => e.stopPropagation()}
                            title="ダウンロード"
                            aria-label="ダウンロード"
                            className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white transition-colors shadow-sm"
                          >
                            <Download size={12} />
                          </a>
                        )}
                        <button
                          id={`item-delete-btn-${item.snapshot_id}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDeleteScopeModal([item.snapshot_id])
                          }}
                          title="削除"
                          aria-label="削除"
                          className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-red-400 transition-colors shadow-sm"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )

                return (
                  <div key={item.snapshot_id} className="w-full" style={aspectRatioStyle}>
                    {isDndEnabled ? (
                      <SortableItem id={item.snapshot_id}>
                        {({ listeners }) => renderCardContent(listeners)}
                      </SortableItem>
                    ) : (
                      renderCardContent()
                    )}
                  </div>
                )
              })}
              {visibleItems.length < sortedItems.length && (
                <div
                  ref={sentinelRef}
                  className="col-span-full h-8 flex items-center justify-center text-xs text-zinc-500"
                >
                  Loading more...
                </div>
              )}
              {sortedItems.length === 0 && (
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
                {isMultiSelectMode && selectedIds.size > 1 && (
                  <>
                    {selectedIds.size > 2 && (
                      <div className="absolute inset-0 bg-surface-2 border border-zinc-700/80 rounded-xl transform translate-x-2 translate-y-2 -rotate-6 pointer-events-none opacity-60 w-[120px] h-[120px]" />
                    )}
                    <div className="absolute inset-0 bg-surface-2 border border-zinc-700/90 rounded-xl transform translate-x-1 translate-y-1 rotate-3 pointer-events-none opacity-75 w-[120px] h-[120px]" />
                  </>
                )}
                <div className="relative z-10 opacity-90 scale-105 ring-2 ring-[#7C6FDD] rounded-xl pointer-events-none bg-surface-2 border border-zinc-700 flex items-center justify-center w-[120px] h-[120px]">
                  {(() => {
                    const item = album?.items.find((x) => x.snapshot_id === activeId)
                    return item?.image_path ? (
                      <img
                        src={item.image_path}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <ImageOff size={20} />
                    )
                  })()}
                </div>
                {isMultiSelectMode && selectedIds.size > 1 && (
                  <div className="absolute -bottom-2 -right-2 z-20 bg-[#7C6FDD] text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                    +{selectedIds.size - 1}
                  </div>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  )
}
