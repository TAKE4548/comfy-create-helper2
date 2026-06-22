import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Folder, Copy, Layers, Trash2, Pencil, Settings2, CheckSquare, Square } from 'lucide-react'
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

import { lorasApi, loraCategoriesApi } from '../api/client'
import type { Lora, Category } from '../api/types'
import { ImageCarousel } from '../components/ImageCarousel'
import { CategoryManagerModal } from '../components/CategoryManagerModal'
import {
  LoraRegisterModal,
  LoraEditModal,
  LoraDetailModal,
  type LoraFormState,
} from '../components/LoraModals'

import { useMultiSelect } from '../hooks/useMultiSelect'
import { LS_KEYS } from '../utils/localStorageKeys'
import { BulkEditModal, type BulkEditField } from '../components/BulkEditModal'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'

const EMPTY_FORM: LoraFormState = {
  model_name: '',
  description: '',
  recommended_strength_min: undefined,
  recommended_strength_max: undefined,
  category_id: undefined,
  file_path: '',
  trigger_word_sets: [],
}

function SortableLoraCard({ id, children, disabled }: { id: number; children: React.ReactNode; disabled: boolean }) {
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

export function LoRAsPage() {
  const qc = useQueryClient()
  
  // Use state dynamically inside component to check isMultiSelectMode
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [items, setItems] = useState<Lora[]>([])

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
  const [tooltipLora, setTooltipLora] = useState<number | null>(null)
  const [editLora, setEditLora] = useState<Lora | null>(null)
  const [selectedLoraForDetail, setSelectedLoraForDetail] = useState<Lora | null>(null)
  const [copiedTriggerSetId, setCopiedTriggerSetId] = useState<number | null>(null)
  const [form, setForm] = useState<LoraFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<LoraFormState>(EMPTY_FORM)

  const { data: categories } = useQuery({
    queryKey: ['lora-categories'],
    queryFn: () => loraCategoriesApi.list() as Promise<Category[]>,
  })
  const { data: loras } = useQuery({
    queryKey: ['loras', selectedCat],
    queryFn: () => lorasApi.list(selectedCat ?? undefined) as Promise<Lora[]>,
  })

  useEffect(() => {
    if (loras) {
      setItems(loras)
    }
  }, [loras])

  const createLora = useMutation({
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loras'] }); setShowModal(false); setForm(EMPTY_FORM) },
    mutationFn: () => lorasApi.create({
      ...form,
      trigger_word_sets: form.trigger_word_sets.map((t) => ({
        name: t.name,
        words: t.words.split(',').map((w) => w.trim()).filter(Boolean),
      })),
    }),
  })

  const deleteLora = useMutation({
    mutationFn: (id: number) => lorasApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loras'] }),
  })

  const updateLora = useMutation({
    mutationFn: () => lorasApi.update(editLora!.id, {
      ...editForm,
      trigger_word_sets: editForm.trigger_word_sets.map((t) => ({
        name: t.name,
        words: t.words.split(',').map((w) => w.trim()).filter(Boolean),
      })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loras'] }); setEditLora(null) },
  })

  const reorderLoras = useMutation({
    mutationFn: (ordered_ids: number[]) => lorasApi.reorder(ordered_ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loras'] }),
  })

  const loraBulkEditFields: BulkEditField[] = [
    {
      key: 'category_id',
      label: 'カテゴリ',
      type: 'category',
      options: categories?.map(c => ({ id: c.id, name: c.name })) || [],
    },
    {
      key: 'recommended_strength',
      label: '推奨強度',
      type: 'strength_range',
    },
  ]

  const bulkUpdateLoras = useMutation({
    mutationFn: async (values: any) => {
      await Promise.all(
        [...selectedIds].map(id => {
          const lora = items.find(i => i.id === id)
          if (!lora) return Promise.resolve()
          const updatedLora = {
            model_name: lora.model_name,
            description: lora.description,
            recommended_strength_min: lora.recommended_strength_min,
            recommended_strength_max: lora.recommended_strength_max,
            category_id: lora.category_id,
            file_path: lora.file_path,
            thumbnail_path: lora.thumbnail_path,
            ...values,
            trigger_word_sets: lora.trigger_word_sets.map((tws) => ({
              name: tws.name,
              words: tws.words,
            })),
          }
          return lorasApi.update(id, updatedLora)
        })
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loras'] })
      exitMultiSelectMode()
      setShowBulkEdit(false)
    }
  })

  const filteredLoras = items.filter((l) =>
    l.model_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const isDndActive = !search && selectedCat === null

  const openEdit = (lora: Lora) => {
    setEditLora(lora)
    setEditForm({
      model_name: lora.model_name,
      description: lora.description ?? '',
      recommended_strength_min: lora.recommended_strength_min ?? undefined,
      recommended_strength_max: lora.recommended_strength_max ?? undefined,
      category_id: lora.category_id ?? undefined,
      file_path: lora.file_path ?? '',
      trigger_word_sets: lora.trigger_word_sets.map((tws) => ({
        name: tws.name,
        words: tws.words.join(', '),
      })),
      thumbnail_path: lora.thumbnail_path ?? undefined,
    })
  }

  const handleCopy = (id: number, words: string) => {
    navigator.clipboard.writeText(words)
    setCopiedTriggerSetId(id)
    setTimeout(() => setCopiedTriggerSetId(null), 2000)
  }

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
      reorderLoras.mutate(newOrder.map(i => i.id))
    } else {
      const oldIdx = items.findIndex((x) => x.id === Number(active.id))
      const newIdx = items.findIndex((x) => x.id === Number(over.id))
      const reordered = arrayMove(items, oldIdx, newIdx)
      setItems(reordered)
      reorderLoras.mutate(reordered.map((x) => x.id))
    }
  }

  const renderDragOverlayItem = (id: number) => {
    const lora = items.find((l) => l.id === id)
    if (!lora) return null
    const catName = categories?.find((c) => c.id === lora.category_id)?.name
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#1F1F25] overflow-hidden flex flex-col justify-between h-full min-h-[300px] w-[200px]">
        <div className="relative aspect-square w-full bg-zinc-800 flex items-center justify-center text-zinc-500">
          {lora.thumbnail_path ? (
            <img src={lora.thumbnail_path} alt={lora.model_name} className="w-full h-full object-cover" />
          ) : (
            <Layers size={32} />
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col justify-between gap-2">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-medium text-zinc-200 truncate">
              {lora.description || lora.model_name.split('/').pop()}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {catName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">{catName}</span>}
            </div>
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all disabled:opacity-50"
            >
              <Pencil size={12} />
              一括編集
            </button>
          }
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Layers size={17} className="text-accent-green" />LoRAs
          <span className="text-xs text-zinc-500 font-normal ml-1">({filteredLoras.length})</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatModal(true)}
            className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200 transition-all"
            title="カテゴリ管理"
          >
            <Settings2 size={15} />
          </button>
          <button id="register-lora-btn" onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all">
            <Plus size={14} />Register Model
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input id="lora-search" type="text" placeholder="Search LoRAs…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent-green/40" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button id="lora-filter-all" onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === null ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            All
          </button>
          {categories?.map((cat) => (
            <button key={cat.id} id={`lora-filter-${cat.id}`}
              onClick={() => setSelectedCat(cat.id === selectedCat ? null : cat.id)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCat === cat.id ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredLoras.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredLoras.map((lora) => {
                const catName = categories?.find((c) => c.id === lora.category_id)?.name
                const longPressHandlers = getLongPressHandlers(lora.id)
                return (
                  <SortableLoraCard key={lora.id} id={lora.id} disabled={!isDndActive}>
                    <div
                      id={`lora-card-${lora.id}`}
                      onClick={(e) => {
                        if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                          e.stopPropagation()
                          handleItemClick(lora.id, e)
                        } else {
                          setSelectedLoraForDetail(lora)
                        }
                      }}
                      onMouseDown={longPressHandlers.onMouseDown}
                      onMouseUp={longPressHandlers.onMouseUp}
                      onMouseLeave={longPressHandlers.onMouseLeave}
                      onTouchStart={longPressHandlers.onTouchStart}
                      onTouchEnd={longPressHandlers.onTouchEnd}
                      className={`group relative rounded-xl border overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer flex flex-col justify-between h-full min-h-[300px] ${
                        isMultiSelectMode && isSelected(lora.id)
                          ? 'border-[#3ECF8E] ring-1 ring-[#3ECF8E]/30 bg-surface'
                          : 'border-[rgba(255,255,255,0.06)] bg-surface'
                      }`}
                    >
                      {/* Checkbox for multi-select */}
                      {isMultiSelectMode && (
                        <div className="absolute top-2 left-2 z-20 p-1 rounded-md bg-surface/80 text-[#3ECF8E] border border-[rgba(255,255,255,0.08)]">
                          {isSelected(lora.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                      )}
                      
                      <ImageCarousel
                        thumbnailPath={lora.thumbnail_path}
                        snapshotPaths={lora.snapshot_paths}
                        alt={lora.model_name}
                        className="aspect-square w-full"
                      >
                        <button id={`lora-edit-${lora.id}`} onClick={(e) => { e.stopPropagation(); openEdit(lora) }}
                          className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-accent-green/20 hover:text-accent-green">
                          <Pencil size={13} />
                        </button>
                        <button id={`lora-delete-${lora.id}`}
                          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this LoRA?')) deleteLora.mutate(lora.id) }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
                          <Trash2 size={13} />
                        </button>
                      </ImageCarousel>

                      <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                        <div className="space-y-1.5 min-w-0">
                          <div>
                            <p className="text-xs font-medium text-zinc-200 truncate" title={lora.description || lora.model_name}>
                              {lora.description || lora.model_name.split('/').pop()}
                            </p>
                            {lora.description && <p className="text-xs text-zinc-500 truncate mt-0.5" title={lora.model_name}>{lora.model_name.split('/').pop()}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {catName && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">{catName}</span>}
                            {(lora.recommended_strength_min != null || lora.recommended_strength_max != null) && (
                              <span className="text-xs text-zinc-500">
                                {lora.recommended_strength_min === lora.recommended_strength_max
                                  ? `×${lora.recommended_strength_min}`
                                  : `${lora.recommended_strength_min ?? '?'}~${lora.recommended_strength_max ?? '?'}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {lora.trigger_word_sets.length > 0 && (
                          <div className="space-y-1">
                            {lora.trigger_word_sets.slice(0, 2).map((tws) => (
                              <div key={tws.id} className="flex items-center gap-1.5 group/tws">
                                <p className="text-xs text-zinc-600 truncate flex-1">{tws.words.slice(0, 3).join(', ')}{tws.words.length > 3 ? '…' : ''}</p>
                                <button id={`copy-trigger-${tws.id}`}
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tws.words.join(', ')) }}
                                  className="opacity-0 group-hover/tws:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300">
                                  <Copy size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-2 mt-1">
                          {lora.file_path ? (
                            <div className="relative">
                              <button id={`lora-path-${lora.id}`}
                                onClick={(e) => e.stopPropagation()}
                                onMouseEnter={() => setTooltipLora(lora.id)}
                                onMouseLeave={() => setTooltipLora(null)}
                                className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                <Folder size={13} />
                              </button>
                              {tooltipLora === lora.id && (
                                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded bg-zinc-800 border border-[rgba(255,255,255,0.1)] text-xs text-zinc-300 whitespace-nowrap z-10">{lora.file_path}</div>
                              )}
                            </div>
                          ) : (
                            <div />
                          )}
                        </div>
                      </div>

                    </div>
                  </SortableLoraCard>
                )
              })}
            </div>
          </SortableContext>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeId && (
              <div className="relative">
                <div className="opacity-90 scale-105 ring-2 ring-[#3ECF8E] rounded-xl pointer-events-none">
                  {renderDragOverlayItem(activeId)}
                </div>
                {isMultiSelectMode && selectedIds.size > 1 && (
                  <div className="absolute -bottom-2 -right-2 bg-[#3ECF8E] text-black text-xs font-bold
                                  rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                    +{selectedIds.size - 1}
                  </div>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {filteredLoras.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <Layers size={40} strokeWidth={1} />
            <p className="mt-3 text-sm">No LoRAs registered yet.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <LoraRegisterModal form={form} setForm={setForm} categories={categories}
          isPending={createLora.isPending}
          onClose={() => setShowModal(false)}
          onSubmit={() => createLora.mutate()}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['lora-categories'] })} />
      )}
      {editLora && (
        <LoraEditModal form={editForm} setForm={setEditForm} categories={categories}
          isPending={updateLora.isPending}
          onClose={() => setEditLora(null)}
          onSubmit={() => updateLora.mutate()}
          snapshotPaths={editLora.snapshot_paths}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['lora-categories'] })} />
      )}
      {selectedLoraForDetail && (
        <LoraDetailModal lora={selectedLoraForDetail} categories={categories}
          copiedId={copiedTriggerSetId}
          onCopy={handleCopy}
          onClose={() => setSelectedLoraForDetail(null)} />
      )}
      {showCatModal && (
        <CategoryManagerModal type="lora" onClose={() => setShowCatModal(false)} />
      )}
      {showBulkEdit && (
        <BulkEditModal
          isOpen={showBulkEdit}
          onClose={() => setShowBulkEdit(false)}
          fields={loraBulkEditFields}
          selectedCount={selectedIds.size}
          onApply={(values) => bulkUpdateLoras.mutate(values)}
          isApplying={bulkUpdateLoras.isPending}
        />
      )}
    </div>
  )
}

