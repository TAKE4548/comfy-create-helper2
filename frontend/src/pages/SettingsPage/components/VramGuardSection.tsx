import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ChevronDown, ChevronUp, Save, RefreshCw } from 'lucide-react'
import { settingsApi, type VramSettings } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'

import { LS_KEYS } from '../../../utils/localStorageKeys'
import { useSettingsMobile } from '../hooks/useSettingsMobile'
import { useSettingsCommit } from '../hooks/useSettingsCommit'
import { SettingInfoPopover } from './SettingInfoPopover'
import { useSettingsDraftRegistration } from '../context/SettingsDraftContext'

export interface VramGuardSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export const VRAM_LIMIT_MIN = 2.0
export const VRAM_LIMIT_MAX = 14.0
export const VRAM_LIMIT_DEFAULT = 4.0
export const VRAM_APPROACH_MARGIN_GB = 1.0

export function readStoredVramLimit(raw: string | null): number {
  if (raw == null || raw.trim() === '') return VRAM_LIMIT_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return VRAM_LIMIT_DEFAULT
  return Math.min(VRAM_LIMIT_MAX, Math.max(VRAM_LIMIT_MIN, n))
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const clampPct = (v: number): number => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0)

export function VramGuardSection({ isExpanded, onToggle }: VramGuardSectionProps) {
  const qc = useQueryClient()
  const isMobile = useSettingsMobile()
  const [minFreeGb, setMinFreeGb] = useState<number>(() =>
    readStoredVramLimit(safeGetItem(LS_KEYS.VRAM_GUARD_LIMIT)),
  )
  const [minFreeGbRaw, setMinFreeGbRaw] = useState(() => String(readStoredVramLimit(safeGetItem(LS_KEYS.VRAM_GUARD_LIMIT))))
  const [guardEnabled, setGuardEnabled] = useState<boolean>(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const draftRef = useRef({ minFreeGb, guardEnabled })
  draftRef.current = { minFreeGb, guardEnabled }
  const dirtyRef = useRef(false)
  const baselineRef = useRef({ minFreeGb, guardEnabled })
  const lastValidGbRef = useRef(minFreeGb)
  const committedRef = useRef({ minFreeGb, guardEnabled })
  const handledCommitRef = useRef(-1)
  const commit = useSettingsCommit({
    save: async (_key, snapshot) => {
      const values = JSON.parse(snapshot) as { vram_min_free_gb: number; vram_guard_enabled: boolean }
      await settingsApi.updateVram(values)
      await qc.invalidateQueries({ queryKey: ['settings-vram'] })
    },
  })
  const draftRegistration = useSettingsDraftRegistration('settings-vram', {
    cancelQueued: () => commit.stage('settings-vram', null),
    discardLocal: () => {
      setMinFreeGb(baselineRef.current.minFreeGb)
      setMinFreeGbRaw(String(baselineRef.current.minFreeGb))
      setGuardEnabled(baselineRef.current.guardEnabled)
      dirtyRef.current = false
      setHasUnsavedChanges(false)
      setSaveError(null)
    },
  })

  // System stats from store
  const systemStats = useGenerationStore((state) => state.systemStats)
  const systemWsConnected = useGenerationStore((state) => state.systemWsConnected)

  // Query server vram settings
  const { data: vramSettings, isLoading, isError: vramQueryError } = useQuery<VramSettings>({
    queryKey: ['settings-vram'],
    queryFn: () => settingsApi.getVram(),
    enabled: isExpanded && !systemWsConnected,
    refetchInterval: isExpanded && !systemWsConnected ? 2500 : false,
    refetchIntervalInBackground: false,
    retry: false,
  })

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.VRAM_GUARD_LIMIT, String(minFreeGb))
    } catch {
      // ignore storage failures; UI continues
    }
  }, [minFreeGb])

  useEffect(() => {
    if (vramSettings && !dirtyRef.current) {
      if (typeof vramSettings.vram_min_free_gb === 'number') {
        setMinFreeGb(vramSettings.vram_min_free_gb)
        setMinFreeGbRaw(String(vramSettings.vram_min_free_gb))
        lastValidGbRef.current = vramSettings.vram_min_free_gb
      }
      if (typeof vramSettings.vram_guard_enabled === 'boolean') {
        setGuardEnabled(vramSettings.vram_guard_enabled)
      }
      if (typeof vramSettings.vram_min_free_gb === 'number' && typeof vramSettings.vram_guard_enabled === 'boolean') {
        baselineRef.current = { minFreeGb: vramSettings.vram_min_free_gb, guardEnabled: vramSettings.vram_guard_enabled }
        commit.acceptServer('settings-vram', JSON.stringify({ vram_min_free_gb: vramSettings.vram_min_free_gb, vram_guard_enabled: vramSettings.vram_guard_enabled }))
      }
    }
  }, [vramSettings])

  useEffect(() => {
    const state = commit.getState('settings-vram')
    const rawValue = Number(minFreeGbRaw)
    const rawValid = minFreeGbRaw.trim() !== '' && Number.isFinite(rawValue) && rawValue >= VRAM_LIMIT_MIN && rawValue <= VRAM_LIMIT_MAX
    if (state.phase === 'saved' && handledCommitRef.current !== state.revision) {
      handledCommitRef.current = state.revision
      baselineRef.current = committedRef.current
      setToastMessage('設定を保存しました')
      setTimeout(() => setToastMessage(null), 2000)
      if (rawValid) {
        dirtyRef.current = false
        setHasUnsavedChanges(false)
        draftRegistration.clear()
      } else {
        dirtyRef.current = true
        setHasUnsavedChanges(true)
      }
      setSaveError(null)
    } else if (state.phase === 'error' && handledCommitRef.current !== state.revision) {
      handledCommitRef.current = state.revision
      setSaveError(state.error ?? '保存に失敗しました')
      setToastMessage(null)
      dirtyRef.current = true
      setHasUnsavedChanges(true)
    }
    draftRegistration.update({ dirty: dirtyRef.current || state.phase === 'dirty' || state.phase === 'saving', invalid: !rawValid, failed: state.phase === 'error', queued: state.phase === 'dirty', inFlight: state.phase === 'saving' })
  })

  const commitCurrent = () => {
    const rawValue = Number(minFreeGbRaw)
    if (minFreeGbRaw.trim() === '' || !Number.isFinite(rawValue) || rawValue < VRAM_LIMIT_MIN || rawValue > VRAM_LIMIT_MAX) {
      commit.stage('settings-vram', null)
      setHasUnsavedChanges(true)
      dirtyRef.current = true
      return
    }
    const values = { vram_min_free_gb: rawValue, vram_guard_enabled: guardEnabled }
    committedRef.current = { minFreeGb: rawValue, guardEnabled }
    commit.stage('settings-vram', JSON.stringify(values))
    commit.commit('settings-vram')
  }

  const handleSave = () => {
    if (Number(minFreeGbRaw) < VRAM_LIMIT_MIN || Number(minFreeGbRaw) > VRAM_LIMIT_MAX || !Number.isFinite(Number(minFreeGbRaw)) || minFreeGbRaw.trim() === '') {
      setHasUnsavedChanges(true)
      dirtyRef.current = true
      return
    }
    setSaveError(null)
    setToastMessage(null)
    commitCurrent()
  }

  const updateDraft = (next: { minFreeGb?: number; guardEnabled?: boolean }) => {
    dirtyRef.current = true
    setHasUnsavedChanges(true)
    setSaveError(null)
    setToastMessage(null)
    if (next.minFreeGb !== undefined) {
      setMinFreeGb(next.minFreeGb)
      setMinFreeGbRaw(String(next.minFreeGb))
      lastValidGbRef.current = next.minFreeGb
      const values = { vram_min_free_gb: next.minFreeGb, vram_guard_enabled: next.guardEnabled ?? guardEnabled }
      commit.stage('settings-vram', JSON.stringify(values))
    }
    if (next.guardEnabled !== undefined) {
      setGuardEnabled(next.guardEnabled)
      const values = { vram_min_free_gb: lastValidGbRef.current, vram_guard_enabled: next.guardEnabled }
      committedRef.current = { minFreeGb: lastValidGbRef.current, guardEnabled: next.guardEnabled }
      commit.stage('settings-vram', JSON.stringify(values))
      commit.commit('settings-vram')
    }
  }

  const updateRawThreshold = (raw: string) => {
    setMinFreeGbRaw(raw)
    dirtyRef.current = true
    setHasUnsavedChanges(true)
    setSaveError(null)
    setToastMessage(null)
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value) || value < VRAM_LIMIT_MIN || value > VRAM_LIMIT_MAX) {
      commit.stage('settings-vram', null)
      draftRegistration.update({ dirty: true, invalid: true, failed: false, queued: false, inFlight: false })
      return
    }
    lastValidGbRef.current = value
    setMinFreeGb(value)
    const values = { vram_min_free_gb: value, vram_guard_enabled: guardEnabled }
    commit.stage('settings-vram', JSON.stringify(values))
    draftRegistration.update({ dirty: true, invalid: false, failed: false, queued: true, inFlight: false })
  }

  // Calculate current free VRAM: prefer systemStats, then vramSettings, then null
  const currentFreeGb = systemWsConnected && systemStats?.vram_total_gb != null && systemStats?.vram_used_gb != null
      ? Math.max(0, +(systemStats.vram_total_gb - systemStats.vram_used_gb).toFixed(2))
      : vramSettings?.vram_free_gb != null
      ? +vramSettings.vram_free_gb.toFixed(2)
      : null

  const totalGb =
    systemWsConnected && systemStats?.vram_total_gb != null
      ? +systemStats.vram_total_gb.toFixed(2)
      : vramSettings?.vram_total_gb != null
      ? +vramSettings.vram_total_gb.toFixed(2)
      : null

  const meterState: 'safe' | 'approaching' | 'below' =
    currentFreeGb == null || currentFreeGb >= minFreeGb + VRAM_APPROACH_MARGIN_GB
      ? 'safe'
      : currentFreeGb >= minFreeGb
      ? 'approaching'
      : 'below'
  const barColor =
    meterState === 'below' ? 'bg-red-500/70' : meterState === 'approaching' ? 'bg-amber-500/70' : 'bg-emerald-500/70'

  return (
    <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-[#3ECF8E]" />
          <h2 className="text-sm font-semibold text-zinc-300">VRAM安全ガード設定</h2>
          <span className="text-xs text-zinc-600">— 空きVRAM枯渇によるCUDA OOM防止ガード</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="p-3 md:p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-3 md:space-y-4 font-sans">
          {isLoading ? (
            <div className="flex items-center gap-2 text-zinc-500 text-xs py-4">
              <RefreshCw size={14} className="animate-spin" />
              <span>設定を読み込み中...</span>
            </div>
          ) : (
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-5">
              {/* Header and Save Button */}
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.04)] pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-zinc-200">生成前 空きVRAM閾値制御</h3>
                  <p className="text-[11px] text-zinc-500">
                    設定した空き容量を下回る場合、新規生成キューへの投入を安全に一時待機/ブロックします。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {toastMessage && (
                    <span className="text-xs text-accent-green font-medium animate-fade-in">
                      {toastMessage}
                    </span>
                  )}
                  {hasUnsavedChanges && <span role="status" className="text-xs text-amber-300">未保存</span>}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={commit.getState('settings-vram').phase === 'saving'}
                    hidden={isMobile}
                    aria-label="VRAM安全ガード設定を保存"
                    title="VRAM安全ガード設定を保存"
                    className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg font-medium bg-[#7C6FDD] text-white hover:bg-[#6d62cc] disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Save size={13} />
                    <span>{commit.getState('settings-vram').phase === 'saving' ? '保存中...' : '保存'}</span>
                  </button>
                </div>
              </div>

              {saveError && (
                <p role="alert" className="text-sm text-rose-300">
                  保存できませんでした: {saveError}。設定は未保存です。
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left pane: Status & Gauge Comparison */}
              <div className="p-3.5 rounded-lg bg-surface-2/40 border border-[rgba(255,255,255,0.04)] space-y-2.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-zinc-400 font-medium">現在の空きVRAM:</span>
                    <span className="font-mono text-zinc-200 font-semibold">
                    {currentFreeGb != null ? `${currentFreeGb.toFixed(1)} GB` : 'VRAM情報を更新できません'}
                    </span>
                    {totalGb != null && (
                      <span className="text-zinc-500 text-[11px]">/ 全体 {totalGb.toFixed(1)} GB</span>
                    )}
                  </div>
                  <div>
                    {currentFreeGb == null ? (
                      <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-400">
                        状態不明
                      </span>
                    ) : meterState === 'safe' ? (
                      <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        安全域 (OK)
                      </span>
                    ) : meterState === 'approaching' ? (
                      <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        閾値に接近
                      </span>
                    ) : (
                      <span className="shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                        閾値未満 (警戒)
                      </span>
                    )}
                  </div>
                </div>
                {vramQueryError && <p role="status" className="break-words text-sm text-amber-300">{currentFreeGb != null ? 'VRAM情報を更新できません。表示値は直前の測定値です。' : 'VRAM情報を更新できません。'}</p>}

                {/* Progress bar gauge */}
                {totalGb != null && totalGb > 0 && currentFreeGb != null && (
                  <div className="space-y-1">
                    <div className="relative w-full h-3 bg-zinc-800/80 rounded-full overflow-hidden border border-[rgba(255,255,255,0.06)]">
                      {/* Current free VRAM bar */}
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${barColor}`}
                        style={{
                          width: `${clampPct((currentFreeGb / totalGb) * 100)}%`,
                        }}
                      />
                      {/* Min threshold indicator mark */}
                      <div
                        data-testid="vram-threshold-line"
                        className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                        title={`最小安全閾値: ${minFreeGb.toFixed(1)} GB`}
                        style={{
                          left: `${clampPct((minFreeGb / totalGb) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-zinc-500">
                      <span className="shrink-0 whitespace-nowrap">0 GB</span>
                      <span
                        data-testid="vram-threshold-tag"
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-amber-400"
                      >
                        <ChevronUp size={12} aria-hidden="true" />
                        閾値: {minFreeGb.toFixed(1)} GB
                      </span>
                      <span className="shrink-0 whitespace-nowrap">{totalGb.toFixed(1)} GB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right pane: Slider, Number Input & Toggle */}
              <div className="space-y-3 min-w-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <SettingInfoPopover label="VRAM閾値の説明"><div><label htmlFor="vram-min-free-input" className="text-zinc-300 font-medium">最小必要空き容量 (vram_min_free_gb)</label><p className="max-w-prose text-[11px] text-zinc-500">生成開始前に必要とする空きVRAMです。使用可能なVRAMがこの値を下回る場合、VRAM安全ガードが生成を止めます。</p></div></SettingInfoPopover>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="vram-min-free-input"
                      aria-label="最小必要空き容量 (vram_min_free_gb)"
                      type="number"
                      min={2.0}
                      max={14.0}
                      step={0.5}
                      value={minFreeGbRaw}
                      onChange={(e) => updateRawThreshold(e.target.value)}
                      onBlur={() => { if (isMobile) commitCurrent() }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && isMobile) commitCurrent() }}
                      inputMode="decimal"
                      className="w-24 min-h-11 touch-manipulation bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1 text-right font-mono text-xs text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]"
                      style={{ touchAction: 'manipulation' }}
                    />
                    <span className="text-xs text-zinc-400">GB</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={2.0}
                  max={14.0}
                  step={0.5}
                  value={minFreeGb}
                  onChange={(e) => updateDraft({ minFreeGb: parseFloat(e.target.value) })}
                  onPointerUp={() => { if (isMobile) commitCurrent() }}
                  onKeyUp={() => { if (isMobile) commitCurrent() }}
                  onBlur={() => { if (isMobile) commitCurrent() }}
                  onPointerCancel={(event) => event.preventDefault()}
                  aria-label="最小必要空き容量スライダー"
                  className="w-full h-11 bg-transparent accent-[#7C6FDD] cursor-pointer"
                  style={{ touchAction: 'pan-y' }}
                />

                <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                  <span>2.0 GB</span>
                  <span>6.0 GB</span>
                  <span>10.0 GB</span>
                  <span>14.0 GB</span>
                </div>
              </div>

              {/* Guard Enable Toggle */}
              <div className="pt-2 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-300 font-medium">VRAM安全ガードを有効化</span>
                  <p className="text-[11px] text-zinc-500">
                    オフにするとVRAM不足時の事前ブロックを行わず生成を実行します
                  </p>
                </div>
                <label
                  className="relative inline-flex min-h-11 shrink-0 items-center cursor-pointer before:absolute before:-inset-2 before:content-['']"
                  style={{ touchAction: 'manipulation' }}
                >
                  <input
                    type="checkbox"
                    checked={guardEnabled}
                      onChange={(e) => updateDraft({ guardEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1/2 after:-translate-y-1/2 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#3ECF8E]"></div>
                </label>
              </div>
              </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
