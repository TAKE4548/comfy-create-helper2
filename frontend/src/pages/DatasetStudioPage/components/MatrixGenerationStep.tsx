import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Sparkles, RefreshCw, Send, CheckCircle, AlertCircle, Layers, Shirt, Settings2 } from 'lucide-react'
import { TagChipEditor } from '../../../components/TagChipEditor'
import { datasetApi, workflowsApi, workflowPresetsApi, comfyApi } from '../../../api/client'
import type { DatasetItem, Workflow, DatasetProject } from '../../../api/types'
import { useStudioStore } from '../useStudioStore'
import { OutfitMasterModal, distributeAltOutfits } from './OutfitMasterModal'
import { OutfitPresetBadge } from './OutfitPresetBadge'
import { NodeRemapModal } from './NodeRemapModal'
import { useStudioAutosave, type StudioFormData } from '../hooks/useStudioAutosave'
import type { DatasetStudioDraft } from '../utils/studioDraftStorage'

export interface MatrixGenerationStepProps {
  onDirectBatchSubmit?: (items: DatasetItem[], workflowPromptJson?: any) => Promise<void>
}

export interface InjectPromptOptions {
  positiveNodeId?: string | null
  negativeNodeId?: string | null
  negativePrompt?: string
  seedNodeId?: string | null
}

/**
 * Injects prompt and seed into a ComfyUI workflow JSON prompt payload.
 * Clones the workflow, searches for positive prompt node (CLIPTextEncode)
 * and seed node (KSampler), and injects raw_prompt and seed.
 * Supports targeted node IDs via options (positiveNodeId, negativeNodeId, seedNodeId).
 */
