import { useState, useEffect, useMemo } from 'react'
import {
  Zap, Shuffle, Lock, Download, Camera, Settings,
  Loader2, ChevronRight, Wand2, AlertCircle, CheckCircle2,
  ImageOff, ScanLine, Plus, X,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, snapshotsApi, mappingMastersApi, lorasApi, tagSetsApi, albumsApi } from '../api/client'
import type { Workflow, MappingMaster, Lora, TagSet, AlbumSummary } from '../api/types'
import { useGenerationStore } from '../store/useGenerationStore'
import { RescanModal } from '../components/RescanModal'
import { UploadWorkflowModal } from '../components/UploadWorkflowModal'
import { TagChipEditor } from '../components/TagChipEditor'
import { HistoryModalPreview } from '../components/HistoryModalPreview'
import { useWorkflowParams } from './GeneratePage/hooks/useWorkflowParams'
import { useGenerateAction } from './GeneratePage/hooks/useGenerateAction'
import { useImageNavigation } from './GeneratePage/hooks/useImageNavigation'
import { useSnapshotActions } from './GeneratePage/hooks/useSnapshotActions'
import { useAuditAction } from './GeneratePage/hooks/useAuditAction'
import { useWorkflowUpload } from './GeneratePage/hooks/useWorkflowUpload'
import { formatDateTime, getPromptPrefix } from '../utils/formatUtils'

interface SnapshotSummaryWithParams {
  id: number
  workflow_id: number
  image_path: string | null
  created_at: string
  params?: Record<string, any>
}

