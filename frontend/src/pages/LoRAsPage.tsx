import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Folder, Layers, Trash2, Pencil, Settings2, CheckSquare, Square, GripVertical, ChevronDown, ChevronRight, FileJson } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { lorasApi, loraCategoriesApi, baseModelsApi } from '../api/client'
import type { Lora, Category, BaseModel } from '../api/types'
import { useAccordionSections } from '../hooks/useAccordionSections'
import { ImageCarousel } from '../components/ImageCarousel'
import { CategoryManagerModal } from '../components/CategoryManagerModal'
import {
  LoraRegisterModal,
  LoraDetailModal,
  type LoraFormState,
} from '../components/LoraModals'
import { ImageCropper } from '../components/ImageCropper'
import { useThumbnailAspectRatio } from '../hooks/useThumbnailAspectRatio'

import { useCollectionSelection } from '../hooks/useCollectionSelection'
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
  target_base_model_ids: [],
}

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

function SortableLoraCard({ id, children, disabled }: { id: number; children: (handleProps: DragHandleRenderProps) => React.ReactNode; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners: listeners as DragHandleListeners, isDragging })}
    </div>
  )
}

function CategorySectionDroppable({
  containerId,
  children,
  isEmpty,
}: {
  containerId: string
  children: React.ReactNode
  isEmpty: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId,
  })

  return (
    <div
      ref={setNodeRef}
      id={containerId}
      className={`min-h-[60px] rounded-xl transition-colors ${
        isOver ? 'bg-accent-green/5 ring-1 ring-accent-green/30' : ''
      }`}
    >
      {isEmpty ? (
        <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-[rgba(255,255,255,0.08)] rounded-xl">
          カードがありません（ここにドラッグ＆ドロップしてカテゴリ移動）
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export function LoRAsPage() {
  const qc = useQueryClient()
  
  // Use state dynamically inside component to check isMultiSelectMode
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [items, setItems] = useState<Lora[]>([])

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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<(number | 'uncategorized')[]>([])
  const [selectedBaseModelIds, setSelectedBaseModelIds] = useState<number[]>([])
  const { isExpanded, toggleSection } = useAccordionSections('ps_accordion_loras')
  const [showModal, setShowModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [tooltipLora, setTooltipLora] = useState<number | null>(null)
  const [selectedLoraForDetail, setSelectedLoraForDetail] = useState<Lora | null>(null)
  const [copiedTriggerSetId, setCopiedTriggerSetId] = useState<number | null>(null)
  const [copiedTriggerWord, setCopiedTriggerWord] = useState<string | null>(null)
  const [form, setForm] = useState<LoraFormState>(EMPTY_FORM)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const { aspectRatioStyle, numericRatio } = useThumbnailAspectRatio()

  const { data: categories } = useQuery({
    queryKey: ['lora-categories'],
    queryFn: () => loraCategoriesApi.list() as Promise<Category[]>,
  })
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>,
  })
  const { data: loras } = useQuery({
    queryKey: ['loras', selectedBaseModelIds],
    queryFn: () => lorasApi.list(
      undefined,
      selectedBaseModelIds.length > 0 ? selectedBaseModelIds.join(',') : undefined
    ) as Promise<Lora[]>,
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

  const bulkDeleteLoras = useMutation({
    mutationFn: () => Promise.all([...selectedIds].map((id) => lorasApi.delete(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loras'] })
      exitMultiSelectMode()
      setShowBulkDeleteConfirm(false)
    },
  })

  const updateLora = useMutation({
    mutationFn: ({ id, loraForm }: { id: number; loraForm: LoraFormState }) =>
      lorasApi.update(id, {
        ...loraForm,
        trigger_word_sets: loraForm.trigger_word_sets.map((t) => ({
          name: t.name,
          words: t.words.split(',').map((w) => w.trim()).filter(Boolean),
        })),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loras'] }) },
  })

  const reorderLoras = useMutation({
    mutationFn: ({ ordered_ids, category_id }: { ordered_ids: number[]; category_id?: number | null }) =>
      lorasApi.reorder(ordered_ids, category_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loras'] }),
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
    return data.thumbnail_path || data.image_path
  }

  const handleCropComplete = async (blob: Blob) => {
    try {
      const imagePath = await uploadImage(blob)
      setForm((f) => ({ ...f, thumbnail_path: imagePath }))
    } catch (err) {
      console.error(err)
      alert('画像のアップロードに失敗しました')
    } finally {
      setCropImageSrc(null)
    }
  }



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
    {
      key: 'target_base_model_ids',
      label: '対象ベースモデル',
      type: 'multi_select',
      options: baseModels?.map((model) => ({ id: model.id, name: model.name })) || [],
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
            target_base_model_ids: lora.target_base_model_ids ?? [],
            example_paths: lora.example_paths ?? [],
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

  const handleCopy = (id: number, words: string) => {
    navigator.clipboard.writeText(words)
    setCopiedTriggerSetId(id)
    setTimeout(() => setCopiedTriggerSetId(null), 2000)
  }

  const handleDragStart = (event: DragStartEvent) => {
    if (isMultiSelectMode) return
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (isMultiSelectMode) {
      setActiveId(null)
      return
    }
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const activeItem = items.find((i) => i.id === Number(active.id))
    if (!activeItem) return

    const sourceCatId = activeItem.category_id ?? 'uncategorized'

    let targetCatId: number | null = null
    let targetCardId: number | null = null

    if (typeof over.id === 'string' && over.id.startsWith('category-container-')) {
      const raw = over.id.replace('category-container-', '')
      targetCatId = raw === 'uncategorized' ? null : Number(raw)
    } else {
      const overItem = items.find((i) => i.id === Number(over.id))
      if (!overItem) return
      targetCatId = overItem.category_id ?? null
      targetCardId = overItem.id
    }

    const previousItems = [...items]
    const destCatKey = targetCatId ?? 'uncategorized'

    if (sourceCatId === destCatKey) {
      // 同一カテゴリ内の並び替え
      const sectionCards = items.filter((i) => (i.category_id ?? null) === targetCatId)
      const oldIdx = sectionCards.findIndex((i) => i.id === activeItem.id)
      const newIdx = targetCardId ? sectionCards.findIndex((i) => i.id === targetCardId) : sectionCards.length - 1
      if (oldIdx === newIdx || oldIdx === -1 || newIdx === -1) return

      const reorderedSection = arrayMove(sectionCards, oldIdx, newIdx)
      let sectionIdx = 0
      const newItems = items.map((item) => {
        if ((item.category_id ?? null) === targetCatId) {
          return reorderedSection[sectionIdx++]
        }
        return item
      })
      setItems(newItems)
      reorderLoras.mutate(
        { ordered_ids: reorderedSection.map((x) => x.id), category_id: targetCatId },
        { onError: () => setItems(previousItems) }
      )
    } else {
      // セクション間カテゴリ移動（楽観的更新 + ロールバック）
      const destCards = items.filter((i) => (i.category_id ?? null) === targetCatId)
      const insertIdx = targetCardId ? destCards.findIndex((i) => i.id === targetCardId) : destCards.length
      const updatedActiveItem = { ...activeItem, category_id: targetCatId }

      const newDestCards = [...destCards.slice(0, insertIdx), updatedActiveItem, ...destCards.slice(insertIdx)]
      const newItems = items.map((i) => (i.id === activeItem.id ? updatedActiveItem : i))
      setItems(newItems)

      reorderLoras.mutate(
        { ordered_ids: newDestCards.map((x) => x.id), category_id: targetCatId },
        {
          onError: () => {
            setItems(previousItems)
            alert('カテゴリ移動の保存に失敗しました。元の位置に戻します。')
          }
        }
      )
    }
  }

  const renderDragOverlayItem = (id: number) => {
    const lora = items.find((l) => l.id === id)
    if (!lora) return null
    const catName = categories?.find((c) => c.id === lora.category_id)?.name
    return (
      <div className="rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#1F1F25] overflow-hidden flex flex-col justify-between h-full min-h-[300px] w-[200px]">
        <div className="relative w-full bg-zinc-800 flex items-center justify-center text-zinc-500 overflow-hidden" style={aspectRatioStyle}>
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

  const visibleCategories = (categories ?? []).filter((cat) =>
    selectedCategoryIds.length === 0 || selectedCategoryIds.includes(cat.id)
  )

  const uncategorizedItems = filteredLoras.filter((i) => !i.category_id)
  const allUncategorizedItems = items.filter((i) => !i.category_id)
  const showUncategorized =
    selectedCategoryIds.includes('uncategorized') ||
    (selectedCategoryIds.length === 0 && allUncategorizedItems.length > 0)

  const selectionItems = [
    ...visibleCategories.flatMap((category) => filteredLoras.filter((lora) => lora.category_id === category.id)),
    ...(showUncategorized ? uncategorizedItems : []),
  ]
  const {
    isMultiSelectMode,
    selectedIds,
    exitMultiSelectMode,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    selectAll,
    clearSelection,
  } = useCollectionSelection<number, Lora>({ items: selectionItems })
  const isDndActive = !search && selectedBaseModelIds.length === 0 && !isMultiSelectMode
  const selectedLoras = selectionItems.filter((lora) => selectedIds.has(lora.id))

  const exportSelectedLoras = () => {
    const blob = new Blob([JSON.stringify(selectedLoras, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'loras.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const renderLoraCard = (lora: Lora) => {
    const catName = categories?.find((c) => c.id === lora.category_id)?.name
    const longPressHandlers = getLongPressHandlers(lora.id)
    return (
      <SortableLoraCard key={lora.id} id={lora.id} disabled={!isDndActive}>
        {({ attributes, listeners: handleListeners }) => (
          <div
            id={`lora-card-${lora.id}`}
            onClick={(e) => {
              if (isMultiSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
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
            onTouchCancel={longPressHandlers.onTouchCancel}
            onContextMenu={longPressHandlers.onContextMenu}
            className={`group relative rounded-xl border overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer flex flex-col h-[320px] min-h-[320px] max-h-[320px] ${
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

            {/* タッチ用ドラッグハンドル */}
            {!isMultiSelectMode && isDndActive && (
              <button
                type="button"
                className="absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing touch-none select-none p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white transition-colors"
                style={{ touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
                onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                {...attributes}
                {...handleListeners}
                title="ドラッグして並び替え"
                aria-label="並び替えハンドル"
              >
                <GripVertical size={14} />
              </button>
            )}

            <ImageCarousel
              thumbnailPath={lora.thumbnail_path}
              snapshotPaths={lora.snapshot_paths}
              alt={lora.model_name}
              className="w-full shrink-0"
              imageAspectRatio={numericRatio}
              imageAreaFraction={0.58}
            >
              <button id={`lora-edit-${lora.id}`} onClick={(e) => { e.stopPropagation(); setSelectedLoraForDetail(lora) }}
                className="absolute top-2 right-8 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-zinc-400 hover:bg-accent-green/20 hover:text-accent-green">
                <Pencil size={13} />
              </button>
              <button id={`lora-delete-${lora.id}`}
                onClick={(e) => { e.stopPropagation(); if (confirm('Delete this LoRA?')) deleteLora.mutate(lora.id) }}
                className="absolute top-2 right-2 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity p-1 rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
                <Trash2 size={13} />
              </button>
            </ImageCarousel>

            <div className="p-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col justify-start gap-2">
                <div className="space-y-1.5 min-w-0 overflow-hidden shrink-0">
                <div>
                  <p className="text-xs font-medium text-zinc-200 line-clamp-2 break-words" title={lora.description || lora.model_name}>
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
                <div className="space-y-1 shrink-0">
                  {lora.trigger_word_sets.slice(0, 2).map((tws) => (
                    <div key={tws.id} className="flex items-center gap-1.5 group/tws">
                      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                        {tws.words.slice(0, 3).map((word, index) => {
                          const isCopied = copiedTriggerWord === `${tws.id}:${word}`
                          return <button key={`${word}-${index}`} id={`copy-trigger-${tws.id}${index ? `-${index}` : ''}`} type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigator.clipboard.writeText(word)
                              setCopiedTriggerWord(`${tws.id}:${word}`)
                              setTimeout(() => setCopiedTriggerWord(null), 1200)
                            }}
                            className={`max-w-full truncate text-xs ${isCopied ? 'text-accent-green' : 'text-zinc-600 hover:text-zinc-300'}`}
                            aria-label={`Copy trigger word ${word}`}>{isCopied ? 'Copied' : word}</button>
                        })}
                        {tws.words.length > 3 && <span className="text-xs text-zinc-600">…</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] pt-2 mt-1 shrink-0">
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
        )}
      </SortableLoraCard>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={selectionItems.length}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onExitMode={exitMultiSelectMode}
          actions={
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportSelectedLoras}
              disabled={selectedIds.size === 0}
              aria-label="選択をJSONエクスポート"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-zinc-300 text-xs font-medium hover:bg-white/5 transition-all disabled:opacity-50"
            >
              <FileJson size={12} aria-hidden="true" />
              JSONエクスポート
            </button>
            <button
              onClick={() => setShowBulkEdit(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all disabled:opacity-50"
            >
              <Pencil size={12} />
              一括編集
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={selectedIds.size === 0 || bulkDeleteLoras.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <Trash2 size={12} />
              選択を削除
            </button>
            </div>
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
          <button id="lora-filter-all" onClick={() => setSelectedCategoryIds([])}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCategoryIds.length === 0 ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            All
          </button>
          {categories?.map((cat) => {
            const isSelected = selectedCategoryIds.includes(cat.id)
            return (
              <button key={cat.id} id={`lora-filter-${cat.id}`}
                onClick={() => setSelectedCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id])}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${isSelected ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
                {cat.name}
              </button>
            )
          })}
          <button id="lora-filter-uncategorized"
            onClick={() => setSelectedCategoryIds(prev => prev.includes('uncategorized') ? prev.filter(id => id !== 'uncategorized') : [...prev, 'uncategorized'])}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCategoryIds.includes('uncategorized') ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            未分類
          </button>
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
                  className="rounded border-[rgba(255,255,255,0.08)] bg-surface-2 text-accent-green focus:ring-0 focus:ring-offset-0"
                />
                <span>{bm.name}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="space-y-6">
            {visibleCategories.map((cat) => {
              const catKey = cat.id
              const sectionCards = filteredLoras.filter((l) => l.category_id === cat.id)
              const expanded = isExpanded(catKey)

              return (
                <div key={catKey} className="space-y-3" id={`category-section-${catKey}`}>
                  <button
                    type="button"
                    id={`category-section-header-${catKey}`}
                    onClick={() => toggleSection(catKey)}
                    className="sticky top-0 z-20 flex items-center gap-2 bg-surface/95 text-sm font-semibold text-zinc-300 hover:text-white transition-colors w-full text-left py-1 backdrop-blur"
                  >
                    {expanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    <span>{cat.name}</span>
                    <span className="text-xs font-normal text-zinc-500">({sectionCards.length}件)</span>
                  </button>

                  {expanded && (
                    <SortableContext items={sectionCards.map((x) => x.id)} strategy={rectSortingStrategy}>
                      <CategorySectionDroppable containerId={`category-container-${catKey}`} isEmpty={sectionCards.length === 0}>
                        <div className="mx-auto grid w-full max-w-[928px] grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                          {sectionCards.map((l) => renderLoraCard(l))}
                        </div>
                      </CategorySectionDroppable>
                    </SortableContext>
                  )}
                </div>
              )
            })}

            {showUncategorized && (
              <div key="uncategorized" className="space-y-3" id="category-section-uncategorized">
                <button
                  type="button"
                  id="category-section-header-uncategorized"
                  onClick={() => toggleSection('uncategorized')}
                  className="sticky top-0 z-20 flex items-center gap-2 bg-surface/95 text-sm font-semibold text-zinc-300 hover:text-white transition-colors w-full text-left py-1 backdrop-blur"
                >
                  {isExpanded('uncategorized') ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                  <span>未分類</span>
                  <span className="text-xs font-normal text-zinc-500">({uncategorizedItems.length}件)</span>
                </button>

                {isExpanded('uncategorized') && (
                  <SortableContext items={uncategorizedItems.map((x) => x.id)} strategy={rectSortingStrategy}>
                    <CategorySectionDroppable containerId="category-container-uncategorized" isEmpty={uncategorizedItems.length === 0}>
                      <div className="mx-auto grid w-full max-w-[928px] grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {uncategorizedItems.map((l) => renderLoraCard(l))}
                      </div>
                    </CategorySectionDroppable>
                  </SortableContext>
                )}
              </div>
            )}
          </div>

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
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['lora-categories'] })}
          onUploadImage={(src) => setCropImageSrc(src)} />
      )}
      {selectedLoraForDetail && (
        <LoraDetailModal lora={selectedLoraForDetail} categories={categories}
          copiedId={copiedTriggerSetId}
          onCopy={handleCopy}
          onClose={() => setSelectedLoraForDetail(null)}
          onSave={(id, loraForm) => updateLora.mutate({ id, loraForm })}
          isPending={updateLora.isPending}
          onCategoryCreated={() => qc.invalidateQueries({ queryKey: ['lora-categories'] })} />
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
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="bulk-delete-title" className="w-full max-w-lg rounded-xl border border-red-500/30 bg-surface p-5 shadow-2xl">
            <h2 id="bulk-delete-title" className="text-base font-semibold text-zinc-100">選択したLoRAを削除</h2>
            <p className="mt-2 text-sm text-zinc-300">{selectedLoras.length}件を削除します。この操作は取り消せません。</p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-zinc-400">
              {selectedLoras.map((lora) => <li key={lora.id}>{lora.model_name}</li>)}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkDeleteConfirm(false)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300">キャンセル</button>
              <button type="button" onClick={() => bulkDeleteLoras.mutate()} disabled={bulkDeleteLoras.isPending || selectedIds.size === 0} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{bulkDeleteLoras.isPending ? '削除中…' : '削除する'}</button>
            </div>
          </section>
        </div>
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
