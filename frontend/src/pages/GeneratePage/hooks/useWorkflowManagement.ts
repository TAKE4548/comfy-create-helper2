import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, mappingMastersApi, baseModelsApi, paramTypeMastersApi, comfyApi } from '../../../api/client'
import type { Workflow, MappingMaster, BaseModel, ParamTypeMaster } from '../../../api/types'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { useGenerationStore } from '../../../store/useGenerationStore'

export interface UseWorkflowManagementProps {
  selectedWorkflowId: number | null
  setSelectedWorkflowId: (id: number | null) => void
}

export function useWorkflowManagement({
  selectedWorkflowId,
  setSelectedWorkflowId,
}: UseWorkflowManagementProps) {
  const qc = useQueryClient()
  const isConnected = useGenerationStore((state) => state.isConnected)
  const [selectedMasters, setSelectedMasters] = useState<Record<number, number>>({})
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [isWorkflowMenuOpen, setIsWorkflowMenuOpen] = useState(false)
  const [activePromptTab, setActivePromptTabState] = useState<string>('')
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({})
  const [isAnimaMode, setIsAnimaMode] = useState(false)

  // ── Queries ──
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })
  const { data: workflow } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!) as Promise<Workflow>,
    enabled: !!selectedWorkflowId,
  })
  const { data: mappingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })
  const { data: baseModels } = useQuery({
    queryKey: ['base-models'],
    queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>,
  })
  const { data: paramTypeMasters } = useQuery({
    queryKey: ['param-type-masters'],
    queryFn: () => paramTypeMastersApi.list() as Promise<ParamTypeMaster[]>,
  })
  const { data: comfyObjectInfo } = useQuery({
    queryKey: ['comfy-object-info'],
    queryFn: () => comfyApi.getObjectInfo(),
    staleTime: 1000 * 60 * 60,
    retry: 3,
  })

  useEffect(() => {
    if (isConnected) {
      qc.invalidateQueries({ queryKey: ['comfy-object-info'] })
    }
  }, [isConnected, qc])

  // ── Tab & Collapse Helpers ──
  const setActivePromptTab = (tab: string) => {
    setActivePromptTabState(tab)
    if (selectedWorkflowId && tab) {
      localStorage.setItem(`${LS_KEYS.ACTIVE_PROMPT_TAB_PREFIX}${selectedWorkflowId}`, tab)
    }
  }

  const getIsRoleCollapsed = (role: string) => {
    if (collapsedRoles[role] !== undefined) {
      return collapsedRoles[role]
    }
    return localStorage.getItem(`prompt-surgeon-collapsed-${role}`) === 'true'
  }

  const setRoleCollapsed = (role: string, isCollapsed: boolean) => {
    setCollapsedRoles((prev) => ({ ...prev, [role]: isCollapsed }))
    localStorage.setItem(`prompt-surgeon-collapsed-${role}`, String(isCollapsed))
  }

  // ── Anima Detection ──
  useEffect(() => {
    if (workflow && baseModels) {
      const selectedModel = baseModels.find((m) => m.id === workflow.target_base_model_id)
      setIsAnimaMode(!!selectedModel && selectedModel.name === 'Anima')
    }
  }, [workflow, baseModels])

  // ── Active Prompt Tab Init ──
  useEffect(() => {
    const texts = workflow?.mappings.filter((m) => m.role != null && m.input_type === 'textarea') ?? []
    const savedTab = selectedWorkflowId ? localStorage.getItem(`${LS_KEYS.ACTIVE_PROMPT_TAB_PREFIX}${selectedWorkflowId}`) : null
    if (savedTab && texts.some((t) => t.role === savedTab)) {
      setActivePromptTabState(savedTab)
    } else {
      setActivePromptTabState(texts.length > 0 ? texts[0].role || '' : '')
    }
  }, [workflow, selectedWorkflowId])

  // ── Menu Close On Document Click ──
  useEffect(() => {
    if (!isWorkflowMenuOpen) return
    const closeMenu = () => setIsWorkflowMenuOpen(false)
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [isWorkflowMenuOpen])

  // ── Mutations ──
  const renameWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      setWorkflowManageMode(null)
    },
  })
  const copyWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.copy(id, name),
    onSuccess: (newWf) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedWorkflowId(newWf.id)
      setWorkflowManageMode(null)
    },
  })
  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ workflowId, mappings }: { workflowId: number; mappings: { master_id: number; node_id: string }[] }) =>
      workflowsApi.update(workflowId, { mappings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedMasters({})
    },
  })
  const updateWorkflowBaseModelMutation = useMutation({
    mutationFn: ({ id, target_base_model_id }: { id: number; target_base_model_id: number | null }) =>
      workflowsApi.update(id, { target_base_model_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const handleUpdateMapping = async (mappingId: number, newMasterId: number) => {
    if (!workflow || !selectedWorkflowId) return
    const updatedMappings = workflow.mappings.map((m) =>
      m.id === mappingId
        ? { master_id: newMasterId, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id }
    )
    await updateWorkflowMutation.mutateAsync({ workflowId: selectedWorkflowId, mappings: updatedMappings })
  }

  // ── Derived Mappings ──
  const validMappings = workflow?.mappings.filter((m) => m.role != null) ?? []
  const invalidMappings = workflow?.mappings.filter((m) => m.role == null) ?? []
  const textMappings = validMappings.filter((m) => m.input_type === 'textarea')
  const paramMappings = validMappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed')

  return {
    qc,
    workflows,
    workflow,
    mappingMasters,
    baseModels,
    paramTypeMasters,
    comfyObjectInfo,
    selectedMasters,
    setSelectedMasters,
    workflowManageMode,
    setWorkflowManageMode,
    isWorkflowMenuOpen,
    setIsWorkflowMenuOpen,
    activePromptTab,
    setActivePromptTab,
    collapsedRoles,
    getIsRoleCollapsed,
    setRoleCollapsed,
    isAnimaMode,
    setIsAnimaMode,
    validMappings,
    invalidMappings,
    textMappings,
    paramMappings,
    renameWorkflowMutation,
    copyWorkflowMutation,
    updateWorkflowMutation,
    updateWorkflowBaseModelMutation,
    handleUpdateMapping,
  }
}
