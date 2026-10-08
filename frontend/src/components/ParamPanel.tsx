import { useState } from 'react'
import { Shuffle, Lock, Settings, Link, ChevronDown, ChevronRight } from 'lucide-react'
import type { Lora, ParamTypeMaster, ParamSyncGroup } from '../api/types'
import { LoraStackEditor } from './LoraStackEditor'
import { SearchableLoraSelect } from './SearchableLoraSelect'
import { LS_KEYS } from '../utils/localStorageKeys'

export const DEFAULT_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'heunpp2', 'dpm_2', 'dpm_2_ancestral',
  'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde',
  'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'ddim', 'uni_pc', 'uni_pc_bh2'
]

export const DEFAULT_SCHEDULERS = [
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta'
]

export interface GenerateSectionsExpandedState {
  parameters: boolean;
  paramSync: boolean;
  bypass: boolean;
}

const DEFAULT_EXPANDED_STATE: GenerateSectionsExpandedState = {
  parameters: true,
  paramSync: true,
  bypass: true,
};

export interface ParamPanelProps {
  paramMappings: any[]
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
  loras?: Lora[]
  paramTypeMasters?: ParamTypeMaster[]
  batchSize?: number
  setBatchSize?: (size: number) => void
  seedMode?: 'random' | 'fixed'
  setSeedMode?: (mode: 'random' | 'fixed') => void
  seed?: number
  setSeed?: (seed: number) => void
  mobile?: boolean
  comfyObjectInfo?: any
  bypassProfiles?: any[]
  onToggleBypass?: (profileId: number, isEnabled: boolean) => void
  onOpenBypassSettings?: () => void
  paramSyncGroups?: ParamSyncGroup[]
  onToggleParamSync?: (groupId: number, isEnabled: boolean) => void
  onOpenParamSyncSettings?: () => void
  activeBaseModelId?: number | null
}

