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

export function useWorkflowParams(workflow: Workflow | undefined, selectedWorkflowId: number | null) {
  const { setParamValues, paramValues, setSeed, setSeedMode } = useGenerationStore()
  const qc = useQueryClient()

  // Initialize params when workflow loads
  useEffect(() => {
    if (!workflow) return
    const savedStr = localStorage.getItem(LS_KEYS.PARAMS_PREFIX + workflow.id)
    if (savedStr) {
      try {
        const savedParams = JSON.parse(savedStr)
        setParamValues(savedParams)
        return
      } catch (e) {
        console.error('Failed to parse workflow saved params:', e)
      }
    }

    const init: Record<string, string> = {}
    const wfJson = (workflow.json_body || {}) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (m.role) {
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
    })
    setParamValues(init)
    localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(init))
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
    mutationFn: async ({ workflowId, json_body }: { workflowId: number; json_body: Record<string, unknown> }) =>
      workflowsApi.update(workflowId, { json_body }),
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
    })
    await saveDefaultParamsMutation.mutateAsync({ workflowId: selectedWorkflowId, json_body: wfJson })
    localStorage.setItem(LS_KEYS.PARAMS_PREFIX + selectedWorkflowId, JSON.stringify(paramValues))
  }

  const handleResetDefaultParams = () => {
    if (!workflow || !selectedWorkflowId) return
    const init: Record<string, string> = {}
    const wfJson = (workflow.json_body || {}) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (m.role) {
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
    })
    setParamValues(init)
    localStorage.setItem(LS_KEYS.PARAMS_PREFIX + selectedWorkflowId, JSON.stringify(init))
  }

  return {
    loadSnapshotParams,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    saveDefaultParamsMutation,
  }
}
