import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { MappingNodeSelector, type RankedNodeCandidate } from './MappingNodeSelector'

export interface EditableSlot {
  slotKey: string
  masterId: number
  variantId?: number
  stageId?: number
  stageName: string
  roleLabel: string
  nodeId: string
  enabled: boolean
  missingReference: boolean
  candidates: readonly RankedNodeCandidate[]
}

export interface WorkflowMappingEditorProps {
  rows: readonly EditableSlot[]
  onChangeSlot: (key: string, id: string) => void
  onToggleSlot: (key: string, enabled: boolean) => void
  onToggleStage: (stageId: number, enabled: boolean) => void
  saving?: boolean
}

interface MappingSlotRowProps {
  row: EditableSlot
  saving: boolean
  onChangeSlot: WorkflowMappingEditorProps['onChangeSlot']
  onToggleSlot: WorkflowMappingEditorProps['onToggleSlot']
}

const MappingSlotRow = memo(function MappingSlotRow({ row, saving, onChangeSlot, onToggleSlot }: MappingSlotRowProps) {
  const isUnused = row.enabled && row.nodeId === ''
  return (
    <div
      data-testid={`mapping-slot-${row.slotKey}`}
      className={`grid grid-cols-[minmax(8rem,1fr)_minmax(10rem,2fr)_auto] items-center gap-2 rounded border border-zinc-800 p-2 ${!row.enabled ? 'bg-zinc-950 ' : ''}${row.nodeId ? '' : 'bg-zinc-900/50'}`}
    >
      <div className={`min-w-0 text-sm text-zinc-200 ${row.enabled ? '' : 'opacity-40'}`}>
        <span className="block truncate font-medium">{row.roleLabel}</span>
        <span className="mt-0.5 block truncate text-sm text-zinc-400">{row.stageName}{row.missingReference ? ' · 参照先なし' : ''}</span>
        {isUnused && <span className="block text-xs text-zinc-400">未割当</span>}
      </div>
      <div className={row.enabled ? '' : 'opacity-40'}>
        <MappingNodeSelector value={row.nodeId} candidates={row.candidates} readOnly={!row.enabled || saving} onChange={(id) => onChangeSlot(row.slotKey, id)} />
      </div>
      <label className="flex items-center gap-1 text-xs text-zinc-200">
        <input type="checkbox" aria-label={`${row.roleLabel}有効`} checked={row.enabled} disabled={saving} onChange={(event) => onToggleSlot(row.slotKey, event.target.checked)} />
        有効
      </label>
    </div>
  )
}, (previous, next) => previous.saving === next.saving
  && previous.onChangeSlot === next.onChangeSlot
  && previous.onToggleSlot === next.onToggleSlot
  && previous.row.slotKey === next.row.slotKey
  && previous.row.stageName === next.row.stageName
  && previous.row.roleLabel === next.row.roleLabel
  && previous.row.nodeId === next.row.nodeId
  && previous.row.enabled === next.row.enabled
  && previous.row.missingReference === next.row.missingReference
  && previous.row.candidates === next.row.candidates)

export function WorkflowMappingEditor({ rows, onChangeSlot, onToggleSlot, onToggleStage, saving = false }: WorkflowMappingEditorProps) {
  const callbacks = useRef({ onChangeSlot, onToggleSlot })
  useLayoutEffect(() => { callbacks.current = { onChangeSlot, onToggleSlot } }, [onChangeSlot, onToggleSlot])
  const changeSlot = useCallback((key: string, id: string) => callbacks.current.onChangeSlot(key, id), [])
  const toggleSlot = useCallback((key: string, enabled: boolean) => callbacks.current.onToggleSlot(key, enabled), [])
  const stages = useMemo(() => {
    const seen = new Set<number>()
    return rows.flatMap((row) => row.stageId == null || seen.has(row.stageId) ? [] : (seen.add(row.stageId), [{ id: row.stageId, name: row.stageName }]))
  }, [rows])

  return (
    <div className="space-y-3" aria-label="ワークフローマッピング">
      {stages.length > 0 && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2" aria-label="ステージ一括有効設定">
        {stages.map((stage) => {
          const stageRows = rows.filter((row) => row.stageId === stage.id)
          const enabledCount = stageRows.filter((row) => row.enabled).length
          const enabled = stageRows.length > 0 && enabledCount === stageRows.length
          const mixed = enabledCount > 0 && enabledCount < stageRows.length
          return <label key={stage.id} className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <input
              type="checkbox"
              aria-label={`${stage.name}ステージ有効`}
              aria-checked={mixed ? 'mixed' : enabled}
              checked={enabled}
              ref={(element) => { if (element) element.indeterminate = mixed }}
              disabled={saving}
              onChange={(event) => onToggleStage(stage.id, event.target.checked)}
            />
            {stage.name}
            {mixed && <span className="text-xs font-normal text-amber-300">一部無効</span>}
          </label>
        })}
      </div>}
      <div className="space-y-2">
        {rows.map((row) => <MappingSlotRow key={row.slotKey} row={row} saving={saving} onChangeSlot={changeSlot} onToggleSlot={toggleSlot} />)}
      </div>
    </div>
  )
}
