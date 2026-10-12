/**
 * workflowParamInjector — Pure functional utilities for parsing and injecting
 * workflow parameters, LoRA stacks, and seeds into ComfyUI workflow JSON.
 */

import type { Workflow, StageMaster } from '../api/types'
import { parseSeedValue, SEED_MODES_KEY, seedSlotKey } from './seedModel'
import { resolveSeedInputKey } from './seedInputResolver'

export interface WorkflowNode {
  inputs?: Record<string, any>
  class_type?: string
  [key: string]: any
}

export interface SeedInjectionOptions {
  seedMode: 'random' | 'fixed'
  seed: number
  index?: number
}

export interface InjectWorkflowParamsOptions {
  workflow: Workflow
  paramValues: Record<string, string>
  seedOptions?: SeedInjectionOptions
  cloneJson?: boolean
  stages?: StageMaster[]
  resolvedSeeds?: Record<string, number>
}

/**
 * Extracts a scalar/general parameter value from a workflow node.
 */
export function extractGeneralParam(node: WorkflowNode | null | undefined, paramName: string): string {
  if (node?.inputs) {
    if (node.inputs[paramName] !== undefined) {
      return String(node.inputs[paramName])
    } else if (node.inputs['value'] !== undefined) {
      return String(node.inputs['value'])
    }
  }
  return ''
}

/**
 * Extracts LoRA stack parameters from a workflow node (supports easy loraStack and standard loraStack).
 */
export function extractLoraStackParams(node: WorkflowNode | null | undefined, role: string): Record<string, string> {
  const init: Record<string, string> = {}
  let loraCount = 0
  if (node?.inputs) {
    const countInput = node.inputs['num_loras'] !== undefined ? node.inputs['num_loras'] : node.inputs['lora_count']
    if (countInput !== undefined && !Array.isArray(countInput)) {
      loraCount = Number(countInput)
    } else {
      // Find maximum index i (1 to 10) where either lora_${i}_name or lora_name_${i} is defined
      for (let i = 1; i <= 10; i++) {
        if (node.inputs[`lora_${i}_name`] !== undefined || node.inputs[`lora_name_${i}`] !== undefined) {
          loraCount = i
        }
      }
    }
  }
  init[`${role}_lora_count`] = String(loraCount)
  for (let i = 1; i <= loraCount; i++) {
    const nameInput = node?.inputs?.[`lora_${i}_name`] !== undefined ? node.inputs[`lora_${i}_name`] : node?.inputs?.[`lora_name_${i}`]
    init[`${role}_lora_name_${i}`] = (nameInput !== undefined && !Array.isArray(nameInput)) ? String(nameInput) : ''

    const wtInput = node?.inputs?.[`lora_${i}_strength`] !== undefined ? node.inputs[`lora_${i}_strength`] : node?.inputs?.[`lora_wt_${i}`]
    init[`${role}_lora_wt_${i}`] = (wtInput !== undefined && !Array.isArray(wtInput)) ? String(wtInput) : '0.0'

    const modelStrInput = node?.inputs?.[`lora_${i}_model_strength`] !== undefined ? node.inputs[`lora_${i}_model_strength`] : node?.inputs?.[`model_str_${i}`]
    init[`${role}_model_str_${i}`] = (modelStrInput !== undefined && !Array.isArray(modelStrInput)) ? String(modelStrInput) : '1.0'

    const clipStrInput = node?.inputs?.[`lora_${i}_clip_strength`] !== undefined ? node.inputs[`lora_${i}_clip_strength`] : node?.inputs?.[`clip_str_${i}`]
    init[`${role}_clip_str_${i}`] = (clipStrInput !== undefined && !Array.isArray(clipStrInput)) ? String(clipStrInput) : '1.0'
  }
  return init
}

/**
 * Resolves an external or legacy role key against current knownRoles using StageMaster previous_suffixes history chain,
 * falling back to base_key graceful resolution if not matched.
 */
