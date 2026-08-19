/**
 * useGenerateAction — handles batch generation logic:
 * injects params into workflow JSON and calls queuePrompt.
 */

import { useGenerationStore } from '../../../store/useGenerationStore'
import type { BatchJob } from '../../../store/useGenerationStore'
import type { Workflow } from '../../../api/types'
import { applyBypass } from '../../../utils/bypassUtils'
import { getInitialParams } from './useWorkflowParams'

export function useGenerateAction(workflow: Workflow | undefined, comfyObjectInfo: any = {}) {
  const {
    paramValues: currentParamValues,
    batchSize: currentBatchSize,
    seedMode: currentSeedMode,
    seed: currentSeed,
    sets,
    queuePrompt,
    setActiveBatch,
    appliedAssets,
    bypassProfiles = [],
    paramSyncGroups = [],
    setSubmissionAbortController,
    fetchQueue,
    setErrorToast,
  } = useGenerationStore()

  const injectParams = (
    wfJson: Record<string, unknown>,
    paramValuesInput: Record<string, string>,
    seedMode: 'random' | 'fixed',
    seed: number,
    index: number
  ) => {
    if (!workflow) return

    const defaultParams = getInitialParams(workflow)
    const paramValues = { ...defaultParams, ...paramValuesInput }

    // Inject paramValues into workflow JSON nodes
    workflow.mappings.forEach((m) => {
      if (!m.role || !m.param_name) return
      const node = wfJson[m.node_id] as Record<string, unknown> | undefined
      if (!node) return
      const inputs = node.inputs as Record<string, unknown>
      if (!inputs) return

      if (m.input_type === 'lora_stack') {
        const loraCount = parseInt(paramValues[`${m.role}_lora_count`] || '0', 10)
        const isEasyLoraStack =
          inputs['num_loras'] !== undefined ||
          inputs['lora_1_name'] !== undefined ||
          (node as any)?.class_type === 'easy loraStack'

        if (isEasyLoraStack) {
          inputs['num_loras'] = loraCount
          for (let idx = 1; idx <= loraCount; idx++) {
            inputs[`lora_${idx}_name`] = paramValues[`${m.role}_lora_name_${idx}`] || 'None'
            inputs[`lora_${idx}_strength`] = parseFloat(paramValues[`${m.role}_lora_wt_${idx}`] || '0.0')
            inputs[`lora_${idx}_model_strength`] = parseFloat(paramValues[`${m.role}_model_str_${idx}`] || '1.0')
            inputs[`lora_${idx}_clip_strength`] = parseFloat(paramValues[`${m.role}_clip_str_${idx}`] || '1.0')
          }
          // Reset unused slots
          for (let idx = loraCount + 1; idx <= 10; idx++) {
            if (inputs[`lora_${idx}_name`] !== undefined) {
              inputs[`lora_${idx}_name`] = 'None'
              inputs[`lora_${idx}_strength`] = 1.0
              inputs[`lora_${idx}_model_strength`] = 1.0
              inputs[`lora_${idx}_clip_strength`] = 1.0
            }
          }
          // Clean up standard keys
          delete inputs['lora_count']
          Object.keys(inputs).forEach((k) => {
            if (k.match(/^(lora_name|lora_wt|model_str|clip_str)_(\d+)$/)) {
              delete inputs[k]
            }
          })
        } else {
          inputs['lora_count'] = loraCount
          for (let idx = 1; idx <= loraCount; idx++) {
            inputs[`lora_name_${idx}`] = paramValues[`${m.role}_lora_name_${idx}`] || ''
            inputs[`lora_wt_${idx}`] = parseFloat(paramValues[`${m.role}_lora_wt_${idx}`] || '0.0')
            inputs[`model_str_${idx}`] = parseFloat(paramValues[`${m.role}_model_str_${idx}`] || '1.0')
            inputs[`clip_str_${idx}`] = parseFloat(paramValues[`${m.role}_clip_str_${idx}`] || '1.0')
          }
          // Remove keys exceeding loraCount
          Object.keys(inputs).forEach((k) => {
            const match = k.match(/^(lora_name|lora_wt|model_str|clip_str)_(\d+)$/)
            if (match) {
              const idx = parseInt(match[2], 10)
              if (idx > loraCount) {
                delete inputs[k]
              }
            }
          })
          // Clean up easy loraStack keys
          delete inputs['num_loras']
          Object.keys(inputs).forEach((k) => {
            if (k.match(/^lora_(\d+)_(name|strength|model_strength|clip_strength)$/)) {
              delete inputs[k]
            }
          })
        }
      } else {
        let val: string | number | boolean = ''
        if (m.input_type === 'int') {
          val = parseInt(paramValues[m.role] || '0')
        } else if (m.input_type === 'float') {
          val = parseFloat(paramValues[m.role] || '0.0')
        } else if (m.input_type === 'boolean') {
          val = paramValues[m.role] === 'true'
        } else {
          val = paramValues[m.role] || ''
        }

        if (inputs[m.param_name] !== undefined) {
          inputs[m.param_name] = val
        } else if (inputs['value'] !== undefined) {
          inputs['value'] = val
        } else {
          inputs[m.param_name] = val
        }
      }
    })

    // Inject seed for Sampler_Seed role
    const seedNode = workflow.mappings.find((m) => m.role === 'Sampler_Seed')
    if (seedNode) {
      const node = wfJson[seedNode.node_id] as Record<string, unknown> | undefined
      if (node) {
        const inputs = node.inputs as Record<string, unknown>
        let seedKey: string
        if (seedNode.param_name !== null && seedNode.param_name !== undefined && inputs[seedNode.param_name] !== undefined) {
          seedKey = seedNode.param_name
        } else if (inputs['value'] !== undefined) {
          seedKey = 'value'
        } else {
          seedKey = seedNode.param_name || 'seed'
        }
        inputs[seedKey] = seedMode === 'random' ? Math.floor(Math.random() * 2 ** 32) : seed + index
      }
    }
  }

  const applyParamSync = (paramValues: Record<string, string>): Record<string, string> => {
    const activeGroups = (paramSyncGroups || []).filter((g) => g.is_enabled)
    if (activeGroups.length === 0) return paramValues

    const merged = { ...paramValues }
    activeGroups.forEach((g) => {
      const masterVal = merged[g.master_role]
      if (masterVal !== undefined) {
        g.slave_roles.forEach((slaveRole) => {
          merged[slaveRole] = masterVal
        })
      }
    })
    return merged
  }

  const handleGenerate = async () => {
    if (!workflow) return
    const activeBypassNodeIds = Array.from(
      new Set(
        bypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    const syncedParamValues = applyParamSync(currentParamValues)

    for (let i = 0; i < currentBatchSize; i++) {
      let wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, unknown>
      injectParams(wfJson, syncedParamValues, currentSeedMode, currentSeed, i)
      if (activeBypassNodeIds.length > 0) {
        wfJson = applyBypass(wfJson, activeBypassNodeIds, comfyObjectInfo)
      }
      await queuePrompt(wfJson, { paramValues: syncedParamValues, appliedAssets })
    }
  }

  const handleGenerateSets = async () => {
    if (!workflow) return
    const checkedSets = sets.filter((s) => s.checked)
    if (checkedSets.length === 0) return

    // 中断用 AbortController の作成とストア登録
    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)

    // 事前に全体の枠を構築して activeBatch を即時初期化
    const initialBatch: BatchJob[] = []
    checkedSets.forEach((setItem) => {
      for (let i = 0; i < setItem.batchSize; i++) {
        initialBatch.push({
          promptId: `pending-${setItem.name}-${i}-${Date.now()}`,
          setName: setItem.name,
          status: 'pending'
        })
      }
    })
    setActiveBatch(initialBatch)

    const currentBatch: BatchJob[] = [...initialBatch]
    const mappingsJson = localStorage.getItem('prompt-surgeon-prompt-to-set-map') || '{}'
    const mappings = JSON.parse(mappingsJson)

    const activeBypassNodeIds = Array.from(
      new Set(
        bypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    let currentIdx = 0
    try {
      for (const setItem of checkedSets) {
        const syncedParamValues = applyParamSync(setItem.paramValues)
        for (let i = 0; i < setItem.batchSize; i++) {
          // キャンセル中断チェック
          if (abortController.signal.aborted) {
            console.log('Batch queueing aborted by user.')
            return
          }

          let wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, unknown>
          injectParams(wfJson, syncedParamValues, setItem.seedMode, setItem.seed, i)
          if (activeBypassNodeIds.length > 0) {
            wfJson = applyBypass(wfJson, activeBypassNodeIds, comfyObjectInfo)
          }
          
          let promptId: string | null = null
          try {
            // skipQueueFetch: true で個別フェッチをバイパス
            promptId = await queuePrompt(
              wfJson,
              { paramValues: syncedParamValues, appliedAssets: setItem.appliedAssets },
              { skipQueueFetch: true }
            )
          } catch (err) {
            console.error(`Failed to generate set ${setItem.name} (batch index ${i}):`, err)
          }

          if (promptId) {
            mappings[promptId] = setItem.name
            currentBatch[currentIdx] = {
              ...currentBatch[currentIdx],
              promptId,
              status: 'pending',
            }
            setActiveBatch([...currentBatch])
          } else {
            const errorMsg = `[${setItem.name}] (${i + 1}/${setItem.batchSize}) のキュー投入に失敗しました`
            setErrorToast?.({ message: errorMsg, type: 'error' })
            currentBatch[currentIdx] = {
              ...currentBatch[currentIdx],
              status: 'failed',
            }
            setActiveBatch([...currentBatch])
          }
          currentIdx++
        }
      }
    } finally {
      localStorage.setItem('prompt-surgeon-prompt-to-set-map', JSON.stringify(mappings))
      setActiveBatch([...currentBatch])
      // 全ループ終了後に 1 回のみキューを同期
      await fetchQueue?.()
    }
  }

  return { handleGenerate, handleGenerateSets }
}
