import React, { useState, useMemo } from 'react'
import { X, Sparkles, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, Loader2, Check } from 'lucide-react'
import type { Workflow, WorkflowMapping, SceneItem, SceneDiffParams, WorkflowPreset } from '../api/types'
import { useSceneGenerator } from '../pages/GeneratePage/hooks/useSceneGenerator'
import { generateUUID } from '../utils/uuid'


interface SceneGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
  workflow: Workflow | undefined
  workflowId: number
  baseParamValues: Record<string, string>
  textMappings: WorkflowMapping[]
  presets: WorkflowPreset[]
  onSaved: () => void
}

export const SceneGeneratorModal: React.FC<SceneGeneratorModalProps> = ({
  isOpen,
  onClose,
  workflow,
  workflowId,
  baseParamValues,
  textMappings,
  presets,
  onSaved,
}) => {
  const [selectedBasePresetId, setSelectedBasePresetId] = useState<string | number>('current')

  const effectiveBaseParamValues = useMemo(() => {
    if (selectedBasePresetId === 'current') {
      return baseParamValues
    }
    const preset = presets.find(p => p.id === Number(selectedBasePresetId))
    return preset ? preset.param_values : baseParamValues
  }, [selectedBasePresetId, baseParamValues, presets])

  const { generateDrafts, saveAsProfiles } = useSceneGenerator({
    workflowId,
    baseParamValues: effectiveBaseParamValues,
  })

  // Phase management
  const [phase, setPhase] = useState<'input' | 'draft'>('input')

  // Input state
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [scenes, setScenes] = useState<SceneItem[]>([{ id: generateUUID(), summary: '', name: '' }])
  const [animaMode, setAnimaMode] = useState(false)

  // Draft state
  const [editedDrafts, setEditedDrafts] = useState<SceneDiffParams[]>([])
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpdateSceneName = (id: string, name: string) => {
    setScenes(prev => prev.map(s => (s.id === id ? { ...s, name } : s)))
  }

  if (!isOpen) return null

  // Target textMappings are those with input_type === 'textarea'
  const textFields = textMappings.filter(m => m.input_type === 'textarea')

  const handleToggleField = (role: string) => {
    setSelectedFields(prev =>
      prev.includes(role) ? prev.filter(f => f !== role) : [...prev, role]
    )
  }

  const handleAddScene = () => {
    setScenes(prev => [...prev, { id: generateUUID(), summary: '', name: '' }])
  }

  const handleRemoveScene = (id: string) => {
    if (scenes.length <= 1) {
      setScenes([{ id: generateUUID(), summary: '', name: '' }])
      return
    }
    setScenes(prev => prev.filter(s => s.id !== id))
  }

  const handleUpdateSceneText = (id: string, text: string) => {
    setScenes(prev => prev.map(s => (s.id === id ? { ...s, summary: text } : s)))
  }

  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= scenes.length) return
    setScenes(prev => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[targetIndex]
      copy[targetIndex] = temp
      return copy
    })
  }

  const handleGenerate = async () => {
    setError(null)
    setIsDrafting(true)
    try {
      const activeScenes = scenes.filter(s => s.summary.trim() !== '')
      const result = await generateDrafts(selectedFields, activeScenes, effectiveBaseParamValues, animaMode)
      setEditedDrafts(JSON.parse(JSON.stringify(result)))
      setPhase('draft')
    } catch (e: any) {
      setError(e.message || '生成中にエラーが発生しました')
    } finally {
      setIsDrafting(false)
    }
  }

  const handleUpdateDraftValue = (sceneId: string, fieldName: string, value: string) => {
    setEditedDrafts(prev =>
      prev.map(draft => {
        if (draft.scene_id === sceneId) {
          return {
            ...draft,
            diff_params: {
              ...draft.diff_params,
              [fieldName]: value,
            },
          }
        }
        return draft
      })
    )
  }

  const handleSave = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const activeScenes = scenes.filter(s => s.summary.trim() !== '')
      await saveAsProfiles(activeScenes, editedDrafts, effectiveBaseParamValues)
      onSaved()
    } catch (e: any) {
      setError(e.message || '保存中にエラーが発生しました')
    } finally {
      setIsSaving(false)
    }
  }

  const isGenerateDisabled =
    selectedFields.length === 0 || scenes.every(s => s.summary.trim() === '')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-full lg:max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-5 py-4 bg-surface">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#7C6FDD]/10 text-[#a99ef7]">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-150">
                Scene Generator {workflow?.name ? `(${workflow.name})` : ''}
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                日本語のシーン概要からLLMが英語プロンプトを自動生成し、プリセット（プロファイル）を一括作成します。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-surface-2">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-lg">
              {error}
            </div>
          )}

          {phase === 'input' ? (
            <>
              {/* Field Selection */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-350 mb-3">
                  1. プロンプト生成対象フィールドの選択 (textarea のみ対象)
                </h3>
                {textFields.length === 0 ? (
                  <div className="bg-surface border border-[rgba(255,255,255,0.04)] rounded-lg p-4 text-center text-xs text-zinc-450 italic">
                    対象となるテキストエリア型フィールドが見つかりません。
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {textFields.map(field => {
                      const role = field.role || ''
                      const isChecked = selectedFields.includes(role)
                      return (
                        <label
                          key={field.id}
                          className={`flex items-center gap-2.5 p-3 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                            isChecked
                              ? 'bg-[#7C6FDD]/5 border-[#7C6FDD]/30 text-zinc-100 font-semibold'
                              : 'bg-surface border-[rgba(255,255,255,0.04)] text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-zinc-700 bg-zinc-900 text-[#7C6FDD] focus:ring-[#7C6FDD]/40"
                            checked={isChecked}
                            onChange={() => handleToggleField(role)}
                          />
                          <span>{field.display_name || role}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Base Profile Selection */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-350 mb-2">
                  2. 基準となるパラメータセット (Base Profile) の選択
                </h3>
                <div className="max-w-xs">
                  <select
                    id="scene-gen-base-profile-select"
                    value={selectedBasePresetId}
                    onChange={e => setSelectedBasePresetId(e.target.value)}
                    className="w-full bg-zinc-900 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                  >
                    <option value="current">現在のパラメータ値 (Current)</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Anima Mode Toggle */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    id="anima-mode-toggle"
                    checked={animaMode}
                    onChange={e => setAnimaMode(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-[#7C6FDD] focus:ring-[#7C6FDD]/40"
                  />
                  <span className="text-xs font-semibold text-zinc-300">Animaモード</span>
                  <span className="text-[10px] text-zinc-500">
                    (Qwen-CLIP向けに自然言語で英訳します)
                  </span>
                </label>
              </div>

              {/* Scenes Input */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-zinc-350">
                    3. シーン概要の入力 (日本語)
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddScene}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#7C6FDD]/10 hover:bg-[#7C6FDD]/20 text-[#a99ef7] text-[10px] font-semibold transition-all"
                  >
                    <Plus size={12} /> シーンを追加
                  </button>
                </div>

                <div className="space-y-3">
                  {scenes.map((scene, index) => (
                    <div
                      key={scene.id}
                      className="flex items-start gap-3 bg-surface border border-[rgba(255,255,255,0.04)] rounded-lg p-3"
                    >
                      <div className="flex flex-col gap-1 mt-1.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveScene(index, 'up')}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={index === scenes.length - 1}
                          onClick={() => handleMoveScene(index, 'down')}
                          className="p-1 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>

                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={scene.name ?? ''}
                          onChange={e => handleUpdateSceneName(scene.id, e.target.value)}
                          placeholder={`シーン名 (Scene ${index + 1})`}
                          className="w-full bg-zinc-900/60 border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-[#7C6FDD]/45 focus:outline-none transition-all"
                        />
                        <textarea
                          value={scene.summary}
                          onChange={e => handleUpdateSceneText(scene.id, e.target.value)}
                          placeholder="例: 夕暮れ時のカフェ、窓際に座る少女、窓の外は雨模様..."
                          rows={2}
                          className="w-full bg-zinc-900/60 border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-2 text-xs text-zinc-100 placeholder-zinc-655 focus:border-[#7C6FDD]/45 focus:outline-none transition-all resize-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveScene(scene.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/5 mt-5 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Draft Phase */
            <div>
              <h3 className="text-xs font-semibold text-zinc-350 mb-4">
                4. 生成されたドラフトプロンプト (手動で微調整が可能です)
              </h3>
              <div className="space-y-4">
                {editedDrafts.map((draft, idx) => {
                  const origScene = scenes.find(s => s.id === draft.scene_id)
                  return (
                    <div
                      key={draft.scene_id}
                      className="bg-surface border border-[rgba(255,255,255,0.06)] rounded-xl p-4 space-y-3"
                    >
                      <div className="border-b border-[rgba(255,255,255,0.04)] pb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#a99ef7]">
                          Scene {idx + 1}
                        </span>
                        <span className="text-[10px] text-zinc-400 italic max-w-lg truncate">
                          {origScene?.summary}
                        </span>
                      </div>

                      <div className="grid gap-3">
                        {selectedFields.map(field => {
                          const val = draft.diff_params[field] ?? ''
                          const fieldMapping = textFields.find(f => f.role === field)
                          const displayName = fieldMapping?.display_name || field
                          return (
                            <div key={field} className="space-y-1">
                              <label className="text-[10px] font-semibold text-zinc-400 block">
                                {displayName} ({field})
                              </label>
                              <textarea
                                value={val}
                                onChange={e =>
                                  handleUpdateDraftValue(draft.scene_id, field, e.target.value)
                                }
                                rows={2}
                                className="w-full bg-zinc-900/60 border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-1.5 text-xs text-zinc-150 focus:border-[#7C6FDD]/45 focus:outline-none transition-all resize-none"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[rgba(255,255,255,0.08)] px-5 py-4 bg-surface flex items-center justify-between">
          <div>
            {phase === 'draft' && (
              <button
                type="button"
                onClick={() => setPhase('input')}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
              >
                <ArrowLeft size={14} /> シーン入力に戻る
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-all"
            >
              キャンセル
            </button>

            {phase === 'input' ? (
              <button
                type="button"
                disabled={isGenerateDisabled || isDrafting}
                onClick={handleGenerate}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#7C6FDD] hover:bg-[#6c5ecb] rounded-lg disabled:opacity-40 disabled:pointer-events-none transition-all shadow-lg shadow-[#7C6FDD]/20"
              >
                {isDrafting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate Drafts
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent-green hover:opacity-90 rounded-lg disabled:opacity-40 disabled:pointer-events-none transition-all shadow-lg shadow-accent-green/20"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    プロファイルを作成
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
