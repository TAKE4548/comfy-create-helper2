import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Wand2, ChevronDown, Save, RefreshCw } from 'lucide-react'
import { llmPromptsApi } from '../api/client'
import type { LlmPrompt } from '../api/types'

export function SettingsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    },
  })

  const handleEdit = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  const promptLabels: Record<string, string> = {
    audit_interference: '干渉タグ診断（SDXL/汎用）',
    audit_interference_anima: '干渉タグ診断（Anima）',
    audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
    audit_physical: '物理・構図整合性チェック',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <Settings size={17} className="text-zinc-400" />
        <h1 className="text-base font-semibold text-zinc-200">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* LLM System Prompts Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2>
            <span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading prompts…
            </div>
          ) : (
            <div className="space-y-3">
              {prompts?.map((p) => (
                <div
                  key={p.key}
                  id={`prompt-section-${p.key}`}
                  className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden"
                >
                  <button
                    id={`prompt-expand-${p.key}`}
                    onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-zinc-200">
                        {promptLabels[p.key] ?? p.key}
                      </p>
                      {p.description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <span className="text-xs text-zinc-600">
                        {new Date(p.updated_at).toLocaleDateString('ja-JP')}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-zinc-500 transition-transform ${expanded === p.key ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {expanded === p.key && (
                    <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                      <textarea
                        id={`prompt-content-${p.key}`}
                        value={getContent(p)}
                        onChange={(e) => handleEdit(p.key, e.target.value)}
                        rows={16}
                        className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          id={`prompt-reset-${p.key}`}
                          onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[p.key]; return n })}
                          disabled={!edits[p.key]}
                          className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                        >
                          Reset changes
                        </button>
                        <button
                          id={`prompt-save-${p.key}`}
                          onClick={() => updatePrompt.mutate({ key: p.key, content: getContent(p) })}
                          disabled={updatePrompt.isPending}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            saved === p.key
                              ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                              : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                          }`}
                        >
                          <Save size={12} />
                          {saved === p.key ? 'Saved!' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Connections Status */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
          </div>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-3">
            {[
              { label: 'FastAPI Backend', url: 'http://localhost:8000/health' },
              { label: 'ComfyUI', url: 'http://localhost:8188' },
            ].map(({ label, url }) => (
              <ConnectionStatus key={url} label={label} url={url} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ConnectionStatus({ label, url }: { label: string; url: string }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')

  const check = async () => {
    setStatus('checking')
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) })
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-600 font-mono">{url}</p>
      </div>
      <div className="flex items-center gap-2">
        {status !== 'idle' && (
          <div className={`w-2 h-2 rounded-full ${
            status === 'checking' ? 'bg-zinc-500 animate-pulse' :
            status === 'ok' ? 'bg-accent-green' : 'bg-red-500'
          }`} />
        )}
        <button
          id={`check-${label.replace(/\s+/g, '-').toLowerCase()}`}
          onClick={check}
          className="text-xs px-2 py-1 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all"
        >
          {status === 'checking' ? 'Checking…' : 'Ping'}
        </button>
      </div>
    </div>
  )
}
