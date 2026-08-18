import { useState, useEffect } from 'react'
import type { SpeechBubble, BubbleShapeType, TextOrientation } from '../types/speechBubble'
import type { ServerFont } from '../api/types'
import { calculateFitBubbleDimensions } from '../utils/speechBubbleRenderer'

export interface SpeechBubbleControlsProps {
  bubble: SpeechBubble | null
  bubblesCount: number
  fontList: ServerFont[]
  isFontLoading: boolean
  isDrafting: boolean
  onUpdate: (updated: Partial<SpeechBubble>) => void
  onDelete: () => void
  onGenerateDraft: () => void
}

const RECENT_COLORS_KEY = 'speech_bubble_recent_colors'
const MAX_RECENT_COLORS = 10

// Color parsing & formatting helpers
function rgbaToHexAndAlpha(rgbaStr: string): { hex: string; alpha: number } {
  if (!rgbaStr) return { hex: '#000000', alpha: 1 }

  // Check for rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = rgbaStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0')
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0')
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0')
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    return { hex: `#${r}${g}${b}`, alpha: a }
  }

  // Check for hex #RRGGBB or #RGB
  if (rgbaStr.startsWith('#')) {
    if (rgbaStr.length === 4) {
      const r = rgbaStr[1] + rgbaStr[1]
      const g = rgbaStr[2] + rgbaStr[2]
      const b = rgbaStr[3] + rgbaStr[3]
      return { hex: `#${r}${g}${b}`, alpha: 1 }
    }
    if (rgbaStr.length === 7) {
      return { hex: rgbaStr, alpha: 1 }
    }
    if (rgbaStr.length === 9) {
      const hex = rgbaStr.substring(0, 7)
      const a = parseInt(rgbaStr.substring(7, 9), 16) / 255
      return { hex, alpha: Math.round(a * 100) / 100 }
    }
  }

  return { hex: '#000000', alpha: 1 }
}

