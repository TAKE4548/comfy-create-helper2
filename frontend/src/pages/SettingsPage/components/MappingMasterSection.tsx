import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Plus, Pencil, Trash2, RefreshCw, ChevronDown } from 'lucide-react'
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
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { mappingMastersApi, paramTypeMastersApi } from '../../../api/client'
import type {
  MappingMaster,
  ParamTypeMaster,
  ParamTypeMasterCreate,
} from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'
import {
  MappingMasterModal,
  MappingMasterDeleteModal,
  SortableMasterRow,
  emptyMasterForm,
  masterFormToCreate,
  masterToForm,
  type MappingMasterFormState,
} from '../../../components/SettingsComponents'
import { useMultiSelect } from '../../../hooks/useMultiSelect'
import { BulkEditModal, type BulkEditField } from '../../../components/BulkEditModal'
import { MultiSelectToolbar } from '../../../components/MultiSelectToolbar'
import { ParamTypeMasterModal } from '../../../components/ParamTypeMasterModal'

const mappingBulkEditFields: BulkEditField[] = [
  {
    key: 'param_name',
    label: 'Param Name',
    type: 'text',
  },
  {
    key: 'input_type',
    label: 'Input Type',
    type: 'select',
    options: [
      { id: 'textarea', name: 'textarea' },
      { id: 'int', name: 'int' },
      { id: 'float', name: 'float' },
      { id: 'select', name: 'select' },
      { id: 'lora_stack', name: 'lora_stack' },
      { id: 'select_sampler', name: 'select_sampler' },
      { id: 'select_scheduler', name: 'select_scheduler' },
      { id: 'boolean', name: 'boolean' },
    ],
  },
]

