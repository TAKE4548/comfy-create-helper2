import { Loader2, CheckCircle2, ChevronRight, Wand2, AlertCircle } from 'lucide-react'

export interface AuditPanelProps {
  auditOpen: boolean
  setAuditOpen: (open: boolean) => void
  auditStatus: 'idle' | 'loading' | 'done' | 'error'
  auditResult: any
  auditTypes: string[]
  setAuditTypes: (types: string[] | ((prev: string[]) => string[])) => void
  auditIntent: string
  setAuditIntent: (intent: string) => void
  runAudit: () => void
}

export const AuditPanel = ({
  auditOpen,
  setAuditOpen,
  auditStatus,
  auditResult,
  auditTypes,
  setAuditTypes,
  auditIntent,
  setAuditIntent,
  runAudit,
}: AuditPanelProps) => (
  <div className="rounded-lg border border-[rgba(124,111,221,0.3)] bg-[rgba(124,111,221,0.05)] overflow-hidden">
    <button id="audit-toggle" onClick={() => setAuditOpen(!auditOpen)}
      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#7C6FDD] hover:bg-[rgba(124,111,221,0.1)] transition-colors">
      <div className="flex items-center gap-2">
        <Wand2 size={15} /><span>LLM Audit</span>
        {auditStatus === 'loading' && <Loader2 size={13} className="animate-spin" />}
        {auditStatus === 'done' && <CheckCircle2 size={13} className="text-accent-green" />}
      </div>
      <ChevronRight size={14} className={`transition-transform ${auditOpen ? 'rotate-90' : ''}`} />
    </button>
    {auditOpen && (
      <div className="px-4 pb-4 space-y-3 animate-fade-in">
        <div className="flex gap-2 flex-wrap">
          {(['interference', 'vocabulary', 'physical'] as const).map((t) => (
            <button key={t} onClick={() => setAuditTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
              className={`text-xs px-2 py-1 rounded border transition-all ${auditTypes.includes(t) ? 'border-[#7C6FDD] bg-[rgba(124,111,221,0.2)] text-[#7C6FDD]' : 'border-[rgba(255,255,255,0.1)] text-zinc-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <textarea id="audit-intent" placeholder="やりたいこと・変更したいこと…" value={auditIntent}
          onChange={(e) => setAuditIntent(e.target.value)} rows={2}
          className="w-full bg-[rgba(124,111,221,0.08)] border border-[rgba(124,111,221,0.2)] rounded-md px-3 py-2 text-xs text-zinc-300 placeholder-zinc-650 resize-none focus:outline-none focus:border-[#7C6FDD]/60" />
        <button id="run-audit-btn" onClick={runAudit} disabled={auditStatus === 'loading'}
          className="w-full py-2 rounded-md bg-[#7C6FDD] text-white text-xs font-semibold hover:bg-[#6d62cc] disabled:opacity-50 transition-all glow-purple">
          {auditStatus === 'loading' ? 'Running…' : 'Run Audit'}
        </button>
        {auditResult && (
          <div className="space-y-2 text-xs">
            {auditResult.interference && auditResult.interference.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 font-medium mb-1">Interference</p>
                {auditResult.interference.map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                    <div className="flex gap-2 items-start">
                      <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <div><span className="text-red-300 font-mono">{item.tag}</span><span className="text-zinc-555 ml-2">{item.reason}</span></div>
                    </div>
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag: item.tag } }))}
                      className="text-[10px] px-1.5 py-0.5 bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-900/30 rounded transition-colors">無効化</button>
                  </div>
                ))}
              </div>
            )}
            {auditResult.vocabulary && auditResult.vocabulary.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-500 font-medium mb-1">Suggestions</p>
                {auditResult.vocabulary.map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                    <div className="flex gap-2 items-start">
                      <CheckCircle2 size={12} className="text-accent-green mt-0.5 flex-shrink-0" />
                      <div><span className="text-accent-green font-mono">+{item.suggestion}</span><span className="text-zinc-555 ml-2">{item.effect}</span></div>
                    </div>
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tag-chip-editor:add-tag', { detail: { tag: item.suggestion } }))}
                      className="text-[10px] px-1.5 py-0.5 bg-emerald-950/30 hover:bg-emerald-900/40 text-accent-green border border-emerald-900/30 rounded transition-colors">追加</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>
)
