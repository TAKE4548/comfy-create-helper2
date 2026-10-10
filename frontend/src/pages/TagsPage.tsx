import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Tag, Copy, Trash2, Pencil, Settings2, CheckSquare, Square, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
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
  useDroppable
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { tagSetsApi, tagsetCategoriesApi, baseModelsApi } from '../api/client'
import type { TagSet, Category, BaseModel } from '../api/types'
import { useAccordionSections } from '../hooks/useAccordionSections'
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

import { BulkEditModal, type BulkEditField } from '../components/BulkEditModal'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'
import { useCollectionSelection } from '../hooks/useCollectionSelection'
import { parseTagSetTokens } from '../components/TagSetModals/TagSetFormFields'

const EMPTY_FORM: TagSetFormState = { name: '', description: '', category_id: undefined, tags: '', subsets: [], target_base_model_ids: [] }

const serializeSubsetForms = (subsets: TagSetFormState['subsets']) => (subsets || []).map((subset) => ({
  name: subset.name,
  tags: parseTagSetTokens(subset.tags),
  thumbnail_path: subset.thumbnail_path ?? null,
}))

const preserveTagSetSubsets = (subsets: TagSet['subsets']) => (subsets || []).map((subset) => ({
  name: subset.name,
  tags: subset.tags,
  thumbnail_path: subset.thumbnail_path ?? null,
}))

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

