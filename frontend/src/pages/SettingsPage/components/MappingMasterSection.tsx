import { useState, useEffect, useId, useRef } from 'react'
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
import { useSettingsMobile } from '../hooks/useSettingsMobile'
import { useSettingsDraftRegistration, type SettingsDraftRisk } from '../context/SettingsDraftContext'

const INFO_POPOVER_OPEN_EVENT = 'settings-info-popover-open'
const MANAGEMENT_MENU_OPEN_EVENT = 'settings-management-menu-open'

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
  const isMobile = useSettingsMobile()
  const managementMenuId = `mapping-management-${useId().replace(/:/g, '')}`
  const managementTriggerRef = useRef<HTMLButtonElement>(null)
  const managementMenuRef = useRef<HTMLDivElement>(null)
  const managementItemRefs = useRef<Array<HTMLButtonElement | null>>([])
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
  const [showManagementMenu, setShowManagementMenu] = useState(false)

  const draftRiskRef = useRef<SettingsDraftRisk>({
    dirty: false,
    invalid: false,
    failed: false,
    queued: false,
    inFlight: false,
  })
  const draftMutationRef = useRef({ pending: 0, failed: false, session: 0 })
  const draftSessionRef = useRef(0)
  const draftRegistrationRef = useRef<{
    update: (risk: SettingsDraftRisk) => void
    clear: () => void
  } | null>(null)

  const publishDraftRisk = (patch: Partial<SettingsDraftRisk> = {}) => {
    draftRiskRef.current = {
      ...draftRiskRef.current,
      ...patch,
      inFlight: draftMutationRef.current.pending > 0,
    }
    draftRegistrationRef.current?.update(draftRiskRef.current)
  }

  const clearDraftRisk = () => {
    draftRiskRef.current = {
      dirty: false,
      invalid: false,
      failed: false,
      queued: false,
      inFlight: draftMutationRef.current.pending > 0,
    }
    draftMutationRef.current.failed = false
    if (draftMutationRef.current.pending > 0) {
      draftRegistrationRef.current?.update(draftRiskRef.current)
    } else {
      draftRegistrationRef.current?.clear()
    }
  }

  const draftRegistration = useSettingsDraftRegistration('mapping-master-form', {
    cancelQueued: () => {},
    discardLocal: () => {
      draftSessionRef.current += 1
      clearDraftRisk()
      setShowEditModal(false)
      setSelectedMaster(null)
      setParamTypeModalMode(null)
      setEditingParamType(null)
      setShowParamTypeManager(false)
    },
  })
  draftRegistrationRef.current = draftRegistration

  const startDraftMutation = () => {
    draftMutationRef.current.pending += 1
    draftMutationRef.current.failed = false
    draftMutationRef.current.session = draftSessionRef.current
    publishDraftRisk({ dirty: true, failed: false })
  }
  const failDraftMutation = () => {
    if (draftMutationRef.current.session !== draftSessionRef.current) return
    draftMutationRef.current.failed = true
    publishDraftRisk({ dirty: true, failed: true })
  }
  const settleDraftMutation = () => {
    draftMutationRef.current.pending = Math.max(0, draftMutationRef.current.pending - 1)
    if (draftMutationRef.current.pending === 0 && !draftRiskRef.current.dirty && !draftMutationRef.current.failed) {
      clearDraftRisk()
      return
    }
    publishDraftRisk({ failed: draftMutationRef.current.failed })
  }
  const handleDraftInputCapture = (event: React.FormEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return
    publishDraftRisk({ dirty: true, invalid: !target.validity.valid })
  }

  useEffect(() => {
    if (!showManagementMenu || !isMobile) return
    window.dispatchEvent(new Event(MANAGEMENT_MENU_OPEN_EVENT))
    managementItemRefs.current[0]?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (managementTriggerRef.current?.contains(target) || managementMenuRef.current?.contains(target)) return
      setShowManagementMenu(false)
    }
    const handleOtherPopover = () => setShowManagementMenu(false)
    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener(INFO_POPOVER_OPEN_EVENT, handleOtherPopover)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener(INFO_POPOVER_OPEN_EVENT, handleOtherPopover)
    }
  }, [isMobile, showManagementMenu])

  useEffect(() => {
    if (!isMobile) setShowManagementMenu(false)
  }, [isMobile])

  const handleManagementMenuKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const itemCount = 2
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % itemCount
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + itemCount) % itemCount
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = itemCount - 1
    if (event.key === 'Escape') {
      event.preventDefault()
      setShowManagementMenu(false)
      managementTriggerRef.current?.focus()
      return
    }
    if (nextIndex !== null) {
      event.preventDefault()
      managementItemRefs.current[nextIndex]?.focus()
    }
  }

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
    onMutate: startDraftMutation,
    onError: failDraftMutation,
    onSettled: settleDraftMutation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      if (draftMutationRef.current.session !== draftSessionRef.current) return
      clearDraftRisk()
      setShowEditModal(false)
      setSelectedMaster(null)
    },
  })

  const updateMaster = useMutation({
    mutationFn: ({ id, data }: { id: number; data: MappingMasterV2Update }) =>
      mappingMastersApi.update(id, data),
    onMutate: startDraftMutation,
    onError: failDraftMutation,
    onSettled: settleDraftMutation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      if (draftMutationRef.current.session !== draftSessionRef.current) return
      clearDraftRisk()
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
    onMutate: startDraftMutation,
    onError: failDraftMutation,
    onSettled: settleDraftMutation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
      if (draftMutationRef.current.session !== draftSessionRef.current) return
      clearDraftRisk()
      setParamTypeModalMode(null)
      setEditingParamType(null)
      setShowParamTypeManager(true)
    },
  })

  const updateParamTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ParamTypeMasterCreate }) =>
      paramTypeMastersApi.update(id, data),
    onMutate: startDraftMutation,
    onError: failDraftMutation,
    onSettled: settleDraftMutation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['param-type-masters'] })
      if (draftMutationRef.current.session !== draftSessionRef.current) return
      clearDraftRisk()
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
    draftSessionRef.current += 1
    setSelectedMaster(null)
    setShowEditModal(true)
  }

  const handleOpenEditModal = (mm: MappingMasterV2) => {
    draftSessionRef.current += 1
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
          className="w-full flex flex-col gap-2 px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">Node Mapping Masters</h2>
            <span className="text-xs text-zinc-600">— 編集ノードのマッピングマスタ設定</span>
          </div>
          <div className="flex items-center justify-between gap-2 md:justify-end md:gap-3" onClick={(e) => e.stopPropagation()}>
            {isMobile ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-[#7C6FDD] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#6d62cc] touch-manipulation"
                >
                  <Plus size={12} /> Add Master
                </button>
                <div className="relative">
                  <button
                    ref={managementTriggerRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={showManagementMenu}
                    aria-controls={managementMenuId}
                    onClick={() => setShowManagementMenu((open) => !open)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium text-zinc-200 touch-manipulation"
                  >
                    管理 ⋯
                  </button>
                  {showManagementMenu && (
                    <div
                      ref={managementMenuRef}
                      id={managementMenuId}
                      role="menu"
                      aria-label="Mapping master管理"
                      className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
                    >
                      <button
                        ref={(node) => { managementItemRefs.current[0] = node }}
                        type="button"
                        role="menuitem"
                        onKeyDown={(event) => handleManagementMenuKeyDown(event, 0)}
                        onClick={() => {
                          setShowManagementMenu(false)
                          setShowStageModal(true)
                        }}
                        className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm text-zinc-200 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                      >
                        <Layers size={14} className="mr-2" /> ステージ管理
                      </button>
                      <button
                        ref={(node) => { managementItemRefs.current[1] = node }}
                        type="button"
                        role="menuitem"
                        onKeyDown={(event) => handleManagementMenuKeyDown(event, 1)}
                        onClick={() => {
                          setShowManagementMenu(false)
                          setShowParamTypeManager(true)
                        }}
                        className="flex min-h-11 w-full items-center rounded px-3 text-left text-sm text-zinc-200 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                      >
                        カスタム型マスタ
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
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
              </>
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
        <div onChangeCapture={handleDraftInputCapture}>
          <MappingMasterEditModal
            isOpen={showEditModal}
            onClose={() => {
              draftSessionRef.current += 1
              clearDraftRisk()
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
        </div>
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
          draftSessionRef.current += 1
          setShowParamTypeManager(false)
          setEditingParamType(null)
          setParamTypeModalMode('create')
        }}
        onEdit={(item) => {
          draftSessionRef.current += 1
          setShowParamTypeManager(false)
          setEditingParamType(item)
          setParamTypeModalMode('edit')
        }}
        onDelete={(item) => deleteParamTypeMutation.mutate(item.id)}
      />

      {/* Param Type Master Modal */}
      {paramTypeModalMode && (
        <div onChangeCapture={handleDraftInputCapture}>
          <ParamTypeMasterModal
            mode={paramTypeModalMode}
            initial={editingParamType ?? undefined}
            isPending={createParamTypeMutation.isPending || updateParamTypeMutation.isPending}
            onClose={() => {
              draftSessionRef.current += 1
              clearDraftRisk()
              setParamTypeModalMode(null)
              setEditingParamType(null)
              setShowParamTypeManager(true)
            }}
            onSubmit={async (data) => {
              try {
                if (paramTypeModalMode === 'create') {
                  await createParamTypeMutation.mutateAsync(data)
                } else if (editingParamType) {
                  await updateParamTypeMutation.mutateAsync({ id: editingParamType.id, data })
                }
              } catch {
                // onError records the failed draft and keeps route protection active.
              }
            }}
          />
        </div>
      )}
    </>
  )
}