export function injectPromptAndSeed(
  workflowPromptJson: Record<string, any> | undefined,
  rawPrompt: string,
  seed: number,
  options?: InjectPromptOptions
): Record<string, any> {
  const payload = workflowPromptJson ? JSON.parse(JSON.stringify(workflowPromptJson)) : {}

  let promptInjected = false
  let negativeInjected = false
  let seedInjected = false

  // 1. Direct targeted injection if options provide specific node IDs
  if (options?.positiveNodeId && payload[options.positiveNodeId]) {
    const targetNode = payload[options.positiveNodeId]
    if (targetNode && typeof targetNode === 'object') {
      if (!targetNode.inputs) targetNode.inputs = {}
      targetNode.inputs.text = rawPrompt
      promptInjected = true
    }
  }

  if (options?.negativeNodeId && options.negativePrompt !== undefined && payload[options.negativeNodeId]) {
    const targetNode = payload[options.negativeNodeId]
    if (targetNode && typeof targetNode === 'object') {
      if (!targetNode.inputs) targetNode.inputs = {}
      targetNode.inputs.text = options.negativePrompt
      negativeInjected = true
    }
  }

  if (options?.seedNodeId && payload[options.seedNodeId]) {
    const targetNode = payload[options.seedNodeId]
    if (targetNode && typeof targetNode === 'object') {
      if (!targetNode.inputs) targetNode.inputs = {}
      targetNode.inputs.seed = seed
      seedInjected = true
    }
  }

  // 2. Fallback search through nodes for any un-injected targets
  const candidateTextNodes: string[] = []
  for (const nodeId of Object.keys(payload)) {
    const node = payload[nodeId]
    if (!node || typeof node !== 'object') continue

    // Track CLIPTextEncode nodes for fallback negative injection
    if (node.class_type === 'CLIPTextEncode' || node.class_type?.includes('CLIPText')) {
      candidateTextNodes.push(nodeId)
    }

    // Positive text prompt node (CLIPTextEncode)
    if (!promptInjected && (node.class_type === 'CLIPTextEncode' || node.class_type?.includes('CLIPText'))) {
      if (node.inputs) {
        node.inputs.text = rawPrompt
        promptInjected = true
      }
    }

    // Sampler node (KSampler / KSamplerAdvanced)
    if (!seedInjected && (node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced')) {
      if (node.inputs) {
        node.inputs.seed = seed
        seedInjected = true
      }
    }
  }

  // Negative prompt fallback search if negativePrompt provided but not yet injected
  if (!negativeInjected && options?.negativePrompt !== undefined) {
    // If negativeNodeId was not found or not specified, check candidates or titles
    let targetNegId: string | null = null
    for (const nodeId of Object.keys(payload)) {
      const node = payload[nodeId]
      if (!node || typeof node !== 'object') continue
      const title = (node._meta?.title || node.title || '').toLowerCase()
      if (title.includes('negative') && (node.class_type === 'CLIPTextEncode' || node.class_type?.includes('CLIPText'))) {
        targetNegId = nodeId
        break
      }
    }
    // If not found by title, try second text node if different from first
    if (!targetNegId && candidateTextNodes.length >= 2) {
      targetNegId = candidateTextNodes[1]
    }
    if (targetNegId && payload[targetNegId]) {
      if (!payload[targetNegId].inputs) payload[targetNegId].inputs = {}
      payload[targetNegId].inputs.text = options.negativePrompt
      negativeInjected = true
    }
  }

  // Fallback if no nodes matched: provide standard structure
  if (!promptInjected) {
    payload['6'] = {
      inputs: { text: rawPrompt },
      class_type: 'CLIPTextEncode',
    }
  }
  if (!seedInjected) {
    payload['3'] = {
      inputs: { seed },
      class_type: 'KSampler',
    }
  }
  if (!negativeInjected && options?.negativePrompt !== undefined) {
    payload['7'] = {
      inputs: { text: options.negativePrompt },
      class_type: 'CLIPTextEncode',
    }
  }

  return payload
}

export const MatrixGenerationStep: React.FC<MatrixGenerationStepProps> = ({
  onDirectBatchSubmit,
}) => {
  const {
    activeProject,
    setActiveProject,
    items,
    setItems,
    setCurrentStep,
    selectedAltOutfits,
    setSelectedAltOutfits,
  } = useStudioStore()

  // Project Configuration state
  const [projectName, setProjectName] = useState<string>(activeProject?.name || 'My New Chara LoRA')
  const [characterTrigger, setCharacterTrigger] = useState<string>(activeProject?.character_trigger || 'mychara')
  const [outfitTrigger, setOutfitTrigger] = useState<string>(activeProject?.outfit_trigger || 'mychara_outfit')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number>(activeProject?.workflow_id || 1)

  // 3-way tag inputs
  const [metaTags, setMetaTags] = useState<string>(
    activeProject?.prompt_meta || '1girl, solo, anime style, masterpiece, best quality'
  )
  const [physicalTags, setPhysicalTags] = useState<string>(
    activeProject?.prompt_physical || 'long silver hair, red eyes, ahoge, cat ears'
  )
  const [exclusiveOutfitTags, setExclusiveOutfitTags] = useState<string>(
    activeProject?.prompt_exclusive_outfit || 'black gothic dress, lace collar, gold trim, ribbon'
  )

  // Negative prompt input
  const [negativePrompt, setNegativePrompt] = useState<string>(
    activeProject?.prompt_negative !== undefined
      ? activeProject.prompt_negative
      : 'worst quality, low quality, bad anatomy, blurry'
  )

  // Synchronize form state when activeProject identity changes
  const [prevActiveProjectId, setPrevActiveProjectId] = useState<number | null>(activeProject?.id ?? null)
  if ((activeProject?.id ?? null) !== prevActiveProjectId) {
    setPrevActiveProjectId(activeProject?.id ?? null)
    if (activeProject) {
      setProjectName(activeProject.name || 'My New Chara LoRA')
      setCharacterTrigger(activeProject.character_trigger || 'mychara')
      setOutfitTrigger(activeProject.outfit_trigger || 'mychara_outfit')
      setSelectedWorkflowId(activeProject.workflow_id || 1)
      setMetaTags(activeProject.prompt_meta || '1girl, solo, anime style, masterpiece, best quality')
      setPhysicalTags(activeProject.prompt_physical || 'long silver hair, red eyes, ahoge, cat ears')
      setExclusiveOutfitTags(
        activeProject.prompt_exclusive_outfit || 'black gothic dress, lace collar, gold trim, ribbon'
      )
      setNegativePrompt(
        activeProject.prompt_negative !== undefined
          ? activeProject.prompt_negative
          : 'worst quality, low quality, bad anatomy, blurry'
      )
    }
  }

  useEffect(() => {
    if (activeProject) {
      setProjectName(activeProject.name || 'My New Chara LoRA')
      setCharacterTrigger(activeProject.character_trigger || 'mychara')
      setOutfitTrigger(activeProject.outfit_trigger || 'mychara_outfit')
      setSelectedWorkflowId(activeProject.workflow_id || 1)
      setMetaTags(activeProject.prompt_meta || '1girl, solo, anime style, masterpiece, best quality')
      setPhysicalTags(activeProject.prompt_physical || 'long silver hair, red eyes, ahoge, cat ears')
      setExclusiveOutfitTags(
        activeProject.prompt_exclusive_outfit || 'black gothic dress, lace collar, gold trim, ribbon'
      )
      setNegativePrompt(
        activeProject.prompt_negative !== undefined
          ? activeProject.prompt_negative
          : 'worst quality, low quality, bad anatomy, blurry'
      )
      if (activeProject.selected_alt_outfits) {
        try {
          const parsed = JSON.parse(activeProject.selected_alt_outfits)
          if (Array.isArray(parsed)) {
            setSelectedAltOutfits(parsed)
          }
        } catch {
          // ignore
        }
      }
    }
  }, [activeProject?.id, setSelectedAltOutfits])

  const altOutfitsPayload = useMemo(() => {
    return JSON.stringify(
      selectedAltOutfits.map((o) => ({
        id: o.id,
        name: o.name,
        prompt_tags: o.prompt_tags,
      }))
    )
  }, [selectedAltOutfits])

  const formData = useMemo<StudioFormData>(
    () => ({
      name: projectName,
      character_trigger: characterTrigger,
      outfit_trigger: outfitTrigger,
      workflow_id: selectedWorkflowId,
      prompt_meta: metaTags,
      prompt_physical: physicalTags,
      prompt_exclusive_outfit: exclusiveOutfitTags,
      prompt_negative: negativePrompt,
      selected_alt_outfits: altOutfitsPayload,
    }),
    [
      projectName,
      characterTrigger,
      outfitTrigger,
      selectedWorkflowId,
      metaTags,
      physicalTags,
      exclusiveOutfitTags,
      negativePrompt,
      altOutfitsPayload,
    ]
  )

  const handleDraftRestored = useCallback((draft: DatasetStudioDraft) => {
    setProjectName(draft.name)
    setCharacterTrigger(draft.character_trigger)
    setOutfitTrigger(draft.outfit_trigger)
    setSelectedWorkflowId(draft.workflow_id)
    setMetaTags(draft.prompt_meta)
    setPhysicalTags(draft.prompt_physical)
    setExclusiveOutfitTags(draft.prompt_exclusive_outfit)
    setNegativePrompt(draft.prompt_negative)
    if (draft.selected_alt_outfits) {
      try {
        const parsed = JSON.parse(draft.selected_alt_outfits)
        if (Array.isArray(parsed)) {
          setSelectedAltOutfits(parsed)
        }
      } catch {
        // ignore
      }
    }
  }, [setSelectedAltOutfits])

  const handleProjectUpdated = useCallback((updated: DatasetProject) => {
    setActiveProject(updated)
    setProjectName(updated.name)
    setCharacterTrigger(updated.character_trigger)
    setOutfitTrigger(updated.outfit_trigger)
    setSelectedWorkflowId(updated.workflow_id)
    setMetaTags(updated.prompt_meta)
    setPhysicalTags(updated.prompt_physical)
    setExclusiveOutfitTags(updated.prompt_exclusive_outfit)
    setNegativePrompt(updated.prompt_negative ?? '')
    if (updated.selected_alt_outfits) {
      try {
        const parsed = JSON.parse(updated.selected_alt_outfits)
        if (Array.isArray(parsed)) {
          setSelectedAltOutfits(parsed)
        }
      } catch {
        // ignore
      }
    }
  }, [setActiveProject, setSelectedAltOutfits])

  const {
    hasConflict,
    flushAutoSave,
    resolveConflictWithDraft,
    resolveConflictWithServer,
    isRestoredFromDraft,
    clearDraftStatus,
  } = useStudioAutosave({
    activeProject,
    formData,
    onProjectUpdated: handleProjectUpdated,
    onDraftRestored: handleDraftRestored,
  })

  // Workflows list & detailed active workflow
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null)
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false)

  // Modal states
  const [isOutfitModalOpen, setIsOutfitModalOpen] = useState(false)
  const [isRemapModalOpen, setIsRemapModalOpen] = useState(false)

  // Operations state
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [batchProgress, setBatchProgress] = useState<number>(0)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch available workflows
  useEffect(() => {
    let isMounted = true
    setIsLoadingWorkflows(true)
    workflowsApi
      .list()
      .then((data) => {
        if (isMounted) {
          const list = Array.isArray(data) ? (data as Workflow[]) : []
          setWorkflows(list)
          if (list.length > 0 && !activeProject?.workflow_id) {
            setSelectedWorkflowId(list[0].id)
          }
        }
      })
      .catch(() => {
        // Fallback mock workflows if API is not loaded or during testing
        if (isMounted) {
          setWorkflows([{ id: 1, name: 'Default Anima 2B Generator' } as Workflow])
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingWorkflows(false)
      })
    return () => {
      isMounted = false
    }
  }, [activeProject?.workflow_id])

  // Fetch detailed workflow whenever selectedWorkflowId changes & load default negative prompt
  useEffect(() => {
    let isMounted = true
    if (!selectedWorkflowId) return

    workflowsApi
      .get?.(selectedWorkflowId)
      ?.then(async (wf) => {
        if (!isMounted) return
        setCurrentWorkflow(wf)

        // Only auto-resolve negative prompt if user has not already saved one in the active project
        if (activeProject?.prompt_negative === undefined) {
          let resolvedNeg: string | null = null

          // Try presets first
          try {
            const presets = await workflowPresetsApi.list(selectedWorkflowId)
            if (Array.isArray(presets) && presets.length > 0) {
              const pv = presets[0].param_values as Record<string, any>
              if (pv?.Negative_Prompt || pv?.negative_prompt) {
                resolvedNeg = pv.Negative_Prompt || pv.negative_prompt
              }
            }
          } catch {
            // Presets fetch failed, ignore
          }

          // Next try finding negative node text from workflow json
          if (!resolvedNeg && wf?.json_body) {
            const jsonBody = wf.json_body as Record<string, any>
            const negMapping = wf.mappings?.find(
              (m) => m.role === 'Negative_Prompt' || (m.role && m.role.toLowerCase().includes('negative'))
            )
            const targetId = negMapping?.node_id
            if (targetId && jsonBody[targetId]?.inputs?.text) {
              resolvedNeg = jsonBody[targetId].inputs.text
            }
          }

          if (resolvedNeg !== null && isMounted) {
            setNegativePrompt(resolvedNeg)
          }
        }
      })
      .catch(() => {
        // Fallback if detailed workflow fetch fails
        if (isMounted) {
          const fallbackWf = workflows.find((w) => w.id === selectedWorkflowId) || null
          setCurrentWorkflow(fallbackWf)
        }
      })

    return () => {
      isMounted = false
    }
  }, [selectedWorkflowId, activeProject?.prompt_negative, workflows])

  // Character trigger sync logic: keep outfitTrigger ending with _outfit if using default pattern
  const handleCharacterTriggerChange = (newCharTrigger: string) => {
    setCharacterTrigger(newCharTrigger)
    if (!outfitTrigger || outfitTrigger === `${characterTrigger}_outfit`) {
      setOutfitTrigger(`${newCharTrigger}_outfit`)
    }
  }

  // Calculate DOE Orthogonal Matrix
  const handleCalculateMatrix = async () => {
    setIsCalculating(true)
    setStatusMessage(null)
    try {
      await flushAutoSave()
      let project = useStudioStore.getState().activeProject || activeProject
      const altOutfitsPayload = JSON.stringify(
        selectedAltOutfits.map((o) => ({
          id: o.id,
          name: o.name,
          prompt_tags: o.prompt_tags,
        }))
      )

      // If active project does not exist yet or needs to be saved, create or update
      if (!project) {
        project = await datasetApi.createProject({
          name: projectName,
          character_trigger: characterTrigger,
          outfit_trigger: outfitTrigger,
          workflow_id: selectedWorkflowId,
          prompt_meta: metaTags,
          prompt_physical: physicalTags,
          prompt_exclusive_outfit: exclusiveOutfitTags,
          prompt_negative: negativePrompt,
          selected_alt_outfits: altOutfitsPayload,
        })
        setActiveProject(project)
      } else {
        project = await datasetApi.updateProject(project.id, {
          name: projectName,
          character_trigger: characterTrigger,
          outfit_trigger: outfitTrigger,
          workflow_id: selectedWorkflowId,
          prompt_meta: metaTags,
          prompt_physical: physicalTags,
          prompt_exclusive_outfit: exclusiveOutfitTags,
          prompt_negative: negativePrompt,
          selected_alt_outfits: altOutfitsPayload,
        })
        setActiveProject(project)
      }

      const generatedItems = await datasetApi.calculateMatrix(project.id)
      setItems(generatedItems)
      setStatusMessage({
        type: 'success',
        text: `直交計画マトリクス (${generatedItems.length}件) の生成が完了しました`,
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `マトリクス算出エラー: ${err.message || 'Unknown error'}`,
      })
    } finally {
      setIsCalculating(false)
    }
  };

  // Submit direct 20 items batch to ComfyUI (Port 8188)
  const handleSubmitBatch = async () => {
    if (items.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'マトリクスアイテムが生成されていません。先に「直交マトリクス再計算」を実行してください。',
      })
      return
    }

    setIsSubmitting(true)
    setBatchProgress(0)
    setStatusMessage(null)

    try {
      if (onDirectBatchSubmit) {
        await onDirectBatchSubmit(items)
        setBatchProgress(100)
      } else {
        // Direct ComfyUI batch submission via proxy
        const clientId = 'lora-studio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)

        // Fetch selected workflow JSON body and mappings if available
        let workflowPromptJson: Record<string, any> = {}
        let wfMappings: any[] = []
        try {
          const wf = await workflowsApi.get(selectedWorkflowId)
          workflowPromptJson = wf?.json_body || {}
          wfMappings = wf?.mappings || []
        } catch {
          workflowPromptJson = currentWorkflow?.json_body || {}
          wfMappings = currentWorkflow?.mappings || []
        }

        const posMapping = wfMappings.find(
          (m) => m.role === 'Main_Positive_Prompt' || (m.role && m.role.toLowerCase().includes('positive'))
        )
        const negMapping = wfMappings.find(
          (m) => m.role === 'Negative_Prompt' || (m.role && m.role.toLowerCase().includes('negative'))
        )

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const payload = injectPromptAndSeed(workflowPromptJson, item.raw_prompt, item.seed, {
            positiveNodeId: posMapping?.node_id,
            negativeNodeId: negMapping?.node_id,
            negativePrompt: negativePrompt,
          })

          const res = await comfyApi.queuePrompt({
            prompt: payload,
            client_id: clientId,
          })

          if (res?.error) {
            const errorMsg =
              typeof res.error === 'string'
                ? res.error
                : res.error.message || JSON.stringify(res.error)
            throw new Error(errorMsg)
          }

          setBatchProgress(Math.round(((i + 1) / items.length) * 100))
        }
      }

      setStatusMessage({
        type: 'success',
        text: `ComfyUIへの${items.length}件の直接バッチ投入が完了しました！`,
      })
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ComfyUI直接投入エラー: ${err.message || '接続に失敗しました'}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="matrix-generation-step">
      {/* Draft Restored Notification Alert */}
      {isRestoredFromDraft && (
        <div
          data-testid="draft-restored-alert"
          className="bg-indigo-950/70 border border-indigo-700/80 rounded-xl p-4 text-indigo-200 text-xs flex items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>未保存の下書きを復元しました</span>
          </div>
          <button
            type="button"
            onClick={clearDraftStatus}
            className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Draft Conflict Warning Banner */}
      {hasConflict && (
        <div
          data-testid="draft-conflict-alert"
          className="bg-amber-950/70 border border-amber-600/80 rounded-xl p-4 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              サーバー上のデータが更新されています。ローカルの下書きで上書きするか、サーバーの最新データを読み込むか選択してください。
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              data-testid="resolve-conflict-draft-btn"
              onClick={() => resolveConflictWithDraft()}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
            >
              下書きで上書き
            </button>
            <button
              type="button"
              data-testid="resolve-conflict-server-btn"
              onClick={() => resolveConflictWithServer()}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-700 transition-colors"
            >
              サーバーの最新を読込
            </button>
          </div>
        </div>
      )}

      {/* Top Configuration Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          プロジェクト & トリガー連動設定
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              プロジェクト名
            </label>
            <input
              type="text"
              data-testid="project-name-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="例: Alice Character LoRA"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              キャラトリガー名
            </label>
            <input
              type="text"
              data-testid="character-trigger-input"
              value={characterTrigger}
              onChange={(e) => handleCharacterTriggerChange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="mychara"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              本命衣装トリガー名
            </label>
            <input
              type="text"
              data-testid="outfit-trigger-input"
              value={outfitTrigger}
              onChange={(e) => setOutfitTrigger(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              placeholder="mychara_outfit"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              ComfyUI ワークフロー
            </label>
            <div className="flex gap-2 items-center">
              <select
                data-testid="workflow-select"
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(Number(e.target.value))}
                disabled={isLoadingWorkflows}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
              {currentWorkflow && (
                <button
                  type="button"
                  data-testid="open-remap-modal-button"
                  onClick={() => setIsRemapModalOpen(true)}
                  title="ノード再割当"
                  className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium border border-zinc-700 flex items-center gap-1.5 flex-shrink-0 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>再割当</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Node Mapping Information Badges */}
        {currentWorkflow && (
          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-500 font-medium">注入先ノード:</span>
              {(() => {
                const pos = currentWorkflow.mappings?.find(
                  (m) => m.role === 'Main_Positive_Prompt' || (m.role && m.role.toLowerCase().includes('positive'))
                )
                const neg = currentWorkflow.mappings?.find(
                  (m) => m.role === 'Negative_Prompt' || (m.role && m.role.toLowerCase().includes('negative'))
                )
                const jsonBody = (currentWorkflow.json_body || {}) as Record<string, any>
                const posNode = pos?.node_id ? jsonBody[pos.node_id] : null
                const negNode = neg?.node_id ? jsonBody[neg.node_id] : null

                const posTitle = posNode?._meta?.title || posNode?.title || (posNode?.class_type ? `${posNode.class_type} (#${pos?.node_id})` : `#${pos?.node_id || '未設定'}`)
                const negTitle = negNode?._meta?.title || negNode?.title || (negNode?.class_type ? `${negNode.class_type} (#${neg?.node_id})` : `#${neg?.node_id || '未設定'}`)

                return (
                  <>
                    <span
                      data-testid="positive-node-badge"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-950/70 text-indigo-300 border border-indigo-800/80 text-[11px] font-mono"
                    >
                      <span className="font-sans font-medium text-indigo-400">Positive:</span>
                      #{pos?.node_id || '未設定'} {posTitle}
                    </span>
                    <span
                      data-testid="negative-node-badge"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-950/70 text-rose-300 border border-rose-800/80 text-[11px] font-mono"
                    >
                      <span className="font-sans font-medium text-rose-400">Negative:</span>
                      #{neg?.node_id || '未設定'} {negTitle}
                    </span>
                  </>
                )
              })()}
            </div>
            <button
              type="button"
              data-testid="remap-trigger-link"
              onClick={() => setIsRemapModalOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
            >
              ノード再割当 (Remap)
            </button>
          </div>
        )}
      </div>

      {currentWorkflow && isRemapModalOpen && (
        <NodeRemapModal
          workflow={currentWorkflow}
          onClose={() => setIsRemapModalOpen(false)}
          onSaved={(updatedWf) => {
            setCurrentWorkflow(updatedWf)
            setWorkflows((prev) => prev.map((w) => (w.id === updatedWf.id ? updatedWf : w)))
          }}
        />
      )}

      {/* 3-Section Tag Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Meta / Quality */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">① メタ情報 (Meta & Quality)</h3>
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">共通維持</span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              画風、基本クオリティ、共通設定タグ
            </p>
            <div data-testid="meta-tag-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="meta-tag-editor"
                value={metaTags}
                onChange={setMetaTags}
                placeholder="1girl, solo, anime style, masterpiece..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">
            ※ トリガー置換は行われず、全スロットの先頭に維持されます
          </div>
        </div>

        {/* 2. Physical & Face */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">② 身体的特徴・顔 (Face & Body)</h3>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded">
                連動: {characterTrigger}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              髪型、髪色、瞳の色、ケモ耳などの固定身体特徴
            </p>
            <div data-testid="physical-tag-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="physical-tag-editor"
                value={physicalTags}
                onChange={setPhysicalTags}
                placeholder="long silver hair, red eyes, cat ears..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-indigo-400/80">
            ※ キャプション生成時に完全消去され、キャラトリガーに置換されます
          </div>
        </div>

        {/* 3. Exclusive Outfit */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-200">③ 専用の服装 (Default Outfit)</h3>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                連動: {outfitTrigger}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              本命衣装の固有装飾、ドレス、リボン等の装飾タグ
            </p>
            <div data-testid="exclusive-outfit-editor" className="min-h-[110px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
              <TagChipEditor
                id="exclusive-outfit-editor"
                value={exclusiveOutfitTags}
                onChange={setExclusiveOutfitTags}
                placeholder="black gothic dress, lace collar, gold trim..."
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-emerald-400/80">
            ※ 本命枠（15件）のみ消去・置換。別衣装枠（5件）には混入しません
          </div>
        </div>
      </div>

      {/* ④ ネガティブプロンプト (Negative Prompt) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">
              ④ ネガティブプロンプト (Negative Prompt)
            </h3>
            <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded">
              全スロット共通
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            {(negativePrompt || '').length} 文字
          </span>
        </div>
        <p className="text-xs text-zinc-400 mb-3">
          画質崩れ、不要要素の排除タグ。ワークフローの指定 Negative ノードに全件注入されます。
        </p>
        <div
          data-testid="negative-tag-editor"
          className="min-h-[90px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800"
        >
          <TagChipEditor
            id="negative-tag-editor"
            value={negativePrompt}
            onChange={setNegativePrompt}
            placeholder="worst quality, low quality, bad anatomy, blurry..."
          />
        </div>
      </div>

      {/* 5. Alt Outfits Library Integration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Shirt className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-zinc-200">
                別衣装ライブラリ (Alt Outfits: 25% / 5枠)
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              本命衣装と対照的な衣装を選択し、直交マトリクス5枠に均等配分（過学習防止）
            </p>
          </div>

          <button
            type="button"
            data-testid="open-outfit-library-button"
            onClick={() => setIsOutfitModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium border border-zinc-700 transition-colors w-fit"
          >
            <Shirt className="w-3.5 h-3.5 text-indigo-400" />
            別衣装ライブラリから選択
          </button>
        </div>

        {/* Selected Badges & Summary */}
        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3">
          {selectedAltOutfits.length === 0 ? (
            <div
              data-testid="alt-outfits-empty-state"
              className="text-xs text-zinc-500 py-2 flex items-center justify-between"
            >
              <span>別衣装が選択されていません（全20枠が本命衣装として生成されます）</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" data-testid="alt-outfit-badges-container">
                {selectedAltOutfits.map((outfit) => {
                  const distributed = distributeAltOutfits(selectedAltOutfits, 5)
                  const slotCount = distributed.filter((o) => o.id === outfit.id).length
                  return (
                    <OutfitPresetBadge
                      key={outfit.id}
                      outfit={outfit}
                      count={slotCount}
                      onRemove={(id) => {
                        setSelectedAltOutfits(selectedAltOutfits.filter((o) => o.id !== id))
                      }}
                    />
                  )
                })}
              </div>

              {/* Distribution Summary */}
              <div
                data-testid="alt-outfit-distribution-summary"
                className="text-xs text-zinc-400 pt-2 border-t border-zinc-800/60 flex items-center gap-2 font-mono"
              >
                <span className="text-indigo-400 font-semibold">配分サマリー:</span>
                <span>
                  5枠中:{' '}
                  {(() => {
                    const distributed = distributeAltOutfits(selectedAltOutfits, 5)
                    const counts = selectedAltOutfits.map((o) => {
                      const c = distributed.filter((d) => d.id === o.id).length
                      return `${o.name} ${c}件`
                    })
                    return counts.join(', ')
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <OutfitMasterModal
        isOpen={isOutfitModalOpen}
        onClose={() => setIsOutfitModalOpen(false)}
        selectedOutfitIds={selectedAltOutfits.map((o) => o.id)}
        onSelectOutfits={(outfits) => setSelectedAltOutfits(outfits)}
      />

      {/* Action Buttons & Status Notification */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            data-testid="calculate-matrix-button"
            disabled={isCalculating || isSubmitting}
            onClick={handleCalculateMatrix}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
            直交マトリクス再計算 (DOE)
          </button>

          <button
            type="button"
            data-testid="submit-batch-button"
            disabled={isSubmitting || isCalculating || items.length === 0}
            onClick={handleSubmitBatch}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Send className="w-4 h-4" />
            ComfyUIに20件直接投入
          </button>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            data-testid="proceed-to-curation-button"
            onClick={() => setCurrentStep(2)}
            className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-3 py-2 border border-indigo-900 rounded-lg hover:bg-indigo-950/40 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Step 2 キュレーションへ進む ({items.length}件)
          </button>
        )}
      </div>

      {/* Batch Progress Bar */}
      {isSubmitting && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2" data-testid="batch-progress-container">
          <div className="flex justify-between text-xs text-zinc-300 font-medium">
            <span>ComfyUI直接バッチ投入中...</span>
            <span data-testid="batch-progress-text">{batchProgress}%</span>
          </div>
          <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${batchProgress}%` }}
              data-testid="batch-progress-bar"
            />
          </div>
        </div>
      )}

      {/* Status Alert Message */}
      {statusMessage && (
        <div
          data-testid="status-message"
          className={`flex items-center gap-2.5 p-4 rounded-xl border text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Generated Items Preview List */}
      {items.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">
              生成マトリクスプレビュー ({items.length}件)
            </h3>
            <span className="text-xs text-zinc-400">
              本命衣装: 15件 (75%) / 別衣装: 5件 (25%)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {items.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs space-y-1.5"
                data-testid={`matrix-item-card-${item.slot_index}`}
              >
                <div className="flex justify-between items-center text-zinc-400 font-mono text-[11px]">
                  <span>Slot #{item.slot_index + 1}</span>
                  <span className="text-zinc-500">Seed: {item.seed}</span>
                </div>
                <p className="text-zinc-300 line-clamp-2 text-[11px] leading-relaxed">
                  {item.raw_prompt}
                </p>
              </div>
            ))}
          </div>
          {items.length > 8 && (
            <div className="text-center text-xs text-zinc-500 mt-3">
              他 {items.length - 8} 件省略...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
