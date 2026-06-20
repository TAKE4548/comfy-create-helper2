import { useState } from 'react'
import type { MappingMaster, ScanResult } from '../api/types'

export interface MasterMappingRow {
  master: MappingMaster
  node_id: string
  candidates: string[]
  status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found'
  node_title?: string
}

export function useMasterMappingRows(
  masters: MappingMaster[],
  scanResult: ScanResult | null
) {
  const [rowState, setRowState] = useState<Record<number, string>>({})  // master_id -> node_id

  const buildRows = (): { mainRows: MasterMappingRow[]; notFoundRows: MasterMappingRow[] } => {
    if (!scanResult) return { mainRows: [], notFoundRows: [] }
    
    const matchedMap = new Map(scanResult.matched.map(m => [m.master_id, m]))
    const warningMap = new Map(scanResult.warnings.map(w => [w.master_id, w]))

    const mainRows: MasterMappingRow[] = []
    const notFoundRows: MasterMappingRow[] = []

    for (const master of masters) {  // masters は sort_order 順で渡される
      const matched = matchedMap.get(master.id)
      const warning = warningMap.get(master.id)

      if (matched) {
        // ok マッチ
        mainRows.push({
          master,
          node_id: rowState[master.id] ?? matched.node_id,
          candidates: [],
          status: 'ok',
          node_title: matched.node_title,
        })
      } else if (warning) {
        if (warning.status === 'not_found') {
          notFoundRows.push({
            master,
            node_id: rowState[master.id] ?? '',
            candidates: [],
            status: 'not_found',
          })
        } else if (warning.status === 'duplicated') {
          const candidates = warning.node_ids ?? []
          mainRows.push({
            master,
            node_id: rowState[master.id] ?? candidates[0] ?? '',
            candidates,
            status: 'duplicated',
          })
        } else if (warning.status === 'class_type_mismatch') {
          const candidates = warning.node_id ? [warning.node_id] : []
          mainRows.push({
            master,
            node_id: rowState[master.id] ?? warning.node_id ?? '',
            candidates,
            status: 'class_type_mismatch',
          })
        }
      } else {
        // マスタにのみ存在、スキャン結果になし → not_found扱い
        notFoundRows.push({
          master,
          node_id: rowState[master.id] ?? '',
          candidates: [],
          status: 'not_found',
        })
      }
    }

    return { mainRows, notFoundRows }
  }

  const updateNodeId = (master_id: number, node_id: string) => {
    setRowState(prev => ({ ...prev, [master_id]: node_id }))
  }

  const initFromScan = (result: ScanResult) => {
    // スキャン結果から初期node_idを設定（初回のみ）
    const initial: Record<number, string> = {}
    for (const m of result.matched) {
      initial[m.master_id] = m.node_id
    }
    for (const w of result.warnings) {
      if (w.status === 'duplicated' && w.node_ids?.[0]) initial[w.master_id] = w.node_ids[0]
      else if (w.status === 'class_type_mismatch' && w.node_id) initial[w.master_id] = w.node_id
    }
    setRowState(initial)
  }

  const getMappings = (mainRows: MasterMappingRow[], notFoundRows: MasterMappingRow[]) =>
    [...mainRows, ...notFoundRows]
      .filter(r => r.node_id.trim() !== '')
      .map(r => ({ master_id: r.master.id, node_id: r.node_id.trim() }))

  return { buildRows, updateNodeId, initFromScan, getMappings }
}