export function TagsPage() {
  const qc = useQueryClient()

  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [items, setItems] = useState<TagSet[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<(number | 'uncategorized')[]>([])
  const [selectedBaseModelIds, setSelectedBaseModelIds] = useState<number[]>([])
  const [pendingDeleteTagSet, setPendingDeleteTagSet] = useState<TagSet | null>(null)
  const filtered = items.filter((ts) =>
    (ts.name.toLowerCase().includes(search.toLowerCase()) ||
      (ts.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      ts.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))) &&
    (selectedCategoryIds.length === 0 || selectedCategoryIds.includes(ts.category_id ?? 'uncategorized'))
  )

  const {
    isMultiSelectMode,
    selectedIds,
    exitMultiSelectMode,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    selectAll,
    clearSelection,
  } = useCollectionSelection<number, TagSet>({ items: filtered })

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
  const { isExpanded, toggleSection } = useAccordionSections('ps_accordion_tagsets')
  const [showModal, setShowModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [copiedTagWord, setCopiedTagWord] = useState<string | null>(null)
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
    queryKey: ['tag-sets', selectedBaseModelIds],
    queryFn: () => tagSetsApi.list(
      undefined,
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
      tags: parseTagSetTokens(form.tags),
      subsets: serializeSubsetForms(form.subsets),
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
        tags: parseTagSetTokens(tagForm.tags),
        thumbnail_path: tagForm.thumbnail_path || undefined,
        subsets: serializeSubsetForms(tagForm.subsets),
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

  const selectedTagSets = items.filter((tagSet) => selectedIds.has(tagSet.id))
  const bulkDeleteTagSets = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => tagSetsApi.delete(id))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tag-sets'] })
      exitMultiSelectMode()
      setShowBulkDeleteConfirm(false)
    },
  })

  const reorderTagSets = useMutation({
    mutationFn: ({ ordered_ids, category_id }: { ordered_ids: number[]; category_id?: number | null }) =>
      tagSetsApi.reorder(ordered_ids, category_id),
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
    return data.thumbnail_path || data.image_path
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
            target_base_model_ids: tagSet.target_base_model_ids ?? [],
            ...values,
            subsets: preserveTagSetSubsets(tagSet.subsets),
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
        tags: Array.isArray(s.tags) ? s.tags.join(', ') : s.tags,
        thumbnail_path: s.thumbnail_path ?? null,
      })) : [],
      target_base_model_ids: ts.target_base_model_ids ?? []
    })
  }

  const isDndActive = !search && selectedBaseModelIds.length === 0

  const handleDragStart = (event: DragStartEvent) => {
    if (isMultiSelectMode) return
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (isMultiSelectMode) return
    if (!over || active.id === over.id) return

    const activeItem = items.find((i) => i.id === Number(active.id))
    if (!activeItem) return

    const sourceCatId = activeItem.category_id ?? 'uncategorized'

    // over 対象がコンテナ（'category-container-X'）かカードIDかを判定
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
      reorderTagSets.mutate(
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

      reorderTagSets.mutate(
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

  const visibleCategories = (categories ?? []).filter((cat) =>
    selectedCategoryIds.length === 0 || selectedCategoryIds.includes(cat.id)
  )

  const uncategorizedItems = filtered.filter((i) => !i.category_id)
  const allUncategorizedItems = items.filter((i) => !i.category_id)
  const showUncategorized =
    selectedCategoryIds.includes('uncategorized') ||
    (selectedCategoryIds.length === 0 && allUncategorizedItems.length > 0)

  const renderTagSetCard = (ts: TagSet) => {
    const catName = categories?.find((c) => c.id === ts.category_id)?.name
    const longPressHandlers = getLongPressHandlers(ts.id)
    return (
      <SortableTagSetCard key={ts.id} id={ts.id} disabled={!isDndActive || isMultiSelectMode}>
        {({ attributes, listeners: handleListeners }) => (
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
            className={`group relative rounded-xl border overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all animate-fade-in cursor-pointer flex flex-col h-[320px] w-full max-w-[220px] ${
              isMultiSelectMode && isSelected(ts.id)
                ? 'border-accent-green ring-2 ring-accent-green/40 bg-surface'
                : 'border-[rgba(255,255,255,0.06)] bg-surface'
            }`}>
            
            {isMultiSelectMode && (
              <div className="absolute top-2 left-2 z-20 p-1 rounded-md bg-surface/80 text-zinc-300 border border-[rgba(255,255,255,0.08)]">
                {isSelected(ts.id) ? <CheckSquare size={16} className="text-accent-green" /> : <Square size={16} />}
              </div>
            )}

            {/* タッチ用ドラッグハンドル */}
            {!isMultiSelectMode && isDndActive && (
              <button
                type="button"
                className="absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing touch-none select-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-black/60 hover:bg-black/80 text-zinc-400 hover:text-white transition-colors"
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
              thumbnailPath={ts.thumbnail_path}
              snapshotPaths={ts.snapshot_paths}
              alt={ts.name}
              className="w-full shrink-0"
              imageAspectRatio={numericRatio}
              imageAreaFraction={0.58}
            >
              {!isMultiSelectMode && <button id={`tagset-edit-${ts.id}`}
                onClick={(e) => { e.stopPropagation(); openEdit(ts) }}
                aria-label={`タグセット編集 ${ts.name}`}
                className="absolute top-2 right-12 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-surface/80 text-zinc-400 hover:bg-accent-green/20 hover:text-accent-green">
                <Pencil size={13} />
              </button>}
              {!isMultiSelectMode && <button id={`tagset-delete-${ts.id}`}
                onClick={(e) => { e.stopPropagation(); setPendingDeleteTagSet(ts) }}
                aria-label={`タグセット削除 ${ts.name}`}
                className="absolute top-2 right-2 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-surface/80 text-red-400 hover:bg-red-500/20">
                <Trash2 size={13} />
              </button>}
              {pendingDeleteTagSet?.id === ts.id && <div role="alertdialog" aria-label="タグセット削除の確認" className="absolute inset-x-2 top-12 z-30 rounded-lg border border-red-500/40 bg-surface p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-zinc-200">「{ts.name}」を削除しますか？</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setPendingDeleteTagSet(null)} className="rounded px-2 py-1 text-xs text-zinc-400">キャンセル</button>
                  <button type="button" onClick={() => { deleteTagSet.mutate(ts.id); setPendingDeleteTagSet(null) }} className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300">削除</button>
                </div>
              </div>}
            </ImageCarousel>

            <div className="p-1 flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col justify-start gap-1">
              <div className="space-y-1.5 min-w-0 shrink-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-zinc-200 truncate flex-1" title={ts.name}>{ts.name}</p>
                  {catName && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-zinc-300 border border-white/10">
                      {catName}
                    </span>
                  )}
                </div>
                {ts.description && <p className="text-[10px] text-zinc-500 line-clamp-2" title={ts.description}>{ts.description}</p>}
              </div>

              <div className="flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden h-[44px] shrink-0">
                {ts.tags.slice(0, 5).map((tag, i) => (
                  <button key={i} type="button" aria-label={`Copy tag ${tag}`} onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(tag)
                    setCopiedTagWord(`${ts.id}:${tag}`)
                    setTimeout(() => setCopiedTagWord(null), 1200)
                  }} className={`min-h-[44px] min-w-[44px] text-[11px] px-1 py-0.5 rounded border font-mono truncate max-w-[80px] ${copiedTagWord === `${ts.id}:${tag}` ? 'bg-accent-green/20 border-accent-green/30 text-accent-green' : 'bg-white/[0.04] border-white/10 text-zinc-300'}`}>{copiedTagWord === `${ts.id}:${tag}` ? 'Copied' : tag}</button>
                ))}
                {ts.tags.length > 5 && <span className="text-[9px] px-1 py-0.5 text-zinc-600 font-medium">+{ts.tags.length - 5}</span>}
              </div>

              <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.04)] shrink-0">
                <span className="text-[11px] text-zinc-600">{ts.tags.length} tags</span>
                <button id={`copy-tagset-${ts.id}`}
                  onClick={(e) => { e.stopPropagation(); handleCopy(ts.id, ts.tags) }}
                  className={`min-h-[44px] px-2 rounded transition-all flex items-center gap-1 text-[11px] ${copiedId === ts.id ? 'bg-accent-green/20 text-accent-green border border-accent-green/30' : 'bg-surface-2 border border-[rgba(255,255,255,0.08)] text-zinc-500 hover:text-zinc-300'}`}>
                  <Copy size={9} />{copiedId === ts.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

          </div>
        )}
      </SortableTagSetCard>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={filtered.length}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onExitMode={exitMultiSelectMode}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowBulkEdit(true)}
                disabled={selectedIds.size === 0}
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-[11px] font-medium hover:bg-accent-green/20 transition-all disabled:opacity-50"
              >
                <Pencil size={12} aria-hidden="true" />
                一括編集
              </button>
              <button
                type="button"
                onClick={() => { bulkDeleteTagSets.reset(); setShowBulkDeleteConfirm(true) }}
                disabled={selectedIds.size === 0 || bulkDeleteTagSets.isPending}
                aria-label="選択を削除"
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                <Trash2 size={12} aria-hidden="true" />
                選択を削除
              </button>
            </div>
          }
        />
      )}

      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <Tag size={17} className="text-accent-green" />Tag Sets
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all">
            <Plus size={14} />New Tag Set
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface/50">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input id="tag-search" type="text" placeholder="Search tags…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent-green/60" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <button id="tag-filter-all" onClick={() => setSelectedCategoryIds([])}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${selectedCategoryIds.length === 0 ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
            All
          </button>
          {categories?.map((cat) => {
            const isSelected = selectedCategoryIds.includes(cat.id)
            return (
              <button key={cat.id} id={`tag-filter-${cat.id}`}
                onClick={() => setSelectedCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id])}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${isSelected ? 'bg-accent-green/10 border-accent-green/40 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:border-zinc-600'}`}>
                {cat.name}
              </button>
            )
          })}
          <button id="tag-filter-uncategorized"
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="space-y-6">
            {visibleCategories.map((cat) => {
              const catKey = cat.id
              const sectionCards = filtered.filter((ts) => ts.category_id === cat.id)
              const expanded = isExpanded(catKey)

              return (
                <div key={catKey} className="space-y-3" id={`category-section-${catKey}`}>
                  <button
                    type="button"
                    id={`category-section-header-${catKey}`}
                    onClick={() => toggleSection(catKey)}
                    className="sticky top-0 z-20 flex min-h-[44px] items-center gap-2 bg-surface/95 text-sm font-semibold text-zinc-300 hover:text-white transition-colors w-full text-left py-1 backdrop-blur"
                  >
                    {expanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    <span>{cat.name}</span>
                    <span className="text-xs font-normal text-zinc-500">({sectionCards.length}件)</span>
                  </button>

                  {expanded && (
                    <SortableContext items={sectionCards.map((x) => x.id)} strategy={rectSortingStrategy}>
                      <CategorySectionDroppable containerId={`category-container-${catKey}`} isEmpty={sectionCards.length === 0}>
                        <div className="mx-auto grid w-full max-w-[928px] grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {sectionCards.map((ts) => renderTagSetCard(ts))}
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
                  className="sticky top-0 z-20 flex min-h-[44px] items-center gap-2 bg-surface/95 text-sm font-semibold text-zinc-300 hover:text-white transition-colors w-full text-left py-1 backdrop-blur"
                >
                  {isExpanded('uncategorized') ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                  <span>未分類</span>
                  <span className="text-xs font-normal text-zinc-500">({uncategorizedItems.length}件)</span>
                </button>

                {isExpanded('uncategorized') && (
                  <SortableContext items={uncategorizedItems.map((x) => x.id)} strategy={rectSortingStrategy}>
                    <CategorySectionDroppable containerId="category-container-uncategorized" isEmpty={uncategorizedItems.length === 0}>
                      <div className="mx-auto grid w-full max-w-[928px] grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {uncategorizedItems.map((ts) => renderTagSetCard(ts))}
                      </div>
                    </CategorySectionDroppable>
                  </SortableContext>
                )}
              </div>
            )}
          </div>

          <DragOverlay>
            {activeId && (
              <div className="relative">
                <div className="opacity-90 scale-105 ring-2 ring-accent-green rounded-xl pointer-events-none">
                  {renderDragOverlayItem(activeId)}
                </div>
                {isMultiSelectMode && selectedIds.size > 1 && (
                  <div className="absolute -bottom-2 -right-2 bg-accent-green text-black text-xs font-bold
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
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="bulk-tagset-delete-title" className="w-full max-w-lg rounded-xl border border-red-500/30 bg-surface p-5 shadow-2xl">
            <h2 id="bulk-tagset-delete-title" className="text-base font-semibold text-zinc-100">選択したTagSetを削除</h2>
            <p className="mt-2 text-sm text-zinc-300">{selectedTagSets.length}件を削除します。この操作は取り消せません。</p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-zinc-400">
              {selectedTagSets.map((tagSet) => <li key={tagSet.id}>{tagSet.name}</li>)}
            </ul>
            {bulkDeleteTagSets.isError && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                削除に失敗しました: {bulkDeleteTagSets.error instanceof Error ? bulkDeleteTagSets.error.message : 'サーバーエラー'}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={bulkDeleteTagSets.isPending} onClick={() => setShowBulkDeleteConfirm(false)} className="min-h-[44px] rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-300 disabled:opacity-50">キャンセル</button>
              <button type="button" onClick={() => bulkDeleteTagSets.mutate([...selectedIds])} disabled={bulkDeleteTagSets.isPending || selectedIds.size === 0} className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-[11px] font-medium text-white disabled:opacity-50">{bulkDeleteTagSets.isPending ? '削除中…' : '削除する'}</button>
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
