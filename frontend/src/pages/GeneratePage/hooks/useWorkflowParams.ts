/**
 * useWorkflowParams — manages param initialization, save, and reset
 * for the currently selected workflow.
 */

import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import type { Workflow } from '../../../api/types'

function getInitialParams(workflow: Workflow): Record<string, string> {
  const init: Record<string, string> = {}
  const wfJson = (workflow.json_body || {}) as Record<string, any>
  workflow.mappings.forEach((m) => {
    if (m.role) {
      if (m.input_type === 'lora_stack') {
        const node = m.node_id ? wfJson[m.node_id] : null
        const loraCount = node?.inputs?.['lora_count'] !== undefined ? Number(node.inputs['lora_count']) : 0
        init[`${m.role}_lora_count`] = String(loraCount)
        for (let i = 1; i <= loraCount; i++) {
          init[`${m.role}_lora_name_${i}`] = node?.inputs?.[`lora_name_${i}`] !== undefined ? String(node.inputs[`lora_name_${i}`]) : ''
          init[`${m.role}_lora_wt_${i}`] = node?.inputs?.[`lora_wt_${i}`] !== undefined ? String(node.inputs[`lora_wt_${i}`]) : '0.0'
          init[`${m.role}_model_str_${i}`] = node?.inputs?.[`model_str_${i}`] !== undefined ? String(node.inputs[`model_str_${i}`]) : '1.0'
          init[`${m.role}_clip_str_${i}`] = node?.inputs?.[`clip_str_${i}`] !== undefined ? String(node.inputs[`clip_str_${i}`]) : '1.0'
        }
      } else {
        let val = ''
        if (m.node_id && m.param_name) {
          const node = wfJson[m.node_id]
          if (node?.inputs) {
            if (node.inputs[m.param_name] !== undefined) {
              val = String(node.inputs[m.param_name])
            } else if (node.inputs['value'] !== undefined) {
              val = String(node.inputs['value'])
            }
          }
        }
        init[m.role] = val
      }
    }
  })
  return init
}

export function useWorkflowParams(workflow: Workflow | undefined, selectedWorkflowId: number | null) {
  const { setParamValues, paramValues, setSeed, setSeedMode, appliedAssets, setAppliedAssets } = useGenerationStore()
  const qc = useQueryClient()

  // Initialize params when workflow loads
  useEffect(() => {
    if (!workflow) return
    
    // Initialize params
    const savedStr = localStorage.getItem(LS_KEYS.PARAMS_PREFIX + workflow.id)
    let hasLoadedParams = false
    if (savedStr) {
      try {
        const savedParams = JSON.parse(savedStr)
        setParamValues(savedParams)
        hasLoadedParams = true
      } catch (e) {
        console.error('Failed to parse workflow saved params:', e)
      }
    }

    if (!hasLoadedParams) {
      const init = getInitialParams(workflow)
      setParamValues(init)
      localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(init))
    }

    // Initialize applied assets (only if not customized in local storage yet)
    const savedAssetsStr = localStorage.getItem(`${LS_KEYS.APPLIED_ASSETS}_${workflow.id}`)
    if (!savedAssetsStr && workflow.default_applied_assets) {
      try {
        const defaultAssets = JSON.parse(workflow.default_applied_assets)
        setAppliedAssets(defaultAssets)
      } catch (e) {
        console.error('Failed to parse workflow default applied assets:', e)
      }
    }
  }, [workflow])

  // Load snapshot params
  const loadSnapshotParams = (snapshotParams: Record<string, any>) => {
    const newParams: Record<string, string> = {}
    Object.entries(snapshotParams).forEach(([key, val]) => {
      newParams[key] = String(val)
    })
    setParamValues(newParams)

    if (snapshotParams['Sampler_Seed'] !== undefined) {
      const seedVal = Number(snapshotParams['Sampler_Seed'])
      if (!isNaN(seedVal)) {
        setSeed(seedVal)
        setSeedMode('fixed')
      }
    }
  }

  // Save current params as workflow defaults
  const saveDefaultParamsMutation = useMutation({
    mutationFn: async ({
      workflowId,
      json_body,
      default_applied_assets,
    }: {
      workflowId: number
      json_body: Record<string, unknown>
      default_applied_assets?: string | null
    }) => workflowsApi.update(workflowId, { json_body, default_applied_assets }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const handleSaveDefaultParams = async () => {
    if (!workflow || !selectedWorkflowId) return
    const wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (!m.role || !m.param_name) return
      const node = wfJson[m.node_id]
      if (!node?.inputs) return

      if (m.input_type === 'lora_stack') {
        const loraCountVal = parseInt(paramValues[`${m.role}_lora_count`] || '0', 10)
        node.inputs['lora_count'] = loraCountVal
        for (let i = 1; i <= loraCountVal; i++) {
          node.inputs[`lora_name_${i}`] = paramValues[`${m.role}_lora_name_${i}`] || ''
          node.inputs[`lora_wt_${i}`] = parseFloat(paramValues[`${m.role}_lora_wt_${i}`] || '0.0')
          node.inputs[`model_str_${i}`] = parseFloat(paramValues[`${m.role}_model_str_${i}`] || '1.0')
          node.inputs[`clip_str_${i}`] = parseFloat(paramValues[`${m.role}_clip_str_${i}`] || '1.0')
        }
        // Remove keys exceeding loraCountVal
        Object.keys(node.inputs).forEach((k) => {
          const match = k.match(/^(lora_name|lora_wt|model_str|clip_str)_(\d+)$/)
          if (match) {
            const idx = parseInt(match[2], 10)
            if (idx > loraCountVal) {
              delete node.inputs[k]
            }
          }
        })
      } else {
        let val: string | number = ''
        if (m.input_type === 'int') {
          val = parseInt(paramValues[m.role] || '0')
        } else if (m.input_type === 'float') {
          val = parseFloat(paramValues[m.role] || '0.0')
        } else {
          val = paramValues[m.role] || ''
        }
        if (node.inputs[m.param_name] !== undefined) {
          node.inputs[m.param_name] = val
        } else if (node.inputs['value'] !== undefined) {
          node.inputs['value'] = val
        } else {
          node.inputs[m.param_name] = val
        }
      }
    })

    const assetsStr = JSON.stringify(appliedAssets)
    await saveDefaultParamsMutation.mutateAsync({
      workflowId: selectedWorkflowId,
      json_body: wfJson,
      default_applied_assets: assetsStr,
    })
    localStorage.setItem(LS_KEYS.PARAMS_PREFIX + selectedWorkflowId, JSON.stringify(paramValues))
    localStorage.setItem(`${LS_KEYS.APPLIED_ASSETS}_${selectedWorkflowId}`, assetsStr)
  }

  const handleResetDefaultParams = () => {
    if (!workflow || !selectedWorkflowId) return
    const init = getInitialParams(workflow)
    setParamValues(init)
    localStorage.setItem(LS_KEYS.PARAMS_PREFIX + selectedWorkflowId, JSON.stringify(init))

    // Reset default applied assets
    let defaultAssets: Record<string, any> = {}
    if (workflow.default_applied_assets) {
      try {
        defaultAssets = JSON.parse(workflow.default_applied_assets)
      } catch (e) {
        console.error('Failed to parse default applied assets:', e)
      }
    }
    setAppliedAssets(defaultAssets)
  }

  return {
    loadSnapshotParams,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    saveDefaultParamsMutation,
  }
}