export function resolveRoleWithHistoryFallback(
  roleKey: string | null | undefined,
  stages: StageMaster[],
  knownRoles: string[]
): string {
  // 0. 空値・不正入力ガード
  if (!roleKey) return ''
  // 1. 直接合致
  if (knownRoles.includes(roleKey)) return roleKey
  // 2. previous_suffixes 履歴チェーン解決 (直近最大10件に制限)
  for (const st of stages) {
    let prevList = st.previous_suffixes
    if (typeof prevList === 'string') {
      try {
        prevList = JSON.parse(prevList)
      } catch {
        prevList = null
      }
    }
    if (!prevList || !Array.isArray(prevList)) continue
    const historyChain = prevList.slice(0, 10)
    for (const prev of historyChain) {
      if (prev && roleKey.endsWith(prev)) {
        const base = roleKey.slice(0, -prev.length)
        const updated = `${base}${st.suffix}`
        if (knownRoles.includes(updated)) return updated
      }
    }
  }
  // 3. base_key グレイスフル解決 (アンダースコア分割による親プレフィックス合致)
  const baseKey = roleKey.split('_')[0]
  const matched = knownRoles.find((r) => r.startsWith(baseKey))
  return matched || roleKey
}

/**
 * Returns default initial parameter values for all mappings defined in a workflow.
 */
export function getInitialParams(workflow: Workflow, stages?: StageMaster[]): Record<string, string> {
  const init: Record<string, string> = {}
  const wfJson = (workflow.json_body || {}) as Record<string, WorkflowNode>
  const knownRoles = workflow.mappings.map((m) => m.role).filter(Boolean) as string[]

  workflow.mappings.forEach((m) => {
    if (m.role) {
      const resolvedRole = stages ? resolveRoleWithHistoryFallback(m.role, stages, knownRoles) : m.role
      if (m.input_type === 'lora_stack') {
        const node = m.node_id ? wfJson[m.node_id] : null
        Object.assign(init, extractLoraStackParams(node, resolvedRole))
      } else if (m.input_type === 'seed') {
        const node = m.node_id ? wfJson[m.node_id] : null
        const key = resolveSeedInputKey(m, node?.inputs)
        const value = key ? node?.inputs?.[key] : undefined
        init[resolvedRole] = value !== undefined && !Array.isArray(value) ? String(value) : ''
      } else {
        const node = m.node_id ? wfJson[m.node_id] : null
        init[resolvedRole] = m.param_name ? extractGeneralParam(node, m.param_name) : ''
      }
    }
  })
  return init
}

/**
 * Injects LoRA stack parameters into a node inputs dictionary, handling both easy loraStack and standard loraStack.
 */
