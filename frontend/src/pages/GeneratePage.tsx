import { useState, useEffect, useRef } from 'react'
import {
  Zap, Shuffle, Lock, Download, Save,
  Loader2, ChevronRight, Wand2, AlertCircle, CheckCircle2,
  Plus, ImageOff,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, auditApi, snapshotsApi } from '../api/client'
import type { Workflow, AuditResult } from '../api/types'
import { useComfyWebSocket } from '../hooks/useComfyWebSocket'

const COMFY_URL = 'http://localhost:8188'

export function GeneratePage() {
  const qc = useQueryClient()
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [batchSize, setBatchSize] = useState(1)
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random')
  const [seed, setSeed] = useState(42)
  const [batchImages, setBatchImages] = useState<string[]>([])
  const [selectedImg, setSelectedImg] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditIntent, setAuditIntent] = useState('')
  const [auditTypes, setAuditTypes] = useState<string[]>(['interference'])
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'done'>('idle')

  const { queuePrompt, isGenerating, progress, previewImage, isConnected } = useComfyWebSocket()

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: workflow } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!) as Promise<Workflow>,
    enabled: !!selectedWorkflowId,
  })

  // Initialize params when workflow changes
  useEffect(() => {
    if (!workflow) return
    const init: Record<string, string> = {}
    workflow.mappings.forEach((m) => {
      if (m.input_type === 'textarea' || m.input_type === 'select') {
        init[m.role] = ''
      } else {
        init[m.role] = ''
      }
    })
    setParamValues(init)
  }, [workflow])

  // Show preview as latest batch image when done
  useEffect(() => {
    if (previewImage && !isGenerating) {
      setBatchImages((prev) => [previewImage, ...prev.slice(0, 7)])
      setSelectedImg(previewImage)
    }
  }, [previewImage, isGenerating])

  const runAudit = useMutation({
    mutationFn: async () => {
      setAuditStatus('loading')
      const pos = Object.entries(paramValues)
        .filter(([k]) => k.toLowerCase().includes('positive') || k.toLowerCase().includes('prompt'))
        .map(([, v]) => v)
        .join(', ')
      const res = await auditApi.run({
        audit_types: auditTypes,
        positive: pos,
        negative: paramValues['Negative_Prompt'] ?? '',
        intent: auditIntent,
        model_hint: 'SDXL',
      }) as AuditResult
      setAuditResult(res)
      setAuditStatus('done')
      return res
    },
  })

  const saveSnapshot = useMutation({
    mutationFn: async () => {
      if (!selectedWorkflowId || !selectedImg) return
      await snapshotsApi.create({
        workflow_id: selectedWorkflowId,
        image_path: selectedImg,
        params: paramValues,
      })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
    },
  })

  const handleGenerate = async () => {
    if (!workflow) return
    const wfJson = { ...workflow.json_body } as Record<string, unknown>
    // Inject params into workflow JSON
    workflow.mappings.forEach((m) => {
      const node = wfJson[m.node_id] as Record<string, unknown> | undefined
      if (!node) return
      const inputs = node.inputs as Record<string, unknown>
      if (!inputs) return
      const val = m.input_type === 'int'
        ? parseInt(paramValues[m.role] || '0')
        : m.input_type === 'float'
          ? parseFloat(paramValues[m.role] || '0')
          : paramValues[m.role] || ''
      inputs[m.param_name] = val
    })
    // Inject seed
    const seedNode = workflow.mappings.find((m) => m.role === 'Sampler_Seed')
    if (seedNode) {
      const node = wfJson[seedNode.node_id] as Record<string, unknown> | undefined
      if (node) {
        const inputs = node.inputs as Record<string, unknown>
        inputs['seed'] = seedMode === 'random' ? Math.floor(Math.random() * 2 ** 32) : seed
      }
    }
    setBatchImages([])
    await queuePrompt(wfJson)
  }

  // Group mappings by type
  const textMappings = workflow?.mappings.filter((m) => m.input_type === 'textarea') ?? []
  const paramMappings = workflow?.mappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed') ?? []

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Column */}
      <div className="w-[420px] xl:w-[480px] flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-zinc-200">Generate</h1>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
          </div>
          {/* Workflow selector */}
          <select
            id="workflow-select"
            value={selectedWorkflowId ?? ''}
            onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
            className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50"
          >
            <option value="">Select workflow…</option>
            {workflows?.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* LLM Audit Panel */}
          <div className="rounded-lg border border-[rgba(124,111,221,0.3)] bg-[rgba(124,111,221,0.05)] overflow-hidden">
            <button
              id="audit-toggle"
              onClick={() => setAuditOpen(!auditOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#7C6FDD] hover:bg-[rgba(124,111,221,0.1)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wand2 size={15} />
                <span>LLM Audit</span>
                {auditStatus === 'loading' && <Loader2 size={13} className="animate-spin" />}
                {auditStatus === 'done' && <CheckCircle2 size={13} className="text-accent-green" />}
              </div>
              <ChevronRight size={14} className={`transition-transform ${auditOpen ? 'rotate-90' : ''}`} />
            </button>

            {auditOpen && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <div className="flex gap-2 flex-wrap">
                  {(['interference', 'vocabulary', 'physical'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAuditTypes((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      )}
                      className={`text-xs px-2 py-1 rounded border transition-all ${
                        auditTypes.includes(t)
                          ? 'border-[#7C6FDD] bg-[rgba(124,111,221,0.2)] text-[#7C6FDD]'
                          : 'border-[rgba(255,255,255,0.1)] text-zinc-500'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  id="audit-intent"
                  placeholder="やりたいこと・変更したいこと…"
                  value={auditIntent}
                  onChange={(e) => setAuditIntent(e.target.value)}
                  rows={2}
                  className="w-full bg-[rgba(124,111,221,0.08)] border border-[rgba(124,111,221,0.2)] rounded-md px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-[#7C6FDD]/60"
                />
                <button
                  id="run-audit-btn"
                  onClick={() => runAudit.mutate()}
                  disabled={auditStatus === 'loading'}
                  className="w-full py-2 rounded-md bg-[#7C6FDD] text-white text-xs font-semibold hover:bg-[#6d62cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-purple"
                >
                  {auditStatus === 'loading' ? 'Running…' : 'Run Audit'}
                </button>

                {auditResult && (
                  <div className="space-y-2 text-xs">
                    {auditResult.interference && auditResult.interference.length > 0 && (
                      <div>
                        <p className="text-zinc-500 font-medium mb-1">Interference</p>
                        {auditResult.interference.map((item, i) => (
                          <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)]">
                            <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-red-300 font-mono">{item.tag}</span>
                              <span className="text-zinc-500 ml-2">{item.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {auditResult.vocabulary && auditResult.vocabulary.length > 0 && (
                      <div>
                        <p className="text-zinc-500 font-medium mb-1">Suggestions</p>
                        {auditResult.vocabulary.map((item, i) => (
                          <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)]">
                            <CheckCircle2 size={12} className="text-accent-green mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-accent-green font-mono">+{item.suggestion}</span>
                              <span className="text-zinc-500 ml-2">{item.effect}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prompt inputs */}
          {textMappings.length === 0 && !selectedWorkflowId && (
            <p className="text-center text-zinc-600 text-sm py-8">Select a workflow to begin.</p>
          )}
          {textMappings.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">{m.display_name}</label>
              <textarea
                id={`prompt-${m.role}`}
                value={paramValues[m.role] ?? ''}
                onChange={(e) => setParamValues((p) => ({ ...p, [m.role]: e.target.value }))}
                rows={3}
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-accent-green/40 custom-scrollbar transition-colors hover:border-[rgba(255,255,255,0.15)]"
                placeholder={`Enter ${m.display_name}…`}
              />
            </div>
          ))}

          {/* Parameters */}
          {paramMappings.length > 0 && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 p-3 space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Parameters</p>
              {paramMappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4">
                  <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
                  <input
                    id={`param-${m.role}`}
                    type="number"
                    value={paramValues[m.role] ?? ''}
                    onChange={(e) => setParamValues((p) => ({ ...p, [m.role]: e.target.value }))}
                    step={m.input_type === 'float' ? 0.1 : 1}
                    className="w-24 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                  />
                </div>
              ))}

              {/* Batch Size */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-zinc-400">Batch Size</label>
                <input
                  id="batch-size"
                  type="number"
                  min={1}
                  max={8}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-24 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                />
              </div>

              {/* Seed */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-zinc-400">Seed</label>
                <div className="flex items-center gap-2">
                  <button
                    id="seed-toggle"
                    onClick={() => setSeedMode((m) => m === 'random' ? 'fixed' : 'random')}
                    className={`p-1.5 rounded border transition-all ${
                      seedMode === 'random'
                        ? 'border-accent-green/50 text-accent-green bg-accent-green/10'
                        : 'border-[rgba(255,255,255,0.1)] text-zinc-500'
                    }`}
                    title={seedMode === 'random' ? 'Random seed' : 'Fixed seed'}
                  >
                    {seedMode === 'random' ? <Shuffle size={13} /> : <Lock size={13} />}
                  </button>
                  <input
                    id="seed-input"
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    disabled={seedMode === 'random'}
                    className="w-24 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main Preview */}
        <div className="flex-1 relative overflow-hidden bg-grid">
          {isGenerating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 size={32} className="animate-spin text-accent-green" />
              {progress && (
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Processing…</span>
                    <span>{progress.percentage}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full progress-shimmer rounded-full transition-all duration-200"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : selectedImg ? (
            <div className="relative h-full group">
              <img
                src={selectedImg}
                alt="Generated"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6 gap-3">
                <a
                  href={selectedImg}
                  download="generated.png"
                  id="download-btn"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface/90 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-sm font-medium hover:bg-surface"
                >
                  <Download size={15} />
                  Download
                </a>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
              <ImageOff size={40} strokeWidth={1} />
              <p className="text-sm">No image yet</p>
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {batchImages.length > 0 && (
          <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3">
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
              {batchImages.map((img, i) => (
                <button
                  key={i}
                  id={`thumb-${i}`}
                  onClick={() => setSelectedImg(img)}
                  className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                    selectedImg === img ? 'border-accent-green' : 'border-transparent hover:border-zinc-600'
                  }`}
                >
                  <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-3">
          <button
            id="generate-btn"
            onClick={handleGenerate}
            disabled={isGenerating || !selectedWorkflowId}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Zap size={16} />
                Generate Batch
              </>
            )}
          </button>
          <button
            id="save-snapshot-btn"
            onClick={() => saveSnapshot.mutate()}
            disabled={!selectedImg || saveSnapshot.isPending}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Save size={15} />
            <span className="hidden sm:inline">Save Snapshot</span>
          </button>
        </div>
      </div>
    </div>
  )
}
