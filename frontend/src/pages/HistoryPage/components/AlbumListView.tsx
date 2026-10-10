import { useState } from 'react'
import { BookOpen, ImageOff, GripVertical, Check, X, Edit2, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Album } from '../../../api/types'

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

function SortableAlbumItem({
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

  const touchHandleListeners: DragHandleListeners = {
    onTouchStart: listeners?.onTouchStart as any,
    onMouseDown: listeners?.onMouseDown as any,
    onKeyDown: listeners?.onKeyDown as any,
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
    >
      {children({ attributes, listeners: touchHandleListeners, isDragging })}
    </div>
  )
}

export interface AlbumListViewProps {
  albums: Album[] | undefined
  isLoading?: boolean
  onSelectAlbum: (id: number) => void
  onDeleteAlbum: (id: number) => void
  onRenameAlbum: (id: number, newName: string) => void
  onReorderAlbums: (oldIndex: number, newIndex: number) => void
  isRenaming?: boolean
}

export function AlbumListView({
  albums,
  onSelectAlbum,
  onDeleteAlbum,
  onRenameAlbum,
  onReorderAlbums,
  isRenaming,
}: AlbumListViewProps) {
  const [editingAlbumId, setEditingAlbumId] = useState<number | null>(null)
  const [editingAlbumName, setEditingAlbumName] = useState('')
  const [activeAlbumId, setActiveAlbumId] = useState<number | null>(null)
  const [overAlbumId, setOverAlbumId] = useState<number | null>(null)
  const [deleteConfirmAlbumId, setDeleteConfirmAlbumId] = useState<number | null>(null)

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

  const handleAlbumDragStart = (event: DragStartEvent) => {
    setActiveAlbumId(Number(event.active.id))
  }

  const handleAlbumDragOver = (event: DragOverEvent) => {
    setOverAlbumId(event.over ? Number(event.over.id) : null)
  }

  const handleAlbumDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveAlbumId(null)
    setOverAlbumId(null)
    if (!over || active.id === over.id || !albums) return
    const oldIndex = albums.findIndex((a) => a.id === Number(active.id))
    const newIndex = albums.findIndex((a) => a.id === Number(over.id))
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderAlbums(oldIndex, newIndex)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleAlbumDragStart}
      onDragOver={handleAlbumDragOver}
      onDragEnd={handleAlbumDragEnd}
    >
      <SortableContext
        items={albums?.map((a) => a.id) ?? []}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {albums?.map((album) => (
            <SortableAlbumItem
              key={album.id}
              id={album.id}
              disabled={editingAlbumId !== null || deleteConfirmAlbumId !== null}
            >
              {({ attributes, listeners: touchHandleListeners }) => (
                <div
                  id={`album-card-${album.id}`}
                  onClick={() => {
                    if (editingAlbumId !== album.id) {
                      onSelectAlbum(album.id)
                    }
                  }}
                  className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.1)] transition-all cursor-pointer h-full flex flex-col justify-between select-none"
                >
                  {overAlbumId === album.id && activeAlbumId !== album.id && (
                    <div
                      data-testid={`album-drop-marker-${album.id}`}
                      aria-hidden="true"
                      className={`absolute left-1 right-1 z-30 h-1 rounded-full bg-accent-green shadow-[0_0_12px_rgba(62,207,142,0.8)] pointer-events-none ${
                        albums && albums.findIndex((item) => item.id === activeAlbumId) < albums.findIndex((item) => item.id === album.id)
                          ? 'bottom-0'
                          : 'top-0'
                      }`}
                    />
                  )}

                  {/* タッチ用ドラッグハンドル */}
                  {editingAlbumId !== album.id && (
                    <button
                      type="button"
                      className="absolute top-2 right-2 z-20 cursor-grab active:cursor-grabbing touch-none select-none p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white transition-colors"
                      style={{
                        touchAction: 'none',
                        WebkitTouchCallout: 'none',
                        userSelect: 'none',
                      }}
                      {...touchHandleListeners}
                      {...attributes}
                      onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      title="ドラッグして並び替え"
                      aria-label="並び替えハンドル"
                    >
                      <GripVertical size={14} />
                    </button>
                  )}

                  <div
                    data-testid={`album-cover-${album.id}`}
                    className="relative h-32 overflow-hidden bg-surface-2 flex items-center justify-center"
                  >
                    {album.items.length === 0 ? (
                      <div className="flex flex-col items-center gap-1 text-zinc-500">
                        <ImageOff size={22} strokeWidth={1} />
                        <span className="text-xs">画像はありません</span>
                      </div>
                    ) : album.items.slice(0, 3).map((item, index, covers) => {
                      const source = item.thumbnail_path || item.image_path
                      const isSingle = covers.length === 1
                      return (
                        <div
                          key={item.snapshot_id}
                          className={`absolute top-2 bottom-2 overflow-hidden rounded-lg border border-white/20 bg-surface shadow-xl ${
                            isSingle ? 'left-2 right-2' : 'w-[62%]'
                          }`}
                          style={isSingle ? undefined : {
                            left: `${14 + index * 15}%`,
                            zIndex: index + 1,
                            transform: `rotate(${(index - (covers.length - 1) / 2) * 5}deg)`,
                          }}
                        >
                          {source ? (
                            <img
                              data-testid={`album-cover-image-${album.id}-${index}`}
                              src={source}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                              <ImageOff size={18} strokeWidth={1} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                    {editingAlbumId === album.id ? (
                      <div
                        className="flex items-center gap-1.5 flex-1 mr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          id={`album-name-input-${album.id}`}
                          type="text"
                          value={editingAlbumName}
                          onChange={(e) => setEditingAlbumName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const trimmed = editingAlbumName.trim()
                              if (trimmed && trimmed !== album.name) {
                                onRenameAlbum(album.id, trimmed)
                              }
                              setEditingAlbumId(null)
                            } else if (e.key === 'Escape') {
                              setEditingAlbumId(null)
                            }
                          }}
                          autoFocus
                          className="text-xs bg-surface-2 border border-zinc-600 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-accent-green flex-1"
                        />
                        <button
                          id={`album-rename-save-${album.id}`}
                          onClick={() => {
                            const trimmed = editingAlbumName.trim()
                            if (trimmed && trimmed !== album.name) {
                              onRenameAlbum(album.id, trimmed)
                            }
                            setEditingAlbumId(null)
                          }}
                          disabled={isRenaming}
                          className="p-1 rounded text-zinc-400 hover:text-accent-green hover:bg-zinc-700/50"
                          title="保存"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          id={`album-rename-cancel-${album.id}`}
                          onClick={() => setEditingAlbumId(null)}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
                          title="キャンセル"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="flex items-center gap-1.5 group/name">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {album.name}
                          </p>
                          <button
                            id={`album-edit-btn-${album.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingAlbumId(album.id)
                              setEditingAlbumName(album.name)
                            }}
                            title="アルバム名を変更"
                            className="opacity-0 group-hover:opacity-100 group-hover/name:opacity-100 transition-opacity p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      id={`album-delete-${album.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirmAlbumId(album.id)
                      }}
                      aria-label="アルバムを削除"
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-zinc-400 truncate" title={album.description || undefined}>
                        {album.description?.trim() || '未設定'}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span data-testid={`album-image-count-${album.id}`}>{album.items.length}枚</span>
                        <time data-testid={`album-created-at-${album.id}`} dateTime={album.created_at}>
                          {new Date(album.created_at).toLocaleDateString('ja-JP')}
                        </time>
                      </div>
                    </div>
                    {deleteConfirmAlbumId === album.id && (
                      <div
                        role="alertdialog"
                        aria-label={`${album.name}の削除確認`}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2"
                      >
                        <p className="text-xs text-zinc-200">
                          「{album.name}」を削除しますか？画像{album.items.length}枚のアルバム参照が外れます。
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmAlbumId(null)}
                            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteAlbum(album.id)
                              setDeleteConfirmAlbumId(null)
                            }}
                            className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/30"
                          >
                            {album.name} を削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SortableAlbumItem>
          ))}
          {albums?.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-20 text-zinc-600">
              <BookOpen size={40} strokeWidth={1} />
              <p className="mt-3 text-sm">No albums yet.</p>
            </div>
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeAlbumId &&
          (() => {
            const album = albums?.find((a) => a.id === activeAlbumId)
            if (!album) return null
            return (
              <div
                data-testid={`album-drag-overlay-${album.id}`}
                className="rounded-xl border border-zinc-600 bg-surface shadow-2xl opacity-90 scale-105 p-3 w-[260px]"
              >
                <p className="text-sm font-medium text-zinc-200 truncate">{album.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{album.items.length} images</p>
              </div>
            )
          })()}
      </DragOverlay>
    </DndContext>
  )
}
