import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, Pencil, Settings2 } from 'lucide-react'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { tagSetsApi, tagsetCategoriesApi } from '../api/client'
import type { TagSet, Category } from '../api/types'
import { ImageCarousel } from '../components/ImageCarousel'
import { CategoryManagerModal } from '../components/CategoryManagerModal'
import {
  TagSetCreateModal,
  TagSetEditModal,
  TagSetDetailModal,
  type TagSetFormState,
} from '../components/TagSetModals'

const EMPTY_FORM: TagSetFormState = { name: '', description: '', category_id: undefined, tags: '' }

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
  
  const [items, setItems] = useState<TagSet[]>([])

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
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tag-sets'] }); setShowModal(false); setForm(EMPTY_FORM) },
  })

  const updateTagSet = useMutation({
    mutationFn: () => tagSetsApi.update(editTagSet!.id, {
      name: editForm.name,
      description: editForm.description || undefined,
      category_id: editForm.category_id,
      tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      thumbnail_path: editForm.thumbnail_path || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tag-sets'] }); setEditTagSet(null) },
  })

  const deleteTagSet = useMutation({
    mutationFn: (id: number) => tagSetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tag-sets'] }),
  })

  const reorderTagSets = useMutation({
    mutationFn: (ordered_ids: number[]) => tagSetsApi.reorder(ordered_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tag-sets'] }),
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

  const openEdit = (ts: TagSet) => {
    setEditTagSet(ts)
    setEditForm({ name: ts.name, description: ts.description ?? '', category_id: ts.category_id ?? undefined, tags: ts.tags.join(', '), thumbnail_path: ts.thumbnail_path ?? undefined })
  }

  const filtered = items.filter(
    (ts) =>
      ts.name.toLowerCase().includes(search.toLowerCase()) ||
      (ts.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      ts.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  const isDndActive = !search && selectedCat === null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = items.findIndex((x) => x.id === Number(active.id))
      const newIdx = items.findIndex((x) => x.id === Number(over.id))
      const reordered = arrayMove(items, oldIdx, newIdx)
      setItems(reordered)
      reorderTagSets.mutate(reordered.map((x) => x.id))
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
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

      {/* Filters */}
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

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((ts) => {
                const catName = categories?.find((c) => c.id === ts.category_id)?.name

                return (
                  <SortableTagSetCard key={ts.id} id={ts.id} disabled={!isDndActive}>
                    <div id={`tagset-card-${ts.id}`} onClick={() => setSelectedTagSetForDetail(ts)}
                      className="group relative rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer flex flex-col justify-between h-full min-h-[300px]">
                      
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
        </DndContext>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Tag size={40} strokeWidth={1} /><p className="mt-3 text-sm">No tag sets yet.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <TagSetCreateModal form={form} setForm={setForm} categories={categories}
          isPending={createTagSet.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={() => createTagSet.mutate()}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['tagset-categories'] })} />
      )}
      {editTagSet && (
        <TagSetEditModal form={editForm} setForm={setEditForm} categories={categories}
          isPending={updateTagSet.isPending}
          onClose={() => setEditTagSet(null)}
          onSubmit={() => updateTagSet.mutate()}
          snapshotPaths={editTagSet.snapshot_paths}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['tagset-categories'] })} />
      )}
      {selectedTagSetForDetail && (
        <TagSetDetailModal tagSet={selectedTagSetForDetail} categories={categories}
          copiedId={copiedDetailId}
          onCopy={handleDetailCopy}
          onClose={() => setSelectedTagSetForDetail(null)} />
      )}
      {showCatModal && (
        <CategoryManagerModal type="tagset" onClose={() => setShowCatModal(false)} />
      )}
    </div>
  )
}
