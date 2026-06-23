import { AlertCircle } from 'lucide-react'
import type { MappingMaster } from '../../../api/types'

export interface MappingErrorPanelProps {
  selectedWorkflowId: number | null
  invalidMappings: any[]
  selectedMasters: Record<number, number>
  setSelectedMasters: (prev: Record<number, number> | ((prev: Record<number, number>) => Record<number, number>)) => void
  mappingMasters?: MappingMaster[]
  handleUpdateMapping: (id: number, masterId: number) => void
  isUpdatingMapping: boolean
}

export const MappingErrorPanel = ({
  selectedWorkflowId,
  invalidMappings,
  selectedMasters,
  setSelectedMasters,
  mappingMasters,
  handleUpdateMapping,
  isUpdatingMapping,
}: MappingErrorPanelProps) => {
  if (!selectedWorkflowId || invalidMappings.length === 0) return null
  return (
    <div className="rounded-lg border border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.05)] p-4 space-y-3">
      <div className="flex items-center gap-2 text-rose-400"><AlertCircle size={16} /><h3 className="text-xs font-semibold uppercase tracking-wider">マッピングエラー検出</h3></div>
      <p className="text-xs text-zinc-400 leading-relaxed">ワークフロー内に紐付け先マスタが無効なノードがあります。正しい役割を選択して修正してください。</p>
      <div className="space-y-2.5 pt-1">
        {invalidMappings.map((m) => {
          const currentSelectedMasterId = selectedMasters[m.id] ?? ''
          return (
            <div key={m.id} className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface-2/60 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-400">Node ID: <strong className="text-zinc-200">{m.node_id}</strong></span>
                <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20">エラー</span>
              </div>
              <div className="flex items-center gap-2">
                <select id={`param-error-select-${m.node_id}`} value={currentSelectedMasterId}
                  onChange={(e) => setSelectedMasters((prev: Record<number, number>) => ({ ...prev, [m.id]: Number(e.target.value) }))}
                  className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-zinc-300 focus:outline-none focus:border-rose-500/40">
                  <option value="">役割を選択してください…</option>
                  {mappingMasters?.map((master) => <option key={master.id} value={master.id}>{master.display_name} ({master.role})</option>)}
                </select>
                <button id={`param-error-fix-btn-${m.node_id}`}
                  onClick={() => handleUpdateMapping(m.id, Number(currentSelectedMasterId))}
                  disabled={!currentSelectedMasterId || isUpdatingMapping}
                  className="px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold transition-all disabled:opacity-40">
                  {isUpdatingMapping ? '保存中…' : '修正'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
