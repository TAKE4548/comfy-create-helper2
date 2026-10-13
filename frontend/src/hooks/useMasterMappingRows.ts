import { useCallback, useMemo, useRef, useState } from 'react'
import type { MappingMaster, MappingMasterV2, ScanResult } from '../api/types'
import { hydrateSlotStates, isSlotEnabled, mappingSlotKey, setStageEnabled as updateStageEnabled, slotKey as canonicalSlotKey, type SlotDefinition, type SlotMapping, type WorkflowSlotStates } from '../utils/workflowMappingState'

type HookOptions = { existingMappings?: readonly SlotMapping[]; mappingSlotStates?: WorkflowSlotStates; workflowJson?: unknown }
type RowPresentation = { enabled: boolean; unused: boolean; reference_missing: boolean }
const workflowNodeIds = (value: unknown): Set<string> | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const graph = value as Record<string, unknown>
  if (Array.isArray(graph.nodes)) return new Set(graph.nodes.filter((n): n is { id: unknown } => Boolean(n && typeof n === 'object' && 'id' in n)).map(n => String(n.id)))
  const nodes = graph.nodes && typeof graph.nodes === 'object' ? graph.nodes as Record<string, unknown> : graph
  return new Set(Object.keys(nodes))
}

export interface StageSlotItem extends RowPresentation {
  slotKey: string // `v_${variant_id}` または `m_${master_id}`
  variantId?: number
  masterId: number
  stageId?: number
  stageName: string
  stageKey: string
  node_id: string
  candidates: string[]
  recommendedNodeIds: string[]
  status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' | 'unassigned'
  node_title?: string
}

export interface MasterMappingRow extends RowPresentation {
  rowKey: `m_${number}`
  slotKey?: string
  master: MappingMaster | MappingMasterV2
  node_id: string // primary slot node_id (互換性用)
  candidates: string[]
  status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found'
  node_title?: string
  is_existing_mismatch?: boolean
  stageSlots?: StageSlotItem[] // Stageごとのスロット一覧
}

