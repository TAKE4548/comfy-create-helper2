import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpeechBubble, BubbleShapeType, TextOrientation } from '../types/speechBubble'
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
  const [showAddPresetInput, setShowAddPresetInput] = useState(false)

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

  const handleApplyPreset = (preset: SpeechBubblePreset) => {
    onUpdate({
      shape: preset.shape,
      orientation: preset.orientation,
      fontFamily: preset.font_family,
      fontSize: preset.font_size,
      textColor: preset.text_color,
      backgroundColor: preset.background_color,
      borderColor: preset.border_color,
      borderWidth: preset.border_width,
    })
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
        sort_order: presets.length,
      })
      qc.setQueryData<SpeechBubblePreset[]>(['speech-bubble-presets'], (old) => (old ? [...old, created] : [created]))
      await qc.invalidateQueries({ queryKey: ['speech-bubble-presets'] })
      setNewPresetName('')
      setShowAddPresetInput(false)
    } catch (err: any) {
      alert('プリセットの保存に失敗しました: ' + (err.message || 'Error'))
    } finally {
      setIsSavingPreset(false)
    }
  }

  const handleOverwritePreset = async (preset: SpeechBubblePreset, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!bubble) return
    if (!window.confirm(`プリセット「${preset.name}」を現在の装飾設定で上書き保存しますか？`)) return
    try {
      const updated = await speechBubblePresetsApi.update(preset.id, {
        shape: bubble.shape,
        orientation: bubble.orientation,
        font_family: bubble.fontFamily,
        font_size: bubble.fontSize || 0,
        text_color: bubble.textColor,
        background_color: bubble.backgroundColor,
        border_color: bubble.borderColor,
        border_width: bubble.borderWidth,
      })
      qc.setQueryData<SpeechBubblePreset[]>(['speech-bubble-presets'], (old) =>
        old ? old.map((p) => (p.id === preset.id ? updated : p)) : [updated]
      )
      await qc.invalidateQueries({ queryKey: ['speech-bubble-presets'] })
    } catch (err: any) {
      alert('プリセットの更新に失敗しました: ' + (err.message || 'Error'))
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
    const promptToSend = customTonePrompt.trim() || (selectedTonePresetId ? tonePresets.find((p) => p.id === selectedTonePresetId)?.prompt : '')
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
            {/* プリセット選択 & 新規プリセット保存ボタン */}
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

            {/* 新規口調プリセット登録フォーム */}
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

            {/* 口調プロンプト入力 */}
            <div>
              <textarea
                value={customTonePrompt}
                onChange={(e) => setCustomTonePrompt(e.target.value)}
                placeholder="口調の指示を入力（例: お嬢様言葉で「〜ですわ」を語尾につけて）..."
                rows={2}
                className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* 変換実行ボタン */}
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

            {/* エラー表示 */}
            {rewriteError && (
              <div className="p-2 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300">
                {rewriteError}
              </div>
            )}

            {/* プレビュー & 反映・破棄エリア */}
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
            <div className="flex justify-end space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowAddPresetInput(false)
                  setNewPresetName('')
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

        {/* プリセット一覧 */}
        <div className="flex flex-wrap gap-1.5">
          {presets.length === 0 ? (
            <span className="text-[11px] text-zinc-500">登録済みのプリセットはありません</span>
          ) : (
            presets.map((p) => (
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
                title={`${p.name} (クリックで適用)`}
              >
                {/* プレビュードット（背景色＋枠線色） */}
                <span
                  className="w-3 h-3 rounded-full border flex-shrink-0"
                  style={{
                    backgroundColor: p.background_color,
                    borderColor: p.border_color,
                    borderWidth: Math.min(2, Math.max(1, p.border_width)),
                  }}
                />
                <span className="truncate max-w-[100px]">{p.name}</span>
                {/* 上書き保存ボタン */}
                <button
                  type="button"
                  title="現在の修飾で上書き"
                  onClick={(e) => handleOverwritePreset(p, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-blue-400 p-0.5 text-[10px] transition-opacity"
                >
                  💾
                </button>
                {/* 削除ボタン */}
                <button
                  type="button"
                  title="プリセットを削除"
                  onClick={(e) => handleDeletePreset(p, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 text-[10px] transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
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

