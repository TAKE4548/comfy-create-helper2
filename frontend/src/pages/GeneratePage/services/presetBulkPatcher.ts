import type { WorkflowPreset } from '../../../api/types'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import type { BulkEditPayload } from '../../../components/ProfileBulkEditModal'
import { prependToPrompt, appendToPrompt } from '../../../utils/promptUtils'

export interface ComputedPresetPatch {
  param_values: Record<string, string>
  applied_assets: Record<string, any[]>
  batch_size: number
}

/**
 * Computes updated param_values, applied_assets, and batch_size
 * for a preset given a BulkEditPayload, as a pure function.
 */
export function computePresetPatch(
  preset: WorkflowPreset,
  payload: BulkEditPayload
): ComputedPresetPatch {
  let newParamValues = { ...preset.param_values }
  let newAppliedAssets = { ...preset.applied_assets }
  let newBatchSize = preset.batch_size ?? 1

  if (payload.promptOps) {
    for (const op of payload.promptOps) {
      const targetFields = op.fields ?? Object.keys(newParamValues)
      for (const field of targetFields) {
        if (!(field in newParamValues)) continue
        const current = newParamValues[field]
        if (op.op === 'search_replace') {
          newParamValues[field] = current.split(op.find!).join(op.replace ?? '')
        } else if (op.op === 'overwrite') {
          newParamValues[field] = op.value!
          delete newAppliedAssets[field]
        } else if (op.op === 'prefix') {
          newParamValues[field] = prependToPrompt(current, op.value ?? '')
        } else if (op.op === 'suffix') {
          newParamValues[field] = appendToPrompt(current, op.value ?? '')
        } else if (op.op === 'remove_tags') {
          if (op.commonTagOps && op.commonTagOps.length > 0) {
            const removeMap = new Map<string, string>()
            const updateMap = new Map<string, string>()
            for (const cOp of op.commonTagOps) {
              if (cOp.action === 'remove') {
                removeMap.set(cOp.originalBase.toLowerCase(), 'remove')
              } else if (cOp.action === 'update') {
                updateMap.set(cOp.originalBase.toLowerCase(), cOp.newFormattedTag)
              }
            }
            const currentTags = current.split(',').map((t) => t.trim()).filter(Boolean)
            const updatedTags: string[] = []
            for (const tag of currentTags) {
              const weightMatch = tag.match(/^\((.+?):[0-9.]+\)$/)
              const parenMatch = tag.match(/^\((.+?)\)$/)
              const base = (weightMatch ? weightMatch[1] : parenMatch ? parenMatch[1] : tag).trim().toLowerCase()
              if (removeMap.has(base)) continue
              if (updateMap.has(base)) {
                updatedTags.push(updateMap.get(base)!)
              } else {
                updatedTags.push(tag)
              }
            }
            newParamValues[field] = updatedTags.join(', ')
          } else if (op.tags && op.tags.length > 0) {
            const tagsToRemoveSet = new Set(op.tags.map((t) => t.trim().toLowerCase()))
            const currentTags = current.split(',').map((t) => t.trim()).filter(Boolean)
            const filteredTags = currentTags.filter((t) => !tagsToRemoveSet.has(t.toLowerCase()))
            newParamValues[field] = filteredTags.join(', ')
          }
        }
      }
    }
  }

  if (payload.paramPatch) {
    Object.keys(payload.paramPatch).forEach((key) => {
      if (key.endsWith('_lora_count')) {
        const role = key.replace('_lora_count', '')
        const oldCount = parseInt(newParamValues[`${role}_lora_count`] || '0', 10)
        delete newParamValues[`${role}_lora_count`]
        for (let i = 1; i <= oldCount; i++) {
          delete newParamValues[`${role}_lora_name_${i}`]
          delete newParamValues[`${role}_lora_wt_${i}`]
          delete newParamValues[`${role}_model_str_${i}`]
          delete newParamValues[`${role}_clip_str_${i}`]
        }
      }
    })
    newParamValues = { ...newParamValues, ...payload.paramPatch }
  }

  if (payload.loraStackOps) {
    for (const stackOp of payload.loraStackOps) {
      const { role, mode } = stackOp
      const oldCount = parseInt(newParamValues[`${role}_lora_count`] || '0', 10)

      // Extract current slots
      const currentSlots: Array<{ name: string; weight: string; modelStrength: string; clipStrength: string }> = []
      for (let i = 1; i <= oldCount; i++) {
        currentSlots.push({
          name: newParamValues[`${role}_lora_name_${i}`] || '',
          weight: newParamValues[`${role}_lora_wt_${i}`] || '0.0',
          modelStrength: newParamValues[`${role}_model_str_${i}`] || '1.0',
          clipStrength: newParamValues[`${role}_clip_str_${i}`] || '1.0',
        })
      }

      // Delete old slot keys from newParamValues
      delete newParamValues[`${role}_lora_count`]
      for (let i = 1; i <= oldCount; i++) {
        delete newParamValues[`${role}_lora_name_${i}`]
        delete newParamValues[`${role}_lora_wt_${i}`]
        delete newParamValues[`${role}_model_str_${i}`]
        delete newParamValues[`${role}_clip_str_${i}`]
      }

      let finalSlots: Array<{ name: string; weight: string; modelStrength: string; clipStrength: string }> = []

      if (mode === 'overwrite') {
        finalSlots = (stackOp.slots || []).filter((s) => s.name.trim() !== '')
      } else if (mode === 'differential') {
        const removeSet = new Set<string>()
        const updateMap = new Map<string, { weight?: string; modelStrength?: string; clipStrength?: string }>()
        for (const cop of stackOp.commonOps || []) {
          if (cop.action === 'remove') {
            removeSet.add(cop.name.toLowerCase())
          } else if (cop.action === 'update') {
            updateMap.set(cop.name.toLowerCase(), {
              weight: cop.weight,
              modelStrength: cop.modelStrength,
              clipStrength: cop.clipStrength,
            })
          }
        }

        for (const slot of currentSlots) {
          if (removeSet.has(slot.name.toLowerCase())) {
            continue
          }
          const updates = updateMap.get(slot.name.toLowerCase())
          finalSlots.push({
            name: slot.name,
            weight: updates?.weight ?? slot.weight,
            modelStrength: updates?.modelStrength ?? slot.modelStrength,
            clipStrength: updates?.clipStrength ?? slot.clipStrength,
          })
        }

        for (const addSlot of stackOp.addSlots || []) {
          if (addSlot.name.trim() !== '') {
            finalSlots.push({
              name: addSlot.name.trim(),
              weight: addSlot.weight || '1.0',
              modelStrength: addSlot.modelStrength || '1.0',
              clipStrength: addSlot.clipStrength || '1.0',
            })
          }
        }
      }

      // Clamp to maximum 10 slots
      const clampedSlots = finalSlots.slice(0, 10)
      newParamValues[`${role}_lora_count`] = String(clampedSlots.length)
      clampedSlots.forEach((slot, idx) => {
        const i = idx + 1
        newParamValues[`${role}_lora_name_${i}`] = slot.name
        newParamValues[`${role}_lora_wt_${i}`] = slot.weight
        newParamValues[`${role}_model_str_${i}`] = slot.modelStrength
        newParamValues[`${role}_clip_str_${i}`] = slot.clipStrength
      })
    }
  }

  if (payload.batchSize !== undefined) {
    newBatchSize = payload.batchSize
  }

  if (payload.loraOps) {
    for (const loraOp of payload.loraOps) {
      const existing = newAppliedAssets[loraOp.role] ?? []
      if (loraOp.mode === 'replace') {
        newAppliedAssets[loraOp.role] = [loraOp.asset]
      } else {
        newAppliedAssets[loraOp.role] = [...existing, loraOp.asset]
      }
    }
  }

  if (payload.assetOps) {
    for (const assetOp of payload.assetOps) {
      const existingAssets = newAppliedAssets[assetOp.role] ?? []
      const isOverwriteOp = payload.promptOps?.some((p) => p.op === 'overwrite')
      let updatedAssets: AppliedAsset[] = assetOp.mode === 'replace' || isOverwriteOp ? [] : [...existingAssets]
      for (const asset of assetOp.assets) {
        const isDuplicate = updatedAssets.some(
          (existing) =>
            existing.type === asset.type &&
            existing.assetId === asset.assetId &&
            existing.name === asset.name &&
            existing.loraPromptString === asset.loraPromptString &&
            JSON.stringify(existing.tags) === JSON.stringify(asset.tags)
        )
        if (!isDuplicate) {
          updatedAssets.push(asset)
        }
      }
      newAppliedAssets[assetOp.role] = updatedAssets
    }
  }

  return {
    param_values: newParamValues,
    applied_assets: newAppliedAssets,
    batch_size: newBatchSize,
  }
}
