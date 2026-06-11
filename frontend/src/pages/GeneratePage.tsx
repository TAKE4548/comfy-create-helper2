import { useState, useEffect } from 'react'
import {
  Zap, Shuffle, Lock, Download, Save,
  Loader2, ChevronRight, Wand2, AlertCircle, CheckCircle2,
  ImageOff, ScanLine, Plus, X,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, auditApi, snapshotsApi, mappingMastersApi, lorasApi, tagSetsApi, albumsApi } from '../api/client'
import type { Workflow, AuditResult, MappingMaster, Lora, TagSet, AlbumSummary } from '../api/types'
import { useGenerationStore } from '../store/useGenerationStore'
import { RescanModal } from '../components/RescanModal'
import { TagChipEditor } from '../components/TagChipEditor'

export function GeneratePage() {
  const isMobile = window.location.pathname.startsWith('/mobile') || window.innerWidth < 1024;
  const qc = useQueryClient()
  const [rescanOpen, setRescanOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditIntent, setAuditIntent] = useState('')
  const [auditTypes, setAuditTypes] = useState<string[]>(['interference'])
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [targetAlbumId, setTargetAlbumId] = useState<number | "">("")
  const [newAlbumName, setNewAlbumName] = useState("")

  const { data: albums } = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<AlbumSummary[]>,
  })

  const {
    clientId,
    isConnected,
    isGenerating,
    progress,
    activeClientId,
    filterOwnSession,
    setFilterOwnSession,
    selectedWorkflowId,
    setSelectedWorkflowId,
    paramValues,
    setParamValues,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    queuePrompt,
    appliedAssets,
    addAppliedAsset,
    removeAppliedAsset,
    toggleAppliedAsset,
  } = useGenerationStore()

  const [openAddAssetRole, setOpenAddAssetRole] = useState<string | null>(null)

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })

  const { data: workflow } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!) as Promise<Workflow>,
    enabled: !!selectedWorkflowId,
  })

  const [selectedMasters, setSelectedMasters] = useState<Record<number, number>>({})

  const { data: mappingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  const { data: loras } = useQuery({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
  })

  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
  })

  const handleAddLoraAsset = (role: string, lora: Lora) => {
    // 1. Calculate default strength (rounded to one decimal place)
    const min = lora.recommended_strength_min
    const max = lora.recommended_strength_max
    let strength = 1.0
    if (min != null && max != null) {
      strength = Math.round(((min + max) / 2) * 10) / 10
    } else if (min != null) {
      strength = min
    } else if (max != null) {
      strength = max
    }

    // 2. Extract filename without path and without extension
    const path = lora.file_path || lora.model_name || ''
    const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, "") || 'lora'

    // 3. Get first trigger set words or merge all trigger set words
    const twsWords = lora.trigger_word_sets && lora.trigger_word_sets.length > 0
      ? lora.trigger_word_sets[0].words
      : []

    // 4. Construct loraPromptString
    const loraPromptString = `<lora:${filename}:${strength}>`

    // 5. Add to store
    addAppliedAsset(role, {
      type: 'lora',
      assetId: lora.id,
      name: lora.description || filename,
      tags: twsWords,
      loraPromptString,
    })

    setOpenAddAssetRole(null)
  }

  const handleAddTagSetAsset = (role: string, ts: TagSet) => {
    addAppliedAsset(role, {
      type: 'tagset',
      assetId: ts.id,
      name: ts.name,
      tags: ts.tags || [],
    })
    setOpenAddAssetRole(null)
  }

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ workflowId, mappings }: { workflowId: number; mappings: { master_id: number; node_id: string }[] }) => {
      return workflowsApi.update(workflowId, { mappings })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedMasters({})
    },
  })

  const handleUpdateMapping = async (mappingId: number, newMasterId: number) => {
    if (!workflow || !selectedWorkflowId) return
    const updatedMappings = workflow.mappings.map((m) => {
      if (m.id === mappingId) {
        return { master_id: newMasterId, node_id: m.node_id }
      }
      return { master_id: m.master_id, node_id: m.node_id }
    })
    await updateWorkflowMutation.mutateAsync({
      workflowId: selectedWorkflowId,
      mappings: updatedMappings,
    })
  }

  // Initialize params when workflow changes
  useEffect(() => {
    if (!workflow) return
    console.log("DEBUG: Loading workflow params:", workflow.name)
    const init: Record<string, string> = {}
    const wfJson = (workflow.json_body || {}) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (m.role) {
        let val = ''
        if (m.node_id && m.param_name) {
          const node = wfJson[m.node_id]
          console.log(`DEBUG: Mapping [${m.role}] Node: ${m.node_id}, Param: ${m.param_name}, NodeExists: ${!!node}`)
          if (node && node.inputs) {
            console.log(`DEBUG: Node [${m.node_id}] inputs:`, node.inputs)
            if (node.inputs[m.param_name] !== undefined) {
              val = String(node.inputs[m.param_name])
            } else if (node.inputs['value'] !== undefined) {
              val = String(node.inputs['value'])
            }
          }
        }
        console.log(`DEBUG: Target [${m.role}] resolved value: "${val}"`)
        init[m.role] = val
      }
    })
    setParamValues(init)
  }, [workflow])



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
      
      const allApplied = Object.values(appliedAssets).flat()
      const activeLoras = allApplied
        .filter((a) => a.type === 'lora' && a.enabled)
        .map((a) => {
          let strength = 1.0
          if (a.loraPromptString) {
            const parts = a.loraPromptString.replace(/[<>]/g, '').split(':')
            if (parts.length >= 3) {
              strength = parseFloat(parts[2]) || 1.0
            }
          }
          return { lora_id: a.assetId, strength }
        })
      const activeTagSets = allApplied
        .filter((a) => a.type === 'tagset' && a.enabled)
        .map((a) => ({ tag_set_id: a.assetId }))

      await snapshotsApi.create({
        workflow_id: selectedWorkflowId,
        image_path: selectedImg,
        params: paramValues,
        album_id: targetAlbumId ? Number(targetAlbumId) : undefined,
        new_album_name: newAlbumName || undefined,
        loras: activeLoras,
        tag_sets: activeTagSets,
      })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['albums'] })
    },
    onSuccess: () => {
      setIsSaveModalOpen(false)
      setTargetAlbumId("")
      setNewAlbumName("")
    }
  })

  const handleGenerate = async () => {
    if (!workflow) return
    const wfJson = { ...workflow.json_body } as Record<string, unknown>
    // Inject params into workflow JSON
    workflow.mappings.forEach((m) => {
      if (!m.role || !m.param_name) return
      const node = wfJson[m.node_id] as Record<string, unknown> | undefined
      if (!node) return
      const inputs = node.inputs as Record<string, unknown>
      if (!inputs) return
      let val: string | number = ''
      if (m.input_type === 'int') {
        val = parseInt(paramValues[m.role] || '0')
      } else if (m.input_type === 'float') {
        val = parseFloat(paramValues[m.role] || '0.0')
      } else if (m.input_type === 'textarea') {
        const rawVal = paramValues[m.role] || ''
        const roleAssets = appliedAssets[m.role] || []
        const activeAssets = roleAssets.filter((a) => a.enabled)
        const assetTags = activeAssets.flatMap((a) => a.tags)
        const loraPrompts = activeAssets
          .filter((a) => a.type === 'lora' && a.loraPromptString)
          .map((a) => a.loraPromptString!)
        
        const allPieces = [rawVal, ...assetTags, ...loraPrompts].filter(Boolean)
        val = allPieces.join(', ')
      } else {
        val = paramValues[m.role] || ''
      }
      
      if (inputs[m.param_name] !== undefined) {
        inputs[m.param_name] = val
      } else if (inputs['value'] !== undefined) {
        inputs['value'] = val
      } else {
        inputs[m.param_name] = val
      }
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
    await queuePrompt(wfJson)
  }

  const isGeneratingHere = isGenerating && (!filterOwnSession || activeClientId === clientId)
  const displayImages = filterOwnSession ? batchImages : comfyHistoryImages
  const showStrip = batchImages.length > 0 || comfyHistoryImages.length > 0

  // Group mappings by type
  const validMappings = workflow?.mappings.filter((m) => m.role !== null && m.role !== undefined) ?? []
  const invalidMappings = workflow?.mappings.filter((m) => m.role === null || m.role === undefined) ?? []

  const textMappings = validMappings.filter((m) => m.input_type === 'textarea') ?? []
  const paramMappings = validMappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed') ?? []


  return (
    <>
    <div className="flex h-full overflow-hidden">
      {/* Left Column */}
      <div className="w-[420px] xl:w-[480px] flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-zinc-200">Generate</h1>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
            {isGenerating && activeClientId !== clientId && (
              <span className="text-[10px] text-zinc-500 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">
                他セッションで生成中...
              </span>
            )}
          </div>
          {/* Workflow selector + Rescan button */}
          <div className="flex items-center gap-2">
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
            <button
              id="rescan-btn"
              onClick={() => setRescanOpen(true)}
              disabled={!selectedWorkflowId}
              title="マッピングを再スキャン・修正"
              className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ScanLine size={14} />
            </button>
          </div>
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
                          <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                            <div className="flex gap-2 items-start">
                              <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="text-red-300 font-mono">{item.tag}</span>
                                <span className="text-zinc-500 ml-2">{item.reason}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag: item.tag } }));
                              }}
                              className="text-[10px] px-1.5 py-0.5 bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-900/30 rounded transition-colors"
                            >
                              無効化
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {auditResult.vocabulary && auditResult.vocabulary.length > 0 && (
                      <div>
                        <p className="text-zinc-500 font-medium mb-1">Suggestions</p>
                        {auditResult.vocabulary.map((item, i) => (
                          <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                            <div className="flex gap-2 items-start">
                              <CheckCircle2 size={12} className="text-accent-green mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="text-accent-green font-mono">+{item.suggestion}</span>
                                <span className="text-zinc-500 ml-2">{item.effect}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('tag-chip-editor:add-tag', { detail: { tag: item.suggestion } }));
                              }}
                              className="text-[10px] px-1.5 py-0.5 bg-emerald-950/30 hover:bg-emerald-900/40 text-accent-green border border-emerald-900/30 rounded transition-colors"
                            >
                              追加
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mapping Error Panel */}
          {selectedWorkflowId && invalidMappings.length > 0 && (
            <div className="rounded-lg border border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.05)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertCircle size={16} />
                <h3 className="text-xs font-semibold uppercase tracking-wider">マッピングエラー検出</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                ワークフロー内に紐付け先マスタが無効なノードがあります。正しい役割を選択して修正してください。
              </p>
              <div className="space-y-2.5 pt-1">
                {invalidMappings.map((m) => {
                  const currentSelectedMasterId = selectedMasters[m.id] ?? '';
                  return (
                    <div
                      key={m.id}
                      className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface-2/60 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-zinc-400">
                          Node ID: <strong className="text-zinc-200">{m.node_id}</strong>
                        </span>
                        <span className="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20">
                          エラー
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          id={`param-error-select-${m.node_id}`}
                          value={currentSelectedMasterId}
                          onChange={(e) => setSelectedMasters((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))}
                          className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-zinc-300 focus:outline-none focus:border-rose-500/40"
                        >
                          <option value="">役割を選択してください…</option>
                          {mappingMasters?.map((master) => (
                            <option key={master.id} value={master.id}>
                              {master.display_name} ({master.role})
                            </option>
                          ))}
                        </select>
                        <button
                          id={`param-error-fix-btn-${m.node_id}`}
                          onClick={() => handleUpdateMapping(m.id, Number(currentSelectedMasterId))}
                          disabled={!currentSelectedMasterId || updateWorkflowMutation.isPending}
                          className="px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {updateWorkflowMutation.isPending ? '保存中…' : '修正'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompt inputs */}
          {textMappings.length === 0 && !selectedWorkflowId && (
            <p className="text-center text-zinc-600 text-sm py-8">Select a workflow to begin.</p>
          )}
          {textMappings.map((m) => {
            const isNegative = m.role?.toLowerCase().includes('negative')
            const variant = isNegative ? 'negative' : 'positive'
            
            return (
              <div key={m.id} className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">{m.display_name}</label>
                  {/* Popover for Add Asset */}
                  <div className="relative">
                    <button
                      type="button"
                      id={`add-asset-btn-${m.role!}`}
                      onClick={() => setOpenAddAssetRole(openAddAssetRole === m.role ? null : m.role!)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all"
                    >
                      <Plus size={10} />
                      Add Asset
                    </button>
                    {openAddAssetRole === m.role && (
                      <div className="absolute right-0 mt-1 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-20 max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-3">
                        {/* LoRAs Section */}
                        <div>
                          <p className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">LoRAs</p>
                          <div className="space-y-0.5 mt-1">
                            {loras && loras.length > 0 ? (
                              loras.map((lora) => (
                                <button
                                  type="button"
                                  key={lora.id}
                                  onClick={() => handleAddLoraAsset(m.role!, lora)}
                                  className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-350 hover:bg-white/5 hover:text-white truncate"
                                  title={lora.description || lora.model_name}
                                >
                                  {lora.description || lora.model_name.split('/').pop()?.replace('.safetensors', '')}
                                </button>
                              ))
                            ) : (
                              <p className="text-[10px] text-zinc-650 px-2 py-1 italic">No LoRAs found</p>
                            )}
                          </div>
                        </div>
                        {/* Tag Sets Section */}
                        <div>
                          <p className="text-[10px] font-semibold text-[#7C6FDD] uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">Tag Sets</p>
                          <div className="space-y-0.5 mt-1">
                            {tagSets && tagSets.length > 0 ? (
                              tagSets.map((ts) => (
                                <button
                                  type="button"
                                  key={ts.id}
                                  onClick={() => handleAddTagSetAsset(m.role!, ts)}
                                  className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-350 hover:bg-white/5 hover:text-white truncate"
                                  title={ts.description || ts.name}
                                >
                                  {ts.name}
                                </button>
                              ))
                            ) : (
                              <p className="text-[10px] text-zinc-650 px-2 py-1 italic">No Tag Sets found</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {isMobile ? (
                  <textarea
                    id={`prompt-${m.role!}`}
                    value={paramValues[m.role!] ?? ''}
                    onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                    placeholder={`Enter ${m.display_name}…`}
                    className="w-full min-h-[80px] bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-sm text-[#E4E4E7] placeholder-zinc-650 resize-y focus:outline-none focus:border-accent-green/40"
                  />
                ) : (
                  <TagChipEditor
                    id={`prompt-${m.role!}`}
                    value={paramValues[m.role!] ?? ''}
                    onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                    placeholder={`Enter ${m.display_name}…`}
                    variant={variant}
                  />
                )}
                
                {/* Applied Asset Chips */}
                {appliedAssets[m.role!] && appliedAssets[m.role!].length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {appliedAssets[m.role!].map((asset) => (
                      <div
                        key={asset.id}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] transition-all ${
                          asset.enabled
                            ? asset.type === 'lora'
                              ? 'bg-accent-green/5 text-accent-green border-accent-green/20'
                              : 'bg-[#7C6FDD]/5 text-[#a99ef7] border-[#7C6FDD]/20'
                            : 'bg-zinc-900/60 text-zinc-600 border-zinc-800/80 opacity-40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={asset.enabled}
                          onChange={() => toggleAppliedAsset(m.role!, asset.id)}
                          className="w-3 h-3 rounded border-zinc-800 accent-accent-green cursor-pointer"
                        />
                        <span
                          className="font-medium select-none cursor-pointer"
                          onClick={() => toggleAppliedAsset(m.role!, asset.id)}
                        >
                          {asset.type === 'lora' ? 'LoRA: ' : 'TagSet: '}{asset.name}
                          {asset.type === 'lora' && asset.loraPromptString && (
                            <span className="text-[9px] opacity-75 ml-1 font-mono">({asset.loraPromptString.split(':').pop()?.replace('>', '')})</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAppliedAsset(m.role!, asset.id)}
                          className="text-current/40 hover:text-red-400 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Parameters */}
          {paramMappings.length > 0 && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 p-3 space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Parameters</p>
              {paramMappings.map((m) => {
                if (m.input_type === 'select') {
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-4">
                      <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
                      <select
                        id={`param-${m.role!}`}
                        value={paramValues[m.role!] ?? ''}
                        onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                        className="w-48 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
                      >
                        <option value="">Select option…</option>
                        {loras?.map((lora) => (
                          <option key={lora.id} value={lora.model_name}>
                            {lora.model_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                }

                return (
                  <div key={m.id} className="flex items-center justify-between gap-4">
                    <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
                    <input
                      id={`param-${m.role!}`}
                      type="number"
                      value={paramValues[m.role!] ?? ''}
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      step={m.input_type === 'float' ? 0.1 : 1}
                      className="w-24 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                    />
                  </div>
                )
              })}

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
                    onClick={() => setSeedMode(seedMode === 'random' ? 'fixed' : 'random')}
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
          {isGeneratingHere ? (
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
        {showStrip && (
          <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-medium">History</span>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="session-filter-toggle"
                  checked={filterOwnSession}
                  onChange={(e) => setFilterOwnSession(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer"
                />
                <span className="text-[11px] text-zinc-400">自セッションのみ表示</span>
              </label>
            </div>
            {displayImages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                {displayImages.map((img, i) => (
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
            ) : (
              <p className="text-xs text-zinc-600 py-2">No history images found for this session.</p>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-3">
          <button
            id="generate-btn"
            onClick={handleGenerate}
            disabled={(isGenerating && activeClientId === clientId) || !selectedWorkflowId}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95"
          >
            {isGenerating && activeClientId === clientId ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing…
              </>
            ) : isGenerating && activeClientId !== clientId ? (
              <>
                <Zap size={16} />
                Generate Batch (キュー追加)
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
            onClick={() => setIsSaveModalOpen(true)}
            disabled={!selectedImg}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Save size={15} />
            <span className="hidden sm:inline">Save Snapshot</span>
          </button>
        </div>
      </div>
    </div>

    {/* Rescan Modal */}
    {rescanOpen && workflow && (
      <RescanModal
        workflowId={selectedWorkflowId!}
        workflowJson={workflow.json_body}
        onClose={() => setRescanOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
          setRescanOpen(false)
        }}
      />
    )}

    {/* Save Snapshot Modal */}
    {isSaveModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
        <div 
          className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-200">スナップショットを保存</h3>
            <button
              id="close-save-modal-btn"
              onClick={() => {
                setIsSaveModalOpen(false)
                setTargetAlbumId("")
                setNewAlbumName("")
              }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Album selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">保存先アルバム</label>
              <select
                id="save-album-select"
                value={targetAlbumId}
                onChange={(e) => {
                  setTargetAlbumId(e.target.value === "" ? "" : Number(e.target.value))
                }}
                disabled={!!newAlbumName}
                className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-40 transition-all"
              >
                <option value="">アルバムを選択しない (None)</option>
                {albums?.map((album) => (
                  <option key={album.id} value={album.id}>
                    {album.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center py-1">
              <span className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
              <span className="text-[10px] text-zinc-600 px-3 uppercase tracking-wider">or</span>
              <span className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
            </div>

            {/* New Album input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">新規アルバムを作成して保存</label>
              <input
                id="new-album-name-input"
                type="text"
                placeholder="新規アルバム名を入力…"
                value={newAlbumName}
                onChange={(e) => {
                  setNewAlbumName(e.target.value)
                  if (e.target.value) {
                    setTargetAlbumId("")
                  }
                }}
                className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-accent-green/50 transition-all"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              id="cancel-save-modal-btn"
              onClick={() => {
                setIsSaveModalOpen(false)
                setTargetAlbumId("")
                setNewAlbumName("")
              }}
              className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all"
            >
              キャンセル
            </button>
            <button
              id="confirm-save-modal-btn"
              onClick={() => saveSnapshot.mutate()}
              disabled={saveSnapshot.isPending}
              className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all glow-green flex items-center gap-2"
            >
              {saveSnapshot.isPending && <Loader2 size={14} className="animate-spin" />}
              {saveSnapshot.isPending ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
