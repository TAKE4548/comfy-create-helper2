import { useState, useEffect, useRef, useId, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wand2, Sliders, ChevronDown, Save, RefreshCw, Check } from 'lucide-react'
import { llmPromptsApi } from '../../../api/client'
import type { LlmPrompt } from '../../../api/types'
import { STALE_TIMES } from '../../../constants/staleTimes'
import { useSettingsDraftRegistration } from '../context/SettingsDraftContext'
import { useSettingsCommit } from '../hooks/useSettingsCommit'
import { useSettingsMobile } from '../hooks/useSettingsMobile'
import {
  GROUP_PARAMS,
  GROUP_PROMPTS,
  PROMPT_EDITOR_KEYS,
  promptParamGroupFor,
  type LlmSettingsGroup,
} from './llmSettingsGroups'
export type { LlmSettingsGroup } from './llmSettingsGroups'

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
  speech_draft_vlm_prompt: '画像シチュエーション読み取りプロンプト (VLM)',
  speech_draft_llm_prompt: 'セリフ自動生成プロンプト (LLM)',
  speech_rewrite_system_prompt: 'キャラクター口調変換プロンプト (LLM)',
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
  group?: LlmSettingsGroup
  modelFooter?: React.ReactNode
  isExpandedModel: boolean
  onToggleModel: () => void
  isExpandedPrompts: boolean
  onTogglePrompts: () => void
  isExpandedParams: boolean
  onToggleParams: () => void
}