export function GeneratePage() {
  const [isMobile, setIsMobile] = useState(() =>
    window.location.pathname.startsWith('/mobile') || window.innerWidth < 768
  )
  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.location.pathname.startsWith('/mobile') || window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [activePromptTab, setActivePromptTab] = useState<string>('')
  const qc = useQueryClient()
  const [rescanOpen, setRescanOpen] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | ''>('')
  const [selectedMasters, setSelectedMasters] = useState<Record<number, number>>({})
  const [openAddAssetRole, setOpenAddAssetRole] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [localComfyUrl, setLocalComfyUrl] = useState('')
  const [thumbnailTab, setThumbnailTab] = useState<'history' | 'snapshots'>('history')
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)
  const [selectedLoraForModal, setSelectedLoraForModal] = useState<{ role: string; lora: Lora } | null>(null)
  const [selectedTriggerSetId, setSelectedTriggerSetId] = useState<number | 'default'>('default')
  const [loraStrength, setLoraStrength] = useState<number>(1.0)

  // ── Store ────────────────────────────────────────────────────
  const {
    clientId, isConnected, isGenerating, progress, previewImage, activeClientId,
    filterOwnSession, setFilterOwnSession,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    batchImages, selectedImg, setSelectedImg,
    comfyHistoryImages, appliedAssets,
    addAppliedAsset, removeAppliedAsset, toggleAppliedAsset,
    comfyUrl, setComfyUrl,
    queueRunning, queuePending,
  } = useGenerationStore()

  useEffect(() => { if (comfyUrl) setLocalComfyUrl(comfyUrl) }, [comfyUrl])

  // ── Queries ──────────────────────────────────────────────────
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })
  const { data: workflow } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!) as Promise<Workflow>,
    enabled: !!selectedWorkflowId,
  })
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummaryWithParams[]>,
    enabled: !!selectedWorkflowId,
  })
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
  const { data: albums } = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list() as Promise<AlbumSummary[]>,
  })

  // ── Extracted hooks ──────────────────────────────────────────
  const { loadSnapshotParams, handleSaveDefaultParams, handleResetDefaultParams, saveDefaultParamsMutation } =
    useWorkflowParams(workflow, selectedWorkflowId)

  const { handleGenerate } = useGenerateAction(workflow)

  const displayImages = filterOwnSession ? batchImages : comfyHistoryImages
  const { handlePrevImg, handleNextImg } = useImageNavigation(displayImages)

  const {
    isSaveModalOpen, setIsSaveModalOpen,
    targetAlbumId, setTargetAlbumId,
    newAlbumName, setNewAlbumName,
    saveSnapshot,
  } = useSnapshotActions(selectedWorkflowId)

  const {
    auditOpen, setAuditOpen, auditIntent, setAuditIntent,
    auditTypes, setAuditTypes, auditResult, auditStatus, runAudit,
  } = useAuditAction()

  const {
    uploadModalOpen, setUploadModalOpen, uploadedJson, uploadedFileName,
    dragOver, handleFileSelect, handleDragOver, handleDragLeave, handleDrop,
  } = useWorkflowUpload()

  // ── Mutations ────────────────────────────────────────────────
  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ workflowId, mappings }: { workflowId: number; mappings: { master_id: number; node_id: string }[] }) =>
      workflowsApi.update(workflowId, { mappings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedMasters({})
    },
  })

  // ── Derived state ────────────────────────────────────────────
  const isGeneratingHere = isGenerating && (!filterOwnSession || activeClientId === clientId)

  const totalQueueCount = useMemo(() => {
    const filterJob = (job: any) => !filterOwnSession || job[3]?.client_id === clientId
    return queueRunning.filter(filterJob).length + queuePending.filter(filterJob).length
  }, [queueRunning, queuePending, filterOwnSession, clientId])

  const snapshotIdsForDisplay = displayImages.map((img) => {
    const found = snapshots?.find((s) => s.image_path === img)
    return found ? found.id : null
  })
  const showStrip = batchImages.length > 0 || comfyHistoryImages.length > 0 || (!!snapshots && snapshots.length > 0)
  const hasHistory = !!selectedWorkflowId && !!snapshots && snapshots.length > 0

  const validMappings = workflow?.mappings.filter((m) => m.role != null) ?? []
  const invalidMappings = workflow?.mappings.filter((m) => m.role == null) ?? []
  const textMappings = validMappings.filter((m) => m.input_type === 'textarea')
  const paramMappings = validMappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed')

  // ── Side effects ─────────────────────────────────────────────
  useEffect(() => { setSelectedSnapshotId('') }, [selectedWorkflowId])

  useEffect(() => {
    const texts = workflow?.mappings.filter((m) => m.role != null && m.input_type === 'textarea') ?? []
    setActivePromptTab(texts.length > 0 ? texts[0].role || '' : '')
  }, [workflow])

  // ── Handlers ─────────────────────────────────────────────────
  const handleLoadSnapshot = (id: number) => {
    const snapshot = snapshots?.find((s) => s.id === id)
    if (snapshot?.params) loadSnapshotParams(snapshot.params)
    setSelectedSnapshotId('')
  }

  const handleUpdateMapping = async (mappingId: number, newMasterId: number) => {
    if (!workflow || !selectedWorkflowId) return
    const updatedMappings = workflow.mappings.map((m) =>
      m.id === mappingId
        ? { master_id: newMasterId, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id }
    )
    await updateWorkflowMutation.mutateAsync({ workflowId: selectedWorkflowId, mappings: updatedMappings })
  }

  const handleAddLoraAsset = (role: string, lora: Lora, strength: number, triggerSetId: number | 'default') => {
    const path = lora.file_path || lora.model_name || ''
    const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora'
    let twsWords: string[] = []
    if (triggerSetId !== 'default') {
      const selectedSet = lora.trigger_word_sets?.find((s) => s.id === triggerSetId)
      if (selectedSet) twsWords = selectedSet.words
    }
    addAppliedAsset(role, {
      type: 'lora',
      assetId: lora.id,
      name: lora.description || filename,
      tags: twsWords,
      loraPromptString: `<lora:${filename}:${strength.toFixed(1)}>`,
    })
  }

  const handleAddTagSetAsset = (role: string, ts: TagSet) => {
    addAppliedAsset(role, { type: 'tagset', assetId: ts.id, name: ts.name, tags: ts.tags || [] })
    setOpenAddAssetRole(null)
  }

  // ── Upload zone render ───────────────────────────────────────
  const renderUploadZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('workflow-file-input')?.click()}
      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all min-h-[300px] ${
        dragOver
          ? 'border-accent-green bg-accent-green/5 text-zinc-200'
          : 'border-[rgba(255,255,255,0.15)] hover:border-accent-green/50 hover:bg-white/5 text-zinc-400'
      }`}
    >
      <input
        id="workflow-file-input"
        type="file"
        accept=".json"
        onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
        className="hidden"
      />
      <Plus size={36} className="text-zinc-500 mb-3 hover:text-accent-green transition-colors" />
      <p className="text-sm font-medium text-zinc-300 mb-1">ワークフロー JSON ファイルをドラッグ＆ドロップ</p>
      <p className="text-xs text-zinc-500">またはクリックしてファイルを選択してください (.json)</p>
    </div>
  )

  // ── Shared sub-components (inline) ───────────────────────────
  const SettingsPopover = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`absolute ${mobile ? 'left-[-120px]' : 'right-0'} top-full mt-2 w-72 bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl p-4 z-50 space-y-4 animate-fade-in`}>
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          <Settings size={12} className="text-accent-green" />ComfyUI設定
        </span>
        <button type="button" onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-zinc-400 font-medium">ComfyUI URL</label>
        <input
          type="text"
          value={localComfyUrl}
          onChange={(e) => { setLocalComfyUrl(e.target.value); setComfyUrl(e.target.value) }}
          placeholder="http://localhost:8188"
          className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40"
        />
      </div>
      {selectedWorkflowId && workflow && (
        <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 font-medium">ワークフロー設定</span>
            <span className="text-[9px] text-zinc-500 font-mono">ID: {selectedWorkflowId}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { handleSaveDefaultParams(); setIsSettingsOpen(false) }}
              disabled={saveDefaultParamsMutation.isPending}
              className="flex-1 py-1.5 rounded bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 text-accent-green text-[10px] font-semibold disabled:opacity-40"
            >デフォルト保存</button>
            <button
              type="button"
              onClick={() => { handleResetDefaultParams(); setIsSettingsOpen(false) }}
              className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-350 text-[10px] font-semibold"
            >リセット</button>
          </div>
        </div>
      )}
    </div>
  )

  const AssetDropdown = ({ role }: { role: string }) => (
    <div className="absolute right-0 mt-1 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-20 max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-zinc-500 uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">LoRAs</p>
        <div className="space-y-0.5 mt-1">
          {loras && loras.length > 0 ? loras.map((lora) => (
            <button type="button" key={lora.id} onClick={() => {
              const min = lora.recommended_strength_min, max = lora.recommended_strength_max
              let initStrength = 1.0
              if (min != null && max != null) initStrength = Math.round(((min + max) / 2) * 10) / 10
              else if (min != null) initStrength = min
              else if (max != null) initStrength = max
              setLoraStrength(initStrength)
              setSelectedTriggerSetId(lora.trigger_word_sets?.length ? lora.trigger_word_sets[0].id : 'default')
              setSelectedLoraForModal({ role, lora })
              setOpenAddAssetRole(null)
            }} className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-350 hover:bg-white/5 hover:text-white truncate" title={lora.description || lora.model_name}>
              {lora.description || lora.model_name.split('/').pop()?.replace('.safetensors', '')}
            </button>
          )) : <p className="text-[10px] text-zinc-650 px-2 py-1 italic">No LoRAs found</p>}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-[#7C6FDD] uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">Tag Sets</p>
        <div className="space-y-0.5 mt-1">
          {tagSets && tagSets.length > 0 ? tagSets.map((ts) => (
            <button type="button" key={ts.id} onClick={() => handleAddTagSetAsset(role, ts)}
              className="w-full text-left text-xs px-2 py-1.5 rounded text-zinc-350 hover:bg-white/5 hover:text-white truncate" title={ts.description || ts.name}>
              {ts.name}
            </button>
          )) : <p className="text-[10px] text-zinc-650 px-2 py-1 italic">No Tag Sets found</p>}
        </div>
      </div>
    </div>
  )

  const AppliedAssetChips = ({ role }: { role: string }) => {
    const assets = appliedAssets[role] || []
    if (!assets.length) return null
    return (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {assets.map((asset) => (
          <div key={asset.id} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] transition-all ${
            asset.enabled
              ? asset.type === 'lora' ? 'bg-accent-green/5 text-accent-green border-accent-green/20' : 'bg-[#7C6FDD]/5 text-[#a99ef7] border-[#7C6FDD]/20'
              : 'bg-zinc-900/60 text-zinc-600 border-zinc-800/80 opacity-40'
          }`}>
            <input type="checkbox" checked={asset.enabled} onChange={() => toggleAppliedAsset(role, asset.id)} className="w-3 h-3 rounded border-zinc-800 accent-accent-green cursor-pointer" />
            <span className="font-medium select-none cursor-pointer" onClick={() => toggleAppliedAsset(role, asset.id)}>
              {asset.type === 'lora' ? 'LoRA: ' : 'TagSet: '}{asset.name}
              {asset.type === 'lora' && asset.loraPromptString && (
                <span className="text-[9px] opacity-75 ml-1 font-mono">({asset.loraPromptString.split(':').pop()?.replace('>', '')})</span>
              )}
            </span>
            <button type="button" onClick={() => removeAppliedAsset(role, asset.id)} className="text-current/40 hover:text-red-400 transition-colors"><X size={10} /></button>
          </div>
        ))}
      </div>
    )
  }

  const AuditPanel = () => (
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
            className="w-full bg-[rgba(124,111,221,0.08)] border border-[rgba(124,111,221,0.2)] rounded-md px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-[#7C6FDD]/60" />
          <button id="run-audit-btn" onClick={() => runAudit.mutate()} disabled={auditStatus === 'loading'}
            className="w-full py-2 rounded-md bg-[#7C6FDD] text-white text-xs font-semibold hover:bg-[#6d62cc] disabled:opacity-50 transition-all glow-purple">
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
                        <div><span className="text-red-300 font-mono">{item.tag}</span><span className="text-zinc-500 ml-2">{item.reason}</span></div>
                      </div>
                      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag: item.tag } }))}
                        className="text-[10px] px-1.5 py-0.5 bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-900/30 rounded transition-colors">無効化</button>
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
                        <div><span className="text-accent-green font-mono">+{item.suggestion}</span><span className="text-zinc-500 ml-2">{item.effect}</span></div>
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

  const MappingErrorPanel = () => {
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
                    onChange={(e) => setSelectedMasters((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))}
                    className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-zinc-300 focus:outline-none focus:border-rose-500/40">
                    <option value="">役割を選択してください…</option>
                    {mappingMasters?.map((master) => <option key={master.id} value={master.id}>{master.display_name} ({master.role})</option>)}
                  </select>
                  <button id={`param-error-fix-btn-${m.node_id}`}
                    onClick={() => handleUpdateMapping(m.id, Number(currentSelectedMasterId))}
                    disabled={!currentSelectedMasterId || updateWorkflowMutation.isPending}
                    className="px-3 py-1.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold transition-all disabled:opacity-40">
                    {updateWorkflowMutation.isPending ? '保存中…' : '修正'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const ParamPanel = ({ mobile = false }: { mobile?: boolean }) => {
    if (paramMappings.length === 0) return null
    return (
      <div className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 ${mobile ? 'p-3.5' : 'p-3'} space-y-3`}>
        <p className="text-xs font-medium text-zinc-505 uppercase tracking-wider">Parameters</p>
        {paramMappings.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-4">
            <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
            {m.input_type === 'select' ? (
              <select id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} value={paramValues[m.role!] ?? ''}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40`}>
                <option value="">Select option…</option>
                {loras?.map((lora) => <option key={lora.id} value={lora.model_name}>{lora.model_name}</option>)}
              </select>
            ) : (
              <input id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} type="number" value={paramValues[m.role!] ?? ''}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                step={m.input_type === 'float' ? 0.1 : 1}
                className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right`} />
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs text-zinc-400">Batch Size</label>
          <input id={`batch-size${mobile ? '-mobile' : ''}`} type="number" min={1} max={8} value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right`} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs text-zinc-400">Seed</label>
          <div className="flex items-center gap-2">
            <button id={`seed-toggle${mobile ? '-mobile' : ''}`}
              onClick={() => setSeedMode(seedMode === 'random' ? 'fixed' : 'random')}
              className={`p-1${mobile ? '' : '.5'} rounded border transition-all ${seedMode === 'random' ? 'border-accent-green/50 text-accent-green bg-accent-green/10' : 'border-[rgba(255,255,255,0.1)] text-zinc-500'}`}>
              {seedMode === 'random' ? <Shuffle size={mobile ? 12 : 13} /> : <Lock size={mobile ? 12 : 13} />}
            </button>
            <input id={`seed-input${mobile ? '-mobile' : ''}`} type="number" value={seed}
              onChange={(e) => setSeed(Number(e.target.value))} disabled={seedMode === 'random'}
              className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right disabled:opacity-40`} />
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <>
        <div className="flex flex-col h-full overflow-y-auto pb-36 bg-surface relative">
          {/* Header */}
          <div className="flex flex-col gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-zinc-200">Generate</h1>
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
                {isGenerating && activeClientId !== clientId && (
                  <span className="text-[10px] text-zinc-500 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">他セッションで生成中...</span>
                )}
              </div>
              <button id="rescan-btn-mobile" onClick={() => setRescanOpen(true)} disabled={!selectedWorkflowId} title="マッピングを再スキャン・修正"
                className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 transition-all flex-shrink-0">
                <ScanLine size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <select id="workflow-select-mobile" value={selectedWorkflowId ?? ''}
                onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[40%] truncate">
                <option value="">+ 新しいワークフローを追加 (Upload New...)</option>
                {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="relative flex-shrink-0 flex items-center">
                <button id="settings-toggle-btn-mobile" type="button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-1.5 rounded-md border transition-all ${isSettingsOpen ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5'}`} title="ComfyUI設定">
                  <Settings size={14} />
                </button>
                {isSettingsOpen && <SettingsPopover mobile />}
              </div>
              <select id="snapshot-history-select-mobile" value={selectedSnapshotId}
                onChange={(e) => { if (e.target.value) handleLoadSnapshot(Number(e.target.value)) }}
                disabled={!hasHistory}
                className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 max-w-[50%] truncate">
                {!hasHistory ? <option value="">履歴なし</option> : (
                  <>
                    <option value="">過去スナップショットを選択...</option>
                    {snapshots?.map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.created_at)} - {getPromptPrefix(s.params)}</option>)}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Progress Line */}
          <div className="w-full bg-surface-2 border-b border-[rgba(255,255,255,0.06)] px-4 py-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 min-w-0">
              {isGeneratingHere ? <Loader2 size={10} className="animate-spin text-accent-green flex-shrink-0" /> : <div className="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />}
              <span className="truncate">{isGeneratingHere ? 'Generating...' : 'Ready'}</span>
              <span className="text-zinc-600">|</span>
              <span className="font-semibold text-zinc-350">Queue: {totalQueueCount}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[150px]">
              <div className="h-1 bg-surface-2 rounded-full border border-white/5 overflow-hidden flex-1">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${isGeneratingHere && progress ? progress.percentage : 0}%` }} />
              </div>
              <span className="font-mono text-accent-green whitespace-nowrap">{isGeneratingHere && progress ? progress.percentage : 0}%</span>
            </div>
          </div>

          {/* Main Preview */}
          <div className="bg-grid relative w-full aspect-video max-h-[300px] flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
            {(previewImage || selectedImg) ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                {isGeneratingHere && <div className="absolute top-2 right-2 bg-surface-2/80 backdrop-blur p-1.5 rounded-full border border-white/5 shadow-md"><Loader2 size={16} className="animate-spin text-accent-green" /></div>}
                <a href={previewImage || selectedImg!} download="generated.png" id="download-btn-mobile"
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/80 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-xs font-medium hover:bg-surface">
                  <Download size={12} />Download
                </a>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-650">
                {isGeneratingHere ? <Loader2 size={24} className="animate-spin text-accent-green" /> : <ImageOff size={32} strokeWidth={1} />}
                <p className="text-xs">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
              </div>
            )}
            {isGeneratingHere && progress && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950 overflow-hidden">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${progress.percentage}%` }} />
              </div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {showStrip && (
            <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface px-4 py-2 space-y-2">
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1 flex-wrap gap-2">
                <div className="flex gap-3">
                  {(['history', 'snapshots'] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setThumbnailTab(tab)}
                      className={`text-[11px] font-semibold pb-0.5 border-b-2 transition-all ${thumbnailTab === tab ? 'border-accent-green text-zinc-200' : 'border-transparent text-zinc-550'}`}>
                      {tab === 'history' ? '履歴' : 'スナップショット'}
                    </button>
                  ))}
                </div>
                {thumbnailTab === 'history' && (
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" id="session-filter-toggle-mobile" checked={filterOwnSession} onChange={(e) => setFilterOwnSession(e.target.checked)} className="w-3.5 h-3.5 rounded accent-accent-green cursor-pointer" />
                    <span className="text-[10px] text-zinc-500">自セッションのみ</span>
                  </label>
                )}
              </div>
              {thumbnailTab === 'history' ? (
                displayImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {displayImages.map((img, i) => (
                      <button key={i} type="button" id={`thumb-mobile-${i}`}
                        onClick={() => { setSelectedImg(img); setModalPreviewIndex(i); setIsModalPreviewOpen(true) }}
                        className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all ${selectedImg === img ? 'border-accent-green' : 'border-transparent'}`}>
                        <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-zinc-650 py-1">No history images found for this session.</p>
              ) : (
                snapshots && snapshots.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {snapshots.map((snap) => (
                      <button key={snap.id} type="button" onClick={() => handleLoadSnapshot(snap.id)}
                        className="flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded border border-[rgba(255,255,255,0.06)] bg-surface-2/40 hover:bg-surface-2 transition-all w-20 group">
                        <div className="w-16 h-16 rounded overflow-hidden bg-black/40">
                          {snap.image_path ? <img src={snap.image_path} alt="Snapshot" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-650"><ImageOff size={14} /></div>}
                        </div>
                        <span className="text-[8px] text-zinc-500 text-center truncate w-full font-mono">{getPromptPrefix(snap.params) || `Snap #${snap.id}`}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-zinc-650 py-1 italic">No snapshots available.</p>
              )}
            </div>
          )}

          {/* Mobile Prompt Tabs */}
          {textMappings.length > 0 && (
            <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40">
              <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
                {textMappings.map((m) => (
                  <button key={m.id} type="button" onClick={() => setActivePromptTab(m.role || '')}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${activePromptTab === m.role ? 'border-accent-green bg-accent-green/10 text-accent-green font-medium' : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200'}`}>
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {textMappings.length === 0 && !selectedWorkflowId && <div className="px-4 py-6">{renderUploadZone()}</div>}

          {/* Active Prompt Textarea (Mobile) */}
          {textMappings.length > 0 && activePromptTab && (() => {
            const activeMapping = textMappings.find((m) => m.role === activePromptTab)
            if (!activeMapping) return null
            return (
              <div className="px-4 py-3 space-y-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-400">{activeMapping.display_name} Input</label>
                  <div className="relative">
                    <button type="button" id={`add-asset-btn-mobile-${activeMapping.role!}`}
                      onClick={() => setOpenAddAssetRole(openAddAssetRole === activeMapping.role ? null : activeMapping.role!)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                      <Plus size={10} />Add Asset
                    </button>
                    {openAddAssetRole === activeMapping.role && <AssetDropdown role={activeMapping.role!} />}
                  </div>
                </div>
                <textarea id={`prompt-mobile-${activeMapping.role!}`} value={paramValues[activeMapping.role!] ?? ''}
                  onChange={(e) => setParamValues({ ...paramValues, [activeMapping.role!]: e.target.value })}
                  placeholder={`Enter ${activeMapping.display_name}…`}
                  className="w-full min-h-[100px] bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-sm text-[#E4E4E7] placeholder-zinc-650 resize-y focus:outline-none focus:border-accent-green/40" />
                <AppliedAssetChips role={activeMapping.role!} />
              </div>
            )
          })()}

          {/* Mobile Settings & Parameters */}
          <div className="px-4 py-3 space-y-4">
            <AuditPanel />
            <MappingErrorPanel />
            <ParamPanel mobile />
          </div>

          {/* Mobile Action Bar */}
          <div className="fixed bottom-16 left-0 right-0 z-45 bg-surface/90 backdrop-blur border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3">
            <button id="generate-btn-mobile" onClick={handleGenerate} disabled={!selectedWorkflowId || !isConnected}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95">
              <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
            </button>
            <button id="save-snapshot-btn-mobile" onClick={() => setIsSaveModalOpen(true)} disabled={!selectedImg}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-all">
              <Camera size={15} />
            </button>
          </div>
        </div>

        {/* Modals (shared) */}
        <Modals />
      </>
    )
  }

  // ════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ════════════════════════════════════════════════════════════
  const Modals = () => (
    <>
      {rescanOpen && workflow && (
        <RescanModal workflowId={selectedWorkflowId!} workflowJson={workflow.json_body} onClose={() => setRescanOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] }); setRescanOpen(false) }} />
      )}
      {uploadModalOpen && uploadedJson && (
        <UploadWorkflowModal initialName={uploadedFileName} workflowJson={uploadedJson}
          onClose={() => { setUploadModalOpen(false) }}
          onSaved={(newWorkflowId) => { qc.invalidateQueries({ queryKey: ['workflows'] }); setSelectedWorkflowId(newWorkflowId) }} />
      )}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-200">スナップショットを保存</h3>
              <button id="close-save-modal-btn" onClick={() => { setIsSaveModalOpen(false); setTargetAlbumId(''); setNewAlbumName('') }} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">保存先アルバム</label>
                <select id="save-album-select" value={targetAlbumId}
                  onChange={(e) => setTargetAlbumId(e.target.value === '' ? '' : Number(e.target.value))} disabled={!!newAlbumName}
                  className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-40 transition-all">
                  <option value="">アルバムを選択しない (None)</option>
                  {albums?.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-center py-1">
                <span className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" /><span className="text-[10px] text-zinc-600 px-3 uppercase tracking-wider">or</span><span className="h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">新規アルバムを作成して保存</label>
                <input id="new-album-name-input" type="text" placeholder="新規アルバム名を入力…" value={newAlbumName}
                  onChange={(e) => { setNewAlbumName(e.target.value); if (e.target.value) setTargetAlbumId('') }}
                  className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-accent-green/50 transition-all" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button id="cancel-save-modal-btn" onClick={() => { setIsSaveModalOpen(false); setTargetAlbumId(''); setNewAlbumName('') }}
                className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all">キャンセル</button>
              <button id="confirm-save-modal-btn" onClick={() => saveSnapshot.mutate()} disabled={saveSnapshot.isPending}
                className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-40 transition-all glow-green flex items-center gap-2">
                {saveSnapshot.isPending && <Loader2 size={14} className="animate-spin" />}{saveSnapshot.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedLoraForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-2xl p-6 space-y-5 shadow-2xl relative animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-200">LoRA設定</h3>
                <p className="text-xs text-zinc-500 mt-1 truncate max-w-[320px]">{selectedLoraForModal.lora.description || selectedLoraForModal.lora.model_name.split('/').pop()?.replace('.safetensors', '')}</p>
              </div>
              <button id="close-lora-modal-btn" onClick={() => setSelectedLoraForModal(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">トリガーワードセット</label>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {selectedLoraForModal.lora.trigger_word_sets?.length ? (
                    <>
                      {selectedLoraForModal.lora.trigger_word_sets.map((set) => (
                        <label key={set.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTriggerSetId === set.id ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200' : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'}`}>
                          <input type="radio" name="trigger-word-set" checked={selectedTriggerSetId === set.id} onChange={() => setSelectedTriggerSetId(set.id)} className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800" />
                          <div className="flex-1 min-w-0"><p className="text-xs font-semibold">{set.name}</p><p className="text-[10px] text-zinc-500 truncate mt-0.5">{set.words.join(', ')}</p></div>
                        </label>
                      ))}
                      <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTriggerSetId === 'default' ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200' : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'}`}>
                        <input type="radio" name="trigger-word-set" checked={selectedTriggerSetId === 'default'} onChange={() => setSelectedTriggerSetId('default')} className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800" />
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold">トリガーワードなし（デフォルト）</p><p className="text-[10px] text-zinc-500 mt-0.5">LoRAタグのみをプロンプトに挿入します</p></div>
                      </label>
                    </>
                  ) : <div className="p-3 rounded-lg bg-surface border border-[rgba(255,255,255,0.04)] text-zinc-500 text-xs italic">登録されているトリガーワードセットはありません（デフォルト適用）</div>}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-400">LoRA強度 (Strength)</label>
                  <input type="number" min={0.0} max={2.0} step={0.1} value={loraStrength}
                    onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) setLoraStrength(Math.max(0, Math.min(2, val))) }}
                    className="w-16 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-0.5 text-xs text-zinc-200 text-right focus:outline-none focus:border-[#7C6FDD]/50" />
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min={0.0} max={2.0} step={0.1} value={loraStrength} onChange={(e) => setLoraStrength(parseFloat(e.target.value))} className="flex-1 accent-[#7C6FDD] bg-surface h-1.5 rounded-lg appearance-none cursor-pointer" />
                  <span className="text-xs font-mono text-zinc-400 w-8 text-right">{loraStrength.toFixed(1)}</span>
                </div>
                {selectedLoraForModal.lora.recommended_strength_min != null && selectedLoraForModal.lora.recommended_strength_max != null && (
                  <p className="text-[10px] text-zinc-500 text-right">推奨強度: {selectedLoraForModal.lora.recommended_strength_min} 〜 {selectedLoraForModal.lora.recommended_strength_max}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button id="cancel-lora-modal-btn" onClick={() => setSelectedLoraForModal(null)} className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all">キャンセル</button>
              <button id="confirm-lora-modal-btn" onClick={() => { handleAddLoraAsset(selectedLoraForModal.role, selectedLoraForModal.lora, loraStrength, selectedTriggerSetId); setSelectedLoraForModal(null) }}
                className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 transition-all glow-green flex items-center gap-2">適用</button>
            </div>
          </div>
        </div>
      )}
      <HistoryModalPreview isOpen={isModalPreviewOpen} onClose={() => setIsModalPreviewOpen(false)}
        images={displayImages} currentIndex={modalPreviewIndex} onChangeIndex={setModalPreviewIndex} snapshotIds={snapshotIdsForDisplay} />
    </>
  )

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
                <span className="text-[10px] text-zinc-500 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">他セッションで生成中...</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select id="workflow-select" value={selectedWorkflowId ?? ''}
                onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[130px] truncate">
                <option value="">+ 新しいワークフローを追加 (Upload New...)</option>
                {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div className="relative flex-shrink-0 flex items-center">
                <button id="settings-toggle-btn" type="button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-1.5 rounded-md border transition-all ${isSettingsOpen ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5'}`} title="ComfyUI設定">
                  <Settings size={14} />
                </button>
                {isSettingsOpen && <SettingsPopover />}
              </div>
              <select id="snapshot-history-select" value={selectedSnapshotId}
                onChange={(e) => { if (e.target.value) handleLoadSnapshot(Number(e.target.value)) }}
                disabled={!hasHistory}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 max-w-[140px] truncate">
                {!hasHistory ? <option value="">履歴なし</option> : (
                  <>
                    <option value="">過去スナップショットを選択...</option>
                    {snapshots?.map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.created_at)} - {getPromptPrefix(s.params)}</option>)}
                  </>
                )}
              </select>
              <button id="rescan-btn" onClick={() => setRescanOpen(true)} disabled={!selectedWorkflowId} title="マッピングを再スキャン・修正"
                className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 transition-all flex-shrink-0">
                <ScanLine size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            <AuditPanel />
            <MappingErrorPanel />

            {textMappings.length === 0 && !selectedWorkflowId && <div className="flex-1 flex flex-col pt-4">{renderUploadZone()}</div>}

            {textMappings.map((m) => {
              const isNegative = m.role?.toLowerCase().includes('negative')
              return (
                <div key={m.id} className="space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">{m.display_name}</label>
                    <div className="relative">
                      <button type="button" id={`add-asset-btn-${m.role!}`}
                        onClick={() => setOpenAddAssetRole(openAddAssetRole === m.role ? null : m.role!)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                        <Plus size={10} />Add Asset
                      </button>
                      {openAddAssetRole === m.role && <AssetDropdown role={m.role!} />}
                    </div>
                  </div>
                  <TagChipEditor id={`prompt-${m.role!}`} value={paramValues[m.role!] ?? ''}
                    onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                    placeholder={`Enter ${m.display_name}…`}
                    variant={isNegative ? 'negative' : 'positive'} />
                  <AppliedAssetChips role={m.role!} />
                </div>
              )
            })}

            <ParamPanel />
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Preview */}
          <div className="flex-1 relative overflow-hidden bg-grid flex items-center justify-center outline-none" tabIndex={0}>
            {(previewImage || selectedImg) ? (
              <div className="relative h-[70%] w-[70%] flex items-center justify-center border border-zinc-800 shadow-2xl rounded-lg bg-surface-2 overflow-hidden group">
                <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6 gap-3 bg-black/40">
                  <a href={previewImage || selectedImg!} download="generated.png" id="download-btn"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface/90 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-sm font-medium hover:bg-surface">
                    <Download size={15} />Download
                  </a>
                </div>
                {displayImages.length > 1 && (
                  <>
                    {displayImages.indexOf(selectedImg || '') > 0 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); handlePrevImg() }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight size={20} className="rotate-180" />
                      </button>
                    )}
                    {displayImages.indexOf(selectedImg || '') < displayImages.length - 1 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleNextImg() }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight size={20} />
                      </button>
                    )}
                  </>
                )}
                {isGeneratingHere && <div className="absolute top-4 right-4 bg-surface-2/80 backdrop-blur p-2 rounded-full border border-white/10 shadow-lg"><Loader2 size={20} className="animate-spin text-accent-green" /></div>}
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
                {isGeneratingHere ? <Loader2 size={40} className="animate-spin text-accent-green" /> : <ImageOff size={40} strokeWidth={1} />}
                <p className="text-sm">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
              </div>
            )}
            {/* Status bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2 flex flex-col gap-1.5">
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${isGeneratingHere && progress ? progress.percentage : 0}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                <div className="flex items-center gap-2">
                  {isGeneratingHere ? <Loader2 size={12} className="animate-spin text-accent-green flex-shrink-0" /> : <div className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />}
                  <span className="font-semibold text-zinc-300">{isGeneratingHere ? 'Generating...' : 'Ready'}</span>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-350">Queue: {totalQueueCount}</span>
                </div>
                <span className="font-mono text-accent-green font-semibold">{isGeneratingHere && progress ? progress.percentage : 0}%</span>
              </div>
            </div>
          </div>

          {/* Thumbnail Strip */}
          {showStrip && (
            <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5">
                <div className="flex gap-4">
                  {(['history', 'snapshots'] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setThumbnailTab(tab)}
                      className={`text-xs font-semibold pb-1 border-b-2 transition-all ${thumbnailTab === tab ? 'border-accent-green text-zinc-150' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                      {tab === 'history' ? '履歴 (History)' : 'スナップショット (Snapshots)'}
                    </button>
                  ))}
                </div>
                {thumbnailTab === 'history' && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" id="session-filter-toggle" checked={filterOwnSession} onChange={(e) => setFilterOwnSession(e.target.checked)} className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer" />
                    <span className="text-[11px] text-zinc-400">自セッションのみ表示</span>
                  </label>
                )}
              </div>
              {thumbnailTab === 'history' ? (
                displayImages.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {displayImages.map((img, i) => (
                      <button key={i} type="button" id={`thumb-${i}`} onClick={() => setSelectedImg(img)}
                        className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${selectedImg === img ? 'border-accent-green' : 'border-transparent hover:border-zinc-600'}`}>
                        <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : <p className="text-xs text-zinc-600 py-2">No history images found for this session.</p>
              ) : (
                snapshots && snapshots.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {snapshots.map((snap) => (
                      <button key={snap.id} type="button" onClick={() => handleLoadSnapshot(snap.id)}
                        className="flex-shrink-0 flex flex-col items-center gap-1.5 p-1 rounded-md border border-[rgba(255,255,255,0.06)] hover:border-accent-green/45 bg-surface-2/40 hover:bg-surface-2 transition-all w-24 group">
                        <div className="w-20 h-20 rounded overflow-hidden bg-black/40">
                          {snap.image_path ? <img src={snap.image_path} alt="Snapshot" className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center text-zinc-650"><ImageOff size={16} /></div>}
                        </div>
                        <span className="text-[9px] text-zinc-400 text-center truncate w-full font-mono">{getPromptPrefix(snap.params) || `Snap #${snap.id}`}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-xs text-zinc-650 py-2 italic">No snapshots available for this workflow.</p>
              )}
            </div>
          )}

          {/* Action Bar */}
          <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-3">
            <button id="generate-btn" onClick={handleGenerate} disabled={!selectedWorkflowId || !isConnected}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95">
              <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
            </button>
            <button id="save-snapshot-btn" onClick={() => setIsSaveModalOpen(true)} disabled={!selectedImg}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <Camera size={15} /><span className="hidden sm:inline">Save Snapshot</span>
            </button>
          </div>
        </div>
      </div>

      <Modals />
    </>
  )
}
