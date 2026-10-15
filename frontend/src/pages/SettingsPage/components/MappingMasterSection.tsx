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
import { ParamTypeMasterManagerModal } from '../../../components/ParamTypeMasterManagerModal'

export interface MappingMasterSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

interface MasterRowProps {
  master: MappingMasterV2
  onEdit: (m: MappingMasterV2) => void
  onDelete: (m: MappingMasterV2) => void
}

const TOUCH_BUTTON_CLASS =
  "relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded touch-manipulation transition-colors before:absolute before:-inset-2 before:content-['']"

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

  const displayName = master.name || master.display_name || ''
  const classes = master.expected_class_types ?? []
  const variants = master.variants ?? []

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="settings-mobile-card p-3 border-b border-zinc-800 hover:bg-zinc-800/20 transition-colors"
    >
      <div className="settings-mobile-card__title flex min-w-0 items-center gap-3">
        <button
          type="button"
          className={`${TOUCH_BUTTON_CLASS} cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400`}
          {...attributes}
          {...listeners}
          title="並び替え"
          aria-label="並び替えハンドル"
        >
          <GripVertical size={14} />
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-100" title={displayName}>
          {displayName}
        </span>
        <span className="settings-mobile-card__target-node text-xs font-mono text-zinc-400">
          ({master.param_name})
        </span>
      </div>

      <div className="settings-mobile-card__actions flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(master)}
          aria-label={`${displayName} のマッピング設定を編集（対象ノード: ${master.param_name}${classes.length ? ' / ' + classes.join(', ') : ''}）`}
          className={`${TOUCH_BUTTON_CLASS} text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800`}
          title="編集"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(master)}
          aria-label={`${displayName} を削除`}
          className={`${TOUCH_BUTTON_CLASS} text-zinc-400 hover:text-red-400 hover:bg-zinc-800`}
          title="削除"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="settings-mobile-card__badges flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px] font-mono">
          {master.input_type}
        </span>
        {classes.length > 1 && (
          <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px] font-mono">
            +{classes.length - 1} classes
          </span>
        )}
        {variants.length > 0 ? (
          <>
            {variants.map((v, i) => (
              <span
                key={v.id ?? v.stage_id}
                className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-xs font-mono border ${
                  i === 0 ? 'inline-flex' : 'hidden md:inline-flex'
                } ${
                  v.is_enabled
                    ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                    : 'bg-zinc-900 text-zinc-500 border-transparent opacity-60'
                }`}
              >
                {v.stage_name}
              </span>
            ))}
            {variants.length > 1 && (
              <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px] font-mono md:hidden">
                +{variants.length - 1} stages
              </span>
            )}
          </>
        ) : (
          <span className="text-zinc-600 text-xs">-</span>
        )}
        {master.default_enabled === false && (
          <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 text-[11px]">
            新規マッピングで基本無効
          </span>
        )}
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
  const [showParamTypeManager, setShowParamTypeManager] = useState(false)

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
      setShowParamTypeManager(true)
    },
  })

  const updateParamTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ParamTypeMasterCreate }) =>
      paramTypeMastersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
      setParamTypeModalMode(null)
      setEditingParamType(null)
      setShowParamTypeManager(true)
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
              aria-haspopup="dialog"
              onClick={() => setShowParamTypeManager(true)}
              className="flex items-center gap-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 font-medium transition-colors"
            >
              カスタム型マスタ
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

      <ParamTypeMasterManagerModal
        isOpen={showParamTypeManager}
        items={paramTypeMasters}
        onClose={() => setShowParamTypeManager(false)}
        onCreate={() => {
          setShowParamTypeManager(false)
          setEditingParamType(null)
          setParamTypeModalMode('create')
        }}
        onEdit={(item) => {
          setShowParamTypeManager(false)
          setEditingParamType(item)
          setParamTypeModalMode('edit')
        }}
        onDelete={(item) => deleteParamTypeMutation.mutate(item.id)}
      />

      {/* Param Type Master Modal */}
      {paramTypeModalMode && (
        <ParamTypeMasterModal
          mode={paramTypeModalMode}
          initial={editingParamType ?? undefined}
          isPending={createParamTypeMutation.isPending || updateParamTypeMutation.isPending}
          onClose={() => {
            setParamTypeModalMode(null)
            setEditingParamType(null)
            setShowParamTypeManager(true)
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