export const ParamPanel = ({
  paramMappings,
  paramValues,
  setParamValues,
  loras,
  paramTypeMasters,
  batchSize,
  setBatchSize,
  seedMode,
  setSeedMode,
  seed,
  setSeed,
  mobile = false,
  comfyObjectInfo,
  bypassProfiles = [],
  onToggleBypass,
  onOpenBypassSettings,
  paramSyncGroups = [],
  onToggleParamSync,
  onOpenParamSyncSettings,
  activeBaseModelId,
}: ParamPanelProps) => {
  const [expandedSections, setExpandedSections] = useState<GenerateSectionsExpandedState>(() => {
    try {
      const stored = localStorage.getItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED);
      return stored ? { ...DEFAULT_EXPANDED_STATE, ...JSON.parse(stored) } : DEFAULT_EXPANDED_STATE;
    } catch {
      return DEFAULT_EXPANDED_STATE;
    }
  });

  const toggleSection = (key: keyof GenerateSectionsExpandedState) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(LS_KEYS.GENERATE_SECTIONS_EXPANDED, JSON.stringify(next));
      return next;
    });
  };

  if (paramMappings.length === 0) return null

  // Active slave roles and their master group mapping
  const activeSlaveMap = new Map<string, ParamSyncGroup>()
  paramSyncGroups.filter((g) => g.is_enabled).forEach((g) => {
    g.slave_roles.forEach((slaveRole) => {
      activeSlaveMap.set(slaveRole, g)
    })
  })

  return (
    <div className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 ${mobile ? 'p-3.5' : 'p-3'} space-y-3`}>
      {/* Parameters Header */}
      <button
        type="button"
        id={`parameters-section-toggle${mobile ? '-mobile' : ''}`}
        onClick={() => toggleSection('parameters')}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors w-full text-left focus:outline-none"
      >
        {expandedSections.parameters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Parameters</span>
      </button>

      {expandedSections.parameters && (
        <div className="space-y-3 pt-1">
      {paramMappings.map((m) => {
        const syncGroup = activeSlaveMap.get(m.role!)
        const isSyncedSlave = Boolean(syncGroup)
        const masterDisplayName = syncGroup ? (paramMappings.find((pm) => pm.role === syncGroup.master_role)?.display_name || syncGroup.master_role) : ''

        if (m.input_type === 'lora_stack') {
          return (
            <LoraStackEditor
              key={m.id}
              role={m.role!}
              paramValues={paramValues}
              setParamValues={setParamValues}
              loras={loras}
              title={m.display_name || undefined}
              activeBaseModelId={activeBaseModelId}
            />
          )
        }
        return (
          <div key={m.id} className="flex items-center justify-between gap-4">
            <div className="flex flex-col min-w-0 flex-shrink-0">
              <label className="text-xs text-zinc-400 truncate">{m.display_name}</label>
              {isSyncedSlave && (
                <span className="text-[9px] text-accent-green/80 flex items-center gap-0.5" title={`Synced with ${masterDisplayName}`}>
                  <Link size={9} /> Synced: {masterDisplayName}
                </span>
              )}
            </div>
            {m.input_type === 'select_sampler' ? (
              <select id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} value={paramValues[m.role!] ?? ''}
                disabled={isSyncedSlave}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 disabled:opacity-40 disabled:cursor-not-allowed`}>
                <option value="">Select sampler…</option>
                {(comfyObjectInfo?.KSampler?.input?.required?.sampler_name?.[0] || comfyObjectInfo?.KSamplerAdvanced?.input?.required?.sampler_name?.[0] || DEFAULT_SAMPLERS)?.map((name: string) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : m.input_type === 'select_scheduler' ? (
              <select id={`param-${mobile ? 'mobile-' : ''}${m.role!}`} value={paramValues[m.role!] ?? ''}
                disabled={isSyncedSlave}
                onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 disabled:opacity-40 disabled:cursor-not-allowed`}>
                <option value="">Select scheduler…</option>
                {(comfyObjectInfo?.KSampler?.input?.required?.scheduler?.[0] || comfyObjectInfo?.KSamplerAdvanced?.input?.required?.scheduler?.[0] || DEFAULT_SCHEDULERS)?.map((name: string) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : m.input_type === 'select' ? (
              <SearchableLoraSelect
                value={paramValues[m.role!] ?? ''}
                onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                loras={loras}
                activeBaseModelId={activeBaseModelId}
                className={`${mobile ? 'w-36' : 'w-48'} ${isSyncedSlave ? 'opacity-40 pointer-events-none' : ''}`}
                placeholder="Select option…"
              />
            ) : m.input_type === 'boolean' ? (
              <button
                id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                type="button"
                disabled={isSyncedSlave}
                onClick={() => {
                  const currentVal = paramValues[m.role!] === 'true'
                  setParamValues({ ...paramValues, [m.role!]: currentVal ? 'false' : 'true' })
                }}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                  paramValues[m.role!] === 'true' ? 'bg-accent-green' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    paramValues[m.role!] === 'true' ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            ) : (() => {
              const customType = paramTypeMasters?.find((ptm) => ptm.name === m.input_type)
              if (customType) {
                if (customType.widget_type === 'select' && customType.combo_options) {
                  return (
                    <select
                      id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                      value={paramValues[m.role!] ?? ''}
                      disabled={isSyncedSlave}
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <option value="">選択してください…</option>
                      {customType.combo_options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )
                } else if (customType.widget_type === 'boolean') {
                  return (
                    <button
                      id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                      type="button"
                      disabled={isSyncedSlave}
                      onClick={() => {
                        const currentVal = paramValues[m.role!] === 'true'
                        setParamValues({ ...paramValues, [m.role!]: currentVal ? 'false' : 'true' })
                      }}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                        paramValues[m.role!] === 'true' ? 'bg-accent-green' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          paramValues[m.role!] === 'true' ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  )
                } else {
                  return (
                    <input
                      id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                      type={customType.widget_type === 'textarea' ? 'text' : 'number'}
                      value={paramValues[m.role!] ?? ''}
                      disabled={isSyncedSlave}
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      min={customType.min_value ?? undefined}
                      max={customType.max_value ?? undefined}
                      step={customType.step ?? (customType.widget_type === 'float' ? 0.01 : 1)}
                      className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right disabled:opacity-40 disabled:cursor-not-allowed`}
                    />
                  )
                }
              }
              return (
                <input
                  id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                  type="number"
                  value={paramValues[m.role!] ?? ''}
                  disabled={isSyncedSlave}
                  onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                  step={m.input_type === 'float' ? 0.1 : 1}
                  className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right disabled:opacity-40 disabled:cursor-not-allowed`}
                />
              )
            })()}
          </div>
        )
      })}
      {typeof batchSize === 'number' && setBatchSize && (
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs text-zinc-400">Batch Size</label>
          <input id={`batch-size${mobile ? '-mobile' : ''}`} type="number" min={1} max={8} value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right`} />
        </div>
      )}
      {typeof seed === 'number' && setSeed && seedMode && setSeedMode && (
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
      )}
    </div>
  )}

      {/* Param Sync Section */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            id={`paramsync-section-toggle${mobile ? '-mobile' : ''}`}
            onClick={() => toggleSection('paramSync')}
            className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors focus:outline-none"
          >
            {expandedSections.paramSync ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Param Sync</span>
          </button>
          <button
            id={`param-sync-settings-btn${mobile ? '-mobile' : ''}`}
            type="button"
            onClick={onOpenParamSyncSettings}
            className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1"
            title="Param Sync Settings"
          >
            <Settings size={12} />
            <span className="text-[10px] text-zinc-400 hover:underline">Settings</span>
          </button>
        </div>

        {expandedSections.paramSync && (
          <div className="pt-1">
            {paramSyncGroups && paramSyncGroups.length > 0 ? (
              <div className="space-y-1.5">
                {paramSyncGroups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-zinc-400 truncate max-w-[150px]">{g.name}</span>
                    <button
                      id={`param-sync-toggle-${g.id}${mobile ? '-mobile' : ''}`}
                      type="button"
                      onClick={() => onToggleParamSync?.(g.id, !g.is_enabled)}
                      className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        g.is_enabled ? 'bg-accent-green' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          g.is_enabled ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500 italic">No sync groups. Open Settings to add.</p>
            )}
          </div>
        )}
      </div>

      {/* Bypass Section */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            id={`bypass-section-toggle${mobile ? '-mobile' : ''}`}
            onClick={() => toggleSection('bypass')}
            className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors focus:outline-none"
          >
            {expandedSections.bypass ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Bypasses</span>
          </button>
          <button
            id={`bypass-settings-btn${mobile ? '-mobile' : ''}`}
            type="button"
            onClick={onOpenBypassSettings}
            className="p-1 hover:bg-white/5 rounded text-zinc-400 hover:text-zinc-200 transition-all flex items-center gap-1"
            title="Bypass Settings"
          >
            <Settings size={12} />
            <span className="text-[10px] text-zinc-400 hover:underline">Settings</span>
          </button>
        </div>

        {expandedSections.bypass && (
          <div className="pt-1">
            {bypassProfiles && bypassProfiles.length > 0 ? (
              <div className="space-y-1.5">
                {bypassProfiles.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-zinc-400 truncate max-w-[150px]">{p.name}</span>
                    <button
                      id={`bypass-toggle-${p.id}${mobile ? '-mobile' : ''}`}
                      type="button"
                      onClick={() => onToggleBypass?.(p.id, !p.is_enabled)}
                      className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        p.is_enabled ? 'bg-red-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          p.is_enabled ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500 italic">No profiles. Open Settings to add.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}