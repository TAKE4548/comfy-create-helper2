import { Shuffle, Lock } from 'lucide-react'
import type { Lora } from '../../../api/types'
import { LoraStackEditor } from '../../../components/LoraStackEditor'

const DEFAULT_SAMPLERS = [
  'euler', 'euler_ancestral', 'heun', 'heunpp2', 'dpm_2', 'dpm_2_ancestral',
  'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde',
  'dpmpp_sde_gpu', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'ddim', 'uni_pc', 'uni_pc_bh2'
]

const DEFAULT_SCHEDULERS = [
  'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'
]

export interface ParamPanelProps {
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

export const ParamPanel = ({
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
