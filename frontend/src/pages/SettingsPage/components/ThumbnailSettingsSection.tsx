import React, { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useThumbnailAspectRatio } from '../../../hooks/useThumbnailAspectRatio'
import { useSettingsMobile } from '../hooks/useSettingsMobile'

export const ThumbnailSettingsSection: React.FC = () => {
  const { presetId, customRatio, presets, aspectRatioStyle, ratioStr, persistenceError, setPreset, setCustomRatio } = useThumbnailAspectRatio()
  const isMobile = useSettingsMobile()
  const [customInput, setCustomInput] = useState(customRatio)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isMobile || !saveMessage) return
    const timer = window.setTimeout(() => setSaveMessage(null), 2000)
    return () => window.clearTimeout(timer)
  }, [isMobile, saveMessage])

  const handlePresetChange = (id: string) => {
    const saved = setPreset(id)
    setSaveMessage(saved ? '設定を保存しました' : null)
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCustomInput(val)
    const saved = setCustomRatio(val)
    setSaveMessage(saved ? '設定を保存しました' : null)
  }

  return (
    <div className="bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl p-3 md:p-5 shadow-lg space-y-3 md:space-y-4" data-testid="thumbnail-settings-section">
      <div className="flex items-center gap-2.5 pb-3 border-b border-[rgba(255,255,255,0.06)]">
        <ImageIcon className="text-accent-green" size={18} />
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">サムネイル表示・アスペクト比設定</h3>
          <p className="text-[11px] text-zinc-400">一覧カードやプレビューで表示するサムネイルの標準アスペクト比を設定します。</p>
        </div>
      </div>

      {persistenceError ? (
        <p role="alert" className="text-sm text-amber-300">保存できませんでした: {persistenceError}。設定は未保存です。</p>
      ) : saveMessage ? (
        <p role="status" className="text-sm text-emerald-300">{saveMessage}</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 items-start">
        {/* Preset Selector */}
        <div className="md:col-span-2 space-y-2">
          <label htmlFor="thumbnail-aspect-preset" className="text-xs font-medium text-zinc-300 block">アスペクト比の選択</label>
          <select
            id="thumbnail-aspect-preset"
            data-testid="thumbnail-aspect-select"
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="min-h-11 w-full min-w-0 touch-manipulation rounded-lg border border-[rgba(255,255,255,0.08)] bg-surface-2 px-3 text-xs text-zinc-200 focus:outline-none focus:border-accent-green sm:max-w-xs"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {presetId === 'custom' && (
            <div className="pt-2 space-y-1.5 animate-fade-in">
              <label className="text-xs text-zinc-400 block">カスタム比率入力 (W:H または数値)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={handleCustomChange}
                  placeholder="例: 5:7, 7:9, 0.71"
                  className="min-h-[44px] px-3 py-1.5 text-xs font-mono bg-zinc-900 border border-[rgba(255,255,255,0.12)] rounded-lg text-zinc-200 focus:outline-none focus:border-accent-green w-full max-w-full sm:max-w-48"
                  data-testid="custom-aspect-ratio-input"
                />
                <span className="text-[11px] font-mono text-zinc-500">現在適用中: {ratioStr}</span>
              </div>
            </div>
          )}
        </div>

        {/* Live Preview Box */}
        <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/60 rounded-lg border border-[rgba(255,255,255,0.06)]">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Live Preview</span>
          <div
            className="w-32 bg-zinc-900 border-2 border-dashed border-accent-green/60 rounded-lg flex flex-col items-center justify-center p-2 text-center transition-all duration-300 shadow-inner"
            style={aspectRatioStyle}
            data-testid="aspect-ratio-preview-box"
          >
            <ImageIcon size={20} className="text-accent-green/70 mb-1" />
            <span className="text-[10px] font-mono text-zinc-300 font-bold">{ratioStr}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
