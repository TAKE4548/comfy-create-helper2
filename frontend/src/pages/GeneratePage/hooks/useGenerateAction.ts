/**
 * useGenerateAction — handles batch generation logic:
 * injects params into workflow JSON and calls queuePrompt.
 */

import { useGenerationStore } from '../../../store/useGenerationStore'
import type { Workflow } from '../../../api/types'

export function useGenerateAction(workflow: Workflow | undefined) {
  const { paramValues, batchSize, seedMode, seed, queuePrompt } = useGenerationStore()

  const handleGenerate = async () => {
    if (!workflow) return
    for (let i = 0; i < batchSize; i++) {
      const wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, unknown>

      // Inject paramValues into workflow JSON nodes
      workflow.mappings.forEach((m) => {
        if (!m.role || !m.param_name) return
        const node = wfJson[m.node_id] as Record<string, unknown> | undefined
        if (!node) return
        const inputs = node.inputs as Record<string, unknown>
        if (!inputs) return

        let val: string | number = ''
        if (m.input_type === 'int') {
          val = parseInt(paramValues[m.role] || '0')
        } else if (m.input_type === 'float') {
          val = parseFloat(paramValues[m.role] || '0.0')
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
          inputs[seedKey] = seedMode === 'random' ? Math.floor(Math.random() * 2 ** 32) : seed + i
        }
      }

      await queuePrompt(wfJson)
    }
  }

  return { handleGenerate }
}
