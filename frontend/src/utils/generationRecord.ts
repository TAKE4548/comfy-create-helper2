import type { Workflow, WorkflowMapping } from '../api/types'
import type { AppliedAsset } from '../store/types'
import { resolveSeedInputKey } from './seedInputResolver'
import {
  PROMPT_TEMPLATE_STATE_KEY,
  isWorkflowTemplateActive,
  parsePresetState,
  buildSanitizedTemplateRecord,
  type SanitizedPromptTemplateRecord,
} from './promptTemplateEngine'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface CapturedField {
  mapping_id: number; node_id: string; role: string | null
  param_name: string | null; input_type: string | null; display_name: string; class_type: string | null
  recorded: boolean; value: JsonValue; status: 'submitted' | 'bypassed' | 'missing'
  value_kind: 'literal' | 'graph-reference'
}
export interface CapturedAsset {
  type: 'lora' | 'tagset'; asset_id: number; role: string; name: string; tags: string[]
  lora_prompt: string | null; origin: 'generic-tagset' | 'lora-trigger' | 'none' | 'unknown'
  trigger_set_id: number | null; trigger_set_name: string | null
}
export interface GenerationRecord {
  version: 1; workflow_id: number; workflow_name: string; completeness: 'complete' | 'partial' | 'unknown'
  fields: CapturedField[]; parameters: CapturedField[]; assets: CapturedAsset[]; queued_at: string | null
  completed_at?: string | null; prompt_id?: string
  prompt_template?: SanitizedPromptTemplateRecord
}
export type CaptureAssetInput = AppliedAsset & { triggerSetId?: number | null; triggerSetName?: string | null }
export const PROMPT_RECORD_KEY = '__prompt_surgeon_metadata_v1'
export const ASSOCIATIONS_KEY = '__metadata_associations_v1'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function json(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(json)
  return object(value) && Object.values(value).every(json)
}
const clone = <T extends JsonValue>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function capture(mapping: WorkflowMapping, injected: Record<string, unknown>, submitted: Record<string, unknown>): CapturedField {
  const prompt = mapping.input_type === 'textarea'
  const raw = (prompt ? injected : submitted)[mapping.node_id]
  const node = object(raw) ? raw : undefined
  const inputs = node && object(node.inputs) ? node.inputs : undefined
  const configuredKey = (typeof mapping.input_name === 'string' && mapping.input_name.trim().length > 0)
    ? mapping.input_name.trim()
    : null
  const resolvedSeedKey = mapping.input_type === 'seed' ? resolveSeedInputKey(mapping, inputs) : null
  let key: string
  if (resolvedSeedKey) {
    key = resolvedSeedKey
  } else if (configuredKey) {
    key = configuredKey
  } else if (mapping.role === 'Sampler_Seed') {
    const candidates = [
      mapping.param_name,
      ...(mapping.fallback_param_names ?? []),
      'noise_seed',
      'seed',
      'value',
    ].filter(Boolean) as string[]
    const matched = inputs ? candidates.find((k) => inputs[k] !== undefined) : undefined
    key = matched ?? (mapping.param_name || 'seed')
  } else if (inputs && mapping.param_name != null && inputs[mapping.param_name] !== undefined) {
    key = mapping.param_name
  } else if (inputs && inputs.value !== undefined) {
    key = 'value'
  } else {
    key = mapping.param_name || 'value'
  }
  const value = mapping.input_type === 'lora_stack' ? inputs : mapping.input_type === 'seed' ? (resolvedSeedKey ? inputs?.[resolvedSeedKey] : undefined) : inputs?.[key]
  const recorded = prompt ? typeof value === 'string' : json(value)
  const wasBypassed = object(injected[mapping.node_id]) && !object(submitted[mapping.node_id])
  const status = !recorded ? (wasBypassed ? 'bypassed' : 'missing') : wasBypassed ? 'bypassed' : 'submitted'
  return {
    mapping_id: mapping.id, node_id: mapping.node_id, role: mapping.role, param_name: mapping.param_name,
    input_type: mapping.input_type, display_name: mapping.display_name || mapping.role || `${mapping.node_id}:${key}`,
    class_type: typeof node?.class_type === 'string' ? node.class_type : null,
    recorded, value: recorded ? clone(value as JsonValue) : null, status,
    value_kind: Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]) ? 'graph-reference' : 'literal',
  }
}

export function buildGenerationRecord(
  workflow: Workflow,
  injectedGraph: Record<string, unknown>,
  submittedGraph: Record<string, unknown>,
  assets: Record<string, CaptureAssetInput[]>,
  paramValues?: Record<string, unknown>
): GenerationRecord {
  if (workflow.mappings.some(m => m.role === PROMPT_RECORD_KEY || m.role === ASSOCIATIONS_KEY)) {
    throw new Error('記録用の予約キーとプロンプト欄のroleが重複しています')
  }
  const captured = workflow.mappings.map(m => capture(m, injectedGraph, submittedGraph))
  const fields = captured.filter(f => f.input_type === 'textarea')
  const validIds = new Set(captured.map(f => f.mapping_id)).size === captured.length && captured.every(f => Number.isInteger(f.mapping_id) && !!f.node_id)
  const record: GenerationRecord = {
    version: 1, workflow_id: workflow.id, workflow_name: workflow.name, queued_at: null,
    completeness: validIds && fields.every(f => f.recorded && typeof f.value === 'string') ? 'complete' : 'partial',
    fields, parameters: captured.filter(f => f.input_type !== 'textarea'),
    assets: Object.entries(assets).flatMap(([role, list]) => list.filter(a => a.enabled).map(a => {
      const known = Number.isInteger(a.triggerSetId) && (a.triggerSetId ?? 0) > 0
      return {
        type: a.type, asset_id: a.assetId, role, name: a.name, tags: [...a.tags], lora_prompt: a.loraPromptString ?? null,
        origin: a.type === 'tagset' ? 'generic-tagset' as const : known ? 'lora-trigger' as const : a.triggerSetId === null ? 'none' as const : 'unknown' as const,
        trigger_set_id: known ? a.triggerSetId! : null, trigger_set_name: known ? a.triggerSetName ?? null : null,
      }
    })),
  }

  const templateConfig = workflow.prompt_template_config
  const rawState = paramValues?.[PROMPT_TEMPLATE_STATE_KEY]
  if (
    isWorkflowTemplateActive(templateConfig) &&
    typeof rawState === 'string' &&
    rawState.trim().length > 0 &&
    templateConfig?.template_snapshot?.sections
  ) {
    const structure = templateConfig.template_snapshot
    const parsedState = parsePresetState(rawState, structure)
    record.prompt_template = buildSanitizedTemplateRecord(structure, parsedState, templateConfig.template_id)
  }

  return record
}
