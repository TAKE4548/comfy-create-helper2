import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, Pencil, Settings2, CheckSquare, Square, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { tagSetsApi, tagsetCategoriesApi, baseModelsApi } from '../api/client'
import type { TagSet, Category, BaseModel } from '../api/types'
import { ImageCarousel } from '../components/ImageCarousel'
import { CategoryManagerModal } from '../components/CategoryManagerModal'
import {
  TagSetCreateModal,
  TagSetEditModal,
  TagSetDetailModal,
  type TagSetFormState,
} from '../components/TagSetModals'
import { ImageCropper } from '../components/ImageCropper'
import { useThumbnailAspectRatio } from '../hooks/useThumbnailAspectRatio'

import { useMultiSelect } from '../hooks/useMultiSelect'
import { BulkEditModal, type BulkEditField } from '../components/BulkEditModal'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'

const EMPTY_FORM: TagSetFormState = { name: '', description: '', category_id: undefined, tags: '', subsets: [], target_base_model_ids: [] }

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

function SortableTagSetCard({ id, children, disabled }: { id: number; children: (handleProps: DragHandleRenderProps) => React.ReactNode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  const mouseListeners: React.DOMAttributes<HTMLDivElement> = {
    onMouseDown: listeners?.onMouseDown as any,
    onKeyDown: listeners?.onKeyDown as any,
  }

  const touchHandleListeners: DragHandleListeners = {
    onTouchStart: listeners?.onTouchStart as any,
    onMouseDown: listeners?.onMouseDown as any,
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...mouseListeners}>
      {children({ attributes, listeners: touchHandleListeners, isDragging })}
    </div>
  )
}