export function useMasterMappingRows(
  masters: (MappingMaster | MappingMasterV2)[],
  scanResult: ScanResult | null,
  options: HookOptions = {},
) {
  const [rowState, setRowState] = useState<Record<string, string>>({})
  const [mismatchState, setMismatchState] = useState<Record<string, boolean>>({})
  const [mappingSlotStates, setMappingSlotStates] = useState<WorkflowSlotStates>(options.mappingSlotStates ?? {})
  const initialized = useRef(false)
  const storedMappings = useRef<readonly SlotMapping[]>(options.existingMappings ?? [])
  const latestScan = useRef(scanResult)
  const graph = useRef(options.workflowJson)
  if (scanResult) latestScan.current = scanResult
  if (options.workflowJson !== undefined) graph.current = options.workflowJson

  const allDefinitions = useMemo<SlotDefinition[]>(() => masters.flatMap(master => {
    const variants = 'variants' in master && Array.isArray(master.variants) ? master.variants : []
    return variants.length ? variants.map(v => ({ masterId: master.id, variantId: v.id, stageId: v.stage_id, role: v.computed_role, legacyRole: master.role, defaultEnabled: master.default_enabled !== false }))
      : [{ masterId: master.id, defaultEnabled: master.default_enabled !== false }]
  }), [masters])
  const activeDefinitions = useMemo<SlotDefinition[]>(() => masters.flatMap(master => {
    const variants = 'variants' in master ? master.variants.filter(v => v.is_enabled !== false) : []
    return variants.length ? variants.map(v => ({ masterId: master.id, variantId: v.id, stageId: v.stage_id, role: v.computed_role, legacyRole: master.role, defaultEnabled: master.default_enabled !== false }))
      : [{ masterId: master.id, defaultEnabled: master.default_enabled !== false }]
  }), [masters])
  const slotDefinitions = (includeInactive = false) => includeInactive ? allDefinitions : activeDefinitions
  const saved = storedMappings.current
  const savedByKey = useMemo(() => new Map(saved.map(m => [mappingSlotKey(m, allDefinitions), m])), [saved, allDefinitions])
  const mappedKeys = useMemo(() => new Set(savedByKey.keys()), [savedByKey])
  const visibleSlots = useMemo(() => activeDefinitions.filter(s => s.defaultEnabled
    || mappedKeys.has(canonicalSlotKey(s.masterId, s.variantId))
    || Object.prototype.hasOwnProperty.call(mappingSlotStates, canonicalSlotKey(s.masterId, s.variantId))), [activeDefinitions, mappedKeys, mappingSlotStates])
  const visibleDefinitions = () => visibleSlots
  const hydratedStates = useMemo(() => hydrateSlotStates(mappingSlotStates, saved, visibleSlots), [mappingSlotStates, saved, visibleSlots])
  const states = () => hydratedStates
  const enabled = (masterId: number, variantId?: number) => isSlotEnabled(hydratedStates, canonicalSlotKey(masterId, variantId))

  const buildRows = (): { rows: MasterMappingRow[]; mainRows: MasterMappingRow[]; notFoundRows: MasterMappingRow[] } => {
    const activeScan = latestScan.current
    if (!activeScan) return { rows: [], mainRows: [], notFoundRows: [] }

    const matchedMap = new Map(activeScan.matched.map(m => [m.master_id, m]))
    const warningMap = new Map(activeScan.warnings.map(w => [w.master_id, w]))
    const graphIds = workflowNodeIds(graph.current)

    const rows: MasterMappingRow[] = []
    const mainRows: MasterMappingRow[] = []
    const notFoundRows: MasterMappingRow[] = []

    for (const master of masters) {
      const variants = ('variants' in master && Array.isArray((master as MappingMasterV2).variants))
        ? (master as MappingMasterV2).variants.filter(v => v.is_enabled !== false)
        : []
      const knownKeys = mappedKeys
      const hasKnownSlot = variants.length ? variants.some(v => knownKeys.has(canonicalSlotKey(master.id, v.id)) || Object.prototype.hasOwnProperty.call(mappingSlotStates, canonicalSlotKey(master.id, v.id)))
        : knownKeys.has(canonicalSlotKey(master.id)) || Object.prototype.hasOwnProperty.call(mappingSlotStates, canonicalSlotKey(master.id))
      if (master.default_enabled === false && !hasKnownSlot) continue

      if (variants.length > 0) {
        const stageSlots: StageSlotItem[] = []

        for (const variant of variants) {
          const slotKey = `v_${variant.id}`

          const slotWarning = activeScan.warnings.find(w => w.variant_id != null && w.variant_id === variant.id)
            ?? (variants.length === 1 ? activeScan.warnings.find(w => !w.variant_id && w.master_id === master.id) : undefined)
          const slotMatched = activeScan.matched.find(m => m.variant_id != null && m.variant_id === variant.id)
            ?? (variants.length === 1 ? activeScan.matched.find(m => !m.variant_id && m.master_id === master.id) : undefined)

          let status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' | 'unassigned' = 'not_found'
          let candidates: string[] = []
          let recommendedNodeIds: string[] = []
          let node_title: string | undefined = undefined

          if (slotWarning) {
            status = slotWarning.status as any
            if (slotWarning.status === 'duplicated') {
              candidates = slotWarning.node_ids ?? []
              recommendedNodeIds = slotWarning.node_ids ?? []
            } else if (slotWarning.status === 'class_type_mismatch') {
              candidates = slotWarning.node_id ? [slotWarning.node_id] : []
              recommendedNodeIds = slotWarning.node_id ? [slotWarning.node_id] : []
            }
          } else if (slotMatched) {
            status = 'ok'
            node_title = slotMatched.node_title
            candidates = slotMatched.node_ids ?? [slotMatched.node_id]
            recommendedNodeIds = slotMatched.node_ids ?? [slotMatched.node_id]
          }

          let node_id = rowState[slotKey]
          if (node_id === undefined) {
            if (slotWarning) {
              if (slotWarning.status === 'duplicated' && candidates.length > 0) {
                node_id = candidates[0]
              } else if (slotWarning.status === 'class_type_mismatch' && slotWarning.node_id) {
                node_id = slotWarning.node_id
              } else {
                node_id = ''
              }
            } else if (slotMatched) {
              node_id = slotMatched.node_id
            } else {
              node_id = ''
            }
          }

          if (node_id) {
            if (status === 'not_found' || status === 'unassigned') {
              status = 'ok'
            }
            if (slotMatched && node_id === slotMatched.node_id && !node_title) {
              node_title = slotMatched.node_title
            }
          } else {
            status = status === 'not_found' ? 'not_found' : 'unassigned'
          }

          stageSlots.push({
            slotKey,
            variantId: variant.id,
            masterId: master.id,
            stageId: variant.stage_id,
            stageName: variant.stage_name,
            stageKey: variant.stage_key,
            node_id,
            candidates,
            recommendedNodeIds,
            status,
            enabled: enabled(master.id, variant.id), unused: node_id === '',
            reference_missing: Boolean(node_id && graphIds && !graphIds.has(node_id)),
            node_title,
          })
        }

        const primarySlot = stageSlots[0]
        const hasOkSlot = stageSlots.some(s => s.status === 'ok')
        const hasDuplicatedSlot = stageSlots.some(s => s.status === 'duplicated')
        const hasMismatchSlot = stageSlots.some(s => s.status === 'class_type_mismatch')
        const allNotFound = stageSlots.every(s => s.status === 'not_found' || (s.status === 'unassigned' && s.candidates.length === 0))

        let masterStatus: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' = 'not_found'
        if (hasDuplicatedSlot) masterStatus = 'duplicated'
        else if (hasMismatchSlot) masterStatus = 'class_type_mismatch'
        else if (hasOkSlot) masterStatus = 'ok'
        else masterStatus = 'not_found'

        const isExistingMismatch = mismatchState[String(master.id)] ?? mismatchState[`m_${master.id}`] ?? stageSlots.some(s => mismatchState[s.slotKey]) ?? false

        const row: MasterMappingRow = {
          rowKey: `m_${master.id}`, slotKey: primarySlot?.slotKey,
          master,
          node_id: primarySlot ? primarySlot.node_id : '',
          candidates: primarySlot ? primarySlot.candidates : [],
          status: masterStatus,
          node_title: primarySlot?.node_title,
          is_existing_mismatch: isExistingMismatch,
          stageSlots,
          enabled: primarySlot?.enabled ?? true, unused: primarySlot?.unused ?? true,
          reference_missing: primarySlot?.reference_missing ?? false,
        }

        rows.push(row)

        if (allNotFound) {
          notFoundRows.push(row)
        } else {
          mainRows.push(row)
        }
      } else {
        // Legacy single-slot master
        const matched = matchedMap.get(master.id)
        const warning = warningMap.get(master.id)

        let status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' = 'not_found'
        let candidates: string[] = []
        let node_id = rowState[`m_${master.id}`] ?? rowState[String(master.id)] ?? ''
        let node_title: string | undefined = undefined

        if (warning) {
          status = warning.status as any
          if (warning.status === 'duplicated') {
            candidates = warning.node_ids ?? []
            if (rowState[`m_${master.id}`] === undefined && rowState[String(master.id)] === undefined && candidates.length > 0) {
              node_id = candidates[0]
            }
          } else if (warning.status === 'class_type_mismatch') {
            candidates = warning.node_id ? [warning.node_id] : []
            if (rowState[`m_${master.id}`] === undefined && rowState[String(master.id)] === undefined && warning.node_id) {
              node_id = warning.node_id
            }
          }
        } else if (matched) {
          status = 'ok'
          node_title = matched.node_title
          if (rowState[`m_${master.id}`] === undefined && rowState[String(master.id)] === undefined) {
            node_id = matched.node_id
          }
          candidates = matched.node_ids ?? [matched.node_id]
        }

        const isExistingMismatch = mismatchState[String(master.id)] ?? mismatchState[`m_${master.id}`] ?? false

        const row: MasterMappingRow = {
          rowKey: `m_${master.id}`, slotKey: `m_${master.id}`,
          master,
          node_id,
          candidates,
          status,
          node_title,
          is_existing_mismatch: isExistingMismatch,
          enabled: enabled(master.id), unused: node_id === '',
          reference_missing: Boolean(node_id && graphIds && !graphIds.has(node_id)),
        }

        rows.push(row)

        if (status === 'not_found') {
          notFoundRows.push(row)
        } else {
          mainRows.push(row)
        }
      }
    }

    return { rows, mainRows, notFoundRows }
  }

  const updateSlotNodeId = (slotKey: string, node_id: string) => {
    const def = visibleDefinitions().find(s => (s.variantId == null ? `m_${s.masterId}` : `v_${s.variantId}`) === slotKey)
    if (!def || !enabled(def.masterId, def.variantId)) return
    setRowState(prev => {
      const next = { ...prev, [slotKey]: node_id }
      if (slotKey.startsWith('m_')) {
        const id = slotKey.substring(2)
        next[id] = node_id
      }
      return next
    })
  }

  const clearSlot = (slotKey: string) => {
    updateSlotNodeId(slotKey, '')
  }

  const updateNodeId = (master_id: number, node_id: string) => {
    const slot = visibleDefinitions().find(def => def.masterId === master_id)
    if (!slot || !enabled(slot.masterId, slot.variantId)) return
    setRowState(prev => {
      const next: Record<string, string> = {
        ...prev,
        [String(master_id)]: node_id,
        [`m_${master_id}`]: node_id,
      }
      const targetMaster = masters.find(m => m.id === master_id)
      if (targetMaster && 'variants' in targetMaster && Array.isArray((targetMaster as MappingMasterV2).variants)) {
        const firstVariant = (targetMaster as MappingMasterV2).variants[0]
        if (firstVariant) {
          next[`v_${firstVariant.id}`] = node_id
        }
      }
      return next
    })
  }

  const setSlotEnabled = (key: string, value: boolean) => {
    const def = visibleDefinitions().find(s => (s.variantId == null ? `m_${s.masterId}` : `v_${s.variantId}`) === key)
    if (!def) return
    setMappingSlotStates(prev => ({ ...prev, [canonicalSlotKey(def.masterId, def.variantId)]: value }))
  }
  const setStageEnabled = (stageId: number, value: boolean) => {
    setMappingSlotStates(prev => updateStageEnabled(prev, visibleDefinitions(), stageId, value))
  }

  const initFromScan = useCallback((
    result: ScanResult,
    existingMappings?: readonly SlotMapping[],
    workflowJson?: unknown
  ) => {
    latestScan.current = result
    if (workflowJson !== undefined) graph.current = workflowJson
    if (initialized.current) return
    const savedMappings = existingMappings ?? options.existingMappings ?? []
    storedMappings.current = savedMappings
    const savedByIdentity = new Map(savedMappings.map(mapping => [mappingSlotKey(mapping, allDefinitions), mapping]))
    const initialSlots = activeDefinitions.filter(slot => slot.defaultEnabled
      || savedByIdentity.has(canonicalSlotKey(slot.masterId, slot.variantId))
      || Object.prototype.hasOwnProperty.call(options.mappingSlotStates ?? {}, canonicalSlotKey(slot.masterId, slot.variantId)))
    const scanDefaults: Record<string, string> = {}
    for (const m of result.matched) {
      if (m.variant_id) {
        scanDefaults[`v_${m.variant_id}`] = m.node_id
      }
      scanDefaults[`m_${m.master_id}`] = m.node_id
      scanDefaults[String(m.master_id)] = m.node_id
    }
    for (const w of result.warnings) {
      let defaultVal: string | undefined
      if (w.status === 'duplicated' && w.node_ids?.[0]) {
        defaultVal = w.node_ids[0]
      } else if (w.status === 'class_type_mismatch' && w.node_id) {
        defaultVal = w.node_id
      }
      if (defaultVal !== undefined) {
        if (w.variant_id) {
          scanDefaults[`v_${w.variant_id}`] = defaultVal
        }
        scanDefaults[`m_${w.master_id}`] = defaultVal
        scanDefaults[String(w.master_id)] = defaultVal
      }
    }

    const initial: Record<string, string> = {}
    const mismatches: Record<string, boolean> = {}

    if (savedMappings.length > 0) {
      for (const master of masters) {
        const variants = ('variants' in master && Array.isArray((master as MappingMasterV2).variants))
          ? (master as MappingMasterV2).variants.filter(v => v.is_enabled !== false)
          : []

        if (variants.length > 0) {
          for (const variant of variants) {
            const slotKey = `v_${variant.id}`
            const existing = savedByIdentity.get(canonicalSlotKey(master.id, variant.id))

            if (existing && existing.node_id !== undefined && existing.node_id.trim() !== '') {
              const existingNodeId = existing.node_id.trim()
              const matched = result.matched.find(m => m.variant_id === variant.id)
                ?? (variants.length === 1 ? result.matched.find(m => m.master_id === master.id) : undefined)
              const warning = result.warnings.find(w => w.variant_id === variant.id)
                ?? (variants.length === 1 ? result.warnings.find(w => w.master_id === master.id) : undefined)

              const validCandidates = [
                ...(matched?.node_ids ?? (matched ? [matched.node_id] : [])),
                ...(warning?.node_ids ?? (warning?.node_id ? [warning.node_id] : []))
              ]

              let isValid = validCandidates.includes(existingNodeId)
              if (!isValid && workflowJson) {
                if (Object.prototype.hasOwnProperty.call(workflowJson, existingNodeId)) {
                  isValid = true
                }
              }

              if (isValid) {
                initial[slotKey] = existingNodeId
              } else {
                initial[slotKey] = scanDefaults[slotKey] ?? ''
                mismatches[String(master.id)] = true
                mismatches[slotKey] = true
              }
            } else {
              initial[slotKey] = scanDefaults[slotKey] ?? ''
            }
          }

          const primaryVariant = variants[0]
          if (primaryVariant) {
            initial[`m_${master.id}`] = initial[`v_${primaryVariant.id}`] ?? ''
            initial[String(master.id)] = initial[`m_${master.id}`]
          }
        } else {
          const existing = savedMappings.find(e => e.master_id === master.id)
          const existingNodeId = existing?.node_id
          if (existingNodeId !== undefined && existingNodeId.trim() !== '') {
            const matched = result.matched.find(m => m.master_id === master.id)
            const warning = result.warnings.find(w => w.master_id === master.id)
            const validCandidates = [
              ...(matched?.node_ids ?? (matched ? [matched.node_id] : [])),
              ...(warning?.node_ids ?? (warning?.node_id ? [warning.node_id] : []))
            ]

            let isValid = validCandidates.includes(existingNodeId)
            if (!isValid && workflowJson) {
              if (Object.prototype.hasOwnProperty.call(workflowJson, existingNodeId)) {
                isValid = true
              }
            }

            if (isValid) {
              initial[`m_${master.id}`] = existingNodeId
              initial[String(master.id)] = existingNodeId
            } else {
              initial[`m_${master.id}`] = scanDefaults[`m_${master.id}`] ?? ''
              initial[String(master.id)] = initial[`m_${master.id}`]
              mismatches[String(master.id)] = true
            }
          } else {
            initial[`m_${master.id}`] = scanDefaults[`m_${master.id}`] ?? ''
            initial[String(master.id)] = initial[`m_${master.id}`]
          }
        }
      }
    } else {
      for (const key of Object.keys(scanDefaults)) {
        initial[key] = scanDefaults[key]
      }
      for (const master of masters) {
        const variants = ('variants' in master && Array.isArray((master as MappingMasterV2).variants))
          ? (master as MappingMasterV2).variants.filter(v => v.is_enabled !== false)
          : []
        if (variants.length > 0) {
          for (const v of variants) {
            const key = `v_${v.id}`
            if (initial[key] === undefined) {
              initial[key] = scanDefaults[key] ?? ''
            }
          }
          const primary = variants[0]
          if (primary) {
            initial[`m_${master.id}`] = initial[`v_${primary.id}`] ?? ''
            initial[String(master.id)] = initial[`m_${master.id}`]
          }
        } else {
          if (initial[`m_${master.id}`] === undefined) {
            initial[`m_${master.id}`] = scanDefaults[`m_${master.id}`] ?? ''
          }
          if (initial[String(master.id)] === undefined) {
            initial[String(master.id)] = initial[`m_${master.id}`]
          }
        }
      }
    }

    for (const mapping of savedMappings) {
      const key = mappingSlotKey(mapping, slotDefinitions(true)).replace(':', '_')
      initial[key] = mapping.node_id
    }
    setRowState(initial)
    setMappingSlotStates(hydrateSlotStates(options.mappingSlotStates, savedMappings, initialSlots))
    setMismatchState(mismatches)
    initialized.current = true
  }, [masters, allDefinitions, activeDefinitions, options.existingMappings, options.mappingSlotStates])

  const getMappings = (mainRows: MasterMappingRow[], notFoundRows: MasterMappingRow[]) => {
    const results: { master_id: number; node_id: string; variant_id?: number }[] = []
    const inputRows = [...mainRows, ...notFoundRows]
    const knownKeys = new Set(inputRows.flatMap(r => r.stageSlots?.length
      ? r.stageSlots.map(s => canonicalSlotKey(s.masterId, s.variantId))
      : [canonicalSlotKey(r.master.id)]))
    for (const saved of storedMappings.current) {
      if (!knownKeys.has(mappingSlotKey(saved, slotDefinitions(true)))) {
        const { variant_id, ...legacy } = saved
        results.push(variant_id == null ? legacy : { ...saved, variant_id })
      }
    }
    for (const r of inputRows) {
      if (r.stageSlots && r.stageSlots.length > 0) {
        for (const slot of r.stageSlots) {
          if (slot.node_id && slot.node_id.trim() !== '') {
            const saved = savedByKey.get(canonicalSlotKey(slot.masterId, slot.variantId))
            results.push({
              master_id: slot.masterId,
              node_id: saved?.node_id === slot.node_id ? saved.node_id : slot.node_id.trim(),
              ...(slot.variantId !== undefined ? { variant_id: slot.variantId } : {}),
            })
          }
        }
      } else if (r.node_id && r.node_id.trim() !== '') {
        const saved = storedMappings.current.find(m => m.master_id === r.master.id && m.variant_id == null)
        results.push({ master_id: r.master.id, node_id: saved?.node_id === r.node_id ? saved.node_id : r.node_id.trim() })
      }
    }
    return results
  }

  const built = useMemo(buildRows, [masters, scanResult, rowState, mismatchState, hydratedStates, mappedKeys, options.workflowJson])
  const cachedBuildRows = useCallback(() => built, [built])
  return { rows: built.rows, buildRows: cachedBuildRows, mappingSlotStates: states(), setSlotEnabled, setStageEnabled, updateNodeId, updateSlotNodeId, clearSlot, initFromScan, getMappings }
}
