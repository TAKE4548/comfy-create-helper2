import type { ParamSyncGroup, WorkflowMapping } from '../api/types'

export type SeedMode = 'random' | 'fixed'
export interface SeedSettings { mode: SeedMode; seed: number }
export const SEED_MODES_KEY = '__seed_modes_v1'
export const UINT32_MAX = 4294967295

interface SeedModeDocument {
  version: 1
  modes: Record<string, SeedMode>
}

export function seedSlotKey(mapping: WorkflowMapping): string {
  return `master:${mapping.master_id}:variant:${mapping.variant_id ?? 'legacy'}`
}

function parseModeDocument(raw: string | undefined): SeedModeDocument | undefined {
  if (raw === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('Seed mode metadata is invalid JSON') }
  if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1 ||
      !(parsed as { modes?: unknown }).modes || typeof (parsed as { modes: unknown }).modes !== 'object' ||
      Array.isArray((parsed as { modes: unknown }).modes)) {
    throw new Error('Seed mode metadata has an unsupported version or shape')
  }
  return parsed as SeedModeDocument
}

export function parseSeedValue(raw: string, label: string): number {
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${label} must be an unsigned integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be between 0 and ${UINT32_MAX}`)
  }
  return value
}

export function readSeedSettings(mapping: WorkflowMapping, values: Record<string, string>): SeedSettings {
  const document = parseModeDocument(values[SEED_MODES_KEY])
  const slot = seedSlotKey(mapping)
  const mode = document && Object.prototype.hasOwnProperty.call(document.modes, slot) ? document.modes[slot] : 'fixed'
  if (mode !== 'random' && mode !== 'fixed') throw new Error(`Invalid seed mode for ${mapping.display_name ?? mapping.role ?? 'Seed'}`)
  return { mode, seed: parseSeedValue(values[mapping.role ?? ''] ?? '', mapping.display_name ?? mapping.param_name ?? 'Seed') }
}

export function setSeedModeForMapping(
  mapping: WorkflowMapping,
  values: Record<string, string>,
  mode: SeedMode,
): Record<string, string> {
  if (mode !== 'random' && mode !== 'fixed') throw new Error('Invalid seed mode')
  const existing = parseModeDocument(values[SEED_MODES_KEY])
  const modes = { ...(existing?.modes ?? {}), [seedSlotKey(mapping)]: mode }
  return { ...values, [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes }) }
}

/** Validate role and slot uniqueness before exposing or writing dedicated seed controls. */
export function validateSeedMappings(mappings: WorkflowMapping[]): string[] {
  const errors: string[] = []
  const slots = new Set<string>()
  const destinations = new Set<string>()
  for (const mapping of mappings.filter(item => item.input_type === 'seed')) {
    const slot = seedSlotKey(mapping)
    const role = mapping.role
    if (slots.has(slot)) errors.push(`Duplicate seed slot: ${slot}`)
    slots.add(slot)
    if (!role || role === SEED_MODES_KEY) errors.push(`Invalid or reserved seed role: ${role ?? '(empty)'}`)
    else if (destinations.has(role)) errors.push(`Duplicate seed destination: ${role}`)
    else destinations.add(role)
  }
  return errors
}

export function resolveSeedSyncRoots(
  mappings: WorkflowMapping[],
  groups: ParamSyncGroup[],
): Record<string, string> {
  const seeds = mappings.filter(mapping => mapping.input_type === 'seed')
  const byRole = new Map<string, WorkflowMapping[]>()
  for (const mapping of mappings) {
    if (mapping.role) byRole.set(mapping.role, [...(byRole.get(mapping.role) ?? []), mapping])
  }
  const seedRoles = new Set(seeds.map(mapping => mapping.role).filter((role): role is string => !!role))
  const parents = new Map<string, string>()
  for (const sync of groups.filter(item => item.is_enabled)) {
    const roles = [sync.master_role, ...sync.slave_roles]
    if (!roles.some(role => seedRoles.has(role))) continue
    const resolved = roles.map(role => {
      const matches = byRole.get(role) ?? []
      if (matches.length !== 1) throw new Error(`Seed sync role must resolve to one mapping: ${role}`)
      return matches[0]
    })
    if (resolved.some(mapping => mapping.input_type !== 'seed')) throw new Error('Seed sync cannot mix parameter types')
    for (const childRole of sync.slave_roles) {
      const previous = parents.get(childRole)
      if (previous && previous !== sync.master_role) throw new Error(`Seed sync has multiple parents: ${childRole}`)
      parents.set(childRole, sync.master_role)
    }
  }
  const rootRole = (role: string, visiting = new Set<string>()): string => {
    if (visiting.has(role)) throw new Error(`Seed sync cycle at ${role}`)
    const parent = parents.get(role)
    if (!parent) return role
    visiting.add(role)
    const root = rootRole(parent, visiting)
    visiting.delete(role)
    return root
  }
  const mappingForRole = new Map(seeds.map(mapping => [mapping.role as string, mapping]))
  const roots: Record<string, string> = {}
  for (const mapping of seeds) {
    if (!mapping.role) throw new Error('Seed mapping has no role')
    const root = mappingForRole.get(rootRole(mapping.role))
    if (!root) throw new Error(`Seed sync root is not a seed mapping: ${mapping.role}`)
    roots[seedSlotKey(mapping)] = seedSlotKey(root)
  }
  return roots
}
