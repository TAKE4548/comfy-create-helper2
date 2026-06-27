import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, Pencil, Settings2, CheckSquare, Square, X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
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

import { tagSetsApi, tagsetCategoriesApi } from '../api/client'
import type { TagSet, Category } from '../api/types'
import { ImageCarousel } from '../components/ImageCarousel'
import { CategoryManagerModal } from '../components/CategoryManagerModal'
import {
  TagSetDetailModal,
  type TagSetFormState as TagSetModalFormState,
} from '../components/TagSetModals'
import { InlineCategorySelect } from '../components/InlineCategorySelect'
import { ImageCropper } from '../components/ImageCropper'

import { useMultiSelect } from '../hooks/useMultiSelect'
import { LS_KEYS } from '../utils/localStorageKeys'
import { BulkEditModal, type BulkEditField } from '../components/BulkEditModal'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'

interface TagSetFormState {
  name: string
  description: string
  category_id: number | undefined
  tags: string
  thumbnail_path?: string
  subsets: { name: string; tags: string }[]
}

const EMPTY_FORM: TagSetFormState = { name: '', description: '', category_id: undefined, tags: '', subsets: [] }

function SortableTagSetCard({ id, children, disabled }: { id: number; children: React.ReactNode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
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
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: isMultiSelectMode
        ? { distance: 8 }
        : {
            delay: (() => {
              const stored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE);
              const parsed = stored !== null ? parseFloat(stored) : NaN;
              return !isNaN(parsed) ? parsed * 1000 : 500;
            })(),
            tolerance: 5,
          },
    })
  )
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
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

  const { data: categories } = useQuery({
    queryKey: ['tagset-categories'],
    queryFn: () => tagsetCategoriesApi.list() as Promise<Category[]>,
  })
  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets', selectedCat],
    queryFn: () => tagSetsApi.list(selectedCat ?? undefined) as Promise<TagSet[]>,
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
      subsets: form.subsets ? form.subsets.map((s) => ({
        name: s.name,
        tags: s.tags.split(',').map((t) => t.trim()).filter(Boolean)
      })) : []
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tag-sets'] }); setShowModal(false); setForm(EMPTY_FORM) },
  })

  const updateTagSet = useMutation({
    mutationFn: ({ id, tagForm }: { id: number; tagForm: TagSetModalFormState }) =>
      tagSetsApi.update(id, {
        name: tagForm.name,
        description: tagForm.description || undefined,
        category_id: tagForm.category_id,
        tags: tagForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        thumbnail_path: tagForm.thumbnail_path || undefined,
        subsets: tagForm.subsets ? tagForm.subsets.map((s) => ({
          name: s.name,
          tags: s.tags.split(',').map((t) => t.trim()).filter(Boolean)
        })) : []
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tag-sets'] }) },
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
      })) : []
    })
  }

  const filtered = items.filter(
    (ts) =>
      ts.name.toLowerCase().includes(search.toLowerCase()) ||
      (ts.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      ts.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  const isDndActive = !search && selectedCat === null

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
        <div className="relative aspect-square w-full bg-zinc-800 flex items-center justify-center text-zinc-500">
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((ts) => {
                const catName = categories?.find((c) => c.id === ts.category_id)?.name
                const longPressHandlers = getLongPressHandlers(ts.id)
                return (
                  <SortableTagSetCard key={ts.id} id={ts.id} disabled={!isDndActive}>
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

                      <ImageCarousel
                        thumbnailPath={ts.thumbnail_path}
                        snapshotPaths={ts.snapshot_paths}
                        alt={ts.name}
                        className="aspect-square w-full"
                      >
                        <button id={`tagset-edit-${ts.id}`}
                          onClick={(e) => { e.stopPropagation(); openEdit(ts) }}
                          className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-[#7C6FDD]/20 hover:text-[#7C6FDD]">
                          <Pencil size={13} />
                        </button>
                        <button id={`tagset-delete-${ts.id}`}
                          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this tag set?')) deleteTagSet.mutate(ts.id) }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
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
        <LocalTagSetCreateModal form={form} setForm={setForm} categories={categories}
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
        <LocalTagSetEditModal form={editForm} setForm={setEditForm} categories={categories}
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
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </div>
  )
}

const PURPLE_INPUT = 'w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40'

function LocalTagSetFormFields({
  form, setForm, idPrefix, categories, onCategoryCreated, onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  idPrefix: string
  categories?: Category[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage: (src: string) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
        <input id={`${idPrefix}-name`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={PURPLE_INPUT} placeholder="e.g. 水着セット" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Description</label>
        <input id={`${idPrefix}-description`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={PURPLE_INPUT} placeholder="Optional description…" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Category</label>
        <InlineCategorySelect
          id={`${idPrefix}-category`}
          value={form.category_id}
          onChange={(catId) => setForm((f) => ({ ...f, category_id: catId }))}
          categories={categories || []}
          onCategoryCreated={onCategoryCreated}
          apiCreateFn={tagsetCategoriesApi.create}
          accentClass="[#7C6FDD]"
        />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Tags (comma-separated) *</label>
        <textarea id={`${idPrefix}-tags`} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} rows={3}
          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-[#7C6FDD]/40 resize-none"
          placeholder="swimsuit, bikini, white bikini, ..." />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">Cover Thumbnail Image</label>
        <div className="flex items-center gap-3">
          {form.thumbnail_path ? (
            <img src={form.thumbnail_path} alt="Cover Preview" className="w-12 h-12 rounded object-cover bg-zinc-800 border border-[rgba(255,255,255,0.1)]" />
          ) : (
            <div className="w-12 h-12 rounded bg-zinc-950 flex items-center justify-center text-zinc-500 border border-dashed border-[rgba(255,255,255,0.15)] text-[10px]">No Cover</div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id={`${idPrefix}-file-input`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                  onUploadImage(reader.result as string);
                };
                reader.readAsDataURL(file);
              }
            }}
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-300 text-xs font-medium hover:text-zinc-100 hover:bg-surface-3 transition-all"
            onClick={() => document.getElementById(`${idPrefix}-file-input`)?.click()}
          >
            画像をアップロード
          </button>
        </div>
      </div>
      
      {/* Subsets Section */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-zinc-400 font-semibold">Subsets (バリエーション)</label>
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({
                ...f,
                subsets: [...(f.subsets || []), { name: '', tags: '' }]
              }))
            }}
            className="text-[10px] px-2 py-1 rounded bg-[#7C6FDD]/10 border border-[#7C6FDD]/30 text-[#7C6FDD] hover:bg-[#7C6FDD]/20 transition-all"
          >
            + Add Subset
          </button>
        </div>
        <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
          {(form.subsets || []).map((sub, idx) => (
            <div key={idx} className="flex gap-2 items-start bg-zinc-950/40 p-2 rounded-lg border border-[rgba(255,255,255,0.04)]">
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  placeholder="Subset Name (e.g. 日中)"
                  value={sub.name}
                  onChange={(e) => {
                    const next = [...form.subsets]
                    next[idx] = { ...next[idx], name: e.target.value }
                    setForm((f: any) => ({ ...f, subsets: next }))
                  }}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40"
                />
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={sub.tags}
                  onChange={(e) => {
                    const next = [...form.subsets]
                    next[idx] = { ...next[idx], tags: e.target.value }
                    setForm((f: any) => ({ ...f, subsets: next }))
                  }}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-[#7C6FDD]/40"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = form.subsets.filter((_, i) => i !== idx)
                  setForm((f: any) => ({ ...f, subsets: next }))
                }}
                className="p-1 rounded text-red-400 hover:bg-red-500/10 self-center"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {(form.subsets || []).length === 0 && (
            <p className="text-[10px] text-zinc-600 text-center py-2">No subsets defined.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function LocalTagSetCreateModal({
  form, setForm, categories, isPending, onClose, onSubmit, onCategoryCreated, onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  onCategoryCreated: (cat: Category) => void
  onUploadImage: (src: string) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">New Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <LocalTagSetFormFields form={form} setForm={setForm} idPrefix="tagset" categories={categories} onCategoryCreated={onCategoryCreated} onUploadImage={onUploadImage} />
          <button id="save-tagset-btn" onClick={onSubmit} disabled={!form.name || !form.tags || isPending}
            className="w-full py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {isPending ? 'Saving…' : 'Create Tag Set'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LocalTagSetEditModal({
  form, setForm, categories, isPending, onClose, onSubmit, snapshotPaths, onCategoryCreated, onUploadImage,
}: {
  form: TagSetFormState
  setForm: React.Dispatch<React.SetStateAction<TagSetFormState>>
  categories?: Category[]
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  snapshotPaths?: string[]
  onCategoryCreated: (cat: Category) => void
  onUploadImage: (src: string) => void
}) {
  const images = Array.from(
    new Set(
      [form.thumbnail_path, ...(snapshotPaths || [])].filter((p): p is string => Boolean(p))
    )
  )

  const [activeImage, setActiveImage] = useState<string | null>(
    form.thumbnail_path || (snapshotPaths && snapshotPaths.length > 0 ? snapshotPaths[0] : null)
  )

  useEffect(() => {
    if (activeImage && !images.includes(activeImage)) {
      setActiveImage(images[0] || null)
    } else if (!activeImage && images.length > 0) {
      setActiveImage(images[0])
    }
  }, [form.thumbnail_path, snapshotPaths])

  const handlePrev = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    const prevIdx = idx <= 0 ? images.length - 1 : idx - 1
    setActiveImage(images[prevIdx])
  }

  const handleNext = () => {
    if (images.length <= 1) return
    const idx = images.indexOf(activeImage || '')
    const nextIdx = idx === images.length - 1 || idx === -1 ? 0 : idx + 1
    setActiveImage(images[nextIdx])
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-4xl bg-surface rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <h2 className="text-sm font-semibold text-zinc-200">Edit Tag Set</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.06)] max-h-[75vh] overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Preview & Cover Image</span>
              <div className="aspect-square bg-zinc-950 rounded-xl overflow-hidden relative flex items-center justify-center border border-[rgba(255,255,255,0.08)] group">
                {activeImage ? (
                  <>
                    <img src={activeImage} alt="Preview" className="w-full h-full object-cover" />
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrev}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={handleNext}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                    {activeImage === form.thumbnail_path ? (
                      <div className="absolute top-2 left-2 bg-accent-green text-[9px] text-background px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow">
                        Current Cover
                      </div>
                    ) : null}

                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {activeImage === form.thumbnail_path ? (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, thumbnail_path: undefined }))}
                          className="px-3 py-1.5 rounded-lg bg-red-500/95 text-white font-bold text-xs hover:bg-red-600 transition-colors shadow-lg"
                        >
                          Remove Cover
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, thumbnail_path: activeImage }))}
                          className="px-3 py-1.5 rounded-lg bg-accent-green/95 text-background font-bold text-xs hover:brightness-110 transition-colors shadow-lg"
                        >
                          Set as Cover
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="tag-edit-left-file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = () => {
                              onUploadImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('tag-edit-left-file-input')?.click()}
                        className="px-3 py-1.5 rounded-lg bg-blue-600/95 text-white font-bold text-xs hover:bg-blue-500 transition-colors shadow-lg"
                      >
                        Upload Local
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-zinc-600">
                    <ImageIcon size={40} strokeWidth={1} />
                    <span className="text-xs mt-2">No Images Available</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-5 flex flex-col justify-between h-full overflow-y-auto">
            <LocalTagSetFormFields form={form} setForm={setForm} idPrefix="tagset-edit" categories={categories} onCategoryCreated={onCategoryCreated} onUploadImage={onUploadImage} />
            <button id="save-tagset-btn" onClick={onSubmit} disabled={!form.name || !form.tags || isPending}
              className="w-full mt-4 py-2.5 rounded-xl bg-[#7C6FDD] text-white font-bold text-sm hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