export interface MappingMasterSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export function MappingMasterSection({ isExpanded, onToggle }: MappingMasterSectionProps) {
  const qc = useQueryClient()
  const [sortedMasters, setSortedMasters] = useState<MappingMaster[]>([])
  const [showMasterModal, setShowMasterModal] = useState<'create' | 'edit' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState<MappingMaster | null>(null)
  const [masterForm, setMasterForm] = useState<MappingMasterFormState>(emptyMasterForm())
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)

  const [paramTypeModalMode, setParamTypeModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingParamType, setEditingParamType] = useState<ParamTypeMaster | null>(null)

  const { data: masters, isLoading: isLoadingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
    staleTime: STALE_TIMES.MAPPING_MASTERS,
  })

  useEffect(() => {
    if (masters) {
      setSortedMasters(masters)
    }
  }, [masters])

  const { data: usages, isLoading: isLoadingUsages } = useQuery({
    queryKey: ['mapping-master-usages', selectedMaster?.id],
    queryFn: () => mappingMastersApi.getUsages(selectedMaster!.id),
    enabled: !!selectedMaster && showDeleteModal,
  })

  const { data: paramTypeMasters = [] } = useQuery<ParamTypeMaster[]>({
    queryKey: ['param-type-masters'],
    queryFn: () => paramTypeMastersApi.list() as Promise<ParamTypeMaster[]>,
    staleTime: STALE_TIMES.PARAM_TYPE_MASTERS,
  })

  const {
    isMultiSelectMode,
    selectedIds,
    exitMultiSelectMode,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    selectAll,
    clearSelection,
  } = useMultiSelect({ items: sortedMasters })

  const createMaster = useMutation({
    mutationFn: (data: Parameters<typeof mappingMastersApi.create>[0]) =>
      mappingMastersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeMasterModal()
    },
  })

  const updateMaster = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Parameters<typeof mappingMastersApi.update>[1]
    }) => mappingMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeMasterModal()
    },
  })

  const deleteMaster = useMutation({
    mutationFn: (id: number) => mappingMastersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      closeDeleteModal()
    },
  })

  const reorderMaster = useMutation({
    mutationFn: (ordered_ids: number[]) => mappingMastersApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
    },
  })

  const bulkUpdateMasters = useMutation({
    mutationFn: async (values: any) => {
      await Promise.all(
        [...selectedIds].map((id) => {
          const mm = sortedMasters.find((m) => m.id === id)
          if (!mm) return Promise.resolve()
          const updatedMm = {
            role: mm.role,
            display_name: mm.display_name,
            param_name: mm.param_name,
            input_type: mm.input_type,
            expected_class_types: mm.expected_class_types || [],
            title_patterns: mm.title_patterns || [],
            ...values,
          }
          return mappingMastersApi.update(id, updatedMm)
        })
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      exitMultiSelectMode()
      setShowBulkEdit(false)
    },
  })

  const createParamTypeMutation = useMutation({
    mutationFn: paramTypeMastersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
      setParamTypeModalMode(null)
      setEditingParamType(null)
    },
  })

  const updateParamTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ParamTypeMasterCreate }) =>
      paramTypeMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
      setParamTypeModalMode(null)
      setEditingParamType(null)
    },
  })

  const deleteParamTypeMutation = useMutation({
    mutationFn: paramTypeMastersApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
    },
  })

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

    if (isMultiSelectMode && selectedIds.has(active.id as number) && selectedIds.size > 1) {
      if (selectedIds.has(over.id as number)) return
      const activeIdx = sortedMasters.findIndex((m) => m.id === active.id)
      const overIdx = sortedMasters.findIndex((m) => m.id === over.id)
      const selected = sortedMasters.filter((m) => selectedIds.has(m.id))
      const nonSelected = sortedMasters.filter((m) => !selectedIds.has(m.id))
      const overIdxInNonSelected = nonSelected.findIndex((m) => m.id === over.id)
      const insertAt = overIdx > activeIdx ? overIdxInNonSelected + 1 : overIdxInNonSelected
      const newOrder = [
        ...nonSelected.slice(0, insertAt),
        ...selected,
        ...nonSelected.slice(insertAt),
      ]
      setSortedMasters(newOrder)
      reorderMaster.mutate(newOrder.map((m) => m.id))
    } else {
      const oldIndex = sortedMasters.findIndex((m) => m.id === active.id)
      const newIndex = sortedMasters.findIndex((m) => m.id === over.id)
      const reordered = arrayMove(sortedMasters, oldIndex, newIndex)
      setSortedMasters(reordered)
      reorderMaster.mutate(reordered.map((m) => m.id))
    }
  }

  const openCreateModal = () => {
    setMasterForm(emptyMasterForm())
    setShowMasterModal('create')
  }
  const openEditModal = (mm: MappingMaster) => {
    setSelectedMaster(mm)
    setMasterForm(masterToForm(mm))
    setShowMasterModal('edit')
  }
  const openCopyCreateModal = (mm: MappingMaster) => {
    setMasterForm(masterToForm(mm))
    setShowMasterModal('create')
  }
  const closeMasterModal = () => {
    setShowMasterModal(null)
    setSelectedMaster(null)
  }
  const openDeleteModal = (mm: MappingMaster) => {
    setSelectedMaster(mm)
    setShowDeleteModal(true)
  }
  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setSelectedMaster(null)
  }

  const handleSaveMaster = (e: React.FormEvent) => {
    e.preventDefault()
    const data = masterFormToCreate(masterForm)
    if (showMasterModal === 'create') createMaster.mutate(data)
    else if (showMasterModal === 'edit' && selectedMaster)
      updateMaster.mutate({ id: selectedMaster.id, data })
  }

  const renderDragOverlayItem = (id: number) => {
    const mm = sortedMasters.find((m) => m.id === id)
    if (!mm) return null
    return (
      <div className="px-4 py-2 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-xs text-zinc-300 shadow-xl flex items-center gap-3">
        <span className="font-semibold text-[#3ECF8E]">{mm.role}</span>
        <span className="text-gray-500">|</span>
        <span>{mm.param_name}</span>
      </div>
    )
  }

  return (
    <>
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={sortedMasters.length}
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

      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <div
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">Node Mapping Masters</h2>
            <span className="text-xs text-zinc-600">— 編集ノードのマッピングマスタ設定</span>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {!isMultiSelectMode && (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6d62cc] transition-all"
              >
                <Plus size={12} />Add Master
              </button>
            )}
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
        {isExpanded && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
            {/* Custom Param Types Bar */}
            <div className="p-3 bg-surface-2/40 rounded-lg border border-[rgba(255,255,255,0.06)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">
                  カスタム型マスター ({paramTypeMasters.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingParamType(null)
                    setParamTypeModalMode('create')
                  }}
                  className="flex items-center gap-1 text-xs text-[#7C6FDD] hover:text-[#9185e6] font-medium transition-colors"
                >
                  <Plus size={12} /> 新規型を作成
                </button>
              </div>
              {paramTypeMasters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {paramTypeMasters.map((ptm) => (
                    <div
                      key={ptm.id}
                      className="flex items-center gap-2 px-2.5 py-1 bg-surface border border-[rgba(255,255,255,0.08)] rounded-md text-xs text-zinc-300"
                    >
                      <span className="font-semibold text-zinc-200">{ptm.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ({ptm.widget_type})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingParamType(ptm)
                          setParamTypeModalMode('edit')
                        }}
                        className="text-zinc-400 hover:text-zinc-200"
                        title="編集"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`'${ptm.name}' を削除しますか？`)) {
                            deleteParamTypeMutation.mutate(ptm.id)
                          }
                        }}
                        className="text-zinc-400 hover:text-red-400"
                        title="削除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  カスタム型マスターはまだ登録されていません。
                </p>
              )}
            </div>

            {isLoadingMasters ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
                <RefreshCw size={14} className="animate-spin" />Loading mapping masters…
              </div>
            ) : (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                        {[
                          '',
                          'Role',
                          'Display Name',
                          'Param Name',
                          'Input Type',
                          'Expected Class Types',
                          'Title Patterns',
                          '',
                        ].map((h, i) => (
                          <th
                            key={i}
                            className={`px-4 py-3 font-medium${
                              h === '' && i === 7 ? ' text-right' : ''
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <SortableContext
                      items={sortedMasters.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                        {sortedMasters.map((mm) => {
                          const isSelectedRow = isSelected(mm.id)
                          const longPressHandlers = getLongPressHandlers(mm.id)
                          return (
                            <SortableMasterRow
                              key={mm.id}
                              mm={mm}
                              openEditModal={openEditModal}
                              openDeleteModal={openDeleteModal}
                              openCopyModal={openCopyCreateModal}
                              isMultiSelectMode={isMultiSelectMode}
                              isSelected={isSelectedRow}
                              onClick={(e) => {
                                if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                                  e.stopPropagation()
                                  handleItemClick(mm.id, e)
                                } else {
                                  openEditModal(mm)
                                }
                              }}
                              longPressHandlers={longPressHandlers}
                            />
                          )
                        })}
                        {(!sortedMasters || sortedMasters.length === 0) && (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                              No mapping masters found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </SortableContext>
                  </table>
                  <DragOverlay>
                    {activeId && (
                      <div className="relative">
                        <div className="opacity-90 scale-105 ring-2 ring-[#3ECF8E] rounded-lg pointer-events-none">
                          {renderDragOverlayItem(activeId)}
                        </div>
                        {isMultiSelectMode && selectedIds.size > 1 && (
                          <div className="absolute -bottom-2 -right-2 bg-[#3ECF8E] text-black text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                            +{selectedIds.size - 1}
                          </div>
                        )}
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modals */}
      {showMasterModal && (
        <MappingMasterModal
          mode={showMasterModal}
          form={masterForm}
          setForm={setMasterForm}
          isPending={createMaster.isPending || updateMaster.isPending}
          onClose={closeMasterModal}
          onSubmit={handleSaveMaster}
          masters={masters}
          paramTypeMasters={paramTypeMasters}
          onOpenCreateParamType={() => setParamTypeModalMode('create')}
        />
      )}
      {paramTypeModalMode && (
        <ParamTypeMasterModal
          mode={paramTypeModalMode}
          initial={editingParamType ?? undefined}
          isPending={createParamTypeMutation.isPending || updateParamTypeMutation.isPending}
          onClose={() => {
            setParamTypeModalMode(null)
            setEditingParamType(null)
          }}
          onSubmit={(data) => {
            if (paramTypeModalMode === 'create') {
              createParamTypeMutation.mutate(data)
            } else if (editingParamType) {
              updateParamTypeMutation.mutate({ id: editingParamType.id, data })
            }
          }}
        />
      )}
      {showDeleteModal && selectedMaster && (
        <MappingMasterDeleteModal
          master={selectedMaster}
          usages={usages as any}
          isLoadingUsages={isLoadingUsages}
          isPending={deleteMaster.isPending}
          onClose={closeDeleteModal}
          onDelete={() => deleteMaster.mutate(selectedMaster.id)}
        />
      )}
      {showBulkEdit && (
        <BulkEditModal
          isOpen={showBulkEdit}
          onClose={() => setShowBulkEdit(false)}
          fields={mappingBulkEditFields}
          selectedCount={selectedIds.size}
          onApply={(values) => bulkUpdateMasters.mutate(values)}
          isApplying={bulkUpdateMasters.isPending}
        />
      )}
    </>
  )
}
