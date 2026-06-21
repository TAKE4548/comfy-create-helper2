import { useState, useEffect, useMemo } from 'react'
import {
  Zap, Shuffle, Lock, Download, Camera, Settings,
  Loader2, ChevronRight, ChevronDown, Wand2, AlertCircle, CheckCircle2,
  ImageOff, ScanLine, Plus, X, CheckSquare, Square,
} from 'lucide-react'
import { useMultiSelect } from '../hooks/useMultiSelect'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, snapshotsApi, mappingMastersApi, lorasApi, tagSetsApi, workflowPresetsApi } from '../api/client'
import type { Workflow, MappingMaster, Lora, TagSet, WorkflowPreset } from '../api/types'
import { useGenerationStore } from '../store/useGenerationStore'
import type { AppliedAsset } from '../store/useGenerationStore'
import { RescanModal } from '../components/RescanModal'
import { UploadWorkflowModal } from '../components/UploadWorkflowModal'
import { TagChipEditor } from '../components/TagChipEditor'
import { LoraStackEditor } from '../components/LoraStackEditor'
import { HistoryModalPreview } from '../components/HistoryModalPreview'
import { JobManagementModal } from '../components/JobManagementModal'
import { AddSnapshotToAlbumModal } from '../components/AddSnapshotToAlbumModal'
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

// ── Top-level components extracted to prevent re-creation and mobile crashes ──

interface SettingsPopoverProps {
  setIsSettingsOpen: (open: boolean) => void
  localComfyUrl: string
  setLocalComfyUrl: (url: string) => void
  setComfyUrl: (url: string) => void
  selectedWorkflowId: number | null
  workflow: any
  handleSaveDefaultParams: () => void
  isSavePending: boolean
  handleResetDefaultParams: () => void
  mobile?: boolean
}

const SettingsPopover = ({
  setIsSettingsOpen,
  localComfyUrl,
  setLocalComfyUrl,
  setComfyUrl,
  selectedWorkflowId,
  workflow,
  handleSaveDefaultParams,
  isSavePending,
  handleResetDefaultParams,
  mobile = false,
}: SettingsPopoverProps) => (
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
            disabled={isSavePending}
            className="flex-1 py-1.5 rounded bg-accent-green/10 hover:bg-accent-green/20 border border-accent-green/30 text-accent-green text-[10px] font-semibold disabled:opacity-40"
          >デフォルト保存</button>
          <button
            type="button"
            onClick={() => { handleResetDefaultParams(); setIsSettingsOpen(false) }}
            className="flex-1 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.06)] text-zinc-350 text-[10px] font-semibold"
          >リreset</button>
        </div>
      </div>
    )}
  </div>
)

interface AssetDropdownProps {
  role: string
  loras?: Lora[]
  tagSets?: TagSet[]
  setLoraStrength: (strength: number) => void
  setSelectedTriggerSetId: (id: number | 'default') => void
  setSelectedLoraForModal: (data: { role: string; lora: Lora } | null) => void
  setOpenAddAssetRole: (role: string | null) => void
  handleAddTagSetAsset: (role: string, ts: TagSet) => void
}