export function TagsPage() {
  const qc = useQueryClient()

  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [items, setItems] = useState<TagSet[]>([])

  const {
    isMultiSelectMode,
    selectedIds,
    exitMultiSelectMode,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    selectAll,
    clearSelection,
  } = useMultiSelect({ items })

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // PCマウス: 8px移動でドラッグ開始
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 5, // モバイルタッチ: ドラッグハンドル上で5px移動で即時開始
      },
    })
  )
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [selectedBaseModelIds, setSelectedBaseModelIds] = useState<number[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [selectedTagSetForDetail, setSelectedTagSetForDetail] = useState<TagSet | null>(null)
  const [copiedDetailId, setCopiedDetailId] = useState<number | null>(null)
  const [editTagSet, setEditTagSet] = useState<TagSet | null>(null)
  const [form, setForm] = useState<TagSetFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<TagSetFormState>(EMPTY_FORM)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [isEditCropping, setIsEditCropping] = useState(false)
  const { aspectRatioStyle, numericRatio } = useThumbnailAspectRatio()

  const { data: categories } = useQuery({
    queryKey: ['tagset-categories'],
    queryFn: () => tagsetCategoriesApi.list() as Promise<Category[]>,
  })
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>,
  })
  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets', selectedCat, selectedBaseModelIds],
    queryFn: () => tagSetsApi.list(
      selectedCat ?? undefined,
      selectedBaseModelIds.length > 0 ? selectedBaseModelIds.join(',') : undefined
    ) as Promise<TagSet[]>,
  })

  useEffect(() => {
    if (tagSets) {
      setItems(tagSets)
    }
  }, [tagSets])

  const createTagSet = useMutation({
    mutationFn: () => tagSetsApi.create({
      name: form.name,
      description: form.description || undefined,
      category_id: form.category_id,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      subsets: form.subsets ? form.subsets.map((s: { name: string; tags: string }) => ({
        name: s.name,
        tags: s.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      })) : [],
      target_base_model_ids: form.target_base_model_ids
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tag-sets'] }); setShowModal(false); setForm(EMPTY_FORM) },
  })

  const updateTagSet = useMutation({
    mutationFn: ({ id, tagForm }: { id: number; tagForm: TagSetFormState }) =>
      tagSetsApi.update(id, {
        name: tagForm.name,
        description: tagForm.description || undefined,
        category_id: tagForm.category_id,
        tags: tagForm.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
        thumbnail_path: tagForm.thumbnail_path || undefined,
        subsets: tagForm.subsets ? tagForm.subsets.map((s: { name: string; tags: string }) => ({
          name: s.name,
          tags: s.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        })) : [],
        target_base_model_ids: tagForm.target_base_model_ids
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-sets'] })
      setEditTagSet(null)
      setSelectedTagSetForDetail(null)
    },
    onError: () => {
      alert('タグセットの保存に失敗しました。')
    }
  })

  const deleteTagSet = useMutation({
    mutationFn: (id: number) => tagSetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tag-sets'] }),
  })

  const reorderTagSets = useMutation({
    mutationFn: (ordered_ids: number[]) => tagSetsApi.reorder(ordered_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tag-sets'] }),
  })

  const uploadImage = async (blob: Blob): Promise<string> => {
    const formData = new FormData()
    formData.append('file', blob, 'cropped.jpg')
    const res = await fetch('/api/snapshots/upload', {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      throw new Error('Upload failed')
    }
    const data = await res.json()
    return data.image_path
  }

  const handleCropComplete = async (blob: Blob) => {
    try {
      const imagePath = await uploadImage(blob)
      if (isEditCropping) {
        setEditForm((f) => ({ ...f, thumbnail_path: imagePath }))
      } else {
        setForm((f) => ({ ...f, thumbnail_path: imagePath }))
      }
    } catch (err) {
      console.error(err)
      alert('画像のアップロードに失敗しました')
    } finally {
      setCropImageSrc(null)
    }
  }

  const tagSetBulkEditFields: BulkEditField[] = [
    {
      key: 'category_id',
      label: 'カテゴリ',
      type: 'category',
      options: categories?.map(c => ({ id: c.id, name: c.name })) || [],
    },
  ]

  const bulkUpdateTagSets = useMutation({
    mutationFn: async (values: any) => {
      await Promise.all(
        [...selectedIds].map(id => {
          const tagSet = items.find(i => i.id === id)
          if (!tagSet) return Promise.resolve()
          const updatedTs = {
            name: tagSet.name,
            description: tagSet.description,
            category_id: tagSet.category_id,
            tags: tagSet.tags,
            thumbnail_path: tagSet.thumbnail_path,
            ...values
          }
          return tagSetsApi.update(id, updatedTs)
        })
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-sets'] })
      exitMultiSelectMode()
      setShowBulkEdit(false)
    }
  })

  const handleCopy = (id: number, tags: string[]) => {
    navigator.clipboard.writeText(tags.join(', '))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1200)
  }

  const handleDetailCopy = (id: number, tags: string[]) => {
    navigator.clipboard.writeText(tags.join(', '))
    setCopiedDetailId(id)
    setTimeout(() => setCopiedDetailId(null), 2000)
  }

  const openEdit = (ts: any) => {
    setEditTagSet(ts)
    setEditForm({
      name: ts.name,
      description: ts.description ?? '',
      category_id: ts.category_id ?? undefined,
      tags: ts.tags.join(', '),
      thumbnail_path: ts.thumbnail_path ?? undefined,
      subsets: ts.subsets ? ts.subsets.map((s: any) => ({
        name: s.name,
        tags: s.tags.join(', ')
      })) : [],
      target_base_model_ids: ts.target_base_model_ids ?? []
    })
  }

  const filtered = items.filter(
    (ts) =>
      ts.name.toLowerCase().includes(search.toLowerCase()) ||
      (ts.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      ts.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  const isDndActive = !search && selectedCat === null && selectedBaseModelIds.length === 0

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    if (isMultiSelectMode && selectedIds.has(active.id as number) && selectedIds.size > 1) {
      if (selectedIds.has(over.id as number)) return
      // グループ移動
      const activeIdx = items.findIndex(i => i.id === active.id)
      const overIdx = items.findIndex(i => i.id === over.id)
      const selected = items.filter(i => selectedIds.has(i.id))
      const nonSelected = items.filter(i => !selectedIds.has(i.id))
      const overIdxInNonSelected = nonSelected.findIndex(i => i.id === over.id)
      const insertAt = overIdx > activeIdx ? overIdxInNonSelected + 1 : overIdxInNonSelected
      const newOrder = [...nonSelected.slice(0, insertAt), ...selected, ...nonSelected.slice(insertAt)]
      setItems(newOrder)
      reorderTagSets.mutate(newOrder.map(i => i.id))
    } else {
      const oldIdx = items.findIndex((x) => x.id === Number(active.id))
      const newIdx = items.findIndex((x) => x.id === Number(over.id))
      const reordered = arrayMove(items, oldIdx, newIdx)
      setItems(reordered)
      reorderTagSets.mutate(reordered.map((x) => x.id))
    }
  }

  const renderDragOverlayItem = (id: number) => {
    const ts = items.find((x) => x.id === id)
    if (!ts) return null
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#1F1F25] overflow-hidden flex flex-col justify-between h-full min-h-[300px] w-[200px]">
        <div className="relative w-full bg-zinc-800 flex items-center justify-center text-zinc-500 overflow-hidden" style={aspectRatioStyle}>
          {ts.thumbnail_path ? (
            <img src={ts.thumbnail_path} alt={ts.name} className="w-full h-full object-cover" />
          ) : (
            <Tag size={32} />
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col justify-between gap-2">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-semibold text-zinc-200 truncate">{ts.name}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={items.length}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onExitMode={exitMultiSelectMode}
          actions={
            <button
              onClick={() => setShowBulkEdit(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/10 border border-purple-600/30 text-purple-400 text-xs font-medium hover:bg-purple-600/20 transition-all disabled:opacity-50"
            >
              <Pencil size={12} />
              一括編集
            </button>
          }
        />
      )}

      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Tag size={17} className="text-accent-purple" />Tag Sets
          <span className="text-xs text-zinc-500 font-normal ml-1">({filtered.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatModal(true)}
            className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200 transition-all"
            title="カテゴリ管理"
          >
            <Settings2 size={15} />
          </button>
          <button id="create-tagset-btn" onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C6FDD]/10 border border-[#7C6FDD]/30 text-[#7C6FDD] text-xs font-medium hover:bg-[#7C6FDD]/20 transition-all">
            <Plus size={14} />New Tag Set
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input id="tag-search" type="text" placeholder="Search tags…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#7C6FDD]/40" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button id="tag-filter-all" onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === null ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            All
          </button>
          {categories?.map((cat) => (
            <button key={cat.id} id={`tag-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === cat.id ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-[#7C6FDD]' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Base Model Filters */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-[rgba(255,255,255,0.06)] bg-surface/30">
        <span className="text-xs font-semibold text-zinc-400">Base Models:</span>
        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar">
          {baseModels?.map((bm) => {
            const isChecked = selectedBaseModelIds.includes(bm.id)
            return (
              <label key={bm.id} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id={`base-model-filter-${bm.name}`}
                  checked={isChecked}
                  onChange={() => {
                    if (isChecked) {
                      setSelectedBaseModelIds(selectedBaseModelIds.filter(id => id !== bm.id))
                    } else {
                      setSelectedBaseModelIds([...selectedBaseModelIds, bm.id])
                    }
                  }}
                  className="rounded border-[rgba(255,255,255,0.08)] bg-surface-2 text-[#7C6FDD] focus:ring-0 focus:ring-offset-0"
                />
                <span>{bm.name}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((ts) => {
                const catName = categories?.find((c) => c.id === ts.category_id)?.name
                const longPressHandlers = getLongPressHandlers(ts.id)
                return (
                  <SortableTagSetCard key={ts.id} id={ts.id} disabled={!isDndActive}>
                    {({ listeners: touchHandleListeners }) => (
                    <div id={`tagset-card-${ts.id}`} 
                      onClick={(e) => {
                        if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                          e.stopPropagation()
                          handleItemClick(ts.id, e)
                        } else {
                          setSelectedTagSetForDetail(ts)
                        }
                      }}
                      onMouseDown={longPressHandlers.onMouseDown}
                      onMouseUp={longPressHandlers.onMouseUp}
                      onMouseLeave={longPressHandlers.onMouseLeave}
                      onTouchStart={longPressHandlers.onTouchStart}
                      onTouchEnd={longPressHandlers.onTouchEnd}
                      className={`group relative rounded-xl border overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer flex flex-col justify-between h-full min-h-[300px] ${
                        isMultiSelectMode && isSelected(ts.id)
                          ? 'border-purple-500/50 ring-1 ring-purple-500/30 bg-surface'
                          : 'border-[rgba(255,255,255,0.06)] bg-surface'
                      }`}>
                      
                      {isMultiSelectMode && (
                        <div className="absolute top-2 left-2 z-20 p-1 rounded-md bg-surface/80 text-purple-400 border border-[rgba(255,255,255,0.08)]">
                          {isSelected(ts.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                      )}

                      {/* タッチ用ドラッグハンドル */}
                      {!isMultiSelectMode && isDndActive && (
                        <button
                          type="button"
                          className="absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing touch-none select-none p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white transition-colors"
                          style={{ touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
                          onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                          {...touchHandleListeners}
                          title="ドラッグして並び替え"
                          aria-label="並び替えハンドル"
                        >
                          <GripVertical size={14} />
                        </button>
                      )}

                      <ImageCarousel
                        thumbnailPath={ts.thumbnail_path}
                        snapshotPaths={ts.snapshot_paths}
                        alt={ts.name}
                        className="w-full"
                        style={aspectRatioStyle}
                      >
                        <button id={`tagset-edit-${ts.id}`}
                          onClick={(e) => { e.stopPropagation(); openEdit(ts) }}
                          className="absolute top-2 right-8 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-[#7C6FDD]/20 hover:text-[#7C6FDD]">
                          <Pencil size={13} />
                        </button>
                        <button id={`tagset-delete-${ts.id}`}
                          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this tag set?')) deleteTagSet.mutate(ts.id) }}
                          className="absolute top-2 right-2 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
                          <Trash2 size={13} />
                        </button>
                      </ImageCarousel>

                      <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-semibold text-zinc-200 truncate flex-1" title={ts.name}>{ts.name}</p>
                            {catName && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#7C6FDD]/15 text-[#a99ef7] border border-[#7C6FDD]/25">
                                {catName}
                              </span>
                            )}
                          </div>
                          {ts.description && <p className="text-[10px] text-zinc-500 line-clamp-2" title={ts.description}>{ts.description}</p>}
                        </div>

                        <div className="flex flex-wrap gap-1 overflow-hidden max-h-[44px]">
                          {ts.tags.slice(0, 5).map((tag, i) => (
                            <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-[rgba(124,111,221,0.06)] border border-[rgba(124,111,221,0.15)] text-[#a99ef7] font-mono truncate max-w-[80px]">{tag}</span>
                          ))}
                          {ts.tags.length > 5 && <span className="text-[9px] px-1 py-0.5 text-zinc-600 font-medium">+{ts.tags.length - 5}</span>}
                        </div>

                        <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-2 mt-1">
                          <span className="text-[9px] text-zinc-600">{ts.tags.length} tags</span>
                          <button id={`copy-tagset-${ts.id}`}
                            onClick={(e) => { e.stopPropagation(); handleCopy(ts.id, ts.tags) }}
                            className={`text-[9px] px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${copiedId === ts.id ? 'bg-accent-green/20 text-accent-green border border-accent-green/30' : 'bg-surface-2 border border-[rgba(255,255,255,0.08)] text-zinc-500 hover:text-zinc-300'}`}>
                            <Copy size={9} />{copiedId === ts.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                    </div>
                    )}
                  </SortableTagSetCard>
                )
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId && (
              <div className="relative">
                <div className="opacity-90 scale-105 ring-2 ring-purple-500 rounded-xl pointer-events-none">
                  {renderDragOverlayItem(activeId)}
                </div>
                {isMultiSelectMode && selectedIds.size > 1 && (
                  <div className="absolute -bottom-2 -right-2 bg-purple-500 text-black text-xs font-bold
                                  rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                    +{selectedIds.size - 1}
                  </div>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Tag size={40} strokeWidth={1} /><p className="mt-3 text-sm">No tag sets yet.</p>
          </div>
        )}
      </div>

      {showModal && (
        <TagSetCreateModal form={form} setForm={setForm} categories={categories}
          isPending={createTagSet.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={() => createTagSet.mutate()}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['tagset-categories'] })}
          onUploadImage={(src) => {
            setCropImageSrc(src)
            setIsEditCropping(false)
          }} />
      )}
      {editTagSet && (
        <TagSetEditModal form={editForm} setForm={setEditForm} categories={categories}
          isPending={updateTagSet.isPending}
          onClose={() => setEditTagSet(null)}
          onSubmit={() => updateTagSet.mutate({ id: editTagSet.id, tagForm: editForm })}
          snapshotPaths={editTagSet.snapshot_paths}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['tagset-categories'] })}
          onUploadImage={(src) => {
            setCropImageSrc(src)
            setIsEditCropping(true)
          }} />
      )}
      {selectedTagSetForDetail && (
        <TagSetDetailModal tagSet={selectedTagSetForDetail} categories={categories}
          copiedId={copiedDetailId}
          onCopy={handleDetailCopy}
          onClose={() => setSelectedTagSetForDetail(null)}
          onSave={(id, tagForm) => updateTagSet.mutate({ id, tagForm })}
          isPending={updateTagSet.isPending}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['tagset-categories'] })} />
      )}
      {showCatModal && (
        <CategoryManagerModal type="tagset" onClose={() => setShowCatModal(false)} />
      )}
      {showBulkEdit && (
        <BulkEditModal
          isOpen={showBulkEdit}
          onClose={() => setShowBulkEdit(false)}
          fields={tagSetBulkEditFields}
          selectedCount={selectedIds.size}
          onApply={(values) => bulkUpdateTagSets.mutate(values)}
          isApplying={bulkUpdateTagSets.isPending}
        />
      )}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          aspectRatio={numericRatio}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </div>
  )
}
