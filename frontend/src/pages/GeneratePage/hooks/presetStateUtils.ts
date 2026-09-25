import type { WorkflowPreset } from '../../../api/types'
import type { AppliedAsset } from '../../../store/useGenerationStore'

export interface HistoryState {
  paramValues: Record<string, string>
  appliedAssets: Record<string, AppliedAsset[]>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
}

export interface PresetConflictData {
  serverPreset: WorkflowPreset
  localDraft: {
    name: string
    paramValues: Record<string, string>
    appliedAssets: Record<string, any[]>
    batchSize: number
    seedMode: 'random' | 'fixed'
    seed: number
  }
}

export interface UpdatePresetArgs {
  id: number
  name: string
  param_values?: Record<string, string>
  applied_assets?: Record<string, any[]>
  batch_size?: number
  seed_mode?: string
  seed?: number
  base_updated_at?: string
}

export const isRecordEqual = (a?: Record<string, any>, b?: Record<string, any>): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => a[k] === b[k])
}

export function normalizeTimestamp(ts?: string | null): number {
  if (!ts) return 0
  const trimmed = ts.trim()
  const hasTz = trimmed.endsWith('Z') || trimmed.includes('+') || (trimmed.includes('-') && trimmed.lastIndexOf('-') > 10)
  const normalized = hasTz ? trimmed : `${trimmed}Z`
  const ms = new Date(normalized).getTime()
  return isNaN(ms) ? 0 : ms
}

export function isTimestampDifferent(a?: string | null, b?: string | null, thresholdMs = 1000): boolean {
  if (!a && !b) return false
  if (!a || !b) return true
  const msA = normalizeTimestamp(a)
  const msB = normalizeTimestamp(b)
  return Math.abs(msA - msB) >= thresholdMs
}

export const isStateEqual = (a: HistoryState, b: HistoryState): boolean => {
  return (
    isRecordEqual(a.paramValues, b.paramValues) &&
    JSON.stringify(a.appliedAssets) === JSON.stringify(b.appliedAssets) &&
    a.batchSize === b.batchSize &&
    a.seedMode === b.seedMode &&
    a.seed === b.seed
  )
}
