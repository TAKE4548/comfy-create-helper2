import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SpeechBubble,
  BubbleShapeType,
  TextOrientation,
  DEFAULT_MANGA_EFFECTS,
  MangaTextEffectConfig,
  MultiStrokeLayer,
  PathPresetType,
  ScaleCurveType,
  FillModeType,
  StrokeLineStyle,
} from '../types/speechBubble'
import type { ServerFont, SpeechBubblePreset, SpeechTonePreset } from '../api/types'
import { speechBubblePresetsApi, speechTonePresetsApi } from '../api/client'
import { calculateFitBubbleDimensions } from '../utils/speechBubbleRenderer'
import { STALE_TIMES } from '../constants/staleTimes'

export interface SpeechBubbleControlsProps {
  bubble: SpeechBubble | null
  bubblesCount: number
  fontList: ServerFont[]
  isFontLoading: boolean
  isDrafting: boolean
  onUpdate: (updated: Partial<SpeechBubble>) => void
  onDelete: () => void
  onDuplicate?: () => void
  onGenerateDraft: () => void
}

const RECENT_COLORS_KEY = 'speech_bubble_recent_colors'
const MAX_RECENT_COLORS = 10

export const PRESET_SETTINGS_KEY = 'speech_bubble_preset_filter_settings'

export type PresetSortOption = 'name-asc' | 'name-desc' | 'created-asc' | 'created-desc'
export type PresetDirectionFilter = 'all' | 'vertical' | 'horizontal'

export interface PresetFilterSettings {
  searchQuery: string
  directionFilter: PresetDirectionFilter
  sortBy: PresetSortOption
  isWithTextOpen: boolean
  isWithoutTextOpen: boolean
}

export const DEFAULT_PRESET_FILTER_SETTINGS: PresetFilterSettings = {
  searchQuery: '',
  directionFilter: 'all',
  sortBy: 'name-asc',
  isWithTextOpen: true,
  isWithoutTextOpen: true,
}

