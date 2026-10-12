import type { Workflow, WorkflowMapping, ParamSyncGroup } from '../api/types'
import {
  UINT32_MAX, readSeedSettings, resolveSeedSyncRoots, seedSlotKey,
} from './seedModel'
import { resolveSeedInputKey } from './seedInputResolver'

export interface ResolvedSeedItem {
  seedsBySlot: Record<string, number>
  actualParamValues: Record<string, string>
}
export interface PrepareSeedBatchOptions {
  workflow: Workflow
  paramValues: Record<string, string>
  batchSize: number
  paramSyncGroups?: ParamSyncGroup[]
  randomUint32?: () => number
}
export const MAX_SEED_BATCH_SIZE = 8

interface SeedTarget { mapping: WorkflowMapping; slot: string; input: Record<string, unknown>; key: string; label: string }
const labelFor = (mapping: WorkflowMapping): string => mapping.display_name ?? mapping.param_name ?? mapping.role ?? 'Seed'
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function collectTargets(workflow: Workflow): SeedTarget[] {
  const seeds = workflow.mappings.filter(mapping => mapping.input_type === 'seed')
  const roles = new Set<string>()
  const slots = new Set<string>()
  const destinations = new Set<string>()
  const targets = new Set<string>()
  return seeds.map(mapping => {
    const label = labelFor(mapping)
    if (!mapping.role || mapping.role === '__seed_modes_v1') throw new Error(`${label}: seed mapping has no valid role`)
    if (roles.has(mapping.role)) throw new Error(`${label}: duplicate seed role ${mapping.role}`)
    roles.add(mapping.role)
    const slot = seedSlotKey(mapping)
    if (slots.has(slot)) throw new Error(`${label}: duplicate seed slot ${slot}`)
    slots.add(slot)
    if (destinations.has(mapping.role)) throw new Error(`${label}: conflicting seed destination ${mapping.role}`)
    destinations.add(mapping.role)
    const node = workflow.json_body[mapping.node_id]
    if (!isRecord(node) || !isRecord(node.inputs)) throw new Error(`${label}: workflow node ${mapping.node_id} or inputs are missing`)
    const inputs = node.inputs
    const key = resolveSeedInputKey(mapping, inputs)
    if (!key) {
      const candidates = [mapping.param_name, ...(mapping.fallback_param_names ?? [])].filter(Boolean).join(', ') || '(なし)'
      throw new Error(`${label}: seed入力を解決できません (node ${mapping.node_id}, 候補: ${candidates})`)
    }
    const target = `${mapping.node_id}\u0000${key}`
    if (targets.has(target)) throw new Error(`${label}: conflicting seed graph destination ${mapping.node_id}.${key}`)
    targets.add(target)
    if (Array.isArray(inputs[key])) throw new Error(`${label}: graph-reference Seed input cannot be generated`)
    return { mapping, slot, input: inputs, key, label }
  })
}

function preparePlan(options: PrepareSeedBatchOptions) {
  const targets = collectTargets(options.workflow)
  if (!targets.length) return { targets, roots: {}, rootTargets: [] as SeedTarget[], settings: new Map<string, ReturnType<typeof readSeedSettings>>() }
  if (!Number.isFinite(options.batchSize) || !Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > MAX_SEED_BATCH_SIZE) {
    throw new Error(`Seed batch size must be an integer between 1 and ${MAX_SEED_BATCH_SIZE}`)
  }
  const roots = resolveSeedSyncRoots(options.workflow.mappings, options.paramSyncGroups ?? [])
  const bySlot = new Map(targets.map(target => [target.slot, target]))
  const rootTargets = new Map<string, SeedTarget>()
  const settings = new Map<string, ReturnType<typeof readSeedSettings>>()
  for (const target of targets) {
    const rootSlot = roots[target.slot] ?? target.slot
    const root = bySlot.get(rootSlot)
    if (!root) throw new Error(`${target.label}: seed sync root is missing`)
    rootTargets.set(rootSlot, root)
  }
  for (const [rootSlot, root] of rootTargets) {
    const setting = readSeedSettings(root.mapping, options.paramValues)
    if (!Number.isFinite(setting.seed) || !Number.isInteger(setting.seed) || setting.seed < 0 || setting.seed > UINT32_MAX) {
      throw new Error(`${root.label}: seed must be an unsigned 32-bit integer`)
    }
    if (setting.mode === 'fixed' && setting.seed + options.batchSize - 1 > UINT32_MAX) {
      throw new Error(`${root.label}: fixed seed batch exceeds ${UINT32_MAX}`)
    }
    settings.set(rootSlot, setting)
  }
  return { targets, roots, rootTargets: [...rootTargets.values()], settings }
}

/** Validate all dedicated seed inputs and graph destinations without drawing random values. */
export function validateSeedBatch(options: PrepareSeedBatchOptions): void {
  preparePlan(options)
}

/** Resolve every seed for every batch item before the generation caller starts network work. */
export function prepareSeedBatch(options: PrepareSeedBatchOptions): ResolvedSeedItem[] {
  const plan = preparePlan(options)
  if (!plan.targets.length) return Array.from({ length: Math.max(0, options.batchSize) }, () => ({ seedsBySlot: {}, actualParamValues: { ...options.paramValues } }))
  const randomUint32 = options.randomUint32 ?? (() => Math.floor(Math.random() * 2 ** 32))
  const slotsForRoot = new Map<string, string[]>()
  for (const target of plan.targets) {
    const rootSlot = plan.roots[target.slot] ?? target.slot
    slotsForRoot.set(rootSlot, [...(slotsForRoot.get(rootSlot) ?? []), target.slot])
  }
  const result: ResolvedSeedItem[] = []
  for (let index = 0; index < options.batchSize; index++) {
    const seedsBySlot: Record<string, number> = {}
    const actualParamValues = { ...options.paramValues }
    for (const root of plan.rootTargets) {
      const setting = plan.settings.get(root.slot)!
      const value = setting.mode === 'fixed' ? setting.seed + index : randomUint32()
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
        throw new Error(`${root.label}: random seed must be an unsigned 32-bit integer`)
      }
      for (const slot of slotsForRoot.get(root.slot) ?? []) seedsBySlot[slot] = value
    }
    for (const target of plan.targets) {
      const value = seedsBySlot[target.slot]
      actualParamValues[target.mapping.role!] = String(value)
    }
    result.push({ seedsBySlot, actualParamValues })
  }
  return result
}
