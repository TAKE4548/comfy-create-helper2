import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ChevronDown,
  Layers,
  GripVertical,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { mappingMastersApi } from '../../../api/domains/mappingMasters'
import { mappingGroupsApi } from '../../../api/domains/mappingGroups'
import { stageMastersApi } from '../../../api/domains/stageMasters'
import { paramTypeMastersApi } from '../../../api/domains/workflows'
import type {
  MappingMasterV2,
  MappingMasterV2Create,
  MappingMasterV2Update,
  ParamTypeMaster,
  ParamTypeMasterCreate,
} from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'
import { MappingMasterEditModal } from '../../../components/MappingMasterEditModal'
import { StageManagerModal } from '../../../components/StageManagerModal'
import { MappingMasterDeleteModal } from '../../../components/SettingsComponents'
import { ParamTypeMasterModal } from '../../../components/ParamTypeMasterModal'

export interface MappingMasterSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

interface MasterRowProps {
  master: MappingMasterV2
  onEdit: (m: MappingMasterV2) => void
  onDelete: (m: MappingMasterV2) => void
}

function MasterRow({ master, onEdit, onDelete }: MasterRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: master.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 p-1"
          {...attributes}
          {...listeners}
          title="並び替え"
          aria-label="並び替えハンドル"
        >
          <GripVertical size={14} />
        </button>
        <span className="font-medium text-zinc-100">{master.name || master.display_name}</span>
        <span className="text-xs text-zinc-400 font-mono">({master.param_name})</span>
        {master.default_enabled === false && (
          <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 text-[10px]">
            新規マッピングで基本無効
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono">
          {master.input_type}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Stage Variants Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {master.variants && master.variants.length > 0 ? (
            master.variants.map((v) => (
              <span
                key={v.id ?? v.stage_id}
                className={`px-2 py-0.5 rounded text-xs font-mono border ${
                  v.is_enabled
                    ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                    : 'bg-zinc-900 text-zinc-500 border-transparent opacity-60'
                }`}
              >
                {v.stage_name}
              </span>
            ))
          ) : (
            <span className="text-zinc-600 text-xs">-</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(master)}
            aria-label={`${master.name || master.display_name} を編集`}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            title="編集"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(master)}
            aria-label={`${master.name || master.display_name} を削除`}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
            title="削除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function MappingMasterSection({ isExpanded, onToggle }: MappingMasterSectionProps) {
  const qc = useQueryClient()
  const [sortedMasters, setSortedMasters] = useState<MappingMasterV2[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  // Modals
  const [showEditModal, setShowEditModal] = useState(false)
  const [showStageModal, setShowStageModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState<MappingMasterV2 | null>(null)

  // Custom Param Type modal
  const [paramTypeModalMode, setParamTypeModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingParamType, setEditingParamType] = useState<ParamTypeMaster | null>(null)

  // Queries
  const { data: masters, isLoading: isLoadingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list(),
    staleTime: STALE_TIMES.MAPPING_MASTERS,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['mapping-groups'],
    queryFn: () => mappingGroupsApi.list(true),
    staleTime: STALE_TIMES.MAPPING_MASTERS,
  })

  const { data: stages = [] } = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list(true),
    staleTime: STALE_TIMES.MAPPING_MASTERS,
  })

  const { isLoading: isLoadingUsages } = useQuery({
    queryKey: ['mapping-master-usages', selectedMaster?.id],
    queryFn: () => mappingMastersApi.getUsages(selectedMaster!.id),
    enabled: !!selectedMaster && showDeleteModal,
  })

  const { data: paramTypeMasters = [] } = useQuery<ParamTypeMaster[]>({
    queryKey: ['param-type-masters'],
    queryFn: () => paramTypeMastersApi.list() as Promise<ParamTypeMaster[]>,
    staleTime: STALE_TIMES.PARAM_TYPE_MASTERS,
  })

  useEffect(() => {
    if (masters) {
      setSortedMasters(masters)
    }
  }, [masters])

  const createMaster = useMutation({
    mutationFn: (data: MappingMasterV2Create) => mappingMastersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setShowEditModal(false)
      setSelectedMaster(null)
    },
  })

  const updateMaster = useMutation({
    mutationFn: ({ id, data }: { id: number; data: MappingMasterV2Update }) =>
      mappingMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setShowEditModal(false)
      setSelectedMaster(null)
    },
  })

  const deleteMaster = useMutation({
    mutationFn: (id: number) => mappingMastersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      setShowDeleteModal(false)
      setSelectedMaster(null)
    },
  })

  const reorderMaster = useMutation({
    mutationFn: (ordered_ids: number[]) => mappingMastersApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedMasters.findIndex((m) => m.id === active.id)
    const newIndex = sortedMasters.findIndex((m) => m.id === over.id)
    const reordered = arrayMove(sortedMasters, oldIndex, newIndex)
    setSortedMasters(reordered)
    reorderMaster.mutate(reordered.map((m) => m.id))
  }

  const handleOpenCreateModal = () => {
    setSelectedMaster(null)
    setShowEditModal(true)
  }

  const handleOpenEditModal = (mm: MappingMasterV2) => {
    setSelectedMaster(mm)
    setShowEditModal(true)
  }

  const handleOpenDeleteModal = (mm: MappingMasterV2) => {
    setSelectedMaster(mm)
    setShowDeleteModal(true)
  }

  const handleSaveMaster = (data: MappingMasterV2Create | MappingMasterV2Update) => {
    if (selectedMaster) {
      updateMaster.mutate({ id: selectedMaster.id, data })
    } else {
      createMaster.mutate(data as MappingMasterV2Create)
    }
  }

  const displayedMasters =
    selectedGroupId === null
      ? sortedMasters
      : sortedMasters.filter((m) => m.group_id === selectedGroupId)

  return (
    <>
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
            <button
              type="button"
              onClick={() => setShowStageModal(true)}
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 font-medium transition-colors"
            >
              <Layers size={13} /> ステージ管理
            </button>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6d62cc] transition-all"
            >
              <Plus size={12} /> Add Master
            </button>
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

            {/* Mapping Group Tabs Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-zinc-800" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={selectedGroupId === null}
                onClick={() => setSelectedGroupId(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedGroupId === null
                    ? 'bg-[#7C6FDD] text-white shadow-sm'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                すべて ({sortedMasters.length})
              </button>
              {groups.map((group) => {
                const count = sortedMasters.filter((m) => m.group_id === group.id).length
                return (
                  <button
                    key={group.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedGroupId === group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      selectedGroupId === group.id
                        ? 'bg-[#7C6FDD] text-white shadow-sm'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    <span>{group.name}</span>
                    <span className="text-[10px] opacity-75 font-mono">({count})</span>
                  </button>
                )
              })}
            </div>

            {/* Integrated Masters Table */}
            {isLoadingMasters ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8 justify-center">
                <RefreshCw size={14} className="animate-spin" /> Loading mapping masters…
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-surface overflow-hidden">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={displayedMasters.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-zinc-800">
                      {displayedMasters.map((mm) => (
                        <MasterRow
                          key={mm.id}
                          master={mm}
                          onEdit={handleOpenEditModal}
                          onDelete={handleOpenDeleteModal}
                        />
                      ))}
                      {displayedMasters.length === 0 && (
                        <div className="p-8 text-center text-xs text-zinc-500">
                          マッピングマスターが見つかりません。
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Mapping Master Edit Modal */}
      {showEditModal && (
        <MappingMasterEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setSelectedMaster(null)
          }}
          master={selectedMaster}
          groups={groups}
          stages={stages}
          paramTypeMasters={paramTypeMasters}
          onSave={handleSaveMaster}
          isPending={createMaster.isPending || updateMaster.isPending}
        />
      )}

      {/* Stage Manager Modal */}
      {showStageModal && (
        <StageManagerModal
          isOpen={showStageModal}
          onClose={() => setShowStageModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedMaster && (
        <MappingMasterDeleteModal
          master={{
            ...selectedMaster,
            role: selectedMaster.base_key || selectedMaster.param_name,
            display_name: selectedMaster.name || selectedMaster.display_name || selectedMaster.param_name,
          } as any}
          isLoadingUsages={isLoadingUsages}
          isPending={deleteMaster.isPending}
          onClose={() => {
            setShowDeleteModal(false)
            setSelectedMaster(null)
          }}
          onDelete={() => deleteMaster.mutate(selectedMaster.id)}
        />
      )}

      {/* Param Type Master Modal */}
      {paramTypeModalMode && (
        <ParamTypeMasterModal
          mode={paramTypeModalMode}
          initial={editingParamType ?? undefined}
          isPending={createParamTypeMutation.isPending || updateParamTypeMutation.isPending}
          onClose={() => {
            setParamTypeModalMode(null)
            setEditingParamType(null)
          }}
          onSubmit={async (data) => {
            if (paramTypeModalMode === 'create') {
              await createParamTypeMutation.mutateAsync(data)
            } else if (editingParamType) {
              await updateParamTypeMutation.mutateAsync({ id: editingParamType.id, data })
            }
          }}
        />
      )}
    </>
  )
}
