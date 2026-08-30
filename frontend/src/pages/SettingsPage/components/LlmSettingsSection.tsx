import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wand2, Sliders, ChevronDown, Save, RefreshCw } from 'lucide-react'
import { llmPromptsApi } from '../../../api/client'
import type { LlmPrompt } from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'

export interface LlmParams {
  temperature: number
  top_p: number
  max_tokens: number
  presence_penalty: number
  frequency_penalty: number
}

export const DEFAULT_PARAMS: LlmParams = {
  temperature: 0.2,
  top_p: 1.0,
  max_tokens: 1000,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
}

export const PROMPT_LABELS: Record<string, string> = {
  audit_interference: '干渉タグ診断（SDXL/汎用）',
  audit_interference_anima: '干渉タグ診断（Anima）',
  audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
  audit_physical: '物理・構図整合性チェック',
  scene_generate: 'Scene Generator プロンプト',
  scene_generate_anima: 'Scene Generator プロンプト（Animaモード）',
  translation_ja_to_en: '翻訳システムプロンプト (日 -> 英)',
  translation_en_to_ja: '翻訳システムプロンプト (英 -> 日)',
  speech_draft_vlm_prompt: 'セリフ下書き: VLM システムプロンプト',
  speech_draft_llm_prompt: 'セリフ下書き: LLM システムプロンプト',
  speech_rewrite_system_prompt: 'セリフ口調変換: システムプロンプト',
}

export const PARAM_LABELS: Record<string, string> = {
  llm_params_translation: '翻訳パラメータ設定',
  llm_params_scene_generate: 'Scene Generator パラメータ設定',
  llm_params_audit: 'プロンプト診断パラメータ設定',
  llm_params_speech_draft: 'セリフ下書きパラメータ設定',
}

export const PARAM_FIELDS: { key: keyof LlmParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'temperature', label: 'Temperature (温度)', min: 0.0, max: 2.0, step: 0.1 },
  { key: 'top_p', label: 'Top P (核サンプリング)', min: 0.0, max: 1.0, step: 0.05 },
  { key: 'max_tokens', label: 'Max Tokens (最大トークン数)', min: 1, max: 8192, step: 1 },
  { key: 'presence_penalty', label: 'Presence Penalty (存在ペナルティ)', min: -2.0, max: 2.0, step: 0.1 },
  { key: 'frequency_penalty', label: 'Frequency Penalty (頻度ペナルティ)', min: -2.0, max: 2.0, step: 0.1 },
]

export interface LlmSettingsSectionProps {
  isExpandedModel: boolean
  onToggleModel: () => void
  isExpandedPrompts: boolean
  onTogglePrompts: () => void
  isExpandedParams: boolean
  onToggleParams: () => void
}