function hexAndAlphaToRgba(hex: string, alpha: number): string {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const SpeechBubbleControls: React.FC<SpeechBubbleControlsProps> = ({
  bubble,
  bubblesCount,
  fontList,
  isFontLoading,
  isDrafting,
  onUpdate,
  onDelete,
  onGenerateDraft,
}) => {
  const [recentColors, setRecentColors] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_COLORS_KEY)
      if (saved) {
        setRecentColors(JSON.parse(saved))
      }
    } catch {
      setRecentColors([])
    }
  }, [])

  const addRecentColor = (color: string) => {
    if (!color) return
    try {
      const updated = [color, ...recentColors.filter(c => c !== color)].slice(0, MAX_RECENT_COLORS)
      setRecentColors(updated)
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }
  }

  if (!bubble) {
    return (
      <div className="p-4 text-xs text-zinc-400 bg-[#1F1F25] rounded-lg border border-dashed border-[rgba(255,255,255,0.12)] text-center">
        吹き出しが選択されていません（全 {bubblesCount} 個）。キャンバス上の吹き出しをクリックするか、ダブルクリックで追加してください。
      </div>
    )
  }

  const shapes: { type: BubbleShapeType; label: string }[] = [
    { type: 'oval', label: '楕円' },
    { type: 'rounded-rect', label: '角丸' },
    { type: 'burst', label: '叫び' },
    { type: 'cloud', label: '思考' },
    { type: 'none', label: '枠なし' },
  ]

  const orientations: { type: TextOrientation; label: string }[] = [
    { type: 'vertical', label: '縦書き' },
    { type: 'horizontal', label: '横書き' },
  ]

  const handleColorChange = (
    field: 'textColor' | 'backgroundColor' | 'borderColor',
    newHex: string,
    newAlpha: number
  ) => {
    const rgba = hexAndAlphaToRgba(newHex, newAlpha)
    onUpdate({ [field]: rgba })
    addRecentColor(rgba)
  }

  const handleAutoFitBubbleSize = () => {
    const { w, h } = calculateFitBubbleDimensions(
      bubble.text,
      bubble.fontSize || 18,
      bubble.orientation
    )
    onUpdate({ w, h })
  }

  const textColorParsed = rgbaToHexAndAlpha(bubble.textColor)
  const bgColorParsed = rgbaToHexAndAlpha(bubble.backgroundColor)
  const borderColorParsed = rgbaToHexAndAlpha(bubble.borderColor)

  return (
    <div className="space-y-4 p-4 bg-[#1F1F25] rounded-lg border border-[rgba(255,255,255,0.08)] shadow-sm text-sm text-zinc-200">
      {/* 吹き出しテキスト & ドラフト生成 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-medium text-xs text-zinc-200">セリフテキスト</label>
          <button
            type="button"
            onClick={onGenerateDraft}
            disabled={isDrafting}
            className="text-[11px] px-2 py-1 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 rounded border border-indigo-700/50 disabled:opacity-50 transition-colors"
          >
            {isDrafting ? '生成中...' : '✨ ドラフト生成 (LLM)'}
          </button>
        </div>
        <textarea
          value={bubble.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="セリフを入力..."
          rows={3}
          className="w-full p-2 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 text-xs"
        />
      </div>

      {/* 形状選択 */}
      <div>
        <label className="block font-medium text-xs text-zinc-200 mb-1.5">形状</label>
        <div className="grid grid-cols-5 gap-1">
          {shapes.map((s) => (
            <button
              key={s.type}
              type="button"
              onClick={() => onUpdate({ shape: s.type })}
              className={`py-1 px-1.5 text-xs rounded border text-center transition-colors ${
                bubble.shape === s.type
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                  : 'bg-[#18181C] text-zinc-300 border-[rgba(255,255,255,0.08)] hover:bg-[#282830]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 文字方向 & 吹き出しサイズ自動フィット */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-medium text-xs text-zinc-200">文字方向 & サイズ</label>
          <button
            type="button"
            onClick={handleAutoFitBubbleSize}
            className="text-[11px] px-2 py-0.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded border border-blue-700/40 transition-colors"
          >
            📐 枠サイズ自動フィット
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {orientations.map((o) => (
            <button
              key={o.type}
              type="button"
              onClick={() => onUpdate({ orientation: o.type })}
              className={`py-1 px-3 text-xs rounded border text-center transition-colors ${
                bubble.orientation === o.type
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                  : 'bg-[#18181C] text-zinc-300 border-[rgba(255,255,255,0.08)] hover:bg-[#282830]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {/* 幅・高さ微調整 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center space-x-1.5 bg-[#18181C] px-2 py-1 rounded border border-[rgba(255,255,255,0.08)]">
            <span className="text-[11px] text-zinc-400">W:</span>
            <input
              type="number"
              aria-label="吹き出し幅"
              min="30"
              max="2000"
              value={bubble.w}
              onChange={(e) => onUpdate({ w: Math.max(30, parseInt(e.target.value, 10) || 30) })}
              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-500">px</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-[#18181C] px-2 py-1 rounded border border-[rgba(255,255,255,0.08)]">
            <span className="text-[11px] text-zinc-400">H:</span>
            <input
              type="number"
              aria-label="吹き出し高さ"
              min="30"
              max="2000"
              value={bubble.h}
              onChange={(e) => onUpdate({ h: Math.max(30, parseInt(e.target.value, 10) || 30) })}
              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-500">px</span>
          </div>
        </div>
      </div>

      {/* フォント & サイズ */}
      <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.08)]">
        <div>
          <label className="block font-medium text-xs text-zinc-200 mb-1">フォント</label>
          <select
            value={bubble.fontFamily}
            onChange={(e) => onUpdate({ fontFamily: e.target.value })}
            disabled={isFontLoading}
            className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 text-xs focus:outline-none"
          >
            <option value="sans-serif">標準ゴシック (sans-serif)</option>
            <option value="serif">標準明朝 (serif)</option>
            {fontList.map((f) => (
              <option key={f.file_name} value={f.file_name}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-medium text-xs text-zinc-200">フォントサイズ</label>
            <label className="inline-flex items-center text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={!bubble.fontSize || bubble.fontSize === 0}
                onChange={(e) => onUpdate({ fontSize: e.target.checked ? 0 : 18 })}
                className="mr-1 rounded accent-blue-500"
              />
              自動フィット
            </label>
          </div>
          {bubble.fontSize && bubble.fontSize > 0 ? (
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="8"
                max="64"
                value={bubble.fontSize}
                onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value, 10) })}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs w-10 text-right text-zinc-300">{bubble.fontSize}px</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 色・装飾設定 */}
      <div className="space-y-3 pt-2 border-t border-[rgba(255,255,255,0.08)]">
        {/* 文字色 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-xs text-zinc-200">文字色</span>
            <span className="text-[11px] text-zinc-400">不透明度: {Math.round(textColorParsed.alpha * 100)}%</span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              aria-label="文字色"
              value={textColorParsed.hex}
              onChange={(e) => handleColorChange('textColor', e.target.value, textColorParsed.alpha)}
              className="w-7 h-7 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
            />
            <input
              type="range"
              aria-label="文字色不透明度"
              min="0"
              max="1"
              step="0.05"
              value={textColorParsed.alpha}
              onChange={(e) => handleColorChange('textColor', textColorParsed.hex, parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
        </div>

        {/* 吹き出し背景色 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-xs text-zinc-200">背景色</span>
            <span className="text-[11px] text-zinc-400">不透明度: {Math.round(bgColorParsed.alpha * 100)}%</span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              aria-label="背景色"
              value={bgColorParsed.hex}
              onChange={(e) => handleColorChange('backgroundColor', e.target.value, bgColorParsed.alpha)}
              className="w-7 h-7 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
            />
            <input
              type="range"
              aria-label="背景色不透明度"
              min="0"
              max="1"
              step="0.05"
              value={bgColorParsed.alpha}
              onChange={(e) => handleColorChange('backgroundColor', bgColorParsed.hex, parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
        </div>

        {/* 枠線色 & 太さ */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-xs text-zinc-200">枠線色 & 太さ</span>
            <span className="text-[11px] text-zinc-400">太さ: {bubble.borderWidth}px</span>
          </div>
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="color"
              aria-label="枠線色"
              value={borderColorParsed.hex}
              onChange={(e) => handleColorChange('borderColor', e.target.value, borderColorParsed.alpha)}
              className="w-7 h-7 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
            />
            <input
              type="range"
              aria-label="枠線色不透明度"
              min="0"
              max="1"
              step="0.05"
              value={borderColorParsed.alpha}
              onChange={(e) => handleColorChange('borderColor', borderColorParsed.hex, parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-zinc-400 w-12">枠線幅</span>
            <input
              type="range"
              aria-label="枠線幅"
              min="0"
              max="10"
              step="1"
              value={bubble.borderWidth}
              onChange={(e) => onUpdate({ borderWidth: parseInt(e.target.value, 10) })}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs w-8 text-right text-zinc-300">{bubble.borderWidth}px</span>
          </div>
        </div>

        {/* 最近使用した色パレット */}
        {recentColors.length > 0 && (
          <div>
            <span className="block text-[11px] font-medium text-zinc-400 mb-1">
              最近使用した色 (クリックで背景色に適用)
            </span>
            <div className="flex flex-wrap gap-1.5" data-testid="recent-colors-palette">
              {recentColors.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  title={`適用: ${color}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onUpdate({ backgroundColor: color })
                    addRecentColor(color)
                  }}
                  className="w-5 h-5 rounded-full border border-[rgba(255,255,255,0.2)] shadow-sm hover:scale-110 transition-transform"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 削除ボタン */}
      <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
        <button
          type="button"
          onClick={onDelete}
          className="w-full py-1.5 px-3 text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/50 rounded transition-colors text-xs font-medium"
        >
          🗑 この吹き出しを削除
        </button>
      </div>
    </div>
  )
}