export function LlmSettingsSection({
  group,
  modelFooter,
  isExpandedModel,
  onToggleModel,
  isExpandedPrompts,
  onTogglePrompts,
  isExpandedParams,
  onToggleParams,
}: LlmSettingsSectionProps) {
  const qc = useQueryClient()
  const instanceId = useId()
  const isMobile = useSettingsMobile()
  const hasGroupedDetails = group === 'prompt' || group === 'dialogue'
  const detailsExpanded = isExpandedPrompts
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedPromptKey, setSelectedPromptKey] = useState<string>(PROMPT_EDITOR_KEYS[0])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const editsRef = useRef(edits)
  const [saved, setSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const modelDraftRef = useRef<string | null>(null)
  const [playgroundPresetKey, setPlaygroundPresetKey] = useState('')
  const [playgroundText, setPlaygroundText] = useState('')
  const [playgroundVariablesText, setPlaygroundVariablesText] = useState('{}')
  const [playgroundView, setPlaygroundView] = useState<'raw' | 'expanded'>('raw')
  const [playgroundResponse, setPlaygroundResponse] = useState<{
    rendered_prompt: string
    result: string
    token_limit: number | null
  } | null>(null)
  const [playgroundError, setPlaygroundError] = useState<string | null>(null)
  const [playgroundPending, setPlaygroundPending] = useState(false)
  const playgroundRequestId = useRef(0)
  const [llmParamsEdits, setLlmParamsEdits] = useState<Record<string, LlmParams>>({})
  const llmParamsEditsRef = useRef(llmParamsEdits)
  const [rawParamEdits, setRawParamEdits] = useState<Record<string, string>>({})
  const rawParamEditsRef = useRef(rawParamEdits)
  const dirtyParamsRef = useRef(new Set<string>())
  const savedParamsRef = useRef<Record<string, string>>({})
  const canceledRangePointersRef = useRef(new Set<string>())
  const pendingPromptCountsRef = useRef(new Map<string, number>())
  const failedPromptKeysRef = useRef(new Set<string>())
  const pendingModelCountRef = useRef(0)
  const failedModelRef = useRef(false)
  const syncDraftRegistrationsRef = useRef<() => void>(() => {})
  const discardDraftsRef = useRef<() => void>(() => {})

  const clearSaveFeedback = () => {
    setSaved(null)
    setSaveError(null)
  }

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
    onMutate: () => clearSaveFeedback(),
    onSuccess: (_result, model) => {
      pendingModelCountRef.current = Math.max(0, pendingModelCountRef.current - 1)
      failedModelRef.current = false
      qc.invalidateQueries({ queryKey: ['llm-current-model'] })
      if (modelDraftRef.current === model) {
        modelDraftRef.current = model
        setModelDraft(model)
        setSaved('model')
      }
      syncDraftRegistrationsRef.current()
    },
    onError: (error, model) => {
      pendingModelCountRef.current = Math.max(0, pendingModelCountRef.current - 1)
      failedModelRef.current = true
      if (modelDraftRef.current === model) setSaveError(error instanceof Error ? error.message : '保存に失敗しました')
      syncDraftRegistrationsRef.current()
    },
  })

  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      llmPromptsApi.update(key, { content }),
    onMutate: () => clearSaveFeedback(),
    onSuccess: (_, { key, content }) => {
      const pendingCount = pendingPromptCountsRef.current.get(key) ?? 0
      if (pendingCount <= 1) pendingPromptCountsRef.current.delete(key)
      else pendingPromptCountsRef.current.set(key, pendingCount - 1)
      failedPromptKeysRef.current.delete(key)
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      const currentDraft = key in PARAM_LABELS
        ? JSON.stringify(llmParamsEditsRef.current[key] || DEFAULT_PARAMS)
        : editsRef.current[key]
      if (currentDraft === undefined || currentDraft === content) setSaved(key)
      syncDraftRegistrationsRef.current()
    },
    onError: (error, { key, content }) => {
      const pendingCount = pendingPromptCountsRef.current.get(key) ?? 0
      if (pendingCount <= 1) pendingPromptCountsRef.current.delete(key)
      else pendingPromptCountsRef.current.set(key, pendingCount - 1)
      failedPromptKeysRef.current.add(key)
      const currentDraft = key in PARAM_LABELS
        ? JSON.stringify(llmParamsEditsRef.current[key] || DEFAULT_PARAMS)
        : editsRef.current[key]
      if (currentDraft === undefined || currentDraft === content) {
        setSaveError(error instanceof Error ? error.message : '保存に失敗しました')
      }
      syncDraftRegistrationsRef.current()
    },
  })

  const settingsCommit = useSettingsCommit({
    save: async (key, snapshot) => {
      pendingPromptCountsRef.current.set(key, (pendingPromptCountsRef.current.get(key) ?? 0) + 1)
      failedPromptKeysRef.current.delete(key)
      syncDraftRegistrationsRef.current()
      await updatePrompt.mutateAsync({ key, content: snapshot })
    },
  })

  const draftControls = useMemo(() => ({
    cancelQueued: () => {},
    discardLocal: () => discardDraftsRef.current(),
  }), [])
  const paramsDraftRegistration = useSettingsDraftRegistration(`${instanceId}:llm-params`, draftControls)
  const promptDraftRegistration = useSettingsDraftRegistration(`${instanceId}:llm-prompts`, draftControls)
  const modelDraftRegistration = useSettingsDraftRegistration(`${instanceId}:llm-model`, draftControls)

  const syncDraftRegistrations = () => {
    const parameterStates = Object.keys(PARAM_LABELS).map((key) => settingsCommit.getState(key))
    paramsDraftRegistration.update({
      dirty: parameterStates.some((state) => state.phase === 'dirty' || state.phase === 'invalid' || state.phase === 'error'),
      invalid: parameterStates.some((state) => state.phase === 'invalid'),
      failed: parameterStates.some((state) => state.phase === 'error'),
      queued: false,
      inFlight: parameterStates.some((state) => state.phase === 'saving'),
    })

    const findPrompt = (key: string) => prompts?.find((prompt) => prompt.key === key)?.content
    const promptDirty = Object.entries(editsRef.current).some(([key, content]) => content !== findPrompt(key))
    const nonParamKeys = (keys: Iterable<string>) => [...keys].filter((key) => !(key in PARAM_LABELS))
    const pendingPromptCount = nonParamKeys(pendingPromptCountsRef.current.keys())
      .reduce((total, key) => total + (pendingPromptCountsRef.current.get(key) ?? 0), 0)
    const promptFailed = nonParamKeys(failedPromptKeysRef.current).length > 0
    promptDraftRegistration.update({
      dirty: promptDirty || promptFailed,
      invalid: false,
      failed: promptFailed,
      queued: false,
      inFlight: pendingPromptCount > 0,
    })

    const modelDirty = modelDraftRef.current !== null && modelDraftRef.current !== currentModelData?.content
    modelDraftRegistration.update({
      dirty: modelDirty || failedModelRef.current,
      invalid: false,
      failed: failedModelRef.current,
      queued: false,
      inFlight: pendingModelCountRef.current > 0,
    })
  }
  syncDraftRegistrationsRef.current = syncDraftRegistrations

  discardDraftsRef.current = () => {
    const nextParams: Record<string, LlmParams> = {}
    for (const key of Object.keys(PARAM_LABELS)) {
      const content = prompts?.find((prompt) => prompt.key === key)?.content
      try {
        nextParams[key] = content ? { ...DEFAULT_PARAMS, ...JSON.parse(content) } : { ...DEFAULT_PARAMS }
      } catch {
        nextParams[key] = { ...DEFAULT_PARAMS }
      }
    }
    llmParamsEditsRef.current = nextParams
    setLlmParamsEdits(nextParams)
    rawParamEditsRef.current = {}
    setRawParamEdits({})
    dirtyParamsRef.current.clear()
    savedParamsRef.current = {}
    editsRef.current = {}
    setEdits({})
    modelDraftRef.current = currentModelData?.content ?? null
    setModelDraft(currentModelData?.content ?? null)
    syncDraftRegistrationsRef.current()
  }

  useEffect(() => {
    syncDraftRegistrations()
  }, [prompts, currentModelData?.content, edits, llmParamsEdits, rawParamEdits, modelDraft, updatePrompt.isPending, updateModelMutation.isPending])

  useEffect(() => {
    if (modelDraft === null && currentModelData?.content) {
      modelDraftRef.current = currentModelData.content
      setModelDraft(currentModelData.content)
    }
  }, [currentModelData?.content, modelDraft])

  useEffect(() => {
    if (prompts) {
      const initialEdits: Record<string, LlmParams> = {}
      const keys = Object.keys(PARAM_LABELS)
      keys.forEach((key) => {
        const record = prompts.find((p) => p.key === key)
        const serverValue = record?.content || JSON.stringify(DEFAULT_PARAMS)
        const pendingSave = savedParamsRef.current[key]
        if (dirtyParamsRef.current.has(key)) {
          if (
            pendingSave === serverValue &&
            JSON.stringify(llmParamsEditsRef.current[key]) === pendingSave
          ) {
            dirtyParamsRef.current.delete(key)
            delete savedParamsRef.current[key]
            const nextRaw = { ...rawParamEditsRef.current }
            for (const rawKey of Object.keys(nextRaw)) {
              if (rawKey.startsWith(`${key}:`)) delete nextRaw[rawKey]
            }
            rawParamEditsRef.current = nextRaw
            setRawParamEdits(nextRaw)
          } else {
            return
          }
        }
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
      setLlmParamsEdits((prev) => {
        const next = { ...prev, ...initialEdits }
        llmParamsEditsRef.current = next
        return next
      })
      for (const [key, record] of prompts.filter((prompt) => prompt.key in PARAM_LABELS).map((record) => [record.key, record] as const)) {
        settingsCommit.acceptServer(key, record.content)
      }
    }
  }, [prompts])

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  const paramRawKey = (key: string, field: keyof LlmParams) => `${key}:${field}`

  const isValidParamRaw = (field: keyof LlmParams, raw: string) => {
    const definition = PARAM_FIELDS.find((item) => item.key === field)
    const value = raw.trim() === '' ? Number.NaN : Number(raw)
    const stepsFromMin = definition ? (value - definition.min) / definition.step : 0
    const stepValid = definition !== undefined && Math.abs(stepsFromMin - Math.round(stepsFromMin)) < 1e-6
    return definition !== undefined && Number.isFinite(value) && value >= definition.min && value <= definition.max && stepValid
  }

  const hasInvalidParamRaw = (key: string) => Object.entries(rawParamEditsRef.current)
    .filter(([rawKey]) => rawKey.startsWith(`${key}:`))
    .some(([rawKey, raw]) => !isValidParamRaw(rawKey.slice(key.length + 1) as keyof LlmParams, raw))

  const updateParamValue = (
    key: string,
    field: keyof LlmParams,
    val: number,
    options: { preserveRaw?: boolean; stage?: boolean } = {},
  ) => {
    clearSaveFeedback()
    playgroundRequestId.current += 1
    setPlaygroundPending(false)
    setPlaygroundResponse(null)
    setPlaygroundError(null)
    dirtyParamsRef.current.add(key)
    const rawKey = paramRawKey(key, field)
    if (!options.preserveRaw) {
      const nextRaw = { ...rawParamEditsRef.current, [rawKey]: String(val) }
      rawParamEditsRef.current = nextRaw
      setRawParamEdits(nextRaw)
    }
    const nextValue = { ...(llmParamsEditsRef.current[key] ?? DEFAULT_PARAMS), [field]: val }
    const nextParams = { ...llmParamsEditsRef.current, [key]: nextValue }
    llmParamsEditsRef.current = nextParams
    setLlmParamsEdits(nextParams)
    if (options.stage !== false && !hasInvalidParamRaw(key)) settingsCommit.stage(key, JSON.stringify(nextValue))
    syncDraftRegistrationsRef.current()
  }

  const handleParamInput = (key: string, field: keyof LlmParams, raw: string) => {
    const rawKey = paramRawKey(key, field)
    const nextRaw = { ...rawParamEditsRef.current, [rawKey]: raw }
    rawParamEditsRef.current = nextRaw
    setRawParamEdits(nextRaw)
    const value = raw.trim() === '' ? Number.NaN : Number(raw)
    if (!isValidParamRaw(field, raw)) {
      dirtyParamsRef.current.add(key)
      settingsCommit.stage(key, null)
      syncDraftRegistrationsRef.current()
      return
    }
    updateParamValue(key, field, value, { preserveRaw: true, stage: !hasInvalidParamRaw(key) })
  }

  const commitParam = (key: string) => {
    if (hasInvalidParamRaw(key)) {
      settingsCommit.stage(key, null)
      syncDraftRegistrationsRef.current()
      return
    }
    settingsCommit.commit(key)
    const current = settingsCommit.getState(key)
    if (current.phase !== 'invalid') {
      const snapshot = llmParamsEditsRef.current[key]
      if (snapshot) savedParamsRef.current[key] = JSON.stringify(snapshot)
    }
    syncDraftRegistrationsRef.current()
  }

  const handlePromptEdit = (key: string, content: string) => {
    clearSaveFeedback()
    const baseline = prompts?.find((prompt) => prompt.key === key)?.content
    const nextEdits = { ...editsRef.current }
    if (content === baseline) delete nextEdits[key]
    else nextEdits[key] = content
    editsRef.current = nextEdits
    setEdits(nextEdits)
    syncDraftRegistrationsRef.current()
  }

  const savePrompt = (key: string, content: string) => {
    pendingPromptCountsRef.current.set(key, (pendingPromptCountsRef.current.get(key) ?? 0) + 1)
    failedPromptKeysRef.current.delete(key)
    syncDraftRegistrationsRef.current()
    updatePrompt.mutate({ key, content })
  }

  const saveModel = (model: string) => {
    pendingModelCountRef.current += 1
    failedModelRef.current = false
    syncDraftRegistrationsRef.current()
    updateModelMutation.mutate(model)
  }

  const handleSaveParams = (key: string) => {
    if (hasInvalidParamRaw(key)) {
      settingsCommit.stage(key, null)
      syncDraftRegistrationsRef.current()
      return
    }
    const snapshot = JSON.stringify(llmParamsEditsRef.current[key] || DEFAULT_PARAMS)
    dirtyParamsRef.current.add(key)
    savedParamsRef.current[key] = snapshot
    savePrompt(key, snapshot)
  }

  const allowedPrompts = group ? new Set<string>(GROUP_PROMPTS[group]) : null
  const allowedParams = group ? new Set<string>(GROUP_PARAMS[group]) : null
  const showMainModel = !group || group === 'prompt'
  const showTranslationModel = !group || group === 'translation'
  const showDialogueModels = !group || group === 'dialogue'
  const allAllowedPrompts = new Set<string>(Object.values(GROUP_PROMPTS).flat())
  const visiblePrompts = prompts?.filter((prompt) =>
    allowedPrompts ? allowedPrompts.has(prompt.key) : allAllowedPrompts.has(prompt.key)
  )
  const visibleParams = Object.entries(PARAM_LABELS).filter(
    ([key]) => !allowedParams || allowedParams.has(key)
  )

  useEffect(() => {
    if (!playgroundPresetKey && visiblePrompts?.length) {
      setPlaygroundPresetKey(visiblePrompts[0].key)
    }
  }, [prompts, group, playgroundPresetKey])

  useEffect(() => {
    playgroundRequestId.current += 1
    setPlaygroundPending(false)
    setPlaygroundResponse(null)
    setPlaygroundError(null)
  }, [currentModelData?.content])

  const selectedPlaygroundPreset = visiblePrompts?.find((prompt) => prompt.key === playgroundPresetKey)
    ?? visiblePrompts?.[0]
  const playgroundSystemPrompt = selectedPlaygroundPreset ? getContent(selectedPlaygroundPreset) : ''

  const invalidatePlayground = () => {
    playgroundRequestId.current += 1
    setPlaygroundPending(false)
    setPlaygroundResponse(null)
    setPlaygroundError(null)
  }

  const handlePlaygroundPreview = async () => {
    let variables: Record<string, string>
    try {
      const parsed: unknown = JSON.parse(playgroundVariablesText)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.values(parsed).some((value) => typeof value !== 'string')) {
        throw new Error('変数は文字列値を持つJSONオブジェクトで指定してください')
      }
      variables = parsed as Record<string, string>
    } catch (error) {
      setPlaygroundResponse(null)
      setPlaygroundError(error instanceof Error ? error.message : '変数JSONを確認してください')
      return
    }

    const requestId = ++playgroundRequestId.current
    setPlaygroundPending(true)
    setPlaygroundError(null)
    setPlaygroundResponse(null)
    setPlaygroundView('raw')
    const paramsRecord = prompts?.find((prompt) => prompt.key === 'llm_params_audit')
    const params = llmParamsEdits.llm_params_audit ?? (() => {
      try {
        return paramsRecord?.content ? { ...DEFAULT_PARAMS, ...JSON.parse(paramsRecord.content) } : DEFAULT_PARAMS
      } catch {
        return DEFAULT_PARAMS
      }
    })()
    try {
      const response = await llmPromptsApi.playground({
        system_prompt: playgroundSystemPrompt,
        text: playgroundText,
        variables,
        model: currentModelData?.content || null,
        llm_params: { ...params },
      })
      if (requestId === playgroundRequestId.current) setPlaygroundResponse(response)
    } catch (error) {
      if (requestId === playgroundRequestId.current) {
        setPlaygroundError(error instanceof Error ? error.message : 'Playground preview failed')
      }
    } finally {
      if (requestId === playgroundRequestId.current) setPlaygroundPending(false)
    }
  }

  return (
    <>
      {saveError && <p role="alert" className="mb-2 text-xs text-red-300">保存に失敗しました: {saveError}（設定は未保存です）</p>}
      {/* LLM Model Settings */}
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <div
          onClick={group ? undefined : onToggleModel}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">LLM Model Settings</h2>
            <span className="text-xs text-zinc-600">— 使用するLLMモデルの選択</span>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {saved === 'model' && (
              <span className="flex items-center gap-1 text-xs text-accent-green"><Check size={13} />設定を保存しました</span>
            )}
            {!group && <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                isExpandedModel ? 'rotate-180' : ''
              }`}
            />}
          </div>
        </div>
        {(group || isExpandedModel) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
            {showMainModel && <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">現在のモデル</label>
                <select
                  id="settings-llm-model-select"
                  value={modelDraft ?? currentModelData?.content ?? ''}
                  onChange={(e) => {
                    clearSaveFeedback()
                    modelDraftRef.current = e.target.value
                    setModelDraft(e.target.value)
                    invalidatePlayground()
                    saveModel(e.target.value)
                  }}
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
            </div>}

            {/* 翻訳用LLMモデル設定 */}
            {showTranslationModel && <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">翻訳用LLMモデル</label>
                <select
                  id="settings-translation-model-select"
                  value={prompts?.find((p) => p.key === 'translation_model')?.content || ''}
                  onChange={(e) => savePrompt('translation_model', e.target.value)}
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
            </div>}

            {/* セリフ下書き VLMモデル設定 */}
            {showDialogueModels && <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">
                  セリフ下書き VLMモデル (画像認識用)
                </label>
                <select
                  id="settings-speech-vlm-model-select"
                  value={prompts?.find((p) => p.key === 'speech_draft_vlm_model')?.content || ''}
                  onChange={(e) => savePrompt('speech_draft_vlm_model', e.target.value)}
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
            </div>}

            {/* セリフ下書き LLMモデル設定 */}
            {showDialogueModels && <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">
                  セリフ下書き LLMモデル (テキスト生成用)
                </label>
                <select
                  id="settings-speech-llm-model-select"
                  value={prompts?.find((p) => p.key === 'speech_draft_llm_model')?.content || ''}
                  onChange={(e) => savePrompt('speech_draft_llm_model', e.target.value)}
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
            </div>}

            {/* 翻訳デバウンス間隔設定 */}
            {!group && <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.04)]">
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
                      clearSaveFeedback()
                      savePrompt('translation_debounce', String(val))
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
            </div>}
            {group === 'dialogue' && modelFooter}
          </div>
        )}
      </section>

      <div className={hasGroupedDetails ? 'border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden' : 'contents'}>
        {hasGroupedDetails && <button
          id={`${instanceId}-details-toggle`}
          type="button"
          onClick={onTogglePrompts}
          aria-expanded={detailsExpanded}
          aria-controls={`${instanceId}-details-body`}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">{group === 'prompt' ? 'プロンプト診断・生成の詳細設定' : 'セリフ生成の詳細設定'}</h2>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${detailsExpanded ? 'rotate-180' : ''}`}
          />
        </button>}
        <div id={`${instanceId}-details-body`} hidden={hasGroupedDetails && !detailsExpanded}>
      {/* LLM System Prompts */}
      <section className={hasGroupedDetails || group === 'translation' ? 'border-0 bg-transparent rounded-none overflow-visible' : 'border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden'}>
        {!hasGroupedDetails && group !== 'translation' && <button
          type="button"
          onClick={onTogglePrompts}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2"><Wand2 size={15} className="text-[#7C6FDD]" /><h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2><span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span></div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${isExpandedPrompts ? 'rotate-180' : ''}`} />
        </button>}
        {(group === 'translation' || (hasGroupedDetails ? true : isExpandedPrompts)) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
            {isLoadingPrompts ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8">
                <RefreshCw size={14} className="animate-spin" />Loading prompts…
              </div>
            ) : (
              <div className="space-y-3">
                {group !== 'prompt' && visiblePrompts?.map((p) => (
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
                        {p.key === 'speech_draft_vlm_prompt' && <p className="text-xs text-zinc-500">画像理解：画像の状況や要素を読み取ります。</p>}
                        {p.key === 'speech_draft_llm_prompt' && <p className="text-xs text-zinc-500">セリフ文章化：読み取った状況からセリフを作成します。</p>}
                        {p.key === 'speech_rewrite_system_prompt' && <p className="text-xs text-zinc-500">口調変換：キャラクターに合わせてセリフを整えます。</p>}
                        <textarea
                          id={`prompt-content-${p.key}`}
                          value={getContent(p)}
                          onChange={(e) => {
                            invalidatePlayground()
                            clearSaveFeedback()
                            handlePromptEdit(p.key, e.target.value)
                          }}
                          rows={16}
                          className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar"
                        />
                        <div className="flex items-center justify-between">
                          <button
                            id={`prompt-reset-${p.key}`}
                            onClick={() => {
                              invalidatePlayground()
                              clearSaveFeedback()
                              const nextEdits = { ...editsRef.current }
                              delete nextEdits[p.key]
                              editsRef.current = nextEdits
                              setEdits(nextEdits)
                              syncDraftRegistrationsRef.current()
                            }}
                            disabled={!edits[p.key]}
                            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                          >
                            Reset changes
                          </button>
                          <button
                            id={`prompt-save-${p.key}`}
                            onClick={() =>
                              savePrompt(p.key, getContent(p))
                            }
                            disabled={updatePrompt.isPending}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                              saved === p.key
                                ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                                : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                            }`}
                          >
                            <Save size={12} />
                            {saved === p.key ? '設定を保存しました' : 'Save'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {group === 'prompt' && (() => {
                  const selected = prompts?.find((p) => p.key === selectedPromptKey)
                  const pg = promptParamGroupFor(selectedPromptKey)
                  const pgParams = pg ? (llmParamsEdits[pg] || DEFAULT_PARAMS) : DEFAULT_PARAMS
                  const pgSaved = pg !== null && saved === pg
                  const primaryFields = PARAM_FIELDS.filter((f) => f.key === 'temperature' || f.key === 'max_tokens')
                  const extraFields = PARAM_FIELDS.filter((f) => f.key !== 'temperature' && f.key !== 'max_tokens')
                  const renderField = (field: (typeof PARAM_FIELDS)[number]) => (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 text-zinc-400">{field.label}</span>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={pg ? rawParamEdits[paramRawKey(pg, field.key)] ?? String(pgParams[field.key] ?? DEFAULT_PARAMS[field.key]) : String(DEFAULT_PARAMS[field.key])}
                          onChange={(e) => pg && handleParamInput(pg, field.key, e.currentTarget.value)}
                          onBlur={() => pg && isMobile && commitParam(pg)}
                          onKeyDown={(e) => {
                            if (isMobile && e.key === 'Enter' && pg) {
                              e.preventDefault()
                              commitParam(pg)
                            }
                          }}
                          className="min-h-11 w-24 touch-manipulation bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right text-xs font-mono text-zinc-200 focus:outline-none"
                        />
                      </div>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={pgParams[field.key] ?? DEFAULT_PARAMS[field.key]}
                        onChange={(e) => pg && updateParamValue(pg, field.key, parseFloat(e.currentTarget.value))}
                        onPointerDown={() => pg && canceledRangePointersRef.current.delete(paramRawKey(pg, field.key))}
                        onPointerCancel={() => pg && canceledRangePointersRef.current.add(paramRawKey(pg, field.key))}
                        onPointerUp={() => {
                          if (!pg) return
                          canceledRangePointersRef.current.delete(paramRawKey(pg, field.key))
                          if (isMobile) commitParam(pg)
                        }}
                        onKeyUp={() => isMobile && pg && commitParam(pg)}
                        onBlur={() => {
                          if (!pg) return
                          const canceled = canceledRangePointersRef.current.delete(paramRawKey(pg, field.key))
                          if (isMobile && !canceled) commitParam(pg)
                        }}
                        className="min-h-11 w-full touch-manipulation accent-[#7C6FDD]"
                      />
                    </div>
                  )
                  return (
                    <div data-testid="prompt-unified-editor" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="min-w-0 space-y-3">
                        <label htmlFor="prompt-type-select" className="block text-xs text-zinc-400">プロンプト種別</label>
                        <select
                          id="prompt-type-select"
                          value={selectedPromptKey}
                          onChange={(e) => setSelectedPromptKey(e.target.value)}
                          className="min-h-11 w-full rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] px-3 text-xs text-zinc-200 touch-manipulation"
                        >
                          {PROMPT_EDITOR_KEYS.map((k, i) => (
                            <option key={k} value={k}>{`${'①②③④⑤⑥'[i]} ${PROMPT_LABELS[k] ?? k}`}</option>
                          ))}
                        </select>
                        {!selected && <p className="text-xs text-zinc-500">このプロンプトはまだ取得されていません。</p>}
                        <textarea
                          id={`prompt-content-${selectedPromptKey}`}
                          value={selected ? getContent(selected) : ''}
                          disabled={!selected}
                          onChange={(e) => {
                            invalidatePlayground()
                            clearSaveFeedback()
                            handlePromptEdit(selectedPromptKey, e.target.value)
                          }}
                          rows={16}
                          className="w-full min-h-[16rem] bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y touch-manipulation focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            id={`prompt-reset-${selectedPromptKey}`}
                            type="button"
                            onClick={() => {
                              invalidatePlayground()
                              clearSaveFeedback()
                              const nextEdits = { ...editsRef.current }
                              delete nextEdits[selectedPromptKey]
                              editsRef.current = nextEdits
                              setEdits(nextEdits)
                              syncDraftRegistrationsRef.current()
                            }}
                            disabled={!edits[selectedPromptKey]}
                            className="min-h-11 touch-manipulation text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors"
                          >
                            Reset changes
                          </button>
                          <button
                            id={`prompt-save-${selectedPromptKey}`}
                            type="button"
                            onClick={() => selected && savePrompt(selected.key, getContent(selected))}
                            disabled={updatePrompt.isPending || !selected}
                            className={`flex min-h-11 touch-manipulation items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                              saved === selectedPromptKey
                                ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                                : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                            }`}
                          >
                            <Save size={12} />
                            {saved === selectedPromptKey ? '設定を保存しました' : 'Save'}
                          </button>
                        </div>
                      </div>
                      <div className="min-w-0 space-y-3 font-sans" data-testid="prompt-unified-params">
                        <p className="text-xs text-zinc-400">
                          使用モデル: {currentModelData?.content ?? '未設定'}（全プロンプト共通。変更は上の「現在のモデル」）
                        </p>
                        {pg && (
                          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface p-4 space-y-4">
                            <div className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.04)] pb-2 mb-2">
                              <h3 className="text-xs font-semibold text-zinc-300">{PARAM_LABELS[pg]}</h3>
                              <button
                                type="button"
                                onClick={() => handleSaveParams(pg)}
                                disabled={updatePrompt.isPending}
                                hidden={isMobile}
                                className={`flex min-h-11 touch-manipulation items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                                  pgSaved
                                    ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                                    : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                                }`}
                              >
                                <Save size={12} />
                                {pgSaved ? '設定を保存しました' : '保存'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {primaryFields.map(renderField)}
                            </div>
                            <details>
                              <summary className="min-h-11 cursor-pointer touch-manipulation text-xs text-zinc-400">その他のパラメータ</summary>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                {extraFields.map(renderField)}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
                {group === 'prompt' && (
                  <section aria-label="Prompt Playground" className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-zinc-200">Prompt Playground</h2>
                    <label className="block text-xs text-zinc-400">
                      System prompt preset
                      <select
                        aria-label="Playground preset"
                        value={selectedPlaygroundPreset?.key ?? ''}
                        onChange={(event) => {
                          invalidatePlayground()
                          setPlaygroundPresetKey(event.target.value)
                        }}
                        className="mt-1 w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-zinc-200"
                      >
                        {visiblePrompts?.map((prompt) => (
                          <option key={prompt.key} value={prompt.key}>{PROMPT_LABELS[prompt.key] ?? prompt.key}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Test input
                      <textarea
                        aria-label="Playground input"
                        value={playgroundText}
                        onChange={(event) => {
                          invalidatePlayground()
                          setPlaygroundText(event.target.value)
                        }}
                        rows={3}
                        className="mt-1 w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-zinc-200"
                      />
                    </label>
                    <label className="block text-xs text-zinc-400">
                      Variables (JSON)
                      <textarea
                        aria-label="Playground variables"
                        value={playgroundVariablesText}
                        onChange={(event) => {
                          invalidatePlayground()
                          setPlaygroundVariablesText(event.target.value)
                        }}
                        rows={2}
                        className="mt-1 w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 font-mono text-zinc-200"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handlePlaygroundPreview}
                      disabled={playgroundPending || !selectedPlaygroundPreset}
                      className="px-3 py-2 rounded-lg bg-[#7C6FDD] text-white text-xs font-medium disabled:opacity-50"
                    >
                      {playgroundPending ? 'Previewing…' : 'Preview prompt'}
                    </button>
                    {playgroundError && <p role="alert" className="text-xs text-red-300">{playgroundError}</p>}
                    <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 space-y-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setPlaygroundView('raw')} aria-pressed={playgroundView === 'raw'}>Raw system prompt</button>
                        <button type="button" onClick={() => setPlaygroundView('expanded')} disabled={!playgroundResponse} aria-pressed={playgroundView === 'expanded'}>Expanded system prompt</button>
                      </div>
                      <pre data-testid="playground-prompt-preview" className="whitespace-pre-wrap text-xs text-zinc-300">
                        {playgroundView === 'expanded'
                          ? playgroundResponse?.rendered_prompt ?? ''
                          : playgroundSystemPrompt}
                      </pre>
                      {playgroundResponse && (
                        <>
                          <p className="text-xs text-zinc-400">Context token limit: {playgroundResponse.token_limit ?? '未取得'}</p>
                          <div className="text-xs text-zinc-200 whitespace-pre-wrap">{playgroundResponse.result}</div>
                        </>
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* LLM Detailed Parameters */}
      <section className={hasGroupedDetails || group === 'translation' ? 'border-0 bg-transparent rounded-none overflow-visible' : 'border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden'}>
        {!hasGroupedDetails && group !== 'translation' && <button
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
        </button>}
        {group !== 'prompt' && (group === 'translation' || (hasGroupedDetails ? true : isExpandedParams)) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
            {isLoadingPrompts ? (
              <div className="flex items-center gap-2 text-zinc-600 text-sm py-8 font-sans">
                <RefreshCw size={14} className="animate-spin" />
                Loading parameters…
              </div>
            ) : (
              <div className="space-y-4 font-sans">
                {visibleParams.map(([key, label]) => {
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
                          hidden={isMobile}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                            isSaved
                              ? 'bg-accent-green/20 text-accent-green border border-accent-green/40'
                              : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'
                          }`}
                        >
                          <Save size={12} />
                          {isSaved ? '設定を保存しました' : '保存'}
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
                                value={rawParamEdits[paramRawKey(key, field.key)] ?? String(params[field.key] ?? DEFAULT_PARAMS[field.key])}
                                onChange={(e) => handleParamInput(key, field.key, e.currentTarget.value)}
                                onBlur={() => isMobile && commitParam(key)}
                                onKeyDown={(e) => {
                                  if (isMobile && e.key === 'Enter') {
                                    e.preventDefault()
                                    commitParam(key)
                                  }
                                }}
                                className="w-16 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded px-1.5 py-0.5 text-right font-mono text-zinc-200 focus:outline-none"
                              />
                            </div>
                            <input
                              type="range"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={params[field.key] ?? DEFAULT_PARAMS[field.key]}
                              onChange={(e) => updateParamValue(key, field.key, parseFloat(e.currentTarget.value))}
                              onPointerDown={() => canceledRangePointersRef.current.delete(paramRawKey(key, field.key))}
                              onPointerCancel={() => canceledRangePointersRef.current.add(paramRawKey(key, field.key))}
                              onPointerUp={() => {
                                canceledRangePointersRef.current.delete(paramRawKey(key, field.key))
                                if (isMobile) commitParam(key)
                              }}
                              onKeyUp={() => isMobile && commitParam(key)}
                              onBlur={() => {
                                const canceled = canceledRangePointersRef.current.delete(paramRawKey(key, field.key))
                                if (isMobile && !canceled) commitParam(key)
                              }}
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
        </div>
      </div>
    </>
  )
}
