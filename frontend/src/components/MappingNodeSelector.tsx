import { useEffect, useRef, useState } from 'react'
import { candidateConfidenceLabel, candidateReasonLabel, candidateStageLabel, candidateTierBadgeClass } from '../utils/workflowCandidatePresentation'
import type { RankedNodeCandidate } from '../utils/workflowNodeUtils'
export type { RankedNodeCandidate } from '../utils/workflowNodeUtils'

export interface MappingNodeSelectorProps {
  value: string
  candidates: readonly RankedNodeCandidate[]
  readOnly: boolean
  onChange: (id: string) => void
}

function CandidateBadge({ candidate }: { candidate: RankedNodeCandidate }) {
  return <span title="適合スコア" className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-semibold ${candidateTierBadgeClass(candidate.tier)}`}>
    {candidateConfidenceLabel(candidate)}
  </span>
}

export function MappingNodeSelector({ value, candidates, readOnly, onChange }: MappingNodeSelectorProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const restoringFocus = useRef(false)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const select = (id: string) => {
    onChange(id)
    setOpen(false)
    restoringFocus.current = true
    input.current?.focus()
    restoringFocus.current = false
    setEditing(false)
  }
  const selectedCandidate = value ? candidates.find((candidate) => candidate.id === value) : undefined

  return (
    <div ref={root} className="relative">
      <div
        onClick={() => {
          if (readOnly) return
          input.current?.focus()
          setOpen(true)
          setEditing(true)
        }}
        className={`flex min-w-0 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 ${readOnly ? 'cursor-not-allowed' : 'cursor-text'}`}
      >
      <input
        ref={input}
        aria-label="ノードID"
        value={value}
        readOnly={readOnly}
        onFocus={() => { if (!readOnly && !restoringFocus.current) { setOpen(true); setEditing(true) } }}
        onBlur={() => setEditing(false)}
        onChange={(event) => { if (!readOnly) onChange(event.target.value) }}
        onKeyDown={(event) => {
          if (readOnly) return
          if (event.key === 'Escape') { setOpen(false); return }
          if (event.key === 'Enter' && open) {
            const first = candidates[0]
            if (first) { event.preventDefault(); select(first.id) }
          }
          if (event.key === 'Tab') setOpen(false)
        }}
        className={`${value && !editing ? 'w-16 shrink-0' : 'w-full'} min-w-0 bg-transparent outline-none ${readOnly ? 'cursor-not-allowed' : ''}`}
      />
      {value && !editing && <div className="flex min-w-0 flex-1 items-center gap-2 text-xs" aria-label="選択中のノード">
        <span className="min-w-0 flex-1 truncate text-zinc-300" title={selectedCandidate ? `${selectedCandidate.title} (${selectedCandidate.classType})` : value}>
          {selectedCandidate
            ? `${selectedCandidate.title} · ${selectedCandidate.classType}`
            : '参照先なし'}
        </span>
        {selectedCandidate && <CandidateBadge candidate={selectedCandidate} />}
      </div>}
      </div>
      {open && !readOnly && (
        <div role="listbox" aria-label="候補ノード" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-950 shadow-xl">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="option"
              aria-selected={candidate.id === value}
              onClick={() => select(candidate.id)}
              className="flex w-full items-start gap-2 px-2 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 focus:bg-zinc-800"
            >
              <CandidateBadge candidate={candidate} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{candidate.title || candidate.classType} · {candidate.classType} · ID {candidate.id}</span>
                <span className="block text-xs text-zinc-300">{candidate.reasons.map(candidateReasonLabel).join(' · ')}{candidate.tier <= 1 ? ` · ${candidateStageLabel(candidate.stageRank)}` : ''}{candidate.recommended ? ' · 推奨' : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
