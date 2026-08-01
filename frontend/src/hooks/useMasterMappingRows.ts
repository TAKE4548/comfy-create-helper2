import { useState } from 'react'
import type { MappingMaster, ScanResult } from '../api/types'

export interface MasterMappingRow {
  master: MappingMaster
  node_id: string
  candidates: string[]
  status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found'
  node_title?: string
  is_existing_mismatch?: boolean
}

export function useMasterMappingRows(
  masters: MappingMaster[],
  scanResult: ScanResult | null
) {
  const [rowState, setRowState] = useState<Record<number, string>>({})  // master_id -> node_id
  const [mismatchState, setMismatchState] = useState<Record<number, boolean>>({})

  const buildRows = (): { mainRows: MasterMappingRow[]; notFoundRows: MasterMappingRow[] } => {
    if (!scanResult) return { mainRows: [], notFoundRows: [] }
    
    const matchedMap = new Map(scanResult.matched.map(m => [m.master_id, m]))
    const warningMap = new Map(scanResult.warnings.map(w => [w.master_id, w]))

    const mainRows: MasterMappingRow[] = []
    const notFoundRows: MasterMappingRow[] = []

    for (const master of masters) {
      const matched = matchedMap.get(master.id)
      const warning = warningMap.get(master.id)

      let status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' = 'not_found'
      let candidates: string[] = []
      let node_id = rowState[master.id] ?? ''
      let node_title: string | undefined = undefined

      if (warning) {
        // warning が存在する（duplicated, class_type_mismatch, not_found）場合は警告側を優先
        status = warning.status as any
        if (warning.status === 'duplicated') {
          candidates = warning.node_ids ?? []
          if (rowState[master.id] === undefined && candidates.length > 0) {
            node_id = candidates[0]
          }
        } else if (warning.status === 'class_type_mismatch') {
          candidates = warning.node_id ? [warning.node_id] : []
          if (rowState[master.id] === undefined && warning.node_id) {
            node_id = warning.node_id
          }
        }
      } else if (matched) {
        // 警告がない場合のみ ok マッチ
        status = 'ok'
        node_title = matched.node_title
        if (rowState[master.id] === undefined) {
          node_id = matched.node_id
        }
        // 1:1マッチの場合でも、ドロップダウンから選択可能なように候補に含める
        candidates = matched.node_ids ?? [matched.node_id]
      }

      const row: MasterMappingRow = {
        master,
        node_id,
        candidates,
        status,
        node_title,
        is_existing_mismatch: mismatchState[master.id] ?? false,
      }

      if (status === 'not_found') {
        notFoundRows.push(row)
      } else {
        mainRows.push(row)
      }
    }

    return { mainRows, notFoundRows }
  }

  const updateNodeId = (master_id: number, node_id: string) => {
    setRowState(prev => ({ ...prev, [master_id]: node_id }))
  }

  const initFromScan = (
    result: ScanResult,
    existingMappings?: { master_id: number; node_id: string }[],
    workflowJson?: Record<string, unknown>
  ) => {
    const scanDefaults: Record<number, string> = {}
    for (const m of result.matched) {
      scanDefaults[m.master_id] = m.node_id
    }
    for (const w of result.warnings) {
      if (w.status === 'duplicated' && w.node_ids?.[0]) scanDefaults[w.master_id] = w.node_ids[0]
      else if (w.status === 'class_type_mismatch' && w.node_id) scanDefaults[w.master_id] = w.node_id
    }

    const initial: Record<number, string> = {}
    const mismatches: Record<number, boolean> = {}

    const matchedMap = new Map(result.matched.map(m => [m.master_id, m]))
    const warningMap = new Map(result.warnings.map(w => [w.master_id, w]))

    if (existingMappings && existingMappings.length > 0) {
      const existingMap = new Map(existingMappings.map(e => [e.master_id, e.node_id]))
      for (const master of masters) {
        const existingNodeId = existingMap.get(master.id)
        if (existingNodeId !== undefined && existingNodeId.trim() !== '') {
          const matched = matchedMap.get(master.id)
          const warning = warningMap.get(master.id)
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
            initial[master.id] = existingNodeId
          } else {
            initial[master.id] = scanDefaults[master.id] ?? ''
            mismatches[master.id] = true
          }
        } else {
          initial[master.id] = scanDefaults[master.id] ?? ''
        }
      }
    } else {
      for (const mId of Object.keys(scanDefaults)) {
        initial[Number(mId)] = scanDefaults[Number(mId)]
      }
    }

    setRowState(initial)
    setMismatchState(mismatches)
  }

  const getMappings = (mainRows: MasterMappingRow[], notFoundRows: MasterMappingRow[]) =>
    [...mainRows, ...notFoundRows]
      .filter(r => r.node_id.trim() !== '')
      .map(r => ({ master_id: r.master.id, node_id: r.node_id.trim() }))

  return { buildRows, updateNodeId, initFromScan, getMappings }
}
