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
import { HistoryModalPreview } from '../components/HistoryModalPreview'

interface SnapshotSummaryWithParams {
  id: number
  workflow_id: number
  image_path: string | null
  created_at: string
  params?: Record<string, any>
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const pad = (num: number) => String(num).padStart(2, '0')
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const min = pad(d.getMinutes())
    const ss = pad(d.getSeconds())
    return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`
  } catch {
    return dateStr
  }
}

function getPromptPrefix(params?: Record<string, any>): string {
  if (!params) return ''
  const posKey = Object.keys(params).find(key => {
    const k = key.toLowerCase()
    return (k.includes('positive') || k.includes('prompt')) && !k.includes('negative')
  })
  if (!posKey) return ''
  const promptVal = String(params[posKey] || '')
  if (promptVal.length <= 25) return promptVal
  return promptVal.slice(0, 25) + '...'
}

export function GeneratePage() {
  const [isMobile, setIsMobile] = useState(() => {
    return window.location.pathname.startsWith('/mobile') || window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.location.pathname.startsWith('/mobile') || window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activePromptTab, setActivePromptTab] = useState<string>('');
  const qc = useQueryClient()
  const [rescanOpen, setRescanOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditIntent, setAuditIntent] = useState('')
  const [auditTypes, setAuditTypes] = useState<string[]>(['interference'])
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
  const [auditStatus, setAuditStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | ''>('')
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [targetAlbumId, setTargetAlbumId] = useState<number | "">("")
  const [newAlbumName, setNewAlbumName] = useState("")
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)

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

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummaryWithParams[]>,
    enabled: !!selectedWorkflowId,
  })

  const handleLoadSnapshot = (id: number) => {
    const snapshot = snapshots?.find((s) => s.id === id)
    if (snapshot && snapshot.params) {
      const newParams: Record<string, string> = {}
      Object.entries(snapshot.params).forEach(([key, val]) => {
        newParams[key] = String(val)
      })
      setParamValues(newParams)

      if (snapshot.params['Sampler_Seed'] !== undefined) {
        const seedVal = Number(snapshot.params['Sampler_Seed'])
        if (!isNaN(seedVal)) {
          setSeed(seedVal)
          setSeedMode('fixed')
        }
      }
    }
    setSelectedSnapshotId('')
  }

  useEffect(() => {
    setSelectedSnapshotId('')
  }, [selectedWorkflowId])
  const [selectedLoraForModal, setSelectedLoraForModal] = useState<{ role: string; lora: Lora } | null>(null)
  const [selectedTriggerSetId, setSelectedTriggerSetId] = useState<number | 'default'>('default')
  const [loraStrength, setLoraStrength] = useState<number>(1.0)

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

  const handleAddLoraAsset = (
    role: string,
    lora: Lora,
    strength: number,
    triggerSetId: number | 'default'
  ) => {
    // 1. Extract filename without path and without extension
    const path = lora.file_path || lora.model_name || ''
    const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, "") || 'lora'

    // 2. Get words from the selected trigger set
    let twsWords: string[] = []
    if (triggerSetId !== 'default') {
      const selectedSet = lora.trigger_word_sets?.find(s => s.id === triggerSetId)
      if (selectedSet) {
        twsWords = selectedSet.words
      }
    }

    // 3. Construct loraPromptString
    const loraPromptString = `<lora:${filename}:${strength.toFixed(1)}>`

    // 4. Add to store
    addAppliedAsset(role, {
      type: 'lora',
      assetId: lora.id,
      name: lora.description || filename,
      tags: twsWords,
      loraPromptString,
    })
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

  const saveDefaultParamsMutation = useMutation({
    mutationFn: async ({ workflowId, json_body }: { workflowId: number; json_body: Record<string, unknown> }) => {
      return workflowsApi.update(workflowId, { json_body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
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
    
    const savedStr = localStorage.getItem("prompt-surgeon-params-wf-" + workflow.id)
    if (savedStr) {
      try {
        const savedParams = JSON.parse(savedStr)
        setParamValues(savedParams)
        return
      } catch (e) {
        console.error("Failed to parse workflow saved params:", e)
      }
    }

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
    localStorage.setItem("prompt-surgeon-params-wf-" + workflow.id, JSON.stringify(init))
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

  const handleSaveDefaultParams = async () => {
    if (!workflow || !selectedWorkflowId) return
    const wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (!m.role || !m.param_name) return
      const node = wfJson[m.node_id]
      if (!node || !node.inputs) return
      
      let val: string | number = ''
      if (m.input_type === 'int') {
        val = parseInt(paramValues[m.role] || '0')
      } else if (m.input_type === 'float') {
        val = parseFloat(paramValues[m.role] || '0.0')
      } else {
        val = paramValues[m.role] || ''
      }

      if (node.inputs[m.param_name] !== undefined) {
        node.inputs[m.param_name] = val
      } else if (node.inputs['value'] !== undefined) {
        node.inputs['value'] = val
      } else {
        node.inputs[m.param_name] = val
      }
    })

    await saveDefaultParamsMutation.mutateAsync({
      workflowId: selectedWorkflowId,
      json_body: wfJson,
    })

    localStorage.setItem("prompt-surgeon-params-wf-" + selectedWorkflowId, JSON.stringify(paramValues))
  }

  const handleResetDefaultParams = () => {
    if (!workflow || !selectedWorkflowId) return
    const init: Record<string, string> = {}
    const wfJson = (workflow.json_body || {}) as Record<string, any>
    workflow.mappings.forEach((m) => {
      if (m.role) {
        let val = ''
        if (m.node_id && m.param_name) {
          const node = wfJson[m.node_id]
          if (node && node.inputs) {
            if (node.inputs[m.param_name] !== undefined) {
              val = String(node.inputs[m.param_name])
            } else if (node.inputs['value'] !== undefined) {
              val = String(node.inputs['value'])
            }
          }
        }
        init[m.role] = val
      }
    })
    setParamValues(init)
    localStorage.setItem("prompt-surgeon-params-wf-" + selectedWorkflowId, JSON.stringify(init))
  }

  const handleGenerate = async () => {
    if (!workflow) return
    for (let i = 0; i < batchSize; i++) {
      const wfJson = JSON.parse(JSON.stringify(workflow.json_body)) as Record<string, unknown>
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
          val = paramValues[m.role] || ''
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
          inputs['seed'] = seedMode === 'random' ? Math.floor(Math.random() * 2 ** 32) : seed + i
        }
      }
      await queuePrompt(wfJson)
    }
  }

  const isGeneratingHere = isGenerating && (!filterOwnSession || activeClientId === clientId)
  const displayImages = filterOwnSession ? batchImages : comfyHistoryImages
  const snapshotIdsForDisplay = displayImages.map((img) => {
    const found = snapshots?.find((s) => s.image_path === img)
    return found ? found.id : null
  })
  const showStrip = batchImages.length > 0 || comfyHistoryImages.length > 0
  const hasHistory = !!selectedWorkflowId && !!snapshots && snapshots.length > 0

  // Group mappings by type
  const validMappings = workflow?.mappings.filter((m) => m.role !== null && m.role !== undefined) ?? []
  const invalidMappings = workflow?.mappings.filter((m) => m.role === null || m.role === undefined) ?? []

  const textMappings = validMappings.filter((m) => m.input_type === 'textarea') ?? []
  const paramMappings = validMappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed') ?? []

  useEffect(() => {
    const valid = workflow?.mappings.filter((m) => m.role !== null && m.role !== undefined) ?? [];
    const texts = valid.filter((m) => m.input_type === 'textarea') ?? [];
    if (texts.length > 0) {
      setActivePromptTab(texts[0].role || '');
    } else {
      setActivePromptTab('');
    }
  }, [workflow]);


  return (
    <>
    {isMobile ? (
      <div className="flex flex-col h-full overflow-y-auto pb-36 bg-surface relative">
        {/* Header */}
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-200">Generate</h1>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
              {isGenerating && activeClientId !== clientId && (
                <span className="text-[10px] text-zinc-500 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">
                  他セッションで生成中...
                </span>
              )}
            </div>
            <button
              id="rescan-btn-mobile"
              onClick={() => setRescanOpen(true)}
              disabled={!selectedWorkflowId}
              title="マッピングを再スキャン・修正"
              className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
            >
              <ScanLine size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <select
              id="workflow-select-mobile"
              value={selectedWorkflowId ?? ''}
              onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
              className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[50%] truncate"
            >
              <option value="">Select workflow…</option>
              {workflows?.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select
              id="snapshot-history-select-mobile"
              value={selectedSnapshotId}
              onChange={(e) => {
                const val = e.target.value
                if (val) {
                  handleLoadSnapshot(Number(val))
                }
              }}
              disabled={!hasHistory}
              className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 disabled:cursor-not-allowed max-w-[50%] truncate"
            >
              {!hasHistory ? (
                <option value="">履歴なし</option>
              ) : (
                <>
                  <option value="">過去スナップショットを選択...</option>
                  {snapshots?.map((s) => {
                    const dateStr = formatDateTime(s.created_at)
                    const promptPrefix = getPromptPrefix(s.params)
                    return (
                      <option key={s.id} value={s.id}>
                        {dateStr} - {promptPrefix}
                      </option>
                    )
                  })}
                </>
              )}
            </select>
          </div>
        </div>

        {/* Progress Line */}
        {isGeneratingHere && progress && (
          <div className="w-full bg-surface-2 border-b border-[rgba(255,255,255,0.06)] px-4 py-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 size={10} className="animate-spin text-accent-green flex-shrink-0" />
              <span className="truncate">Generating...</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[150px]">
              <div className="h-1 bg-surface-2 rounded-full border border-white/5 overflow-hidden flex-1">
                <div
                  className="h-full bg-accent-green progress-shimmer transition-all duration-200"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <span className="font-mono text-accent-green whitespace-nowrap">{progress.percentage}%</span>
            </div>
          </div>
        )}

        {/* Main Preview */}
        <div className="bg-grid relative w-full aspect-video max-h-[300px] flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
          {isGeneratingHere ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 size={24} className="animate-spin text-accent-green" />
              {progress && (
                <div className="w-48 space-y-2">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Processing…</span>
                    <span>{progress.percentage}%</span>
                  </div>
                  <div className="h-1 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full progress-shimmer rounded-full transition-all duration-200"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : selectedImg ? (
            <div className="relative w-full h-full">
              <img
                src={selectedImg}
                alt="Generated"
                className="w-full h-full object-contain"
              />
              <a
                href={selectedImg}
                download="generated.png"
                id="download-btn-mobile"
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/80 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-xs font-medium hover:bg-surface"
              >
                <Download size={12} />
                Download
              </a>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
              <ImageOff size={32} strokeWidth={1} />
              <p className="text-xs">No image yet</p>
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {showStrip && (
          <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface px-4 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-zinc-400 font-medium">History</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="session-filter-toggle-mobile"
                  checked={filterOwnSession}
                  onChange={(e) => setFilterOwnSession(e.target.checked)}
                  className="w-3 h-3 rounded accent-accent-green cursor-pointer"
                />
                <span className="text-[10px] text-zinc-500">自セッションのみ表示</span>
              </label>
            </div>
            {displayImages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                {displayImages.map((img, i) => (
                  <button
                    key={i}
                    id={`thumb-mobile-${i}`}
                    onClick={() => {
                      setSelectedImg(img)
                      setModalPreviewIndex(i)
                      setIsModalPreviewOpen(true)
                    }}
                    className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${
                      selectedImg === img ? 'border-accent-green' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-600 py-1">No history images found for this session.</p>
            )}
          </div>
        )}

        {/* Mobile Prompt Tabs */}
        {textMappings.length > 0 && (
          <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40">
            <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
              {textMappings.map((m) => {
                const isActive = activePromptTab === m.role;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActivePromptTab(m.role || '')}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      isActive
                        ? 'border-accent-green bg-accent-green/10 text-accent-green font-medium'
                        : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {m.display_name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {textMappings.length === 0 && !selectedWorkflowId && (
          <p className="text-center text-zinc-650 text-xs py-6">Select a workflow to begin.</p>
        )}

        {/* Active Prompt Textarea */}
        {textMappings.length > 0 && activePromptTab && (() => {
          const activeMapping = textMappings.find((m) => m.role === activePromptTab);
          if (!activeMapping) return null;
          
          return (
            <div className="px-4 py-3 space-y-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-400">{activeMapping.display_name} Input</label>
                <div className="relative">
                  <button
                    type="button"
                    id={`add-asset-btn-mobile-${activeMapping.role!}`}
                    onClick={() => setOpenAddAssetRole(openAddAssetRole === activeMapping.role ? null : activeMapping.role!)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all"
                  >
                    <Plus size={10} />
                    Add Asset
                  </button>
                  {openAddAssetRole === activeMapping.role && (
                    <div className="absolute right-0 mt-1 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-20 max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-3">
                      {/* LoRAs Section */}
                      <div>
                        <p className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">LoRAs</p>
                        <div className="space-y-0.5 mt-1">
                          {loras && loras.length > 0 ? (
                            loras.map((lora) => (
                              <button
                                type="button"
                                key={lora.id}
                                onClick={() => {
                                  const min = lora.recommended_strength_min
                                  const max = lora.recommended_strength_max
                                  let initStrength = 1.0
                                  if (min != null && max != null) {
                                    initStrength = Math.round(((min + max) / 2) * 10) / 10
                                  } else if (min != null) {
                                    initStrength = min
                                  } else if (max != null) {
                                    initStrength = max
                                  }
                                  setLoraStrength(initStrength)
                                  
                                  if (lora.trigger_word_sets && lora.trigger_word_sets.length > 0) {
                                    setSelectedTriggerSetId(lora.trigger_word_sets[0].id)
                                  } else {
                                    setSelectedTriggerSetId('default')
                                  }
                                  setSelectedLoraForModal({ role: activeMapping.role!, lora })
                                  setOpenAddAssetRole(null)
                                }}
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
                                onClick={() => handleAddTagSetAsset(activeMapping.role!, ts)}
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

              <textarea
                id={`prompt-mobile-${activeMapping.role!}`}
                value={paramValues[activeMapping.role!] ?? ''}
                onChange={(e) => setParamValues({ ...paramValues, [activeMapping.role!]: e.target.value })}
                placeholder={`Enter ${activeMapping.display_name}…`}
                className="w-full min-h-[100px] bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-sm text-[#E4E4E7] placeholder-zinc-650 resize-y focus:outline-none focus:border-accent-green/40"
              />

              {/* Applied Asset Chips */}
              {appliedAssets[activeMapping.role!] && appliedAssets[activeMapping.role!].length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {appliedAssets[activeMapping.role!].map((asset) => (
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
                        onChange={() => toggleAppliedAsset(activeMapping.role!, asset.id)}
                        className="w-3 h-3 rounded border-zinc-800 accent-accent-green cursor-pointer"
                      />
                      <span
                        className="font-medium select-none cursor-pointer"
                        onClick={() => toggleAppliedAsset(activeMapping.role!, asset.id)}
                      >
                        {asset.type === 'lora' ? 'LoRA: ' : 'TagSet: '}{asset.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAppliedAsset(activeMapping.role!, asset.id)}
                        className="text-current/40 hover:text-red-400 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Mobile Settings & Parameters */}
        <div className="px-4 py-3 space-y-4">
          {/* LLM Audit */}
          <div className="rounded-lg border border-[rgba(124,111,221,0.3)] bg-[rgba(124,111,221,0.05)] overflow-hidden">
            <button
              id="audit-toggle-mobile"
              onClick={() => setAuditOpen(!auditOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#7C6FDD] hover:bg-[rgba(124,111,221,0.1)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wand2 size={15} />
                <span>LLM Audit</span>
                {auditStatus === 'loading' && <Loader2 size={13} className="animate-spin" />}
              </div>
              <ChevronRight size={14} className={`transition-transform ${auditOpen ? 'rotate-90' : ''}`} />
            </button>

            {auditOpen && (
              <div className="px-4 pb-4 space-y-3">
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
                  id="audit-intent-mobile"
                  placeholder="意図・やりたいこと..."
                  value={auditIntent}
                  onChange={(e) => setAuditIntent(e.target.value)}
                  rows={2}
                  className="w-full bg-[rgba(124,111,221,0.08)] border border-[rgba(124,111,221,0.2)] rounded-md px-3 py-2 text-xs text-zinc-350"
                />
                <button
                  id="run-audit-btn-mobile"
                  onClick={() => runAudit.mutate()}
                  disabled={auditStatus === 'loading'}
                  className="w-full py-2 rounded-md bg-[#7C6FDD] text-white text-xs font-semibold"
                >
                  Run Audit
                </button>
                {auditResult && (
                  <div className="space-y-1.5 text-xs text-zinc-450">
                    {auditResult.interference && auditResult.interference.length > 0 && (
                      <div>
                        <p className="text-red-400 font-semibold mb-1">Interference Detected</p>
                        {auditResult.interference.map((item, idx) => (
                          <div key={idx} className="p-1.5 bg-red-950/20 rounded border border-red-950/30 text-red-300">
                            {item.tag}: {item.reason}
                          </div>
                        ))}
                      </div>
                    )}
                    {auditResult.vocabulary && auditResult.vocabulary.length > 0 && (
                      <div>
                        <p className="text-accent-green font-semibold mb-1">Suggestions</p>
                        {auditResult.vocabulary.map((item, idx) => (
                          <div key={idx} className="p-1.5 bg-emerald-950/20 rounded border border-emerald-950/30 text-accent-green">
                            +{item.suggestion}: {item.effect}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Workflow Settings Card */}
          {selectedWorkflowId && workflow && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">ワークフロー設定</span>
              </div>
              <div className="flex gap-2">
                <button
                  id="save-workflow-defaults-btn-mobile"
                  onClick={handleSaveDefaultParams}
                  disabled={saveDefaultParamsMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 hover:border-accent-green/40 text-accent-green text-xs font-semibold disabled:opacity-40"
                >
                  デフォルト保存
                </button>
                <button
                  id="reset-workflow-defaults-btn-mobile"
                  onClick={handleResetDefaultParams}
                  disabled={saveDefaultParamsMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-350 text-xs font-semibold"
                >
                  リセット
                </button>
              </div>
            </div>
          )}

          {/* Mapping Error Panel */}
          {selectedWorkflowId && invalidMappings.length > 0 && (
            <div className="rounded-lg border border-[rgba(244,63,94,0.3)] bg-[rgba(244,63,94,0.05)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertCircle size={16} />
                <h3 className="text-xs font-semibold uppercase tracking-wider">マッピングエラー検出</h3>
              </div>
              <div className="space-y-2">
                {invalidMappings.map((m) => {
                  const currentSelectedMasterId = selectedMasters[m.id] ?? '';
                  return (
                    <div key={m.id} className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface-2/60 flex flex-col gap-2">
                      <span className="text-xs font-mono text-zinc-400">Node ID: {m.node_id}</span>
                      <div className="flex gap-2">
                        <select
                          id={`param-error-select-mobile-${m.node_id}`}
                          value={currentSelectedMasterId}
                          onChange={(e) => setSelectedMasters((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))}
                          className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-zinc-350 focus:outline-none"
                        >
                          <option value="">役割を選択…</option>
                          {mappingMasters?.map((master) => (
                            <option key={master.id} value={master.id}>{master.display_name}</option>
                          ))}
                        </select>
                        <button
                          id={`param-error-fix-btn-mobile-${m.node_id}`}
                          onClick={() => handleUpdateMapping(m.id, Number(currentSelectedMasterId))}
                          disabled={!currentSelectedMasterId || updateWorkflowMutation.isPending}
                          className="px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold"
                        >
                          修正
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Parameters */}
          {paramMappings.length > 0 && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 p-3.5 space-y-3">
              <p className="text-xs font-medium text-zinc-505 uppercase tracking-wider">Parameters</p>
              {paramMappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4">
                  <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
                  {m.input_type === 'select' ? (
                    <select
                      id={`param-mobile-${m.role!}`}
                      value={paramValues[m.role!] ?? ''}
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      className="w-36 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
                    >
                      <option value="">Select option…</option>
                      {loras?.map((lora) => (
                        <option key={lora.id} value={lora.model_name}>{lora.model_name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`param-mobile-${m.role!}`}
                      type="number"
                      value={paramValues[m.role!] ?? ''}
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      step={m.input_type === 'float' ? 0.1 : 1}
                      className="w-20 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                    />
                  )}
                </div>
              ))}

              {/* Batch Size */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-zinc-400">Batch Size</label>
                <input
                  id="batch-size-mobile"
                  type="number"
                  min={1}
                  max={8}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-20 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                />
              </div>

              {/* Seed */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-zinc-400">Seed</label>
                <div className="flex items-center gap-2">
                  <button
                    id="seed-toggle-mobile"
                    onClick={() => setSeedMode(seedMode === 'random' ? 'fixed' : 'random')}
                    className={`p-1 rounded border transition-all ${
                      seedMode === 'random'
                        ? 'border-accent-green/50 text-accent-green bg-accent-green/10'
                        : 'border-[rgba(255,255,255,0.1)] text-zinc-500'
                    }`}
                  >
                    {seedMode === 'random' ? <Shuffle size={12} /> : <Lock size={12} />}
                  </button>
                  <input
                    id="seed-input-mobile"
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    disabled={seedMode === 'random'}
                    className="w-20 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Action Bar */}
        <div className="fixed bottom-16 left-0 right-0 z-45 bg-surface/90 backdrop-blur border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3">
          <button
            id="generate-btn-mobile"
            onClick={handleGenerate}
            disabled={!selectedWorkflowId || !isConnected}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
          >
            {isGenerating ? (
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
            id="save-snapshot-btn-mobile"
            onClick={() => setIsSaveModalOpen(true)}
            disabled={!selectedImg}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-all"
          >
            <Save size={15} />
          </button>
        </div>
      </div>
    ) : (
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
              className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[130px] truncate"
            >
              <option value="">Select workflow…</option>
              {workflows?.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select
              id="snapshot-history-select"
              value={selectedSnapshotId}
              onChange={(e) => {
                const val = e.target.value
                if (val) {
                  handleLoadSnapshot(Number(val))
                }
              }}
              disabled={!hasHistory}
              className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 disabled:cursor-not-allowed max-w-[140px] truncate"
            >
              {!hasHistory ? (
                <option value="">履歴なし</option>
              ) : (
                <>
                  <option value="">過去スナップショットを選択...</option>
                  {snapshots?.map((s) => {
                    const dateStr = formatDateTime(s.created_at)
                    const promptPrefix = getPromptPrefix(s.params)
                    return (
                      <option key={s.id} value={s.id}>
                        {dateStr} - {promptPrefix}
                      </option>
                    )
                  })}
                </>
              )}
            </select>
            <button
              id="rescan-btn"
              onClick={() => setRescanOpen(true)}
              disabled={!selectedWorkflowId}
              title="マッピングを再スキャン・修正"
              className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
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

          {/* Workflow Settings Card */}
          {selectedWorkflowId && workflow && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">ワークフロー設定</span>
                <span className="text-[10px] text-zinc-500 font-mono">ID: {selectedWorkflowId}</span>
              </div>
              <div className="flex gap-2">
                <button
                  id="save-workflow-defaults-btn"
                  onClick={handleSaveDefaultParams}
                  disabled={saveDefaultParamsMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 hover:border-accent-green/40 text-accent-green text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {saveDefaultParamsMutation.isPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      保存中…
                    </>
                  ) : (
                    <>
                      <Save size={12} />
                      デフォルト保存
                    </>
                  )}
                </button>
                <button
                  id="reset-workflow-defaults-btn"
                  onClick={handleResetDefaultParams}
                  disabled={saveDefaultParamsMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-350 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  デフォルトにリセット
                </button>
              </div>
            </div>
          )}

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
                                  onClick={() => {
                                  const min = lora.recommended_strength_min
                                  const max = lora.recommended_strength_max
                                  let initStrength = 1.0
                                  if (min != null && max != null) {
                                    initStrength = Math.round(((min + max) / 2) * 10) / 10
                                  } else if (min != null) {
                                    initStrength = min
                                  } else if (max != null) {
                                    initStrength = max
                                  }
                                  setLoraStrength(initStrength)
                                  
                                  if (lora.trigger_word_sets && lora.trigger_word_sets.length > 0) {
                                    setSelectedTriggerSetId(lora.trigger_word_sets[0].id)
                                  } else {
                                    setSelectedTriggerSetId('default')
                                  }
                                  setSelectedLoraForModal({ role: m.role!, lora })
                                  setOpenAddAssetRole(null)
                                }}
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
            disabled={!selectedWorkflowId || !isConnected}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95"
          >
            {isGenerating ? (
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
    )}

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

    {/* LoRA Trigger Selection Modal */}
    {selectedLoraForModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
        <div
          className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-200">LoRA設定</h3>
              <p className="text-xs text-zinc-500 mt-1 truncate max-w-[320px]">
                {selectedLoraForModal.lora.description || selectedLoraForModal.lora.model_name.split('/').pop()?.replace('.safetensors', '')}
              </p>
            </div>
            <button
              id="close-lora-modal-btn"
              onClick={() => setSelectedLoraForModal(null)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Trigger Sets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">トリガーワードセット</label>
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {selectedLoraForModal.lora.trigger_word_sets && selectedLoraForModal.lora.trigger_word_sets.length > 0 ? (
                  <>
                    {selectedLoraForModal.lora.trigger_word_sets.map((set) => (
                      <label
                        key={set.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedTriggerSetId === set.id
                            ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200'
                            : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'
                        }`}
                      >
                        <input
                          type="radio"
                          name="trigger-word-set"
                          checked={selectedTriggerSetId === set.id}
                          onChange={() => setSelectedTriggerSetId(set.id)}
                          className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{set.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            {set.words.join(', ')}
                          </p>
                        </div>
                      </label>
                    ))}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTriggerSetId === 'default'
                          ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200'
                          : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'
                      }`}
                    >
                      <input
                        type="radio"
                        name="trigger-word-set"
                        checked={selectedTriggerSetId === 'default'}
                        onChange={() => setSelectedTriggerSetId('default')}
                        className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">トリガーワードなし（デフォルト）</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">LoRAタグのみをプロンプトに挿入します</p>
                      </div>
                    </label>
                  </>
                ) : (
                  <div className="p-3 rounded-lg bg-surface border border-[rgba(255,255,255,0.04)] text-zinc-500 text-xs italic">
                    登録されているトリガーワードセットはありません（デフォルト適用）
                  </div>
                )}
              </div>
            </div>

            {/* Strength control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-zinc-400">LoRA強度 (Strength)</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.0}
                    max={2.0}
                    step={0.1}
                    value={loraStrength}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) {
                        setLoraStrength(Math.max(0, Math.min(2, val)))
                      }
                    }}
                    className="w-16 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-0.5 text-xs text-zinc-200 text-right focus:outline-none focus:border-[#7C6FDD]/50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0.0}
                  max={2.0}
                  step={0.1}
                  value={loraStrength}
                  onChange={(e) => setLoraStrength(parseFloat(e.target.value))}
                  className="flex-1 accent-[#7C6FDD] bg-surface h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-mono text-zinc-400 w-8 text-right">{loraStrength.toFixed(1)}</span>
              </div>
              {selectedLoraForModal.lora.recommended_strength_min !== null && selectedLoraForModal.lora.recommended_strength_max !== null && (
                <p className="text-[10px] text-zinc-500 text-right">
                  推奨強度: {selectedLoraForModal.lora.recommended_strength_min} 〜 {selectedLoraForModal.lora.recommended_strength_max}
                </p>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              id="cancel-lora-modal-btn"
              onClick={() => setSelectedLoraForModal(null)}
              className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all"
            >
              キャンセル
            </button>
            <button
              id="confirm-lora-modal-btn"
              onClick={() => {
                handleAddLoraAsset(
                  selectedLoraForModal.role,
                  selectedLoraForModal.lora,
                  loraStrength,
                  selectedTriggerSetId
                )
                setSelectedLoraForModal(null)
              }}
              className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 transition-all glow-green flex items-center gap-2"
            >
              適用
            </button>
          </div>
        </div>
      </div>
    )}
    <HistoryModalPreview
      isOpen={isModalPreviewOpen}
      onClose={() => setIsModalPreviewOpen(false)}
      images={displayImages}
      currentIndex={modalPreviewIndex}
      onChangeIndex={setModalPreviewIndex}
      snapshotIds={snapshotIdsForDisplay}
    />
    </>
  )
}