export function LlmSettingsSection({
  isExpandedModel,
  onToggleModel,
  isExpandedPrompts,
  onTogglePrompts,
  isExpandedParams,
  onToggleParams,
}: LlmSettingsSectionProps) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [llmParamsEdits, setLlmParamsEdits] = useState<Record<string, LlmParams>>({})

  const { data: prompts, isLoading: isLoadingPrompts } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
    staleTime: STALE_TIMES.LLM_PROMPTS,
  })

  const { data: modelsList, refetch: refetchModels, isFetching: isFetchingModels } = useQuery({
    queryKey: ['llm-models'],
    queryFn: () => llmPromptsApi.getModels() as Promise<string[]>,
  })

  const { data: currentModelData, refetch: refetchCurrentModel } = useQuery({
    queryKey: ['llm-current-model'],
    queryFn: () => llmPromptsApi.getCurrentModel() as Promise<LlmPrompt>,
  })

  const updateModelMutation = useMutation({
    mutationFn: (model: string) => llmPromptsApi.updateCurrentModel(model),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llm-current-model'] })
      setSaved('model')
      setTimeout(() => setSaved(null), 2000)
    },
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    },
  })

  useEffect(() => {
    if (prompts) {
      const initialEdits: Record<string, LlmParams> = {}
      const keys = [
        'llm_params_translation',
        'llm_params_scene_generate',
        'llm_params_audit',
        'llm_params_speech_draft',
      ]
      keys.forEach((key) => {
        const record = prompts.find((p) => p.key === key)
        if (record && record.content) {
          try {
            initialEdits[key] = { ...DEFAULT_PARAMS, ...JSON.parse(record.content) }
          } catch {
            initialEdits[key] = { ...DEFAULT_PARAMS }
          }
        } else {
          initialEdits[key] = { ...DEFAULT_PARAMS }
        }
      })
      setLlmParamsEdits(initialEdits)
    }
  }, [prompts])

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  const handleParamChange = (key: string, field: keyof LlmParams, val: number) => {
    setLlmParamsEdits((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: val,
      },
    }))
  }

  const handleSaveParams = (key: string) => {
    const params = llmParamsEdits[key] || DEFAULT_PARAMS
    updatePrompt.mutate({ key, content: JSON.stringify(params) })
  }

  return (
    <>
      {/* LLM Model Settings */}
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <div
          onClick={onToggleModel}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM Model Settings</h2>
            <span className="text-xs text-zinc-600">— 使用するLLMモデルの選択</span>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {saved === 'model' && (
              <span className="text-xs text-accent-green">✓ 保存しました</span>
            )}
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                isExpandedModel ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
        {isExpandedModel && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">現在のモデル</label>
                <select
                  id="settings-llm-model-select"
                  value={currentModelData?.content || ''}
                  onChange={(e) => updateModelMutation.mutate(e.target.value)}
                  disabled={updateModelMutation.isPending}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                >
                  <option value="" disabled>
                    モデルを選択してください
                  </option>
                  {modelsList?.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                  {currentModelData?.content && !modelsList?.includes(currentModelData.content) && (
                    <option value={currentModelData.content}>
                      {currentModelData.content} (現在設定中)
                    </option>
                  )}
                </select>
              </div>
              <div className="flex items-end self-end">
                <button
                  id="settings-llm-model-refresh"
                  type="button"
                  onClick={() => {
                    refetchModels()
                    refetchCurrentModel()
                  }}
                  disabled={isFetchingModels}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 border border-[rgba(255,255,255,0.08)] hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isFetchingModels ? 'animate-spin' : ''} />
                  モデル一覧を取得
                </button>
              </div>
            </div>

            {/* 翻訳用LLMモデル設定 */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">翻訳用LLMモデル</label>
                <select
                  id="settings-translation-model-select"
                  value={prompts?.find((p) => p.key === 'translation_model')?.content || ''}
                  onChange={(e) =>
                    updatePrompt.mutate({ key: 'translation_model', content: e.target.value })
                  }
                  disabled={updatePrompt.isPending}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                >
                  <option value="">
                    メインLLMモデルを使用 ({currentModelData?.content || '未設定'})
                  </option>
                  {modelsList?.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* セリフ下書き VLMモデル設定 */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">
                  セリフ下書き VLMモデル (画像認識用)
                </label>
                <select
                  id="settings-speech-vlm-model-select"
                  value={prompts?.find((p) => p.key === 'speech_draft_vlm_model')?.content || ''}
                  onChange={(e) =>
                    updatePrompt.mutate({ key: 'speech_draft_vlm_model', content: e.target.value })
                  }
                  disabled={updatePrompt.isPending}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                >
                  <option value="">
                    メインLLMモデルを使用 ({currentModelData?.content || '未設定'})
                  </option>
                  {modelsList?.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* セリフ下書き LLMモデル設定 */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">
                  セリフ下書き LLMモデル (テキスト生成用)
                </label>
                <select
                  id="settings-speech-llm-model-select"
                  value={prompts?.find((p) => p.key === 'speech_draft_llm_model')?.content || ''}
                  onChange={(e) =>
                    updatePrompt.mutate({ key: 'speech_draft_llm_model', content: e.target.value })
                  }
                  disabled={updatePrompt.isPending}
                  className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                >
                  <option value="">
                    メインLLMモデルを使用 ({currentModelData?.content || '未設定'})
                  </option>
                  {modelsList?.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 翻訳デバウンス間隔設定 */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-400">翻訳デバウンス間隔 (ms)</label>
                  <span className="text-xs font-mono text-[#7C6FDD]">
                    {prompts?.find((p) => p.key === 'translation_debounce')?.content || '500'}ms
                  </span>
                </div>
                <input
                  id="settings-translation-debounce"
                  type="range"
                  min="300"
                  max="2000"
                  step="50"
                  value={parseInt(
                    prompts?.find((p) => p.key === 'translation_debounce')?.content || '500',
                    10
                  )}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (val >= 300 && val <= 2000) {
                      updatePrompt.mutate({ key: 'translation_debounce', content: String(val) })
                    }
                  }}
                  disabled={updatePrompt.isPending}
                  className="w-full accent-[#7C6FDD]"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>300ms</span>
                  <span>2000ms</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* LLM System Prompts */}
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onTogglePrompts}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2>
            <span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedPrompts ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedPrompts && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
            {isLoadingPrompts ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
                <RefreshCw size={14} className="animate-spin" />Loading prompts…
              </div>
            ) : (
              <div className="space-y-3">
                {prompts?.map((p) => (
                  <div
                    key={p.key}
                    id={`prompt-section-${p.key}`}
                    className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden"
                  >
                    <button
                      id={`prompt-expand-${p.key}`}
                      onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-zinc-200">
                          {PROMPT_LABELS[p.key] ?? p.key}
                        </p>
                        {p.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <span className="text-xs text-zinc-600">
                          {new Date(p.updated_at).toLocaleDateString('ja-JP')}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-zinc-500 transition-transform ${
                            expanded === p.key ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>
                    {expanded === p.key && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                        <textarea
                          id={`prompt-content-${p.key}`}
                          value={getContent(p)}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.key]: e.target.value }))
                          }
                          rows={16}
                          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar"
                        />
                        <div className="flex items-center justify-between">
                          <button
                            id={`prompt-reset-${p.key}`}
                            onClick={() =>
                              setEdits((prev) => {
                                const n = { ...prev }
                                delete n[p.key]
                                return n
                              })
                            }
                            disabled={!edits[p.key]}
                            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                          >
                            Reset changes
                          </button>
                          <button
                            id={`prompt-save-${p.key}`}
                            onClick={() =>
                              updatePrompt.mutate({ key: p.key, content: getContent(p) })
                            }
                            disabled={updatePrompt.isPending}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                              saved === p.key
                                ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                                : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                            }`}
                          >
                            <Save size={12} />
                            {saved === p.key ? 'Saved!' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* LLM Detailed Parameters */}
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onToggleParams}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM詳細パラメータ設定</h2>
            <span className="text-xs text-zinc-600">— 翻訳・生成・診断の各種パラメータ調整</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedParams ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedParams && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
            {isLoadingPrompts ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8 font-sans">
                <RefreshCw size={14} className="animate-spin" />
                Loading parameters…
              </div>
            ) : (
              <div className="space-y-4 font-sans">
                {Object.entries(PARAM_LABELS).map(([key, label]) => {
                  const params = llmParamsEdits[key] || DEFAULT_PARAMS
                  const isSaved = saved === key
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.04)] pb-2 mb-2">
                        <h3 className="text-xs font-semibold text-zinc-300">{label}</h3>
                        <button
                          type="button"
                          onClick={() => handleSaveParams(key)}
                          disabled={updatePrompt.isPending}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            isSaved
                              ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                              : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                          }`}
                        >
                          <Save size={12} />
                          {isSaved ? '保存しました!' : '保存'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {PARAM_FIELDS.map((field) => (
                          <div key={field.key} className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-zinc-400">{field.label}</span>
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={params[field.key] ?? DEFAULT_PARAMS[field.key]}
                                onChange={(e) =>
                                  handleParamChange(
                                    key,
                                    field.key,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-16 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                              />
                            </div>
                            <input
                              type="range"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={params[field.key] ?? DEFAULT_PARAMS[field.key]}
                              onChange={(e) =>
                                handleParamChange(key, field.key, parseFloat(e.target.value))
                              }
                              className="w-full accent-[#7C6FDD]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