// Color parsing & formatting helpers
function rgbaToHexAndAlpha(rgbaStr: string): { hex: string; alpha: number } {
  if (!rgbaStr) return { hex: '#000000', alpha: 1 }

  const rgbaMatch = rgbaStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0')
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0')
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0')
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    return { hex: `#${r}${g}${b}`, alpha: a }
  }

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
    cleanHex = cleanHex.split('').map((c) => c + c).join('')
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
  onDuplicate,
  onGenerateDraft,
}) => {
  const qc = useQueryClient()
  const { data: presets = [] } = useQuery<SpeechBubblePreset[]>({
    queryKey: ['speech-bubble-presets'],
    queryFn: speechBubblePresetsApi.list,
    staleTime: STALE_TIMES.SPEECH_BUBBLE_PRESETS,
  })

  const { data: tonePresets = [] } = useQuery<SpeechTonePreset[]>({
    queryKey: ['speech-tone-presets'],
    queryFn: speechTonePresetsApi.list,
    staleTime: STALE_TIMES.SPEECH_TONE_PRESETS,
  })

  const [recentColors, setRecentColors] = useState<string[]>([])
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [includeTextInPreset, setIncludeTextInPreset] = useState(false)
  const [showAddPresetInput, setShowAddPresetInput] = useState(false)

  // プリセット一覧のフィルタ・ソート・開閉状態
  const [presetSettings, setPresetSettings] = useState<PresetFilterSettings>(() => {
    try {
      const saved = localStorage.getItem(PRESET_SETTINGS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...DEFAULT_PRESET_FILTER_SETTINGS,
          ...parsed,
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_PRESET_FILTER_SETTINGS
  })

  const updatePresetSettings = (partial: Partial<PresetFilterSettings>) => {
    setPresetSettings((prev) => {
      const next = { ...prev, ...partial }
      try {
        localStorage.setItem(PRESET_SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  // プリセット上書きモーダル状態
  const [overwriteModalPreset, setOverwriteModalPreset] = useState<SpeechBubblePreset | null>(null)
  const [overwriteName, setOverwriteName] = useState('')
  const [overwriteIncludeText, setOverwriteIncludeText] = useState(false)
  const [isOverwritingPreset, setIsOverwritingPreset] = useState(false)

  // 口調変換 (LLM) 状態
  const [isToneSectionOpen, setIsToneSectionOpen] = useState(false)
  const [selectedTonePresetId, setSelectedTonePresetId] = useState<number | null>(null)
  const [customTonePrompt, setCustomTonePrompt] = useState('')
  const [isRewriting, setIsRewriting] = useState(false)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [rewriteResult, setRewriteResult] = useState<{ original: string; rewritten: string } | null>(null)
  const [showAddTonePreset, setShowAddTonePreset] = useState(false)
  const [newTonePresetName, setNewTonePresetName] = useState('')
  const [isSavingTonePreset, setIsSavingTonePreset] = useState(false)

  // 漫画演出 (FX) 状態
  const [isMangaFxOpen, setIsMangaFxOpen] = useState(false)

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
      const updated = [color, ...recentColors.filter((c) => c !== color)].slice(0, MAX_RECENT_COLORS)
      setRecentColors(updated)
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }
  }

  const handleApplyPreset = (preset: SpeechBubblePreset) => {
    const updatePayload: Partial<SpeechBubble> = {
      shape: preset.shape,
      orientation: preset.orientation,
      fontFamily: preset.font_family,
      fontSize: preset.font_size,
      textColor: preset.text_color,
      backgroundColor: preset.background_color,
      borderColor: preset.border_color,
      borderWidth: preset.border_width,
      effects: preset.effects,
    }
    // preset.text が保存されている場合のみテキストを反映し、未設定の場合は現在のテキストを保持
    if (preset.text !== undefined && preset.text !== null && preset.text !== '') {
      updatePayload.text = preset.text
    }
    onUpdate(updatePayload)
  }

  const handleCreatePreset = async () => {
    if (!newPresetName.trim() || !bubble) return
    setIsSavingPreset(true)
    try {
      const created = await speechBubblePresetsApi.create({
        name: newPresetName.trim(),
        shape: bubble.shape,
        orientation: bubble.orientation,
        font_family: bubble.fontFamily,
        font_size: bubble.fontSize || 0,
        text_color: bubble.textColor,
        background_color: bubble.backgroundColor,
        border_color: bubble.borderColor,
        border_width: bubble.borderWidth,
        effects: bubble.effects,
        text: includeTextInPreset ? (bubble.text?.trim() || null) : null,
        sort_order: presets.length,
      })
      qc.setQueryData<SpeechBubblePreset[]>(['speech-bubble-presets'], (old) => (old ? [...old, created] : [created]))
      await qc.invalidateQueries({ queryKey: ['speech-bubble-presets'] })
      setNewPresetName('')
      setIncludeTextInPreset(false)
      setShowAddPresetInput(false)
    } catch (err: any) {
      alert('プリセットの保存に失敗しました: ' + (err.message || 'Error'))
    } finally {
      setIsSavingPreset(false)
    }
  }

  const handleOpenOverwriteModal = (preset: SpeechBubblePreset, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!bubble) return
    setOverwriteModalPreset(preset)
    setOverwriteName(preset.name)
    setOverwriteIncludeText(preset.text !== undefined && preset.text !== null)
  }

  const handleExecuteOverwritePreset = async () => {
    if (!overwriteModalPreset || !bubble) return
    const targetName = overwriteName.trim() || overwriteModalPreset.name
    setIsOverwritingPreset(true)
    try {
      const updated = await speechBubblePresetsApi.update(overwriteModalPreset.id, {
        name: targetName,
        shape: bubble.shape,
        orientation: bubble.orientation,
        font_family: bubble.fontFamily,
        font_size: bubble.fontSize || 0,
        text_color: bubble.textColor,
        background_color: bubble.backgroundColor,
        border_color: bubble.borderColor,
        border_width: bubble.borderWidth,
        effects: bubble.effects,
        text: overwriteIncludeText ? (bubble.text?.trim() || null) : null,
      })
      qc.setQueryData<SpeechBubblePreset[]>(['speech-bubble-presets'], (old) =>
        old ? old.map((p) => (p.id === overwriteModalPreset.id ? updated : p)) : [updated]
      )
      await qc.invalidateQueries({ queryKey: ['speech-bubble-presets'] })
      setOverwriteModalPreset(null)
    } catch (err: any) {
      alert('プリセットの更新に失敗しました: ' + (err.message || 'Error'))
    } finally {
      setIsOverwritingPreset(false)
    }
  }

  const handleDeletePreset = async (preset: SpeechBubblePreset, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`プリセット「${preset.name}」を削除しますか？`)) return
    try {
      await speechBubblePresetsApi.delete(preset.id)
      qc.setQueryData<SpeechBubblePreset[]>(['speech-bubble-presets'], (old) =>
        old ? old.filter((p) => p.id !== preset.id) : []
      )
      await qc.invalidateQueries({ queryKey: ['speech-bubble-presets'] })
    } catch (err: any) {
      alert('プリセットの削除に失敗しました: ' + (err.message || 'Error'))
    }
  }

  const handleRewrite = async () => {
    const promptToSend =
      customTonePrompt.trim() ||
      (selectedTonePresetId ? tonePresets.find((p) => p.id === selectedTonePresetId)?.prompt : '')
    if (!bubble?.text?.trim() || !promptToSend) return
    setIsRewriting(true)
    setRewriteError(null)
    try {
      const res = await speechTonePresetsApi.rewrite({
        text: bubble.text,
        tone_prompt: promptToSend,
        preset_id: selectedTonePresetId || undefined,
      })
      setRewriteResult({
        original: bubble.text,
        rewritten: res.rewritten_text,
      })
    } catch (err: any) {
      setRewriteError(err.message || '口調変換に失敗しました')
    } finally {
      setIsRewriting(false)
    }
  }

  const handleSaveTonePreset = async () => {
    if (!newTonePresetName.trim() || !customTonePrompt.trim()) return
    setIsSavingTonePreset(true)
    try {
      const created = await speechTonePresetsApi.create({
        name: newTonePresetName.trim(),
        prompt: customTonePrompt.trim(),
        sort_order: tonePresets.length,
      })
      qc.setQueryData<SpeechTonePreset[]>(['speech-tone-presets'], (old) => (old ? [...old, created] : [created]))
      await qc.invalidateQueries({ queryKey: ['speech-tone-presets'] })
      setSelectedTonePresetId(created.id)
      setNewTonePresetName('')
      setShowAddTonePreset(false)
    } catch (err: any) {
      alert('口調プリセットの保存に失敗しました: ' + (err.message || 'Error'))
    } finally {
      setIsSavingTonePreset(false)
    }
  }

  if (!bubble) {
    return (
      <div className="p-4 text-xs text-zinc-400 bg-[#1F1F25] rounded-lg border border-dashed border-[rgba(255,255,255,0.12)] text-center">
        吹き出しが選択されていません（全 {bubblesCount} 個）。キャンバス上の吹き出しをクリックするか、ダブルクリックで追加してください。
      </div>
    )
  }

  const fx: MangaTextEffectConfig = bubble.effects || DEFAULT_MANGA_EFFECTS

  const updateEffects = (partial: Partial<MangaTextEffectConfig>) => {
    const updatedFx: MangaTextEffectConfig = {
      ...DEFAULT_MANGA_EFFECTS,
      ...(bubble.effects || {}),
      ...partial,
    }
    onUpdate({ effects: updatedFx })
  }

  const handleAutoFitBubbleSize = () => {
    const { w, h } = calculateFitBubbleDimensions(
      bubble.text,
      bubble.fontSize || 18,
      bubble.orientation,
      bubble.effects
    )
    onUpdate({ w, h })
  }

  // 縦中横の「!?」自動トグル
  const handleAutoRotatePunctuation = () => {
    if (!bubble.text) return
    const textChars = Array.from(bubble.text)
    const targetIndices: number[] = []
    const punctuationRegex = /[!?！？]/

    textChars.forEach((ch, idx) => {
      if (punctuationRegex.test(ch)) {
        targetIndices.push(idx)
      }
    })

    const currentRotateIndices = fx.rotate90Indices || []
    const allAlreadyIncluded = targetIndices.length > 0 && targetIndices.every((i) => currentRotateIndices.includes(i))

    let nextRotateIndices: number[]
    if (allAlreadyIncluded) {
      nextRotateIndices = currentRotateIndices.filter((i) => !targetIndices.includes(i))
    } else {
      nextRotateIndices = Array.from(new Set([...currentRotateIndices, ...targetIndices]))
    }
    updateEffects({ rotate90Indices: nextRotateIndices })
  }

  const handleToggleCharRotate = (charIdx: number) => {
    const current = fx.rotate90Indices || []
    const next = current.includes(charIdx) ? current.filter((i) => i !== charIdx) : [...current, charIdx]
    updateEffects({ rotate90Indices: next })
  }

  const handleAddMultiStroke = () => {
    const newLayer: MultiStrokeLayer = {
      id: crypto.randomUUID(),
      width: 3,
      color: 'rgba(255, 255, 255, 1)',
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      lineJoin: 'round',
      lineStyle: 'solid',
    }
    updateEffects({ multiStrokes: [...(fx.multiStrokes || []), newLayer] })
  }

  const handleUpdateMultiStroke = (id: string, partial: Partial<MultiStrokeLayer>) => {
    const updated = (fx.multiStrokes || []).map((layer) => (layer.id === id ? { ...layer, ...partial } : layer))
    updateEffects({ multiStrokes: updated })
  }

  const handleDeleteMultiStroke = (id: string) => {
    const updated = (fx.multiStrokes || []).filter((layer) => layer.id !== id)
    updateEffects({ multiStrokes: updated })
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

  const textColorParsed = rgbaToHexAndAlpha(bubble.textColor)
  const bgColorParsed = rgbaToHexAndAlpha(bubble.backgroundColor)
  const borderColorParsed = rgbaToHexAndAlpha(bubble.borderColor)

  // プリセットのフィルタ & ソート
  const filteredPresets = presets.filter((p) => {
    if (presetSettings.directionFilter === 'vertical' && p.orientation !== 'vertical') return false
    if (presetSettings.directionFilter === 'horizontal' && p.orientation !== 'horizontal') return false

    if (presetSettings.searchQuery.trim()) {
      const q = presetSettings.searchQuery.trim().toLowerCase()
      const nameMatch = p.name.toLowerCase().includes(q)
      const textMatch = p.text ? p.text.toLowerCase().includes(q) : false
      if (!nameMatch && !textMatch) return false
    }

    return true
  })

  const sortedPresets = [...filteredPresets].sort((a, b) => {
    switch (presetSettings.sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name, 'ja')
      case 'name-desc':
        return b.name.localeCompare(a.name, 'ja')
      case 'created-asc': {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : a.id
        const timeB = b.created_at ? new Date(b.created_at).getTime() : b.id
        return timeA - timeB
      }
      case 'created-desc': {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : a.id
        const timeB = b.created_at ? new Date(b.created_at).getTime() : b.id
        return timeB - timeA
      }
      default:
        return 0
    }
  })

  const withTextPresets = sortedPresets.filter((p) => p.text !== undefined && p.text !== null && p.text.trim() !== '')
  const withoutTextPresets = sortedPresets.filter((p) => !p.text || p.text.trim() === '')

  const renderPresetChips = (list: SpeechBubblePreset[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((p) => {
        const orientationSuffix = p.orientation === 'horizontal' ? '(横)' : '(縦)'
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => handleApplyPreset(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleApplyPreset(p)
              }
            }}
            className="group inline-flex items-center gap-1.5 px-2 py-1 bg-[#18181C] hover:bg-[#282830] border border-[rgba(255,255,255,0.08)] hover:border-blue-500/50 rounded text-xs text-zinc-200 cursor-pointer transition-all"
            title={`${p.name} ${orientationSuffix}${p.text ? `\n💬 テキスト: ${p.text}` : ''} (クリックで適用)`}
          >
            <span
              className="w-3 h-3 rounded-full border flex-shrink-0"
              style={{
                backgroundColor: p.background_color,
                borderColor: p.border_color,
                borderWidth: Math.min(2, Math.max(1, p.border_width)),
              }}
            />
            <span className="truncate max-w-[120px]">
              {p.name} {orientationSuffix}
            </span>
            {p.text && (
              <span className="text-[10px] text-amber-400 font-bold" title={`保存テキスト: ${p.text}`}>
                💬
              </span>
            )}
            <button
              type="button"
              title="現在の修飾で上書き"
              onClick={(e) => handleOpenOverwriteModal(p, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-blue-400 p-0.5 text-[10px] transition-opacity"
            >
              💾
            </button>
            <button
              type="button"
              title="プリセットを削除"
              onClick={(e) => handleDeletePreset(p, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 text-[10px] transition-opacity"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4 p-3 md:p-4 bg-[#1F1F25] rounded-lg border border-[rgba(255,255,255,0.08)] shadow-sm text-sm text-zinc-200">
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

      {/* 都度調整系（文字方向、枠サイズ自動フィット、回転、サイズ微調整） */}
      <div className="space-y-2.5 pt-2 border-t border-[rgba(255,255,255,0.08)]" data-testid="quick-adjust-section">
        {/* 文字方向 & 枠サイズ自動フィット */}
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

          {/* 幅・高さ微調整 (ステップボタン付き) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-1 bg-[#18181C] px-1.5 py-1 rounded border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-zinc-400">W:</span>
              <button
                type="button"
                aria-label="吹き出し幅を減らす"
                onClick={() => onUpdate({ w: Math.max(30, bubble.w - 5) })}
                className="w-5 h-5 flex items-center justify-center bg-[#282830] hover:bg-[#383842] text-zinc-300 rounded text-xs transition-colors"
              >
                -
              </button>
              <input
                type="number"
                aria-label="吹き出し幅"
                min="30"
                max="2000"
                value={bubble.w}
                onChange={(e) => onUpdate({ w: Math.max(30, parseInt(e.target.value, 10) || 30) })}
                className="w-full bg-transparent text-xs text-center text-zinc-200 focus:outline-none"
              />
              <button
                type="button"
                aria-label="吹き出し幅を増やす"
                onClick={() => onUpdate({ w: Math.min(2000, bubble.w + 5) })}
                className="w-5 h-5 flex items-center justify-center bg-[#282830] hover:bg-[#383842] text-zinc-300 rounded text-xs transition-colors"
              >
                +
              </button>
              <span className="text-[10px] text-zinc-500">px</span>
            </div>
            <div className="flex items-center space-x-1 bg-[#18181C] px-1.5 py-1 rounded border border-[rgba(255,255,255,0.08)]">
              <span className="text-[11px] text-zinc-400">H:</span>
              <button
                type="button"
                aria-label="吹き出し高さを減らす"
                onClick={() => onUpdate({ h: Math.max(30, bubble.h - 5) })}
                className="w-5 h-5 flex items-center justify-center bg-[#282830] hover:bg-[#383842] text-zinc-300 rounded text-xs transition-colors"
              >
                -
              </button>
              <input
                type="number"
                aria-label="吹き出し高さ"
                min="30"
                max="2000"
                value={bubble.h}
                onChange={(e) => onUpdate({ h: Math.max(30, parseInt(e.target.value, 10) || 30) })}
                className="w-full bg-transparent text-xs text-center text-zinc-200 focus:outline-none"
              />
              <button
                type="button"
                aria-label="吹き出し高さを増やす"
                onClick={() => onUpdate({ h: Math.min(2000, bubble.h + 5) })}
                className="w-5 h-5 flex items-center justify-center bg-[#282830] hover:bg-[#383842] text-zinc-300 rounded text-xs transition-colors"
              >
                +
              </button>
              <span className="text-[10px] text-zinc-500">px</span>
            </div>
          </div>
        </div>

        {/* 吹き出しの回転 (ステップボタン付き) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-medium text-xs text-zinc-200">吹き出しの回転</label>
            <button
              type="button"
              onClick={() => onUpdate({ rotation: 0 })}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
            >
              0° リセット
            </button>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              aria-label="回転角度を減らす"
              onClick={() => {
                const cur = bubble.rotation || 0
                onUpdate({ rotation: Math.max(-180, cur - 1) })
              }}
              className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
            >
              -
            </button>
            <input
              type="range"
              aria-label="吹き出しの回転"
              min="-180"
              max="180"
              step="1"
              value={bubble.rotation || 0}
              onChange={(e) => onUpdate({ rotation: parseInt(e.target.value, 10) || 0 })}
              className="flex-1 accent-blue-500"
            />
            <button
              type="button"
              aria-label="回転角度を増やす"
              onClick={() => {
                const cur = bubble.rotation || 0
                onUpdate({ rotation: Math.min(180, cur + 1) })
              }}
              className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
            >
              +
            </button>
            <div className="flex items-center space-x-0.5 bg-[#18181C] px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.08)]">
              <input
                type="number"
                aria-label="吹き出し回転角度数値"
                min="-180"
                max="180"
                value={bubble.rotation || 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  onUpdate({ rotation: isNaN(val) ? 0 : Math.max(-180, Math.min(180, val)) })
                }}
                className="w-10 bg-transparent text-xs text-right text-zinc-200 focus:outline-none"
              />
              <span className="text-[10px] text-zinc-400">°</span>
            </div>
          </div>
        </div>
      </div>

      {/* 口調変換 (LLM) セクション */}
      <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.08)]" data-testid="speech-tone-section">
        <div
          role="button"
          tabIndex={0}
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsToneSectionOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsToneSectionOpen((prev) => !prev)
            }
          }}
        >
          <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-200">
            <span className="text-[10px] text-zinc-400">{isToneSectionOpen ? '▼' : '▶'}</span>
            <span>🎭 セリフ口調変換 (LLM)</span>
          </div>
          {rewriteResult && (
            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
              プレビュー中
            </span>
          )}
        </div>

        {isToneSectionOpen && (
          <div className="space-y-2.5 bg-[#18181C] p-2.5 rounded border border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <select
                  aria-label="口調プリセット選択"
                  value={selectedTonePresetId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value ? parseInt(e.target.value, 10) : null
                    setSelectedTonePresetId(id)
                    if (id) {
                      const preset = tonePresets.find((p) => p.id === id)
                      if (preset) {
                        setCustomTonePrompt(preset.prompt)
                      }
                    }
                  }}
                  className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none focus:border-purple-500"
                >
                  <option value="">カスタム指示 / プリセット選択...</option>
                  {tonePresets.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTonePreset((prev) => !prev)}
                className="text-[11px] px-2 py-1 bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 rounded border border-purple-700/40 whitespace-nowrap transition-colors"
              >
                {showAddTonePreset ? '閉じる' : '＋ プリセット登録'}
              </button>
            </div>

            {showAddTonePreset && (
              <div className="p-2 bg-[#1F1F25] rounded border border-purple-500/30 space-y-2">
                <input
                  type="text"
                  placeholder="新しい口調プリセット名（例: ツンデレ風）..."
                  value={newTonePresetName}
                  onChange={(e) => setNewTonePresetName(e.target.value)}
                  className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 text-xs focus:outline-none focus:border-purple-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTonePreset(false)
                      setNewTonePresetName('')
                    }}
                    className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={!newTonePresetName.trim() || !customTonePrompt.trim() || isSavingTonePreset}
                    onClick={handleSaveTonePreset}
                    className="px-2.5 py-0.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
                  >
                    {isSavingTonePreset ? '保存中...' : '登録'}
                  </button>
                </div>
              </div>
            )}

            <div>
              <textarea
                value={customTonePrompt}
                onChange={(e) => setCustomTonePrompt(e.target.value)}
                placeholder="口調の指示を入力（例: お嬢様言葉で「〜ですわ」を語尾につけて）..."
                rows={2}
                className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRewrite}
                disabled={isRewriting || !bubble.text.trim() || (!customTonePrompt.trim() && !selectedTonePresetId)}
                className="px-3 py-1 bg-purple-600/80 hover:bg-purple-600 text-white rounded text-xs font-medium disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                {isRewriting ? '変換中...' : '✨ 口調変換 (LLM)'}
              </button>
            </div>

            {rewriteError && (
              <div className="p-2 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300">
                {rewriteError}
              </div>
            )}

            {rewriteResult && (
              <div className="p-2.5 bg-[#1F1F25] border border-purple-500/40 rounded space-y-2" data-testid="tone-rewrite-preview">
                <div className="text-[11px] font-medium text-purple-300">口調変換プレビュー</div>
                <div className="space-y-1 text-xs">
                  <div className="text-zinc-400">
                    <span className="inline-block w-12 text-[10px] text-zinc-500 font-bold">変換前:</span>
                    <span className="line-through text-zinc-400">{rewriteResult.original}</span>
                  </div>
                  <div className="text-zinc-100 font-medium">
                    <span className="inline-block w-12 text-[10px] text-purple-400 font-bold">変換後:</span>
                    <span className="text-emerald-300">{rewriteResult.rewritten}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-1.5 pt-1 border-t border-[rgba(255,255,255,0.06)]">
                  <button
                    type="button"
                    onClick={() => setRewriteResult(null)}
                    className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 rounded"
                  >
                    破棄
                  </button>
                  <button
                    type="button"
                    disabled={isRewriting}
                    onClick={handleRewrite}
                    className="px-2 py-0.5 text-xs text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-700/40 rounded transition-colors"
                  >
                    再試行
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdate({ text: rewriteResult.rewritten })
                      setRewriteResult(null)
                    }}
                    className="px-3 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                  >
                    セリフに適用
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 漫画テキスト演出 (FX) セクション */}
      <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.08)]" data-testid="manga-effects-section">
        <div
          role="button"
          tabIndex={0}
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsMangaFxOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsMangaFxOpen((prev) => !prev)
            }
          }}
        >
          <div className="flex items-center gap-1.5 font-medium text-xs text-zinc-200">
            <span className="text-[10px] text-zinc-400">{isMangaFxOpen ? '▼' : '▶'}</span>
            <span>💥 漫画テキスト演出 (FX)</span>
          </div>
          {(fx.scaleCurve !== 'none' ||
            (fx.multiStrokes && fx.multiStrokes.length > 0) ||
            fx.pathPreset !== 'none' ||
            fx.fillMode !== 'solid' ||
            (fx.rotate90Indices && fx.rotate90Indices.length > 0)) && (
            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
              演出適用中
            </span>
          )}
        </div>

        {isMangaFxOpen && (
          <div className="space-y-3 bg-[#18181C] p-2.5 rounded border border-[rgba(255,255,255,0.08)]">
            {/* 1. タイポグラフィ & 縦中横 */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
                1. タイポグラフィ & 縦中横
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                    <span>字間 (Letter Spacing)</span>
                    <span>{fx.letterSpacing ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    aria-label="字間"
                    min="-10"
                    max="50"
                    value={fx.letterSpacing ?? 0}
                    onChange={(e) => updateEffects({ letterSpacing: parseInt(e.target.value, 10) })}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                    <span>行間倍率 (Line Height)</span>
                    <span>{(fx.lineHeightRatio ?? (bubble.orientation === 'vertical' ? 1.15 : 1.25)).toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="行間倍率"
                    min="0.8"
                    max="2.5"
                    step="0.05"
                    value={fx.lineHeightRatio ?? (bubble.orientation === 'vertical' ? 1.15 : 1.25)}
                    onChange={(e) => updateEffects({ lineHeightRatio: parseFloat(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                  <span>シアー傾斜 (Shear)</span>
                  <span>{fx.shearAngle ?? 0}°</span>
                </div>
                <input
                  type="range"
                  aria-label="シアー傾斜"
                  min="-45"
                  max="45"
                  value={fx.shearAngle ?? 0}
                  onChange={(e) => updateEffects({ shearAngle: parseInt(e.target.value, 10) })}
                  className="w-full accent-blue-500"
                />
              </div>

              {bubble.orientation === 'vertical' && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-medium">縦中横（90度回転）</span>
                    <button
                      type="button"
                      onClick={handleAutoRotatePunctuation}
                      className="text-[10px] px-2 py-0.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-700/50 transition-colors"
                    >
                      !? 自動回転トグル
                    </button>
                  </div>
                  {bubble.text && (
                    <div className="flex flex-wrap gap-1 bg-[#1F1F25] p-1.5 rounded border border-[rgba(255,255,255,0.06)]">
                      {Array.from(bubble.text).map((char, idx) => {
                        const isRotated = fx.rotate90Indices?.includes(idx)
                        return (
                          <button
                            key={`${char}-${idx}`}
                            type="button"
                            onClick={() => handleToggleCharRotate(idx)}
                            className={`w-6 h-6 text-xs rounded border flex items-center justify-center transition-colors ${
                              isRotated
                                ? 'bg-amber-600 border-amber-500 text-white font-bold'
                                : 'bg-[#18181C] border-[rgba(255,255,255,0.1)] text-zinc-300 hover:bg-[#282830]'
                            }`}
                            title={`文字「${char}」(位置:${idx + 1}) を90度回転`}
                          >
                            {char === '\n' ? '↵' : char}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. ダイナミックスケール & 感情揺らぎ */}
            <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
                2. ダイナミックスケール & 感情揺らぎ
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">スケール変化カーブ</label>
                  <select
                    aria-label="スケール変化カーブ"
                    value={fx.scaleCurve ?? 'none'}
                    onChange={(e) => updateEffects({ scaleCurve: e.target.value as ScaleCurveType })}
                    className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                  >
                    <option value="none">なし (均一サイズ)</option>
                    <option value="linear">線形変化 (Linear)</option>
                    <option value="ease-in">イーズイン (Ease In)</option>
                    <option value="ease-out">イーズアウト (Ease Out)</option>
                    <option value="bezier">ベジェ (S字カーブ)</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                    <span>サイズ揺らぎ (Jitter)</span>
                    <span>{fx.sizeJitter ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    aria-label="サイズ揺らぎ"
                    min="0"
                    max="50"
                    value={fx.sizeJitter ?? 0}
                    onChange={(e) => updateEffects({ sizeJitter: parseInt(e.target.value, 10) })}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              {fx.scaleCurve && fx.scaleCurve !== 'none' && (
                <div className="grid grid-cols-2 gap-2 bg-[#1F1F25] p-1.5 rounded border border-[rgba(255,255,255,0.06)]">
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span>開始倍率 (Start)</span>
                      <span>{(fx.scaleStart ?? 1.0).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      aria-label="開始倍率"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={fx.scaleStart ?? 1.0}
                      onChange={(e) => updateEffects({ scaleStart: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span>終了倍率 (End)</span>
                      <span>{(fx.scaleEnd ?? 1.0).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      aria-label="終了倍率"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      value={fx.scaleEnd ?? 1.0}
                      onChange={(e) => updateEffects({ scaleEnd: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. パス・軌道レイアウト */}
            <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
                3. パス・軌道レイアウト
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">軌道タイプ</label>
                  <select
                    aria-label="軌道タイプ"
                    value={fx.pathPreset ?? 'none'}
                    onChange={(e) => {
                      const val = e.target.value as PathPresetType
                      updateEffects({ pathPreset: val })
                    }}
                    className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                  >
                    <option value="none">なし (通常整列)</option>
                    <option value="line">直線 (2制御点)</option>
                    <option value="arc">円弧・アーチ (3制御点)</option>
                    <option value="wave">S字波 (4制御点)</option>
                    <option value="stepped">階段 (2制御点)</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
                    <span>ガタつき (Baseline Jitter)</span>
                    <span>{fx.baselineJitter ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    aria-label="ガタつき"
                    min="0"
                    max="20"
                    value={fx.baselineJitter ?? 0}
                    onChange={(e) => updateEffects({ baselineJitter: parseInt(e.target.value, 10) })}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>

              {fx.pathPreset && fx.pathPreset !== 'none' && (
                <div className="flex items-center space-x-2 pt-1">
                  <label className="inline-flex items-center text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!fx.pathFollowRotation}
                      onChange={(e) => updateEffects({ pathFollowRotation: e.target.checked })}
                      className="mr-1.5 rounded accent-blue-500"
                    />
                    パス接線方向に文字を回転追従させる
                  </label>
                </div>
              )}
            </div>

            {/* 4. カラー・塗り・テクスチャ */}
            <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[11px] font-semibold text-blue-400 border-b border-[rgba(255,255,255,0.06)] pb-1">
                4. カラー・塗り・グラデーション
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-0.5">塗りモード</label>
                  <select
                    aria-label="塗りモード"
                    value={fx.fillMode ?? 'solid'}
                    onChange={(e) => updateEffects({ fillMode: e.target.value as FillModeType })}
                    className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                  >
                    <option value="solid">単色塗り (Solid)</option>
                    <option value="gradient">グラデーション (Gradient)</option>
                    <option value="tone">スクリーントーン網点 (Tone)</option>
                    <option value="hollow">中抜き (Hollow)</option>
                  </select>
                </div>
                {fx.fillMode === 'gradient' && (
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-0.5">種別</label>
                    <select
                      aria-label="グラデーション種別"
                      value={fx.gradientType ?? 'linear'}
                      onChange={(e) => updateEffects({ gradientType: e.target.value as 'linear' | 'radial' })}
                      className="w-full p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none"
                    >
                      <option value="linear">線形 (Linear)</option>
                      <option value="radial">放射状 (Radial)</option>
                    </select>
                  </div>
                )}
              </div>

              {fx.fillMode === 'gradient' && (
                <div className="space-y-1.5 bg-[#1F1F25] p-2 rounded border border-[rgba(255,255,255,0.06)]">
                  {fx.gradientType === 'linear' && (
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                        <span>角度 (Angle)</span>
                        <span>{fx.gradientAngle ?? 0}°</span>
                      </div>
                      <input
                        type="range"
                        aria-label="グラデーション角度"
                        min="0"
                        max="360"
                        value={fx.gradientAngle ?? 0}
                        onChange={(e) => updateEffects({ gradientAngle: parseInt(e.target.value, 10) })}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-zinc-300">
                    <span>グラデーション色</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="グラデーション開始色"
                        value={rgbaToHexAndAlpha(fx.gradientStops?.[0]?.color || bubble.textColor).hex}
                        onChange={(e) => {
                          const c1 = e.target.value
                          const c2 = fx.gradientStops?.[1]?.color || 'rgba(100, 100, 100, 1)'
                          updateEffects({
                            gradientStops: [
                              { color: c1, offset: 0 },
                              { color: c2, offset: 1 },
                            ],
                          })
                        }}
                        className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                      />
                      <span>→</span>
                      <input
                        type="color"
                        aria-label="グラデーション終了色"
                        value={rgbaToHexAndAlpha(fx.gradientStops?.[1]?.color || 'rgba(100, 100, 100, 1)').hex}
                        onChange={(e) => {
                          const c1 = fx.gradientStops?.[0]?.color || bubble.textColor
                          const c2 = e.target.value
                          updateEffects({
                            gradientStops: [
                              { color: c1, offset: 0 },
                              { color: c2, offset: 1 },
                            ],
                          })
                        }}
                        className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 5. 多重フチ（多層アウトライン） */}
            <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1">
                <span className="text-[11px] font-semibold text-blue-400">5. 多重フチ（多層アウトライン）</span>
                <button
                  type="button"
                  onClick={handleAddMultiStroke}
                  className="text-[10px] px-2 py-0.5 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-700/50 transition-colors"
                >
                  ＋ フチ追加
                </button>
              </div>

              {(!fx.multiStrokes || fx.multiStrokes.length === 0) ? (
                <div className="text-[11px] text-zinc-500 py-1 text-center">多重フチレイヤーはありません</div>
              ) : (
                <div className="space-y-2">
                  {fx.multiStrokes.map((layer, idx) => {
                    const layerColorParsed = rgbaToHexAndAlpha(layer.color)
                    return (
                      <div
                        key={layer.id || idx}
                        className="p-2 bg-[#1F1F25] rounded border border-[rgba(255,255,255,0.08)] space-y-1.5"
                        data-testid={`multi-stroke-layer-${idx}`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-zinc-300">
                          <span className="font-medium">レイヤー #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMultiStroke(layer.id)}
                            className="text-red-400 hover:text-red-300 text-[10px]"
                            title="レイヤー削除"
                          >
                            ✕ 削除
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                              <span>太さ</span>
                              <span>{layer.width}px</span>
                            </div>
                            <input
                              type="range"
                              aria-label={`フチレイヤー${idx + 1}太さ`}
                              min="1"
                              max="20"
                              value={layer.width}
                              onChange={(e) =>
                                handleUpdateMultiStroke(layer.id, { width: parseInt(e.target.value, 10) })
                              }
                              className="w-full accent-blue-500"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              aria-label={`フチレイヤー${idx + 1}色`}
                              value={layerColorParsed.hex}
                              onChange={(e) => {
                                const rgba = hexAndAlphaToRgba(e.target.value, layer.opacity ?? 1)
                                handleUpdateMultiStroke(layer.id, { color: rgba })
                              }}
                              className="w-6 h-6 rounded border border-[rgba(255,255,255,0.15)] bg-transparent cursor-pointer p-0.5"
                            />
                            <select
                              aria-label={`フチレイヤー${idx + 1}スタイル`}
                              value={layer.lineStyle ?? 'solid'}
                              onChange={(e) =>
                                handleUpdateMultiStroke(layer.id, { lineStyle: e.target.value as StrokeLineStyle })
                              }
                              className="flex-1 p-1 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 text-[10px] focus:outline-none"
                            >
                              <option value="solid">実線</option>
                              <option value="dashed">破線</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 修飾プリセット */}
      <div className="space-y-2 pt-2 border-t border-[rgba(255,255,255,0.08)]" data-testid="speech-bubble-presets-section">
        <div className="flex items-center justify-between">
          <label className="font-medium text-xs text-zinc-200">修飾プリセット</label>
          <button
            type="button"
            onClick={() => setShowAddPresetInput((prev) => !prev)}
            className="text-[11px] px-2 py-0.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 rounded border border-blue-700/40 transition-colors"
          >
            {showAddPresetInput ? '閉じる' : '＋ プリセット登録'}
          </button>
        </div>

        {/* 新規プリセット登録インラインフォーム */}
        {showAddPresetInput && (
          <div className="p-2 bg-[#18181C] rounded border border-[rgba(255,255,255,0.12)] space-y-2">
            <input
              type="text"
              placeholder="プリセット名を入力..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreatePreset()
                }
              }}
            />
            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                aria-label="テキストを含める"
                checked={includeTextInPreset}
                onChange={(e) => setIncludeTextInPreset(e.target.checked)}
                className="rounded accent-blue-500"
              />
              <span>テキストを含める {bubble.text ? `(「${bubble.text.length > 8 ? bubble.text.slice(0, 8) + '...' : bubble.text}」)` : '(空)'}</span>
            </label>
            <div className="flex justify-end space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowAddPresetInput(false)
                  setNewPresetName('')
                  setIncludeTextInPreset(false)
                }}
                className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 rounded"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!newPresetName.trim() || isSavingPreset}
                onClick={handleCreatePreset}
                className="px-2.5 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
              >
                {isSavingPreset ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* 検索・フィルタ・ソートコントロール */}
        <div className="space-y-1.5 bg-[#18181C] p-2 rounded border border-[rgba(255,255,255,0.06)]">
          {/* 検索バー */}
          <div className="relative">
            <input
              type="text"
              aria-label="プリセット検索"
              placeholder="プリセット名 / テキストで検索..."
              value={presetSettings.searchQuery}
              onChange={(e) => updatePresetSettings({ searchQuery: e.target.value })}
              className="w-full p-1.5 text-xs bg-[#1F1F25] text-zinc-100 placeholder-zinc-500 rounded border border-[rgba(255,255,255,0.1)] focus:outline-none focus:border-blue-500"
            />
            {presetSettings.searchQuery && (
              <button
                type="button"
                aria-label="検索クリア"
                onClick={() => updatePresetSettings({ searchQuery: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* 縦横フィルタ & ソートセレクタ */}
          <div className="flex items-center justify-between gap-1.5">
            {/* 種別フィルタ */}
            <div className="flex items-center gap-1" role="group" aria-label="プリセット種別フィルタ">
              {(
                [
                  { value: 'all', label: 'すべて', ariaLabel: 'すべてのプリセット' },
                  { value: 'vertical', label: '縦書き', ariaLabel: '縦書きプリセット' },
                  { value: 'horizontal', label: '横書き', ariaLabel: '横書きプリセット' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-label={opt.ariaLabel}
                  onClick={() => updatePresetSettings({ directionFilter: opt.value })}
                  className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                    presetSettings.directionFilter === opt.value
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-[#1F1F25] text-zinc-400 hover:text-zinc-200 hover:bg-[#282830]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* ソートセレクタ */}
            <div className="flex items-center gap-1">
              <select
                aria-label="プリセット並び順"
                value={presetSettings.sortBy}
                onChange={(e) => updatePresetSettings({ sortBy: e.target.value as PresetSortOption })}
                className="p-1 text-[11px] bg-[#1F1F25] text-zinc-200 border border-[rgba(255,255,255,0.1)] rounded focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="name-asc">名前昇順</option>
                <option value="name-desc">名前降順</option>
                <option value="created-asc">日時昇順</option>
                <option value="created-desc">日時降順</option>
              </select>
            </div>
          </div>
        </div>

        {/* プリセット一覧 (2区分折り畳み) */}
        {presets.length === 0 ? (
          <div className="p-2 text-center text-[11px] text-zinc-500">
            登録済みのプリセットはありません
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="p-2 text-center text-[11px] text-zinc-500">
            条件に一致するプリセットがありません
          </div>
        ) : (
          <div className="space-y-2">
            {/* 1. テキスト付きプリセット */}
            <div className="border border-[rgba(255,255,255,0.06)] rounded bg-[#18181C]/50 overflow-hidden">
              <button
                type="button"
                aria-label="テキスト付きプリセットの折り畳み切替"
                onClick={() => updatePresetSettings({ isWithTextOpen: !presetSettings.isWithTextOpen })}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#18181C] hover:bg-[#222228] text-xs text-zinc-300 transition-colors select-none"
              >
                <span className="font-medium flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500">{presetSettings.isWithTextOpen ? '▼' : '▶'}</span>
                  <span>💬 テキスト付き ({withTextPresets.length})</span>
                </span>
              </button>
              {presetSettings.isWithTextOpen && (
                <div className="p-2 border-t border-[rgba(255,255,255,0.04)]">
                  {withTextPresets.length === 0 ? (
                    <span className="text-[11px] text-zinc-500">テキスト付きプリセットはありません</span>
                  ) : (
                    renderPresetChips(withTextPresets)
                  )}
                </div>
              )}
            </div>

            {/* 2. スタイル専用（テキストなし）プリセット */}
            <div className="border border-[rgba(255,255,255,0.06)] rounded bg-[#18181C]/50 overflow-hidden">
              <button
                type="button"
                aria-label="スタイル専用プリセットの折り畳み切替"
                onClick={() => updatePresetSettings({ isWithoutTextOpen: !presetSettings.isWithoutTextOpen })}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#18181C] hover:bg-[#222228] text-xs text-zinc-300 transition-colors select-none"
              >
                <span className="font-medium flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500">{presetSettings.isWithoutTextOpen ? '▼' : '▶'}</span>
                  <span>🎨 スタイル専用 ({withoutTextPresets.length})</span>
                </span>
              </button>
              {presetSettings.isWithoutTextOpen && (
                <div className="p-2 border-t border-[rgba(255,255,255,0.04)]">
                  {withoutTextPresets.length === 0 ? (
                    <span className="text-[11px] text-zinc-500">スタイル専用プリセットはありません</span>
                  ) : (
                    renderPresetChips(withoutTextPresets)
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                aria-label="フォントサイズを減らす"
                onClick={() => onUpdate({ fontSize: Math.max(8, (bubble.fontSize || 18) - 1) })}
                className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
              >
                -
              </button>
              <input
                type="range"
                aria-label="フォントサイズ"
                min="8"
                max="64"
                value={bubble.fontSize}
                onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value, 10) })}
                className="flex-1 accent-blue-500"
              />
              <button
                type="button"
                aria-label="フォントサイズを増やす"
                onClick={() => onUpdate({ fontSize: Math.min(64, (bubble.fontSize || 18) + 1) })}
                className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
              >
                +
              </button>
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
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] text-zinc-400 w-12">枠線幅</span>
            <button
              type="button"
              aria-label="枠線幅を減らす"
              onClick={() => onUpdate({ borderWidth: Math.max(0, bubble.borderWidth - 1) })}
              className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
            >
              -
            </button>
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
            <button
              type="button"
              aria-label="枠線幅を増やす"
              onClick={() => onUpdate({ borderWidth: Math.min(10, bubble.borderWidth + 1) })}
              className="w-6 h-6 flex items-center justify-center bg-[#18181C] hover:bg-[#282830] text-zinc-300 border border-[rgba(255,255,255,0.08)] rounded text-xs transition-colors"
            >
              +
            </button>
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

      {/* 吹き出しアクション */}
      <div className="pt-2 border-t border-[rgba(255,255,255,0.08)] space-y-2">
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="w-full py-1.5 px-3 text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 border border-blue-800/50 rounded transition-colors text-xs font-medium"
          >
            📋 この吹き出しを複製
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="w-full py-1.5 px-3 text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/50 rounded transition-colors text-xs font-medium"
        >
          🗑 この吹き出しを削除
        </button>
      </div>

      {/* プリセット上書きモーダル */}
      {overwriteModalPreset && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="preset-overwrite-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOverwriteModalPreset(null)}
        >
          <div
            className="w-full max-w-sm bg-[#1E1E24] border border-[rgba(255,255,255,0.12)] rounded-lg shadow-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(255,255,255,0.08)]">
              <h3 className="font-semibold text-xs text-zinc-100">プリセットの上書き保存</h3>
              <button
                type="button"
                onClick={() => setOverwriteModalPreset(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">プリセット名</label>
              <input
                type="text"
                data-testid="overwrite-preset-name-input"
                value={overwriteName}
                onChange={(e) => setOverwriteName(e.target.value)}
                placeholder="プリセット名を入力..."
                className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#18181C] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="overwrite-preset-include-text-checkbox"
                aria-label="テキストを含める"
                checked={overwriteIncludeText}
                onChange={(e) => setOverwriteIncludeText(e.target.checked)}
                className="rounded accent-blue-500"
              />
              <span>テキストを含める {bubble.text ? `(「${bubble.text.length > 8 ? bubble.text.slice(0, 8) + '...' : bubble.text}」)` : '(空)'}</span>
            </label>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <button
                type="button"
                data-testid="overwrite-preset-cancel-btn"
                onClick={() => setOverwriteModalPreset(null)}
                className="px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 rounded"
              >
                キャンセル
              </button>
              <button
                type="button"
                data-testid="overwrite-preset-submit-btn"
                disabled={!overwriteName.trim() || isOverwritingPreset}
                onClick={handleExecuteOverwritePreset}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
              >
                {isOverwritingPreset ? '上書き中...' : '上書き保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