const AssetDropdown = ({
  role,
  loras,
  tagSets,
  setLoraStrength,
  setSelectedTriggerSetId,
  setSelectedLoraForModal,
  setOpenAddAssetRole,
  handleAddTagSetAsset,
}: AssetDropdownProps) => (
  <div className="absolute right-0 mt-1 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl z-20 max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-3">
    <div>
      <p className="text-[10px] font-semibold text-zinc-505 uppercase px-2 py-1 border-b border-[rgba(255,255,255,0.05)]">LoRAs</p>
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

interface AppliedAssetChipsProps {
  role: string
  appliedAssets: Record<string, AppliedAsset[]>
  toggleAppliedAsset: (role: string, id: string) => void
  removeAppliedAsset: (role: string, id: string) => void
}

const AppliedAssetChips = ({
  role,
  appliedAssets,
  toggleAppliedAsset,
  removeAppliedAsset,
}: AppliedAssetChipsProps) => {
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

interface AuditPanelProps {
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

const AuditPanel = ({
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
          className="w-full bg-[rgba(124,111,221,0.08)] border border-[rgba(124,111,221,0.2)] rounded-md px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-[#7C6FDD]/60" />
        <button id="run-audit-btn" onClick={runAudit} disabled={auditStatus === 'loading'}
          className="w-full py-2 rounded-md bg-[#7C6FDD] text-white text-xs font-semibold hover:bg-[#6d62cc] disabled:opacity-50 transition-all glow-purple">
          {auditStatus === 'loading' ? 'Running…' : 'Run Audit'}
        </button>
        {auditResult && (
          <div className="space-y-2 text-xs">
            {auditResult.interference && auditResult.interference.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-505 font-medium mb-1">Interference</p>
                {auditResult.interference.map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                    <div className="flex gap-2 items-start">
                      <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                      <div><span className="text-red-300 font-mono">{item.tag}</span><span className="text-zinc-505 ml-2">{item.reason}</span></div>
                    </div>
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag: item.tag } }))}
                      className="text-[10px] px-1.5 py-0.5 bg-red-950/30 hover:bg-red-900/40 text-red-300 border border-red-900/30 rounded transition-colors">無効化</button>
                  </div>
                ))}
              </div>
            )}
            {auditResult.vocabulary && auditResult.vocabulary.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-505 font-medium mb-1">Suggestions</p>
                {auditResult.vocabulary.map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 items-start py-1.5 border-t border-[rgba(255,255,255,0.05)] justify-between">
                    <div className="flex gap-2 items-start">
                      <CheckCircle2 size={12} className="text-accent-green mt-0.5 flex-shrink-0" />
                      <div><span className="text-accent-green font-mono">+{item.suggestion}</span><span className="text-zinc-505 ml-2">{item.effect}</span></div>
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

interface MappingErrorPanelProps {
  selectedWorkflowId: number | null
  invalidMappings: any[]
  selectedMasters: Record<number, number>
  setSelectedMasters: (prev: Record<number, number> | ((prev: Record<number, number>) => Record<number, number>)) => void
  mappingMasters?: MappingMaster[]
  handleUpdateMapping: (id: number, masterId: number) => void
  isUpdatingMapping: boolean
}

const MappingErrorPanel = ({
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

const DEFAULT_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'heunpp2', 'dpm_2', 'dpm_2_ancestral',
  'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde',
  'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'ddim', 'uni_pc', 'uni_pc_bh2'
]

const DEFAULT_SCHEDULERS = [
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'
]

interface ParamPanelProps {
  paramMappings: any[]
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
  loras?: Lora[]
  batchSize: number
  setBatchSize: (size: number) => void
  seedMode: 'random' | 'fixed'
  setSeedMode: (mode: 'random' | 'fixed') => void
  seed: number
  setSeed: (seed: number) => void
  mobile?: boolean
  comfyObjectInfo?: any
}

const ParamPanel = ({
  paramMappings,
  paramValues,
  setParamValues,
  loras,
  batchSize,
  setBatchSize,
  seedMode,
  setSeedMode,
  seed,
  setSeed,
  mobile = false,
  comfyObjectInfo,
}: ParamPanelProps) => {
  if (paramMappings.length === 0) return null
  return (
    <div className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 ${mobile ? 'p-3.5' : 'p-3'} space-y-3`}>
      <p className="text-xs font-medium text-zinc-505 uppercase tracking-wider">Parameters</p>
      {paramMappings.map((m) => {
        if (m.input_type === 'lora_stack') {
          return (
            <LoraStackEditor
              key={m.id}
              role={m.role!}
              paramValues={paramValues}
              setParamValues={setParamValues}
              loras={loras}
              title={m.display_name || undefined}
            />
          )
        }
        return (
          <div key={m.id} className="flex items-center justify-between gap-4">
            <label className="text-xs text-zinc-400 flex-shrink-0">{m.display_name}</label>
            {m.input_type === 'select_sampler' ? (
              <select id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} value={paramValues[m.role!] ?? ''}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40`}>
                <option value="">Select sampler…</option>
                {(comfyObjectInfo?.KSampler?.input?.required?.sampler_name?.[0] || comfyObjectInfo?.KSamplerAdvanced?.input?.required?.sampler_name?.[0] || DEFAULT_SAMPLERS)?.map((name: string) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : m.input_type === 'select_scheduler' ? (
              <select id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} value={paramValues[m.role!] ?? ''}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40`}>
                <option value="">Select scheduler…</option>
                {(comfyObjectInfo?.KSampler?.input?.required?.scheduler?.[0] || comfyObjectInfo?.KSamplerAdvanced?.input?.required?.scheduler?.[0] || DEFAULT_SCHEDULERS)?.map((name: string) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : m.input_type === 'select' ? (
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
        )
      })}
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

  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({})

  const getIsRoleCollapsed = (role: string) => {
    if (collapsedRoles[role] !== undefined) {
      return collapsedRoles[role];
    }
    return localStorage.getItem(`prompt-surgeon-collapsed-${role}`) === 'true';
  };

  const setRoleCollapsed = (role: string, isCollapsed: boolean) => {
    setCollapsedRoles((prev) => ({ ...prev, [role]: isCollapsed }));
    localStorage.setItem(`prompt-surgeon-collapsed-${role}`, String(isCollapsed));
  };

  useEffect(() => {
    const handleTextModeToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const editorId = customEvent.detail?.id;
      if (editorId && editorId.startsWith('prompt-')) {
        const role = editorId.replace('prompt-', '');
        setRoleCollapsed(role, false);
      }
    };
    window.addEventListener('tag-chip-editor:text-mode-toggle', handleTextModeToggle);
    return () => window.removeEventListener('tag-chip-editor:text-mode-toggle', handleTextModeToggle);
  }, []);
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
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')

  // ── Store ────────────────────────────────────────────────────
  const {
    clientId, isConnected, isGenerating, progress, previewImage, activeClientId,
    filterOwnSession, setFilterOwnSession,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    batchImages, selectedImg, setSelectedImg,
    comfyHistoryImages, appliedAssets,
    addAppliedAsset, removeAppliedAsset, toggleAppliedAsset, setAppliedAssets,
    comfyUrl, setComfyUrl,
    queueRunning, queuePending,
    sets, activeSetId, addSet, removeSet, renameSet,
    toggleSetChecked, setAllSetsChecked, setActiveSetId, updateActiveSet,
    activeBatch,
  } = useGenerationStore()

  const batchProgress = useMemo(() => {
    if (!activeBatch || activeBatch.length === 0) {
      return {
        percentage: progress ? progress.percentage : 0,
        text: 'Generating...'
      }
    }
    const n = activeBatch.length
    const finished = activeBatch.filter((j) => j.status === 'completed' || j.status === 'failed').length
    const hasGenerating = activeBatch.some((j) => j.status === 'generating')
    
    const currentFraction = (hasGenerating && progress && progress.max > 0)
      ? (progress.value / progress.max)
      : 0
      
    const rawPercentage = ((finished + currentFraction) / n) * 100
    const percentage = Math.min(100, Math.max(0, Math.round(rawPercentage)))
    
    return {
      percentage,
      text: `Generating (${finished}/${n} Complete)...`
    }
  }, [activeBatch, progress])

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
  const { data: presets } = useQuery({
    queryKey: ['workflow-presets', selectedWorkflowId],
    queryFn: () => workflowPresetsApi.list(selectedWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: !!selectedWorkflowId,
  })
  const { data: comfyObjectInfo } = useQuery({
    queryKey: ['comfy-object-info', comfyUrl],
    queryFn: async () => {
      const res = await fetch(comfyUrl + '/object_info', { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error('Failed to fetch object info')
      return res.json()
    },
    enabled: !!comfyUrl,
    retry: false,
  })

  // ── Extracted hooks ──────────────────────────────────────────
  const { loadSnapshotParams, handleSaveDefaultParams, handleResetDefaultParams, saveDefaultParamsMutation } =
    useWorkflowParams(workflow, selectedWorkflowId)

  const { handleGenerateSets } = useGenerateAction(workflow)

  const displayImages = filterOwnSession ? batchImages : comfyHistoryImages
  const sortedDisplayImages = useMemo(() => {
    return sortOrder === 'desc' ? displayImages : [...displayImages].reverse()
  }, [displayImages, sortOrder])
  
  const getSetNameForImage = (imgUrl: string) => {
    try {
      const url = new URL(imgUrl)
      const promptId = url.searchParams.get('t')
      if (promptId) {
        const mappings = JSON.parse(localStorage.getItem('prompt-surgeon-prompt-to-set-map') || '{}')
        return mappings[promptId] || null
      }
    } catch {}
    return null
  }
  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return []
    const copy = [...snapshots] as SnapshotSummaryWithParams[]
    return sortOrder === 'desc'
      ? copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [snapshots, sortOrder])
  const { handlePrevImg, handleNextImg } = useImageNavigation(sortedDisplayImages)

  const historyItems = useMemo(() => {
    return sortedDisplayImages.map((url, idx) => ({ id: idx, url }))
  }, [sortedDisplayImages])

  const {
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
  } = useMultiSelect({ items: historyItems })

  const {
    isSaveModalOpen, setIsSaveModalOpen,
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

  const createPresetMutation = useMutation({
    mutationFn: (name: string) => workflowPresetsApi.create({
      workflow_id: selectedWorkflowId!,
      name,
      param_values: paramValues,
      applied_assets: appliedAssets,
      batch_size: batchSize,
      seed_mode: seedMode,
      seed: seed,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setNewPresetName('')
    }
  })

  const updatePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowPresetsApi.update(id, {
      name,
      param_values: paramValues,
      applied_assets: appliedAssets,
      batch_size: batchSize,
      seed_mode: seedMode,
      seed: seed,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const deletePresetMutation = useMutation({
    mutationFn: (id: number) => workflowPresetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const handleCreatePreset = () => {
    if (!newPresetName.trim() || !selectedWorkflowId) return
    createPresetMutation.mutate(newPresetName.trim())
  }

  const handleUpdatePreset = (id: number, name: string) => {
    if (!selectedWorkflowId) return
    if (confirm(`現在の設定でプリセット「${name}」を上書き保存しますか？`)) {
      updatePresetMutation.mutate({ id, name })
    }
  }

  const handleDeletePreset = (id: number) => {
    if (confirm('このプリセットを削除しますか？')) {
      deletePresetMutation.mutate(id)
    }
  }

  const handleLoadPreset = (preset: WorkflowPreset) => {
    setParamValues(preset.param_values)
    setAppliedAssets(preset.applied_assets)
    setBatchSize(preset.batch_size)
    setSeedMode(preset.seed_mode as 'random' | 'fixed')
    setSeed(preset.seed)
    
    updateActiveSet({
      paramValues: preset.param_values,
      appliedAssets: preset.applied_assets,
      batchSize: preset.batch_size,
      seedMode: preset.seed_mode as 'random' | 'fixed',
      seed: preset.seed
    })
    setIsPresetOpen(false)
  }

  // ── Derived state ────────────────────────────────────────────
  const isGeneratingHere = isGenerating && (!filterOwnSession || activeClientId === clientId)

  const totalQueueCount = useMemo(() => {
    const filterJob = (job: any) => !filterOwnSession || job[3]?.client_id === clientId
    return queueRunning.filter(filterJob).length + queuePending.filter(filterJob).length
  }, [queueRunning, queuePending, filterOwnSession, clientId])

  const snapshotIdsForDisplay = useMemo(() => {
    return sortedDisplayImages.map((img) => {
      const found = sortedSnapshots?.find((s) => s.image_path === img)
      return found ? found.id : null
    })
  }, [sortedDisplayImages, sortedSnapshots])
  const showStrip = batchImages.length > 0 || comfyHistoryImages.length > 0 || (!!sortedSnapshots && sortedSnapshots.length > 0)
  const hasHistory = !!selectedWorkflowId && !!sortedSnapshots && sortedSnapshots.length > 0

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
  const handleLoadSnapshot = async (id: number) => {
    try {
      const snapshot = (await snapshotsApi.get(id)) as any
      if (snapshot.params) {
        loadSnapshotParams(snapshot.params)
      }
      
      const rebuiltAssets: Record<string, AppliedAsset[]> = {}
      
      if (snapshot.loras && loras) {
        snapshot.loras.forEach((sl: any) => {
          const matchedLora = loras.find((l) => l.id === sl.lora_id)
          if (matchedLora) {
            const path = matchedLora.file_path || matchedLora.model_name || ''
            const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora'
            const role = sl.role || 'positive'
            
            if (!rebuiltAssets[role]) rebuiltAssets[role] = []
            
            rebuiltAssets[role].push({
              id: `lora-${sl.lora_id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'lora',
              assetId: sl.lora_id,
              name: matchedLora.description || filename,
              enabled: true,
              tags: matchedLora.trigger_word_sets?.[0]?.words || [],
              loraPromptString: `<lora:${filename}:${sl.strength.toFixed(1)}>`,
            })
          }
        })
      }
      
      if (snapshot.tag_sets && tagSets) {
        snapshot.tag_sets.forEach((st: any) => {
          const matchedTagSet = tagSets.find((t) => t.id === st.tag_set_id)
          if (matchedTagSet) {
            const role = st.role || 'positive'
            
            if (!rebuiltAssets[role]) rebuiltAssets[role] = []
            
            rebuiltAssets[role].push({
              id: `tagset-${st.tag_set_id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'tagset',
              assetId: st.tag_set_id,
              name: matchedTagSet.name,
              enabled: true,
              tags: matchedTagSet.tags,
            })
          }
        })
      }
      
      setAppliedAssets(rebuiltAssets)
    } catch (e) {
      console.error('Failed to load snapshot details:', e)
    }
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
    setRoleCollapsed(role, false)
  }

  const handleAddTagSetAsset = (role: string, ts: TagSet) => {
    addAppliedAsset(role, { type: 'tagset', assetId: ts.id, name: ts.name, tags: ts.tags || [] })
    setOpenAddAssetRole(null)
    setRoleCollapsed(role, false)
  }

  const handleOpenModalPreview = () => {
    const currentImg = previewImage || selectedImg
    if (!currentImg) return
    const idx = sortedDisplayImages.indexOf(currentImg)
    setModalPreviewIndex(idx >= 0 ? idx : 0)
    setIsModalPreviewOpen(true)
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
                {isSettingsOpen && (
                  <SettingsPopover
                    setIsSettingsOpen={setIsSettingsOpen}
                    localComfyUrl={localComfyUrl}
                    setLocalComfyUrl={setLocalComfyUrl}
                    setComfyUrl={setComfyUrl}
                    selectedWorkflowId={selectedWorkflowId}
                    workflow={workflow}
                    handleSaveDefaultParams={handleSaveDefaultParams}
                    isSavePending={saveDefaultParamsMutation.isPending}
                    handleResetDefaultParams={handleResetDefaultParams}
                    mobile
                  />
                )}
              </div>
              <select id="snapshot-history-select-mobile" value={selectedSnapshotId}
                onChange={(e) => { if (e.target.value) handleLoadSnapshot(Number(e.target.value)) }}
                disabled={!hasHistory}
                className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 max-w-[50%] truncate">
                {!hasHistory ? <option value="">履歴なし</option> : (
                  <>
                    <option value="">過去スナップショットを選択...</option>
                    {sortedSnapshots?.map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.created_at)} - {getPromptPrefix(s.params)}</option>)}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Progress Line */}
          <div className="w-full bg-surface-2 border-b border-[rgba(255,255,255,0.06)] px-4 py-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 min-w-0">
              {isGeneratingHere ? <Loader2 size={10} className="animate-spin text-accent-green flex-shrink-0" /> : <div className="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />}
              <span className="truncate">{isGeneratingHere ? batchProgress.text : 'Ready'}</span>
              <span className="text-zinc-600">|</span>
              <span 
                onClick={() => setIsJobModalOpen(true)}
                className="font-semibold text-zinc-350 cursor-pointer hover:text-white transition-colors"
              >
                Queue: {totalQueueCount}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[150px]">
              <div className="h-1 bg-surface-2 rounded-full border border-white/5 overflow-hidden flex-1">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${isGeneratingHere ? batchProgress.percentage : 0}%` }} />
              </div>
              <span className="font-mono text-accent-green whitespace-nowrap">{isGeneratingHere ? batchProgress.percentage : 0}%</span>
            </div>
          </div>

          {/* Main Preview */}
          <div className="bg-grid relative w-full aspect-video max-h-[300px] flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
            {(previewImage || selectedImg) ? (
              <div className="relative w-full h-full flex items-center justify-center cursor-pointer" onClick={handleOpenModalPreview}>
                <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                {isGeneratingHere && <div className="absolute top-2 right-2 bg-surface-2/80 backdrop-blur p-1.5 rounded-full border border-white/5 shadow-md"><Loader2 size={16} className="animate-spin text-accent-green" /></div>}
                <a href={previewImage || selectedImg!} download="generated.png" id="download-btn-mobile"
                  onClick={(e) => e.stopPropagation()}
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
            {isGeneratingHere && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950 overflow-hidden">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${batchProgress.percentage}%` }} />
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
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] bg-zinc-950/20">
                    {(['desc', 'asc'] as const).map((order) => (
                      <button
                        key={order}
                        type="button"
                        onClick={() => setSortOrder(order)}
                        className={`px-2.5 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
                          sortOrder === order ? 'bg-surface-2 text-zinc-200' : 'text-zinc-550 hover:text-zinc-350'
                        }`}
                      >
                        {order === 'desc' ? '新しい順' : '古い順'}
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
              </div>
              {thumbnailTab === 'history' ? (
                sortedDisplayImages.length > 0 ? (
                  <div className="space-y-2">
                    {isMultiSelectMode && (
                      <div className="flex flex-col gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300">
                        <div className="flex items-center justify-between">
                          <span>{selectedIds.size}枚選択中</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={selectAll} className="text-purple-400 underline">すべて選択</button>
                            <button type="button" onClick={clearSelection} className="text-purple-400 underline">選択解除</button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setIsSaveModalOpen(true)}
                            disabled={selectedIds.size === 0}
                            className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-center disabled:opacity-50"
                          >
                            選択した {selectedIds.size} 枚を保存
                          </button>
                          <button type="button" onClick={exitMultiSelectMode} className="text-zinc-400">
                            ✕ 閉じる
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                      {sortedDisplayImages.map((img, i) => {
                        const longPressHandlers = getLongPressHandlers(i)
                        const isSel = isSelected(i)
                        return (
                          <button key={i} type="button" id={`thumb-mobile-${i}`}
                            onMouseDown={longPressHandlers.onMouseDown}
                            onMouseUp={longPressHandlers.onMouseUp}
                            onMouseLeave={longPressHandlers.onMouseLeave}
                            onTouchStart={longPressHandlers.onTouchStart}
                            onTouchEnd={longPressHandlers.onTouchEnd}
                            onClick={(e) => {
                              if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                                handleItemClick(i, e)
                              } else {
                                setSelectedImg(img)
                                setModalPreviewIndex(i)
                                setIsModalPreviewOpen(true)
                              }
                            }}
                            className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all relative ${
                              isMultiSelectMode
                                ? isSel
                                  ? 'border-purple-500 ring-2 ring-purple-500/30'
                                  : 'border-transparent'
                                : selectedImg === img
                                  ? 'border-accent-green'
                                  : 'border-transparent hover:border-zinc-600'
                            }`}>
                            <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                            {getSetNameForImage(img) && (
                              <span className="absolute top-0.5 left-0.5 bg-black/75 text-accent-green text-[7px] font-bold px-1 rounded select-none truncate max-w-[90%] font-medium">
                                {getSetNameForImage(img)}
                              </span>
                            )}
                            {isMultiSelectMode && (
                              <div className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-black/60 text-purple-400 border border-[rgba(255,255,255,0.08)]">
                                {isSel ? <CheckSquare size={10} /> : <Square size={10} />}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : <p className="text-[10px] text-zinc-650 py-1">No history images found for this session.</p>
              ) : (
                sortedSnapshots && sortedSnapshots.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {sortedSnapshots.map((snap) => (
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
            const isCollapsed = getIsRoleCollapsed(activeMapping.role!)
            return (
              <div className="px-4 py-3 space-y-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/10">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setRoleCollapsed(activeMapping.role!, !isCollapsed)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
                  >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span>{activeMapping.display_name} Input</span>
                  </button>
                  {!isCollapsed && (
                    <div className="relative">
                      <button type="button" id={`add-asset-btn-mobile-${activeMapping.role!}`}
                        onClick={() => setOpenAddAssetRole(openAddAssetRole === activeMapping.role ? null : activeMapping.role!)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                        <Plus size={10} />Add Asset
                      </button>
                      {openAddAssetRole === activeMapping.role && (
                        <AssetDropdown
                          role={activeMapping.role!}
                          loras={loras}
                          tagSets={tagSets}
                          setLoraStrength={setLoraStrength}
                          setSelectedTriggerSetId={setSelectedTriggerSetId}
                          setSelectedLoraForModal={setSelectedLoraForModal}
                          setOpenAddAssetRole={setOpenAddAssetRole}
                          handleAddTagSetAsset={handleAddTagSetAsset}
                        />
                      )}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <>
                    <textarea id={`prompt-mobile-${activeMapping.role!}`} value={paramValues[activeMapping.role!] ?? ''}
                      onChange={(e) => setParamValues({ ...paramValues, [activeMapping.role!]: e.target.value })}
                      placeholder={`Enter ${activeMapping.display_name}…`}
                      className="w-full min-h-[100px] bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-sm text-[#E4E4E7] placeholder-zinc-650 resize-y focus:outline-none focus:border-accent-green/40" />
                    <AppliedAssetChips
                      role={activeMapping.role!}
                      appliedAssets={appliedAssets}
                      toggleAppliedAsset={toggleAppliedAsset}
                      removeAppliedAsset={removeAppliedAsset}
                    />
                  </>
                )}
              </div>
            )
          })()}

          {/* Mobile Settings & Parameters */}
          <div className="px-4 py-3 space-y-4">
            <AuditPanel
              auditOpen={auditOpen}
              setAuditOpen={setAuditOpen}
              auditStatus={auditStatus}
              auditResult={auditResult}
              auditTypes={auditTypes}
              setAuditTypes={setAuditTypes}
              auditIntent={auditIntent}
              setAuditIntent={setAuditIntent}
              runAudit={() => runAudit.mutate()}
            />
            <MappingErrorPanel
              selectedWorkflowId={selectedWorkflowId}
              invalidMappings={invalidMappings}
              selectedMasters={selectedMasters}
              setSelectedMasters={setSelectedMasters}
              mappingMasters={mappingMasters}
              handleUpdateMapping={handleUpdateMapping}
              isUpdatingMapping={updateWorkflowMutation.isPending}
            />
            <ParamPanel
              mobile
              paramMappings={paramMappings}
              paramValues={paramValues}
              setParamValues={setParamValues}
              loras={loras}
              batchSize={batchSize}
              setBatchSize={setBatchSize}
              seedMode={seedMode}
              setSeedMode={setSeedMode}
              seed={seed}
              setSeed={setSeed}
              comfyObjectInfo={comfyObjectInfo}
            />
          </div>

          {/* Mobile Action Bar */}
          <div className="fixed bottom-16 left-0 right-0 z-45 bg-surface/90 backdrop-blur border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3">
            <button id="generate-btn-mobile" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95">
              <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
            </button>
            <button id="save-snapshot-btn-mobile" onClick={() => setIsSaveModalOpen(true)} disabled={!selectedImg || isMultiSelectMode}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-all">
              <Camera size={15} />
            </button>
          </div>
        </div>

        {/* Modals (shared) */}
        {rescanOpen && workflow && (
          <RescanModal workflowId={selectedWorkflowId!} workflowJson={workflow.json_body} onClose={() => setRescanOpen(false)}
            onSaved={() => { qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] }); setRescanOpen(false) }} />
        )}
        {uploadModalOpen && uploadedJson && (
          <UploadWorkflowModal initialName={uploadedFileName} workflowJson={uploadedJson}
            onClose={() => { setUploadModalOpen(false) }}
            onSaved={(newWorkflowId) => { qc.invalidateQueries({ queryKey: ['workflows'] }); setSelectedWorkflowId(newWorkflowId) }} />
        )}
        <AddSnapshotToAlbumModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onConfirm={(data) => {
            const urls = isMultiSelectMode
              ? [...selectedIds].map(idx => sortedDisplayImages[idx]).filter(Boolean)
              : (selectedImg ? [selectedImg] : [])
            saveSnapshot.mutate({ ...data, imagePaths: urls }, {
              onSuccess: () => {
                if (isMultiSelectMode) {
                  exitMultiSelectMode()
                }
              }
            })
          }}
          isPending={saveSnapshot.isPending}
          title="スナップショットを保存"
          confirmText="保存"
          allowNone={true}
        />
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
          images={sortedDisplayImages} currentIndex={modalPreviewIndex} onChangeIndex={setModalPreviewIndex} snapshotIds={snapshotIdsForDisplay} />
        <JobManagementModal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} />
      </>
    )
  }

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
                {isSettingsOpen && (
                  <SettingsPopover
                    setIsSettingsOpen={setIsSettingsOpen}
                    localComfyUrl={localComfyUrl}
                    setLocalComfyUrl={setLocalComfyUrl}
                    setComfyUrl={setComfyUrl}
                    selectedWorkflowId={selectedWorkflowId}
                    workflow={workflow}
                    handleSaveDefaultParams={handleSaveDefaultParams}
                    isSavePending={saveDefaultParamsMutation.isPending}
                    handleResetDefaultParams={handleResetDefaultParams}
                  />
                )}
              </div>
              <select id="snapshot-history-select" value={selectedSnapshotId}
                onChange={(e) => { if (e.target.value) handleLoadSnapshot(Number(e.target.value)) }}
                disabled={!hasHistory}
                className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 max-w-[140px] truncate">
                {!hasHistory ? <option value="">履歴なし</option> : (
                  <>
                    <option value="">過去スナップショットを選択...</option>
                    {sortedSnapshots?.map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.created_at)} - {getPromptPrefix(s.params)}</option>)}
                  </>
                )}
              </select>
              <button id="rescan-btn" onClick={() => setRescanOpen(true)} disabled={!selectedWorkflowId} title="マッピングを再スキャン・修正"
                className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 transition-all flex-shrink-0">
                <ScanLine size={14} />
              </button>
            </div>
          </div>

          {/* Multi-Set Tab Bar (Desktop only) */}
          {!isMobile && selectedWorkflowId && (
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-5 py-2.5 flex-wrap gap-2.5">
              <div className="flex items-center gap-2 overflow-x-auto max-w-[70%] py-1 scrollbar-thin">
                {sets.map((s) => (
                  <div key={s.id} onClick={() => setActiveSetId(s.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${activeSetId === s.id ? 'bg-accent-green/10 border-accent-green/45 text-accent-green font-medium shadow-sm' : 'bg-zinc-900/30 border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'}`}>
                    <input type="checkbox" checked={s.checked} onChange={(e) => { e.stopPropagation(); toggleSetChecked(s.id) }} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer" />
                    {activeSetId === s.id ? (
                      <input type="text" value={s.name} onChange={(e) => renameSet(s.id, e.target.value)} onClick={(e) => e.stopPropagation()} className="bg-transparent border-none focus:outline-none focus:ring-0 text-xs text-accent-green font-medium p-0 w-16" />
                    ) : (
                      <span onDoubleClick={() => setActiveSetId(s.id)} className="truncate max-w-[80px]">{s.name}</span>
                    )}
                    {sets.length > 1 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeSet(s.id) }} className="text-zinc-500 hover:text-red-400 transition-colors ml-0.5"><X size={10} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto relative">
                <button type="button" onClick={() => setAllSetsChecked(true)} className="text-[10px] text-zinc-500 hover:text-zinc-350 px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.06)] hover:bg-white/5 transition-all">全選択</button>
                <button type="button" onClick={() => setAllSetsChecked(false)} className="text-[10px] text-zinc-500 hover:text-zinc-350 px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.06)] hover:bg-white/5 transition-all">全解除</button>
                <button type="button" onClick={addSet} className="flex items-center gap-1 text-[10px] bg-accent-green/10 border border-accent-green/30 text-accent-green px-2 py-0.5 rounded hover:bg-accent-green/20 transition-all font-semibold"><Plus size={10} />新規セット</button>
                
                {/* プリセット管理 */}
                <button type="button" onClick={() => setIsPresetOpen(!isPresetOpen)} className={`flex items-center gap-1 text-[10px] border px-2 py-0.5 rounded transition-all font-semibold ${isPresetOpen ? 'bg-accent-green border-accent-green text-zinc-950 hover:bg-accent-green/90' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}><Wand2 size={10} />プリセット</button>
                {isPresetOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-3 z-50 space-y-2.5 text-xs text-zinc-350 text-left">
                    <div className="font-semibold border-b border-zinc-850 pb-1.5 text-zinc-200">構成プリセット</div>
                    
                    {/* 保存フォーム */}
                    <div className="flex gap-1.5">
                      <input type="text" placeholder="プリセット名を入力..." value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 focus:outline-none focus:border-accent-green/50 text-[11px]" onKeyDown={(e) => { if (e.key === 'Enter') { handleCreatePreset() } }} />
                      <button onClick={handleCreatePreset} disabled={!newPresetName.trim() || createPresetMutation.isPending} className="bg-accent-green text-zinc-950 font-medium px-2.5 py-1 rounded hover:bg-accent-green-hover disabled:opacity-50 transition-colors text-[11px]">保存</button>
                    </div>
                    
                    {/* リスト */}
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin text-zinc-300">
                      {presets && presets.length > 0 ? (
                        presets.map((preset) => (
                          <div key={preset.id} className="flex items-center justify-between p-1.5 rounded hover:bg-zinc-850 transition-colors group">
                            <span onClick={() => handleLoadPreset(preset)} className="cursor-pointer font-medium hover:text-accent-green transition-colors truncate flex-1 max-w-[140px] text-[11px] text-left">{preset.name}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleUpdatePreset(preset.id, preset.name)} title="現在の設定で上書き" className="text-zinc-400 hover:text-accent-green p-0.5"><CheckCircle2 size={11} /></button>
                              <button onClick={() => handleDeletePreset(preset.id)} title="削除" className="text-zinc-500 hover:text-red-400 p-0.5"><X size={11} /></button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4 text-zinc-500 text-[10px]">保存されたプリセットはありません</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            <AuditPanel
              auditOpen={auditOpen}
              setAuditOpen={setAuditOpen}
              auditStatus={auditStatus}
              auditResult={auditResult}
              auditTypes={auditTypes}
              setAuditTypes={setAuditTypes}
              auditIntent={auditIntent}
              setAuditIntent={setAuditIntent}
              runAudit={() => runAudit.mutate()}
            />
            <MappingErrorPanel
              selectedWorkflowId={selectedWorkflowId}
              invalidMappings={invalidMappings}
              selectedMasters={selectedMasters}
              setSelectedMasters={setSelectedMasters}
              mappingMasters={mappingMasters}
              handleUpdateMapping={handleUpdateMapping}
              isUpdatingMapping={updateWorkflowMutation.isPending}
            />

            {textMappings.length === 0 && !selectedWorkflowId && <div className="flex-1 flex flex-col pt-4">{renderUploadZone()}</div>}

            {textMappings.map((m) => {
              const isNegative = m.role?.toLowerCase().includes('negative')
              const isCollapsed = getIsRoleCollapsed(m.role!)
              return (
                <div key={m.id} className="space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setRoleCollapsed(m.role!, !isCollapsed)}
                      className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <span>{m.display_name}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="relative">
                        <button type="button" id={`add-asset-btn-${m.role!}`}
                          onClick={() => setOpenAddAssetRole(openAddAssetRole === m.role ? null : m.role!)}
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                          <Plus size={10} />Add Asset
                        </button>
                        {openAddAssetRole === m.role && (
                          <AssetDropdown
                            role={m.role!}
                            loras={loras}
                            tagSets={tagSets}
                            setLoraStrength={setLoraStrength}
                            setSelectedTriggerSetId={setSelectedTriggerSetId}
                            setSelectedLoraForModal={setSelectedLoraForModal}
                            setOpenAddAssetRole={setOpenAddAssetRole}
                            handleAddTagSetAsset={handleAddTagSetAsset}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <TagChipEditor id={`prompt-${m.role!}`} value={paramValues[m.role!] ?? ''}
                        onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                        placeholder={`Enter ${m.display_name}…`}
                        variant={isNegative ? 'negative' : 'positive'} />
                      <AppliedAssetChips
                        role={m.role!}
                        appliedAssets={appliedAssets}
                        toggleAppliedAsset={toggleAppliedAsset}
                        removeAppliedAsset={removeAppliedAsset}
                      />
                    </>
                  )}
                </div>
              )
            })}

            <ParamPanel
              paramMappings={paramMappings}
              paramValues={paramValues}
              setParamValues={setParamValues}
              loras={loras}
              batchSize={batchSize}
              setBatchSize={setBatchSize}
              seedMode={seedMode}
              setSeedMode={setSeedMode}
              seed={seed}
              setSeed={setSeed}
              comfyObjectInfo={comfyObjectInfo}
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main Preview */}
          <div className="flex-1 relative overflow-hidden bg-grid flex items-center justify-center outline-none" tabIndex={0}>
            {(previewImage || selectedImg) ? (
              <div className="relative h-[70%] w-[70%] flex items-center justify-center border border-zinc-800 shadow-2xl rounded-lg bg-surface-2 overflow-hidden group cursor-pointer" onClick={handleOpenModalPreview}>
                <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6 gap-3 bg-black/40">
                  <a href={previewImage || selectedImg!} download="generated.png" id="download-btn"
                    onClick={(e) => e.stopPropagation()}
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
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${isGeneratingHere ? batchProgress.percentage : 0}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                <div className="flex items-center gap-2">
                  {isGeneratingHere ? <Loader2 size={12} className="animate-spin text-accent-green flex-shrink-0" /> : <div className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />}
                  <span className="font-semibold text-zinc-300">{isGeneratingHere ? batchProgress.text : 'Ready'}</span>
                  <span className="text-zinc-700">|</span>
                  <span 
                    onClick={() => setIsJobModalOpen(true)}
                    className="text-zinc-350 cursor-pointer hover:text-white transition-colors"
                  >
                    Queue: {totalQueueCount}
                  </span>
                </div>
                <span className="font-mono text-accent-green font-semibold">{isGeneratingHere ? batchProgress.percentage : 0}%</span>
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
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] bg-zinc-950/20">
                    {(['desc', 'asc'] as const).map((order) => (
                      <button
                        key={order}
                        type="button"
                        onClick={() => setSortOrder(order)}
                        className={`px-2.5 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
                          sortOrder === order ? 'bg-surface-2 text-zinc-200' : 'text-zinc-550 hover:text-zinc-350'
                        }`}
                      >
                        {order === 'desc' ? '新しい順' : '古い順'}
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
              </div>
              {thumbnailTab === 'history' ? (
                sortedDisplayImages.length > 0 ? (
                  <div className="space-y-2">
                    {isMultiSelectMode && (
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                        <div className="flex items-center gap-2">
                          <span>{selectedIds.size}枚選択中</span>
                          <button type="button" onClick={selectAll} className="text-purple-400 hover:text-purple-200 font-semibold underline">すべて選択</button>
                          <button type="button" onClick={clearSelection} className="text-purple-400 hover:text-purple-200 font-semibold underline">選択解除</button>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsSaveModalOpen(true)}
                            disabled={selectedIds.size === 0}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            選択した {selectedIds.size} 枚を保存
                          </button>
                          <button type="button" onClick={exitMultiSelectMode} className="text-zinc-400 hover:text-zinc-200 font-semibold">
                            ✕ 選択モード終了
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                      {sortedDisplayImages.map((img, i) => {
                        const longPressHandlers = getLongPressHandlers(i)
                        const isSel = isSelected(i)
                        return (
                          <button key={i} type="button" id={`thumb-${i}`}
                            onMouseDown={longPressHandlers.onMouseDown}
                            onMouseUp={longPressHandlers.onMouseUp}
                            onMouseLeave={longPressHandlers.onMouseLeave}
                            onTouchStart={longPressHandlers.onTouchStart}
                            onTouchEnd={longPressHandlers.onTouchEnd}
                            onClick={(e) => {
                              if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                                handleItemClick(i, e)
                              } else {
                                setSelectedImg(img)
                              }
                            }}
                            className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all relative ${
                              isMultiSelectMode
                                ? isSel
                                  ? 'border-purple-500 ring-2 ring-purple-500/30'
                                  : 'border-transparent'
                                : selectedImg === img
                                  ? 'border-accent-green'
                                  : 'border-transparent hover:border-zinc-600'
                            }`}>
                            <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                            {getSetNameForImage(img) && (
                              <span className="absolute top-0.5 left-0.5 bg-black/75 text-accent-green text-[8px] font-bold px-1 rounded select-none truncate max-w-[90%] font-medium">
                                {getSetNameForImage(img)}
                              </span>
                            )}
                            {isMultiSelectMode && (
                              <div className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-black/60 text-purple-400 border border-[rgba(255,255,255,0.08)]">
                                {isSel ? <CheckSquare size={12} /> : <Square size={12} />}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : <p className="text-xs text-zinc-600 py-2">No history images found for this session.</p>
              ) : (
                sortedSnapshots && sortedSnapshots.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {sortedSnapshots.map((snap) => (
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
            <button id="generate-btn" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95">
              <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
            </button>
             <button id="save-snapshot-btn" onClick={() => setIsSaveModalOpen(true)} disabled={!selectedImg || isMultiSelectMode}
               className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
               <Camera size={15} /><span className="hidden sm:inline">Save Snapshot</span>
             </button>
           </div>
         </div>
       </div>
 
       {rescanOpen && workflow && (
         <RescanModal workflowId={selectedWorkflowId!} workflowJson={workflow.json_body} onClose={() => setRescanOpen(false)}
           onSaved={() => { qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] }); setRescanOpen(false) }} />
       )}
       {uploadModalOpen && uploadedJson && (
         <UploadWorkflowModal initialName={uploadedFileName} workflowJson={uploadedJson}
           onClose={() => { setUploadModalOpen(false) }}
           onSaved={(newWorkflowId) => { qc.invalidateQueries({ queryKey: ['workflows'] }); setSelectedWorkflowId(newWorkflowId) }} />
       )}
       <AddSnapshotToAlbumModal
         isOpen={isSaveModalOpen}
         onClose={() => setIsSaveModalOpen(false)}
         onConfirm={(data) => {
           const urls = isMultiSelectMode
             ? [...selectedIds].map(idx => sortedDisplayImages[idx]).filter(Boolean)
             : (selectedImg ? [selectedImg] : [])
           saveSnapshot.mutate({ ...data, imagePaths: urls }, {
             onSuccess: () => {
               if (isMultiSelectMode) {
                 exitMultiSelectMode()
               }
             }
           })
         }}
         isPending={saveSnapshot.isPending}
         title="スナップショットを保存"
        confirmText="保存"
        allowNone={true}
      />
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
        images={sortedDisplayImages} currentIndex={modalPreviewIndex} onChangeIndex={setModalPreviewIndex} snapshotIds={snapshotIdsForDisplay} />
      <JobManagementModal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} />
    </>
  )
}