export function injectLoraStackParams(
  inputs: Record<string, any>,
  role: string,
  paramValues: Record<string, string>,
  classType?: string
): void {
  const loraCountVal = parseInt(paramValues[`${role}_lora_count`] || '0', 10)
  const isEasyLoraStack =
    inputs['num_loras'] !== undefined ||
    inputs['lora_1_name'] !== undefined ||
    classType === 'easy loraStack'

  if (isEasyLoraStack) {
    inputs['num_loras'] = loraCountVal
    for (let i = 1; i <= loraCountVal; i++) {
      inputs[`lora_${i}_name`] = paramValues[`${role}_lora_name_${i}`] || 'None'
      inputs[`lora_${i}_strength`] = parseFloat(paramValues[`${role}_lora_wt_${i}`] || '0.0')
      inputs[`lora_${i}_model_strength`] = parseFloat(paramValues[`${role}_model_str_${i}`] || '1.0')
      inputs[`lora_${i}_clip_strength`] = parseFloat(paramValues[`${role}_clip_str_${i}`] || '1.0')
    }
    // Reset unused slots (up to 10)
    for (let i = loraCountVal + 1; i <= 10; i++) {
      if (inputs[`lora_${i}_name`] !== undefined) {
        inputs[`lora_${i}_name`] = 'None'
        inputs[`lora_${i}_strength`] = 1.0
        inputs[`lora_${i}_model_strength`] = 1.0
        inputs[`lora_${i}_clip_strength`] = 1.0
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
    inputs['lora_count'] = loraCountVal
    for (let i = 1; i <= loraCountVal; i++) {
      inputs[`lora_name_${i}`] = paramValues[`${role}_lora_name_${i}`] || ''
      inputs[`lora_wt_${i}`] = parseFloat(paramValues[`${role}_lora_wt_${i}`] || '0.0')
      inputs[`model_str_${i}`] = parseFloat(paramValues[`${role}_model_str_${i}`] || '1.0')
      inputs[`clip_str_${i}`] = parseFloat(paramValues[`${role}_clip_str_${i}`] || '1.0')
    }
    // Remove keys exceeding loraCountVal
    Object.keys(inputs).forEach((k) => {
      const match = k.match(/^(lora_name|lora_wt|model_str|clip_str)_(\d+)$/)
      if (match) {
        const idx = parseInt(match[2], 10)
        if (idx > loraCountVal) {
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
}

/**
 * Injects a general parameter into a node inputs dictionary with proper type conversion.
 */
export function injectGeneralParam(
  inputs: Record<string, any>,
  paramName: string,
  inputType: string | null | undefined,
  rawValue: string | undefined
): void {
  let val: string | number | boolean = ''
  if (inputType === 'int') {
    val = parseInt(rawValue || '0', 10)
    if (isNaN(val)) val = 0
  } else if (inputType === 'float') {
    val = parseFloat(rawValue || '0.0')
    if (isNaN(val)) val = 0.0
  } else if (inputType === 'boolean') {
    val = rawValue === 'true' || rawValue === '1'
  } else {
    val = rawValue !== undefined ? rawValue : ''
  }

  if (inputs[paramName] !== undefined) {
    inputs[paramName] = val
  } else if (inputs['value'] !== undefined) {
    inputs['value'] = val
  } else {
    inputs[paramName] = val
  }
}

/**
 * Injects parameters, LoRA stacks, and optional seeds into a workflow JSON object.
 */
export function injectWorkflowParams(options: InjectWorkflowParamsOptions): Record<string, any> {
  const { workflow, paramValues: inputParamValues, seedOptions, cloneJson = true, stages, resolvedSeeds } = options
  const wfJson: Record<string, any> = cloneJson
    ? JSON.parse(JSON.stringify(workflow.json_body || {}))
    : (workflow.json_body || {})

  const defaultParams = getInitialParams(workflow, stages)
  const dedicatedSeedMappings = workflow.mappings.filter((m) => m.input_type === 'seed')
  const healedInputs: Record<string, string> = { ...inputParamValues }
  const dedicatedSeedRoles = new Set(dedicatedSeedMappings.map((m) => m.role).filter(Boolean) as string[])
  if (stages && stages.length > 0) {
    const knownRoles = workflow.mappings.map((m) => m.role).filter(Boolean) as string[]
    // Dedicated seed values may follow only an exact role or one unambiguous history chain.
    for (const [key, value] of Object.entries(inputParamValues)) {
      if (key === SEED_MODES_KEY || dedicatedSeedRoles.has(key)) continue
      const seedMatches = new Set<string>()
      for (const stage of stages) {
        let previousSuffixes = stage.previous_suffixes
        if (typeof previousSuffixes === 'string') {
          try {
            previousSuffixes = JSON.parse(previousSuffixes)
          } catch {
            previousSuffixes = null
          }
        }
        if (!Array.isArray(previousSuffixes)) continue
        for (const suffix of previousSuffixes.slice(0, 10)) {
          if (typeof suffix !== 'string' || !key.endsWith(suffix)) continue
          const candidate = `${key.slice(0, -suffix.length)}${stage.suffix}`
          if (dedicatedSeedRoles.has(candidate)) seedMatches.add(candidate)
        }
      }
      if (seedMatches.size > 1) throw new Error(`Ambiguous historical role for dedicated seed: ${key}`)
      if (seedMatches.size === 1) healedInputs[[...seedMatches][0]] = value
    }
    for (const [k, v] of Object.entries(inputParamValues)) {
      if (k === SEED_MODES_KEY || dedicatedSeedRoles.has(k)) continue
      const resolved = resolveRoleWithHistoryFallback(k, stages, knownRoles)
      if (dedicatedSeedRoles.has(resolved)) continue
      if (resolved && resolved !== k && !(resolved in healedInputs)) {
        healedInputs[resolved] = v
      }
    }
  }
  const paramValues = { ...defaultParams, ...healedInputs }
  const preparedSeeds = new Map<object, { key: string; seed: number }>()
  for (const m of dedicatedSeedMappings) {
    const label = m.display_name || m.role || 'Seed'
    const node = m.node_id ? wfJson[m.node_id] as WorkflowNode | undefined : undefined
    if (!m.role || !m.node_id || !node || !node.inputs) {
      throw new Error(`${label}: seed用workflow node/inputsがありません (node ${m.node_id || '(なし)'})`)
    }
    const key = resolveSeedInputKey(m, node.inputs)
    if (!key) {
      const candidates = [m.param_name, ...(m.fallback_param_names ?? [])].filter(Boolean).join(', ') || '(なし)'
      throw new Error(`${label}: seed入力を解決できません (node ${m.node_id}, 候補: ${candidates})`)
    }
    if (Array.isArray(node.inputs[key])) {
      throw new Error(`${label}: seed入力がworkflow参照です (node ${m.node_id}.${key})`)
    }
    const slotKey = seedSlotKey(m)
    const rawSeed = resolvedSeeds ? resolvedSeeds[slotKey] : paramValues[m.role]
    if (rawSeed === undefined) throw new Error(`${label}: seed値がありません (resolved seed未指定; node ${m.node_id}.${key})`)
    const seed = parseSeedValue(String(rawSeed), label)
    preparedSeeds.set(m, { key, seed })
  }

  workflow.mappings.forEach((m) => {
    if (!m.role || !m.node_id) return
    const node = wfJson[m.node_id] as WorkflowNode | undefined
    if (!node) return
    if (!node.inputs) node.inputs = {}

    if (m.input_type === 'lora_stack') {
      injectLoraStackParams(node.inputs, m.role, paramValues, node.class_type)
    } else if (m.input_type === 'seed') {
      const prepared = preparedSeeds.get(m)
      if (!prepared) throw new Error(`${m.display_name || m.role}: seed入力の準備に失敗しました`)
      node.inputs[prepared.key] = prepared.seed
    } else if (m.role !== 'Sampler_Seed' || !seedOptions) {
      const targetParam = m.param_name || 'value'
      const rawVal = paramValues[m.role] !== undefined ? paramValues[m.role] : defaultParams[m.role]
      injectGeneralParam(node.inputs, targetParam, m.input_type, rawVal)
    }
  })

  if (seedOptions) {
    const seedNode = workflow.mappings.find((m) => m.role === 'Sampler_Seed' && m.input_type !== 'seed')
    if (seedNode && seedNode.node_id) {
      const node = wfJson[seedNode.node_id] as WorkflowNode | undefined
      if (node) {
        if (!node.inputs) node.inputs = {}
        let seedKey: string
        if (seedNode.param_name !== null && seedNode.param_name !== undefined && node.inputs[seedNode.param_name] !== undefined) {
          seedKey = seedNode.param_name
        } else if (node.inputs['value'] !== undefined) {
          seedKey = 'value'
        } else {
          seedKey = seedNode.param_name || 'seed'
        }
        node.inputs[seedKey] =
          seedOptions.seedMode === 'random'
            ? Math.floor(Math.random() * 2 ** 32)
            : seedOptions.seed + (seedOptions.index || 0)
      }
    }
  }

  return wfJson
}
