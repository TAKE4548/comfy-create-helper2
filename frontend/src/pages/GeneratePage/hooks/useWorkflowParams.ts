/**
 * useWorkflowParams — manages param initialization, save, and reset
 * for the currently selected workflow.
 */

import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { Workflow } from '../../../api/types'
import {
  extractGeneralParam,
  extractLoraStackParams,
  getInitialParams,
  injectWorkflowParams,
  type WorkflowNode,
} from '../../../utils/workflowParamInjector'

export {
  extractGeneralParam,
  extractLoraStackParams,
  getInitialParams,
  type WorkflowNode,
}

export function useWorkflowParams(workflow: Workflow | undefined, selectedWorkflowId: number | null) {
  const { setParamValues, paramValues, setSeed, setSeedMode, appliedAssets, setAppliedAssets, sets, setSets, activeSetId } = useGenerationStore()
  const qc = useQueryClient()

  // Initialize params when workflow loads
  useEffect(() => {
    if (!workflow) return

    const defaultParams = getInitialParams(workflow)

    // ─── 全セットへの新規ロール補完 ────────────────────────────
    const currentSets = sets || []
    const hasNewKeys = currentSets.some((s) =>
      Object.keys(defaultParams).some((k) => !(k in (s.paramValues || {})))
    )
    if (hasNewKeys && typeof setSets === 'function') {
      const updatedSets = currentSets.map((s) => ({
        ...s,
        paramValues: { ...defaultParams, ...(s.paramValues || {}) }, // デフォルト値ベース、既存値優先
      }))
      setSets(updatedSets)
    }

    const activeSet = currentSets.find((s) => String(s.id) === String(activeSetId)) || currentSets[0]
    const baseParams = (paramValues && Object.keys(paramValues).length > 0) ? paramValues : (activeSet?.paramValues || {})
    const isParamValuesMissingKeys = Object.keys(defaultParams).some((k) => !(k in baseParams))
    if (isParamValuesMissingKeys || Object.keys(baseParams).length === 0) {
      setParamValues({ ...defaultParams, ...baseParams })
    }

    // Initialize applied assets if empty and workflow has defaults
    if (workflow.default_applied_assets && Object.keys(appliedAssets || {}).length === 0) {
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
    const wfJson = injectWorkflowParams({
      workflow,
      paramValues,
      cloneJson: true,
    })

    const assetsStr = JSON.stringify(appliedAssets)
    await saveDefaultParamsMutation.mutateAsync({
      workflowId: selectedWorkflowId,
      json_body: wfJson,
      default_applied_assets: assetsStr,
    })
  }

  const handleResetDefaultParams = () => {
    if (!workflow || !selectedWorkflowId) return
    const init = getInitialParams(workflow)
    setParamValues(init)

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
