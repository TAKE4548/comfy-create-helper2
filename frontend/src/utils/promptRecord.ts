import { promptMetadataApi } from '../api/client'
import type { AppliedAsset } from '../store/types'
import { ASSOCIATIONS_KEY, PROMPT_RECORD_KEY, type CapturedField, type GenerationRecord, type JsonValue } from './generationRecord'

export interface PromptFieldView { key: string; name: string; role: string | null; nodeId: string; recorded: boolean; value: string | null; status: 'submitted' | 'bypassed' | 'missing' }
export interface MetadataItemView { key: string; name: string; recorded: boolean; value: JsonValue; role?: string | null; status?: string }
export interface LoraRow { key: string; model: string; role: string; weight: string | null; modelStrength: string | null; clipStrength: string | null }
export interface MetadataView {
  record: GenerationRecord | null; fields: PromptFieldView[]; parameters: MetadataItemView[]; extras: MetadataItemView[]
  assets: MetadataItemView[]; workflowId: number | null; workflowName: string | null; queuedAt: string | null
  completedAt?: string | null; warning: string | null; actualSeed: string | null; loraRows: LoraRow[]
}
export interface ResolvedMetadata {
  paramValues: Record<string, unknown>; appliedAssets: Record<string, AppliedAsset[]>; workflowId: number | null
  queuedAt: string | null; metadataSavedAt: string | null
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function json(v: unknown): v is JsonValue {
  return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (Array.isArray(v) && v.every(json)) || (object(v) && Object.values(v).every(json))
}
const text = (v: unknown): string | null => typeof v === 'string' || typeof v === 'number' ? String(v) : null
function validTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value)) ? value : null
}
function parseRecord(params: Record<string, unknown> | null): GenerationRecord | null {
  try {
    const raw = params?.[PROMPT_RECORD_KEY]
    if (typeof raw !== 'string') return null
    const r = JSON.parse(raw)
    if (object(r) && r.prompt_id !== undefined && typeof r.prompt_id !== 'string') return null
    if (!object(r) || r.version !== 1 || typeof r.workflow_id !== 'number' || typeof r.workflow_name !== 'string' ||
      !['complete', 'partial', 'unknown'].includes(String(r.completeness)) || !Array.isArray(r.fields) || !Array.isArray(r.parameters) || !Array.isArray(r.assets)) return null
    const validField = (f: unknown) => object(f) && Number.isInteger(f.mapping_id) && typeof f.node_id === 'string' && typeof f.display_name === 'string' &&
      (typeof f.role === 'string' || f.role === null) && typeof f.recorded === 'boolean' && json(f.value) && ['submitted', 'bypassed', 'missing'].includes(String(f.status))
    const validAsset = (a: unknown) => object(a) && ['lora', 'tagset'].includes(String(a.type)) && Number.isInteger(a.asset_id) &&
      typeof a.name === 'string' && typeof a.role === 'string' && Array.isArray(a.tags) && a.tags.every(t => typeof t === 'string') &&
      ['generic-tagset', 'lora-trigger', 'none', 'unknown'].includes(String(a.origin))
    if (![...r.fields, ...r.parameters].every(validField) || !r.assets.every(validAsset) || (r.queued_at !== null && typeof r.queued_at !== 'string')) return null
    const completedAt = r.completed_at === undefined || r.completed_at === null ? null : validTimestamp(r.completed_at)
    return { ...r, completed_at: completedAt } as unknown as GenerationRecord
  } catch { return null }
}
const item = (f: CapturedField, i: number): MetadataItemView => ({ key: `${f.mapping_id}:${f.node_id}:${i}`, name: f.display_name, recorded: f.recorded, value: f.value, role: f.role, status: f.status })
function loraRows(parameters: CapturedField[]): LoraRow[] {
  return parameters.flatMap((f, n) => {
    if (f.input_type !== 'lora_stack' || !f.recorded || f.status !== 'submitted' || !object(f.value)) return []
    const inputs = f.value
    const easy = f.class_type === 'easy loraStack' || 'num_loras' in inputs || 'lora_1_name' in inputs
    const indexes = Object.keys(inputs).flatMap(k => {
      const match = k.match(easy ? /^lora_(\d+)_name$/ : /^lora_name_(\d+)$/)
      return match ? [Number(match[1])] : []
    }).sort((a, b) => a - b)
    const limit = inputs[easy ? 'num_loras' : 'lora_count']
    return indexes.filter(i => typeof limit !== 'number' || i <= limit).flatMap(i => {
      const model = text(inputs[easy ? `lora_${i}_name` : `lora_name_${i}`])
      if (!model || model === 'None') return []
      return [{ key: `${n}:${i}`, model, role: f.role || f.display_name,
        weight: text(inputs[easy ? `lora_${i}_strength` : `lora_wt_${i}`]),
        modelStrength: text(inputs[easy ? `lora_${i}_model_strength` : `model_str_${i}`]),
        clipStrength: text(inputs[easy ? `lora_${i}_clip_strength` : `clip_str_${i}`]),
      }]
    })
  })
}
export function getMetadataView(params: Record<string, unknown> | null): MetadataView {
  const record = parseRecord(params)
  const fields = record?.fields.map((f, i): PromptFieldView => ({ key: `${f.mapping_id}:${f.node_id}:${i}`, name: f.display_name, role: f.role, nodeId: f.node_id,
    recorded: f.recorded && typeof f.value === 'string', value: typeof f.value === 'string' ? f.value : null, status: f.status })) ?? []
  const represented = new Set(record ? [...record.fields, ...record.parameters].flatMap(f => f.role ? [f.role] : []) : [])
  const extras = Object.entries(params || {}).filter(([key, value]) => key !== PROMPT_RECORD_KEY && key !== ASSOCIATIONS_KEY && !represented.has(key) && json(value))
    .map(([key, value]): MetadataItemView => ({ key, name: key, recorded: true, value: value as JsonValue }))
  const ids = record ? [...record.fields, ...record.parameters].map(f => f.mapping_id) : []
  const complete = record?.completeness === 'complete' && fields.every(f => f.recorded) && new Set(ids).size === ids.length
  const seed = record?.parameters.find(f => f.role === 'Sampler_Seed' && f.recorded && f.status === 'submitted' && f.value_kind !== 'graph-reference')
  return {
    record, fields, parameters: record?.parameters.map(item) ?? [], extras,
    assets: record?.assets.map((a, i) => ({ key: `asset-${i}`, name: a.name, recorded: true, value: a as unknown as JsonValue, role: a.role })) ?? [],
    workflowId: record?.workflow_id ?? null, workflowName: record?.workflow_name ?? null, queuedAt: record?.queued_at ?? null,
    completedAt: record?.completed_at ?? null,
    warning: complete ? null : record ? '未記録の項目があります' : '未記録の項目がある可能性があります',
    actualSeed: seed ? text(seed.value) : null, loraRows: loraRows(record?.parameters ?? []),
  }
}
function resolved(params: unknown, assets: unknown, workflowId: unknown, queuedAt: string | null, metadataSavedAt: string | null): ResolvedMetadata | null {
  if (!object(params) || !Object.values(params).every(json)) return null
  const record = parseRecord(params)
  const safeAssets = object(assets) ? Object.fromEntries(Object.entries(assets).filter(([, list]) => Array.isArray(list)).map(([role, list]) => [role,
    (list as unknown[]).filter(a => object(a) && ['lora', 'tagset'].includes(String(a.type)) && typeof a.assetId === 'number' && typeof a.enabled === 'boolean' && typeof a.name === 'string' && Array.isArray(a.tags)),
  ])) as Record<string, AppliedAsset[]> : {}
  return { paramValues: params, appliedAssets: safeAssets, workflowId: record?.workflow_id ?? (typeof workflowId === 'number' ? workflowId : null), queuedAt: record?.queued_at ?? queuedAt, metadataSavedAt }
}
function readLocalMetadata(promptId: string | null): ResolvedMetadata | null {
  if (!promptId) return null
  try {
    const raw = localStorage.getItem(`prompt-surgeon-meta-${promptId}`)
    const cache = raw ? JSON.parse(raw) : null
    if (!object(cache)) return null
    let stamp: string | null = null
    if (typeof cache.timestamp === 'number' && Number.isFinite(cache.timestamp)) {
      try { stamp = new Date(cache.timestamp).toISOString() } catch { /* Ignore timestamps outside the Date range. */ }
    }
    return resolved(cache.paramValues, cache.appliedAssets, cache.workflowId, stamp, null)
  } catch { return null }
}
export function readLocalRecordedMetadata(promptId: string | null): ResolvedMetadata | null {
  const local = readLocalMetadata(promptId)
  if (!local || !promptId) return null
  const record = parseRecord(local.paramValues)
  if (!record || (record.prompt_id !== undefined && record.prompt_id !== promptId)) return null
  return local
}
export async function resolveRecordedMetadata(promptId: string | null): Promise<ResolvedMetadata | null> {
  if (!promptId) return null
  const local = readLocalMetadata(promptId)
  const record = local ? parseRecord(local.paramValues) : null
  if (local && record && (record.prompt_id === undefined || record.prompt_id === promptId)) {
    if (record.completed_at) return local
    try {
      const remote = await promptMetadataApi.get(promptId)
      if (remote.prompt_id !== promptId) return local
      const remoteRecord = parseRecord(remote.param_values)
      if (!remoteRecord || (remoteRecord.prompt_id !== undefined && remoteRecord.prompt_id !== promptId) || !remoteRecord.completed_at) return local
      return {
        ...local,
        paramValues: {
          ...local.paramValues,
          [PROMPT_RECORD_KEY]: JSON.stringify({ ...record, completed_at: remoteRecord.completed_at }),
        },
      }
    } catch { return local }
  }
  // Keep legacy local data only as the final fallback; a v1 record for another prompt is unsafe.
  const legacyLocal = record ? null : local
  try {
    const remote = await promptMetadataApi.get(promptId)
    if (remote.prompt_id !== promptId) return legacyLocal
    const server = resolved(remote.param_values, remote.applied_assets, remote.workflow_id, null, remote.created_at)
    return server && parseRecord(server.paramValues) ? server : legacyLocal ?? server
  } catch { return legacyLocal }
}
