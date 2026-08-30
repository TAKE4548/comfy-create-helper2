import React, { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SpeechTonePreset } from '../api/types'
import type { SpeechBubble } from '../types/speechBubble'
import { speechTonePresetsApi } from '../api/client'

export interface SpeechBubbleToneControlsProps {
  bubble: SpeechBubble | null
  snapshotId?: number
  imagePath?: string
  tonePresets: SpeechTonePreset[]
  onUpdateText: (newText: string) => void
}

export const SpeechBubbleToneControls: React.FC<SpeechBubbleToneControlsProps> = ({
  bubble,
  snapshotId,
  imagePath,
  tonePresets = [],
  onUpdateText,
}) => {
  const qc = useQueryClient()

  const [isToneSectionOpen, setIsToneSectionOpen] = useState(false)
  const [selectedTonePresetId, setSelectedTonePresetId] = useState<number | null>(null)
  const [customTonePrompt, setCustomTonePrompt] = useState('')
  const [includeImageInRewrite, setIncludeImageInRewrite] = useState(true)
  const [sceneHint, setSceneHint] = useState('')
  const [isRewriting, setIsRewriting] = useState(false)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [rewriteResult, setRewriteResult] = useState<{
    original: string
    rewritten: string
    scene_interpretation?: string | null
    reasoning?: string | null
  } | null>(null)
  const [revisionInstruction, setRevisionInstruction] = useState('')
  const [showThinking, setShowThinking] = useState(false)
  const [showAddTonePreset, setShowAddTonePreset] = useState(false)
  const [newTonePresetName, setNewTonePresetName] = useState('')
  const [isSavingTonePreset, setIsSavingTonePreset] = useState(false)

  const activePresets = tonePresets.length > 0 ? tonePresets : (qc.getQueryData<SpeechTonePreset[]>(['speech-tone-presets']) || [])

  useEffect(() => {
    if (selectedTonePresetId) {
      const preset = activePresets.find((p) => p.id === selectedTonePresetId)
      if (preset && !customTonePrompt) {
        setCustomTonePrompt(preset.prompt)
      }
    }
  }, [selectedTonePresetId, activePresets, customTonePrompt])

  if (!bubble) return null

  const handleRewrite = async (options?: { isRevision?: boolean }) => {
    let presets = tonePresets
    if (!presets || presets.length === 0) {
      presets = qc.getQueryData<SpeechTonePreset[]>(['speech-tone-presets']) || []
    }
    if (!presets || presets.length === 0) {
      try {
        presets = await speechTonePresetsApi.list()
      } catch {
        presets = []
      }
    }
    const selectedPreset = selectedTonePresetId ? presets.find((p) => p.id === selectedTonePresetId) : null
    const promptToSend = customTonePrompt.trim() || selectedPreset?.prompt || ''
    if (!bubble?.text?.trim() || !promptToSend) return
    setIsRewriting(true)
    setRewriteError(null)
    try {
      const isRevision = options?.isRevision && Boolean(revisionInstruction.trim())
      const res = await speechTonePresetsApi.rewrite({
        text: bubble.text,
        tone_prompt: promptToSend,
        preset_id: selectedTonePresetId || undefined,
        snapshot_id: snapshotId,
        image_path: imagePath,
        include_image: includeImageInRewrite,
        scene_hint: sceneHint.trim() || undefined,
        previous_rewritten_text: isRevision ? rewriteResult?.rewritten : undefined,
        revision_instruction: isRevision ? revisionInstruction.trim() : undefined,
      })
      setRewriteResult({
        original: bubble.text,
        rewritten: res.rewritten_text,
        scene_interpretation: res.scene_interpretation,
        reasoning: res.reasoning,
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
      let currentPresets = qc.getQueryData<SpeechTonePreset[]>(['speech-tone-presets'])
      if (!currentPresets || currentPresets.length === 0) {
        if (activePresets.length > 0) {
          currentPresets = activePresets
        } else {
          try {
            currentPresets = await speechTonePresetsApi.list()
          } catch {
            currentPresets = activePresets
          }
        }
      }
      const created = await speechTonePresetsApi.create({
        name: newTonePresetName.trim(),
        prompt: customTonePrompt.trim(),
        sort_order: (currentPresets || []).length,
      })
      qc.setQueryData<SpeechTonePreset[]>(['speech-tone-presets'], (old) => {
        const list = old ? [...old] : [...activePresets]
        if (!list.some((p) => p.id === created.id)) {
          list.push(created)
        }
        return list
      })
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

  return (
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
          <div className="flex items-center gap-1.5">
            <div className="flex-1">
              <select
                aria-label="口調プリセット選択"
                value={selectedTonePresetId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null
                  setSelectedTonePresetId(val)
                  if (val) {
                    const preset = activePresets.find((p) => p.id === val)
                    if (preset) {
                      setCustomTonePrompt(preset.prompt)
                    }
                  }
                }}
                className="w-full p-1.5 border border-[rgba(255,255,255,0.12)] rounded bg-[#1F1F25] text-zinc-100 text-xs focus:outline-none focus:border-purple-500"
              >
                <option value="">カスタム指示 / プリセット選択...</option>
                {activePresets.map((tp) => (
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
                  data-testid="tone-preset-register-btn"
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

          {/* 場面ヒント & 画像参照設定 */}
          <div className="space-y-1.5 pt-1 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-zinc-300">場面ヒント・状況説明 (任意)</label>
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeImageInRewrite}
                  onChange={(e) => setIncludeImageInRewrite(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-purple-500 focus:ring-0 text-xs"
                  data-testid="tone-rewrite-include-image"
                />
                <span>画像を参照する (Vision)</span>
              </label>
            </div>
            <textarea
              value={sceneHint}
              onChange={(e) => setSceneHint(e.target.value)}
              placeholder="例: 照れながら強がっている、敵に追い詰められて焦っている、囁いている など"
              rows={2}
              className="w-full text-xs bg-[#121216] border border-zinc-700/60 rounded px-2 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80 resize-none"
              data-testid="tone-rewrite-scene-hint"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleRewrite()}
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

              {(rewriteResult.scene_interpretation || rewriteResult.reasoning) && (
                <div className="border border-purple-900/40 rounded bg-purple-950/20 p-2 space-y-1" data-testid="tone-rewrite-thinking">
                  <button
                    type="button"
                    onClick={() => setShowThinking((prev) => !prev)}
                    className="flex items-center justify-between w-full text-[11px] font-medium text-purple-300 hover:text-purple-200"
                  >
                    <span>💡 AIの解釈・思考過程</span>
                    <span className="text-[10px]">{showThinking ? '▲ 閉じる' : '▼ 表示'}</span>
                  </button>
                  {showThinking && (
                    <div className="text-[11px] text-zinc-300 space-y-1.5 pt-1.5 border-t border-purple-900/30">
                      {rewriteResult.scene_interpretation && (
                        <div>
                          <span className="text-zinc-500 font-bold text-[10px] block">【場面解釈】</span>
                          <p className="text-zinc-300 whitespace-pre-wrap">{rewriteResult.scene_interpretation}</p>
                        </div>
                      )}
                      {rewriteResult.reasoning && (
                        <div>
                          <span className="text-zinc-500 font-bold text-[10px] block">【思考・言葉選び】</span>
                          <p className="text-zinc-300 whitespace-pre-wrap">{rewriteResult.reasoning}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5 pt-1 border-t border-[rgba(255,255,255,0.06)]">
                <input
                  type="text"
                  placeholder="修正指示・ダメ出し（例: もっと冷淡な態度で）"
                  value={revisionInstruction}
                  onChange={(e) => setRevisionInstruction(e.target.value)}
                  className="w-full text-xs bg-[#121216] border border-zinc-700/60 rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500/80"
                  data-testid="tone-rewrite-revision-input"
                />
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRewriteResult(null)
                      setRevisionInstruction('')
                    }}
                    className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200 rounded"
                  >
                    破棄
                  </button>
                  <button
                    type="button"
                    disabled={isRewriting}
                    onClick={() => handleRewrite({ isRevision: false })}
                    className="px-2 py-0.5 text-xs text-purple-300 hover:text-purple-200 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-700/40 rounded transition-colors"
                    data-testid="tone-rewrite-retry"
                  >
                    再試行
                  </button>
                  <button
                    type="button"
                    disabled={isRewriting || !revisionInstruction.trim()}
                    onClick={() => handleRewrite({ isRevision: true })}
                    className="px-2 py-0.5 text-xs text-purple-200 hover:text-purple-100 bg-purple-600/60 hover:bg-purple-600 border border-purple-500/50 rounded font-medium transition-colors disabled:opacity-50"
                    data-testid="tone-rewrite-retry-feedback"
                  >
                    ✨ 修正指示を反映して再生成
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateText(rewriteResult.rewritten)
                      setRewriteResult(null)
                      setRevisionInstruction('')
                    }}
                    className="px-3 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                  >
                    セリフに適用
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
