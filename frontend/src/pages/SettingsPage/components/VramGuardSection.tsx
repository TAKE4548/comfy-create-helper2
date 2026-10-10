import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, ChevronDown, ChevronUp, Save, RefreshCw } from 'lucide-react'
import { settingsApi, type VramSettings } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'

export interface VramGuardSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export function VramGuardSection({ isExpanded, onToggle }: VramGuardSectionProps) {
  const qc = useQueryClient()
  const [minFreeGb, setMinFreeGb] = useState<number>(4.0)
  const [guardEnabled, setGuardEnabled] = useState<boolean>(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const draftRef = useRef({ minFreeGb, guardEnabled })
  draftRef.current = { minFreeGb, guardEnabled }
  const dirtyRef = useRef(false)

  // System stats from store
  const systemStats = useGenerationStore((state) => state.systemStats)

  // Query server vram settings
  const { data: vramSettings, isLoading } = useQuery<VramSettings>({
    queryKey: ['settings-vram'],
    queryFn: () => settingsApi.getVram(),
  })

  useEffect(() => {
    if (vramSettings && !dirtyRef.current) {
      if (typeof vramSettings.vram_min_free_gb === 'number') {
        setMinFreeGb(vramSettings.vram_min_free_gb)
      }
      if (typeof vramSettings.vram_guard_enabled === 'boolean') {
        setGuardEnabled(vramSettings.vram_guard_enabled)
      }
    }
  }, [vramSettings])

  const updateMutation = useMutation({
    mutationFn: (data: { vram_min_free_gb: number; vram_guard_enabled?: boolean }) =>
      settingsApi.updateVram(data),
    onSuccess: (savedData, submittedData) => {
      qc.invalidateQueries({ queryKey: ['settings-vram'] })
      const noNewerEdits = draftRef.current.minFreeGb === submittedData.vram_min_free_gb &&
        draftRef.current.guardEnabled === submittedData.vram_guard_enabled
      if (savedData && noNewerEdits) {
        setMinFreeGb(savedData.vram_min_free_gb)
        setGuardEnabled(savedData.vram_guard_enabled)
        dirtyRef.current = false
        setHasUnsavedChanges(false)
      } else if (noNewerEdits) {
        dirtyRef.current = false
        setHasUnsavedChanges(false)
      }
      setSaveError(null)
      setToastMessage('設定を保存しました')
      setTimeout(() => setToastMessage(null), 3000)
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : String(error))
      setToastMessage(null)
      dirtyRef.current = true
      setHasUnsavedChanges(true)
    },
  })

  const handleSave = () => {
    setSaveError(null)
    setToastMessage(null)
    updateMutation.mutate({
      vram_min_free_gb: minFreeGb,
      vram_guard_enabled: guardEnabled,
    })
  }

  const updateDraft = (next: { minFreeGb?: number; guardEnabled?: boolean }) => {
    dirtyRef.current = true
    setHasUnsavedChanges(true)
    setSaveError(null)
    setToastMessage(null)
    if (next.minFreeGb !== undefined) setMinFreeGb(next.minFreeGb)
    if (next.guardEnabled !== undefined) setGuardEnabled(next.guardEnabled)
  }

  // Calculate current free VRAM: prefer systemStats, then vramSettings, then null
  const currentFreeGb =
    systemStats?.vram_total_gb != null && systemStats?.vram_used_gb != null
      ? Math.max(0, +(systemStats.vram_total_gb - systemStats.vram_used_gb).toFixed(2))
      : vramSettings?.vram_free_gb != null
      ? +vramSettings.vram_free_gb.toFixed(2)
      : null

  const totalGb =
    systemStats?.vram_total_gb != null
      ? +systemStats.vram_total_gb.toFixed(2)
      : vramSettings?.vram_total_gb != null
      ? +vramSettings.vram_total_gb.toFixed(2)
      : null

  const isSafe = currentFreeGb != null ? currentFreeGb >= minFreeGb : true

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
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4 font-sans">
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
                    disabled={updateMutation.isPending}
                    aria-label="VRAM安全ガード設定を保存"
                    title="VRAM安全ガード設定を保存"
                    className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg font-medium bg-[#7C6FDD] text-white hover:bg-[#6d62cc] disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <Save size={13} />
                    <span>{updateMutation.isPending ? '保存中...' : '保存'}</span>
                  </button>
                </div>
              </div>

              {saveError && (
                <p role="alert" className="text-sm text-rose-300">
                  保存できませんでした: {saveError}。設定は未保存です。
                </p>
              )}

              {/* Status & Gauge Comparison */}
              <div className="p-3.5 rounded-lg bg-surface-2/40 border border-[rgba(255,255,255,0.04)] space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-medium">現在の空きVRAM:</span>
                    <span className="font-mono text-zinc-200 font-semibold">
                      {currentFreeGb != null ? `${currentFreeGb.toFixed(1)} GB` : '取得中...'}
                    </span>
                    {totalGb != null && (
                      <span className="text-zinc-500 text-[11px]">/ 全体 {totalGb.toFixed(1)} GB</span>
                    )}
                  </div>
                  <div>
                    {currentFreeGb == null ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                        状態不明
                      </span>
                    ) : isSafe ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        安全域 (OK)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        閾値未満 (警戒)
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar gauge */}
                {totalGb != null && totalGb > 0 && currentFreeGb != null && (
                  <div className="space-y-1">
                    <div className="relative w-full h-3 bg-zinc-800/80 rounded-full overflow-hidden border border-[rgba(255,255,255,0.06)]">
                      {/* Current free VRAM bar */}
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isSafe ? 'bg-emerald-500/70' : 'bg-amber-500/70'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(0, (currentFreeGb / totalGb) * 100))}%`,
                        }}
                      />
                      {/* Min threshold indicator mark */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                        title={`最小安全閾値: ${minFreeGb.toFixed(1)} GB`}
                        style={{
                          left: `${Math.min(100, Math.max(0, (minFreeGb / totalGb) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>0 GB</span>
                      <span className="inline-flex items-center gap-1 text-red-400/80">
                        <ChevronUp size={12} aria-hidden="true" />
                        閾値: {minFreeGb.toFixed(1)} GB
                      </span>
                      <span>{totalGb.toFixed(1)} GB</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Slider & Number Input */}
              {/* Slider & Number Input */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="vram-min-free-input" className="text-zinc-300 font-medium">
                    最小必要空き容量 (vram_min_free_gb)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="vram-min-free-input"
                      type="number"
                      min={2.0}
                      max={14.0}
                      step={0.5}
                      value={minFreeGb}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        if (!isNaN(val)) {
                          updateDraft({ minFreeGb: val })
                        }
                      }}
                      className="w-20 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1 text-right font-mono text-xs text-zinc-100 focus:outline-none focus:border-[#7C6FDD]"
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
                  className="w-full accent-[#7C6FDD] cursor-pointer"
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
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guardEnabled}
                      onChange={(e) => updateDraft({ guardEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#3ECF8E]"></div>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
