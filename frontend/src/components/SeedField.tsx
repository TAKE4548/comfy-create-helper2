import { useId } from 'react'
import type { WorkflowMapping } from '../api/types'
import { Lock, Shuffle } from 'lucide-react'
import { readSeedSettings, setSeedModeForMapping, UINT32_MAX } from '../utils/seedModel'

export interface SeedFieldProps {
  mapping: WorkflowMapping
  paramValues: Record<string, string>
  onChange: (values: Record<string, string>) => void
  mobile?: boolean
  disabled?: boolean
  effectiveSettings?: { mode: 'random' | 'fixed'; seed: number }
}

export function SeedField({ mapping, paramValues, onChange, mobile = false, disabled = false, effectiveSettings }: SeedFieldProps): JSX.Element {
  const generatedId = useId()
  let settings = effectiveSettings
  let error = ''
  if (!settings) {
    try { settings = readSeedSettings(mapping, paramValues) }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Seed設定を読み込めません' }
  }
  const mode = settings?.mode ?? 'fixed'
  const rawValue = paramValues[mapping.role ?? ''] ?? ''
  const value = effectiveSettings ? String(effectiveSettings.seed) : rawValue
  const inputId = `seed-input-${mapping.id}${mobile ? '-mobile' : ''}`
  const modeButtonId = `seed-toggle-${mapping.id}${mobile ? '-mobile' : ''}`
  const handleMode = () => {
    if (disabled || !mapping.role) return
    try { onChange(setSeedModeForMapping(mapping, paramValues, mode === 'random' ? 'fixed' : 'random')) }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Seed設定を更新できません' }
  }
  const handleValue = (next: string) => {
    onChange({ ...paramValues, [mapping.role ?? '']: next })
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={inputId} className="text-xs text-zinc-400 truncate">{mapping.display_name ?? 'Seed'}</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{mode === 'random' ? 'ランダム' : '固定'}</span>
          <button id={modeButtonId} type="button" aria-label={mode === 'random' ? '固定値にする' : 'ランダムにする'}
            aria-pressed={mode === 'random'} disabled={disabled} onClick={handleMode}
            className="p-1 rounded border transition-all disabled:opacity-40">
            {mode === 'random' ? <Shuffle aria-hidden="true" size={mobile ? 12 : 13} /> : <Lock aria-hidden="true" size={mobile ? 12 : 13} />}
          </button>
          <input id={inputId} data-generated-id={generatedId} aria-label={`${mapping.display_name ?? 'Seed'}の値`}
            type="number" value={value} min={0} max={UINT32_MAX} step={1}
            disabled={disabled || mode === 'random' || error.startsWith('Seed mode metadata') || error.startsWith('Invalid seed mode')} onChange={event => handleValue(event.target.value)}
            className={`${mobile ? 'w-20' : 'w-24'} bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-200 text-right disabled:opacity-40`} />
        </div>
      </div>
      {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
