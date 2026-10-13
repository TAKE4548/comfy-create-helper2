export type SlotMapping = {
  master_id: number
  node_id: string
  variant_id?: number | null
  role?: string | null
}

export type SlotDefinition = {
  masterId: number
  variantId?: number
  stageId?: number
  defaultEnabled: boolean
  role?: string | null
  legacyRole?: string | null
}

export type WorkflowSlotStates = Record<string, boolean>

export function slotKey(masterId: number, variantId?: number | null): string {
  return variantId == null ? `m:${masterId}` : `v:${variantId}`
}

// Legacy identities resolve only through a single variant or exact role equality.
export function mappingSlotKey(mapping: SlotMapping, slots: readonly SlotDefinition[]): string {
  if (mapping.variant_id != null) return slotKey(mapping.master_id, mapping.variant_id)
  const masterSlots = slots.filter((slot) => slot.masterId === mapping.master_id)
  if (masterSlots.length === 1) return slotKey(mapping.master_id, masterSlots[0].variantId)
  const role = mapping.role ?? masterSlots.find((slot) => slot.legacyRole)?.legacyRole
  const matches = role ? masterSlots.filter((slot) => slot.role === role) : []
  return matches.length === 1 ? slotKey(mapping.master_id, matches[0].variantId) : slotKey(mapping.master_id)
}

export function hydrateSlotStates(
  states: WorkflowSlotStates | undefined,
  mappings: readonly SlotMapping[],
  slots: readonly SlotDefinition[],
): WorkflowSlotStates {
  const hydrated: WorkflowSlotStates = { ...states }
  const mappedKeys = new Set(mappings.map((mapping) => mappingSlotKey(mapping, slots)))

  for (const slot of slots) {
    const key = slotKey(slot.masterId, slot.variantId)
    if (Object.prototype.hasOwnProperty.call(hydrated, key)) continue
    const legacyKey = slotKey(slot.masterId)
    const resolvesLegacy = mappingSlotKey({ master_id: slot.masterId, node_id: '' }, slots) === key
      || mappings.some((mapping) => mapping.master_id === slot.masterId && mapping.variant_id == null && mappingSlotKey(mapping, slots) === key)
    if (slot.variantId != null && resolvesLegacy && Object.prototype.hasOwnProperty.call(hydrated, legacyKey)) {
      hydrated[key] = hydrated[legacyKey]
      continue
    }
    hydrated[key] = mappedKeys.has(key) || slot.defaultEnabled
  }

  return hydrated
}

export function isSlotEnabled(states: WorkflowSlotStates, key: string): boolean {
  return states[key] !== false
}

export function setStageEnabled(
  states: WorkflowSlotStates,
  slots: readonly SlotDefinition[],
  stageId: number,
  enabled: boolean,
): WorkflowSlotStates {
  const updated = { ...states }
  for (const slot of slots) {
    if (slot.stageId === stageId) updated[slotKey(slot.masterId, slot.variantId)] = enabled
  }
  return updated
}

export type MappingWorkflow = {
  mappings: readonly SlotMapping[]
  mapping_slot_states?: WorkflowSlotStates
}

export function generationWorkflow<T extends MappingWorkflow>(raw: T, slots: readonly SlotDefinition[] = []): Omit<T, 'mappings'> & {
  mappings: T['mappings'][number][]
} {
  const mappings = raw.mappings.filter((mapping) => (
    (raw.mapping_slot_states?.[mappingSlotKey(mapping, slots)]
      ?? raw.mapping_slot_states?.[slotKey(mapping.master_id, mapping.variant_id)]) !== false
  )) as T['mappings'][number][]
  return { ...raw, mappings }
}
