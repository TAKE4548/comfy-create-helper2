import { Shuffle, Lock, Settings } from 'lucide-react'
import type { Lora, ParamTypeMaster } from '../../../api/types'
import { LoraStackEditor } from '../../../components/LoraStackEditor'
import { SearchableLoraSelect } from '../../../components/SearchableLoraSelect'

const DEFAULT_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'heunpp2', 'dpm_2', 'dpm_2_ancestral',
  'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde',
  'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'ddim', 'uni_pc', 'uni_pc_bh2'
]

const DEFAULT_SCHEDULERS = [
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta'
]

export interface ParamPanelProps {
  paramMappings: any[]
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
  loras?: Lora[]
  paramTypeMasters?: ParamTypeMaster[]
  batchSize: number
  setBatchSize: (size: number) => void
  seedMode: 'random' | 'fixed'
  setSeedMode: (mode: 'random' | 'fixed') => void
  seed: number
  setSeed: (seed: number) => void
  mobile?: boolean
  comfyObjectInfo?: any
  bypassProfiles?: any[]
  onToggleBypass?: (profileId: number, isEnabled: boolean) => void
  onOpenBypassSettings?: () => void
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
  activeBaseModelId,
}: ParamPanelProps) => {
  if (paramMappings.length === 0) return null
  return (
    <div className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2 ${mobile ? 'p-3.5' : 'p-3'} space-y-3`}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Parameters</p>
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
              activeBaseModelId={activeBaseModelId}
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
              <SearchableLoraSelect
                value={paramValues[m.role!] ?? ''}
                onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                loras={loras}
                activeBaseModelId={activeBaseModelId}
                className={`${mobile ? 'w-36' : 'w-48'}`}
                placeholder="Select option…"
              />
            ) : m.input_type === 'boolean' ? (
              <button
                id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                type="button"
                onClick={() => {
                  const currentVal = paramValues[m.role!] === 'true'
                  setParamValues({ ...paramValues, [m.role!]: currentVal ? 'false' : 'true' })
                }}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      className={`${mobile ? 'w-36' : 'w-48'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40`}
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
                      onClick={() => {
                        const currentVal = paramValues[m.role!] === 'true'
                        setParamValues({ ...paramValues, [m.role!]: currentVal ? 'false' : 'true' })
                      }}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
                      onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                      min={customType.min_value ?? undefined}
                      max={customType.max_value ?? undefined}
                      step={customType.step ?? (customType.widget_type === 'float' ? 0.01 : 1)}
                      className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right`}
                    />
                  )
                }
              }
              return (
                <input
                  id={`param-${mobile ? 'mobile-' : ''}${m.role!}`}
                  type="number"
                  value={paramValues[m.role!] ?? ''}
                  onChange={(e) => setParamValues({ ...paramValues, [m.role!]: e.target.value })}
                  step={m.input_type === 'float' ? 0.1 : 1}
                  className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/40 text-right`}
                />
              )
            })()}
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

      {/* Bypass Section */}
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Bypasses</p>
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
    </div>
  )
}
