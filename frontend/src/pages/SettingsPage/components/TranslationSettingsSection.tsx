import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Languages,
  Check,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Send,
  Save,
} from 'lucide-react'
import { llmPromptsApi, translateApi } from '../../../api/client'
import type { LlmPrompt, TranslateTestResponse } from '../../../api/types'
import { LlmSettingsSection } from './LlmSettingsSection'
import { TranslationPreviewCard } from './TranslationPreviewCard'

type TranslationProvider = 'google_cloud' | 'deepl' | 'llm' | 'fugumt'

interface TranslationSettingsSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export const TranslationSettingsSection: React.FC<TranslationSettingsSectionProps> = ({
  isExpanded,
  onToggle,
}) => {
  const qc = useQueryClient()

  const { data: prompts, isLoading: isLoadingPrompts, dataUpdatedAt: promptsDataUpdatedAt } = useQuery<LlmPrompt[]>({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })

  const { data: cacheStats, refetch: refetchStats } = useQuery({
    queryKey: ['translate-stats'],
    queryFn: translateApi.getStats,
  })

  const [provider, setProvider] = useState<TranslationProvider>('google_cloud')
  const [savedProvider, setSavedProvider] = useState<TranslationProvider | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [savedCredentials, setSavedCredentials] = useState<{ apiKey: string; apiUrl: string } | null>(null)
  const [providerDirty, setProviderDirty] = useState(false)
  const [credentialsDirty, setCredentialsDirty] = useState(false)
  const [translationExpanded, setTranslationExpanded] = useState(false)
  const [debounceDraft, setDebounceDraft] = useState<number | null>(null)
  const savedSnapshotRef = useRef<{ provider: TranslationProvider; apiKey: string; apiUrl: string; after: number } | null>(null)
  const providerRef = useRef<HTMLInputElement>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Test connection state
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TranslateTestResponse | null>(null)

  // Sync state from fetched prompts
  useEffect(() => {
    if (prompts) {
      const snapshot = savedSnapshotRef.current
      if (snapshot) {
        if (promptsDataUpdatedAt <= snapshot.after) return
        const remoteProvider = prompts.find((p) => p.key === 'translation_provider')?.content
        const remoteKey = prompts.find((p) => p.key === 'translation_api_key')?.content
        const remoteUrl = prompts.find((p) => p.key === 'translation_api_url')?.content
        if (remoteProvider !== snapshot.provider ||
          ((snapshot.provider === 'google_cloud' || snapshot.provider === 'deepl') &&
            (remoteKey !== snapshot.apiKey || remoteUrl !== snapshot.apiUrl))) return
        savedSnapshotRef.current = null
      }
      const pRecord = prompts.find((p) => p.key === 'translation_provider')
      if (pRecord?.content && !providerDirty) {
        if (pRecord.content === 'google_free') {
          setProvider('google_cloud')
          setSavedProvider('google_cloud')
        } else {
          setProvider(pRecord.content as TranslationProvider)
          setSavedProvider(pRecord.content as TranslationProvider)
        }
      }
      const kRecord = prompts.find((p) => p.key === 'translation_api_key')
      if (kRecord && !credentialsDirty) {
        setApiKey(kRecord.content)
      }
      const uRecord = prompts.find((p) => p.key === 'translation_api_url')
      if (uRecord && !credentialsDirty) {
        setApiUrl(uRecord.content)
      }
      if (!credentialsDirty && kRecord && uRecord) {
        setSavedCredentials({ apiKey: kRecord.content, apiUrl: uRecord.content })
      }
    }
  }, [prompts, promptsDataUpdatedAt, providerDirty, credentialsDirty])

  useEffect(() => {
    if (!prompts) return
    const snapshot = savedSnapshotRef.current
    if (snapshot) {
      if (promptsDataUpdatedAt <= snapshot.after) return
      const remoteProvider = prompts.find((p) => p.key === 'translation_provider')?.content
      const remoteKey = prompts.find((p) => p.key === 'translation_api_key')?.content
      const remoteUrl = prompts.find((p) => p.key === 'translation_api_url')?.content
      if (remoteProvider !== snapshot.provider ||
        ((snapshot.provider === 'google_cloud' || snapshot.provider === 'deepl') &&
          (remoteKey !== snapshot.apiKey || remoteUrl !== snapshot.apiUrl))) return
      savedSnapshotRef.current = null
    }
    const key = prompts.find((p) => p.key === 'translation_provider')?.content
    const normalized = key === 'google_free' ? 'google_cloud' : key
    if (providerDirty && normalized === provider) setProviderDirty(false)
    if (credentialsDirty &&
      prompts.find((p) => p.key === 'translation_api_key')?.content === apiKey &&
      prompts.find((p) => p.key === 'translation_api_url')?.content === apiUrl) {
      setCredentialsDirty(false)
    }
  }, [prompts, promptsDataUpdatedAt, providerDirty, credentialsDirty, provider, apiKey, apiUrl])

  const saveSettingsMutation = useMutation({
    mutationFn: async (submitted: { provider: TranslationProvider; apiKey: string; apiUrl: string }) => {
      if (submitted.provider === 'fugumt' || submitted.provider === 'llm') {
        await llmPromptsApi.update('translation_provider', { content: submitted.provider })
      } else {
        await Promise.all([
          llmPromptsApi.update('translation_provider', { content: submitted.provider }),
          llmPromptsApi.update('translation_api_key', { content: submitted.apiKey }),
          llmPromptsApi.update('translation_api_url', { content: submitted.apiUrl }),
        ])
      }
    },
    onSuccess: (_result, submitted) => {
      const upsert = (data: LlmPrompt[], key: string, content: string): LlmPrompt[] =>
        data.some((prompt) => prompt.key === key)
          ? data.map((prompt) => prompt.key === key ? { ...prompt, content } : prompt)
          : [...data, { id: -1, key, content, description: null, updated_at: new Date().toISOString() }]
      let updatedPrompts = upsert(qc.getQueryData<LlmPrompt[]>(['llm-prompts']) ?? [], 'translation_provider', submitted.provider)
      if (submitted.provider === 'google_cloud' || submitted.provider === 'deepl') {
        updatedPrompts = upsert(updatedPrompts, 'translation_api_key', submitted.apiKey)
        updatedPrompts = upsert(updatedPrompts, 'translation_api_url', submitted.apiUrl)
      }
      qc.setQueryData(['llm-prompts'], updatedPrompts)
      savedSnapshotRef.current = {
        ...submitted,
        after: qc.getQueryState(['llm-prompts'])?.dataUpdatedAt ?? Date.now(),
      }
      setSavedProvider(submitted.provider)
      setProviderDirty(provider !== submitted.provider)
      if (submitted.provider === 'google_cloud' || submitted.provider === 'deepl') {
        setSavedCredentials({ apiKey: submitted.apiKey, apiUrl: submitted.apiUrl })
        setCredentialsDirty(apiKey !== submitted.apiKey || apiUrl !== submitted.apiUrl)
      }
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const clearCacheMutation = useMutation({
    mutationFn: translateApi.clearCache,
    onSuccess: () => {
      refetchStats()
    },
  })

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await translateApi.testConnection(
        provider === 'fugumt'
          ? { provider: 'fugumt' }
          : {
              provider,
              api_key: apiKey || undefined,
              api_url: apiUrl || undefined,
            }
      )
      setTestResult(res)
    } catch (err: any) {
      setTestResult({
        success: false,
        sample_translation: '',
        error: err.message || '接続テストに失敗しました',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    saveSettingsMutation.mutate({ provider, apiKey, apiUrl })
  }

  const setDraftProvider = (next: TranslationProvider) => {
    setProvider(next)
    setProviderDirty(next !== savedProvider)
    if (provider === 'llm' && next !== 'llm') providerRef.current?.focus()
    setTestResult(null)
  }

  const debounceMs = Math.min(2000, Math.max(300, Number.isFinite(debounceDraft)
    ? debounceDraft as number
    : Number(prompts?.find((p) => p.key === 'translation_debounce')?.content) || 500))
  const authProvider = provider === 'google_cloud' || provider === 'deepl'
  const configDirty = providerDirty || savedProvider === null ||
    (authProvider && (credentialsDirty || (savedCredentials !== null &&
      (apiKey !== savedCredentials.apiKey || apiUrl !== savedCredentials.apiUrl))))
  const previewEnabled = !configDirty && !saveSettingsMutation.isPending && !saveSettingsMutation.isError

  const handleDebounceChange = async (value: number) => {
    const validated = Math.min(2000, Math.max(300, Math.round(value / 50) * 50))
    setDebounceDraft(validated)
    try {
      await llmPromptsApi.update('translation_debounce', { content: String(validated) })
      qc.invalidateQueries({ queryKey: ['llm-prompts'] })
    } catch {
      setDebounceDraft(null)
    }
  }

  return (
    <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
      >
        <div className="flex items-center gap-2">
          <Languages size={16} className="text-[#7C6FDD]" />
          <h2 className="text-sm font-semibold text-zinc-300">Translation Settings (翻訳設定)</h2>
          <span className="text-xs text-zinc-600">— 高速・高効率プロンプト翻訳</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-accent-green flex items-center gap-1 font-medium animate-fade-in">
              <Check size={13} /> 保存完了
            </span>
          )}
          <span
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            ▼
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-5">
          {isLoadingPrompts ? (
            <div className="flex items-center gap-2 text-zinc-600 text-sm py-4">
              <RefreshCw size={14} className="animate-spin" />
              Loading settings...
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              {/* Provider Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  翻訳プロバイダー <span className="text-[#7C6FDD]">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      provider === 'fugumt'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-zinc-100'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      ref={providerRef}
                      name="provider"
                      value="fugumt"
                      checked={provider === 'fugumt'}
                      onChange={() => setDraftProvider('fugumt')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-200">FuguMT</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          推奨 (CPU)
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        CPU 常駐の staka/fugumt-en-ja (int8)。20〜30ms の超高速和訳。初使用時に自動配置・VRAM 0MB・API キー不要。
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      provider === 'google_cloud'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-zinc-100'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="google_cloud"
                      checked={provider === 'google_cloud'}
                      onChange={() => setDraftProvider('google_cloud')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">
                        Google Cloud Translation API
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        GCPの公式Translation API v2キーを使用。
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      provider === 'deepl'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-zinc-100'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="deepl"
                      checked={provider === 'deepl'}
                      onChange={() => setDraftProvider('deepl')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">DeepL API</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        高精度な自然言語翻訳。DeepL API Free または Pro キーが必要。
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      provider === 'llm'
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-zinc-100'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="llm"
                      checked={provider === 'llm'}
                      onChange={() => setDraftProvider('llm')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">
                        ローカル LLM (LMStudio / Ollama)
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        設定済みのローカルLLMモデルを使用して翻訳。
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* API Key / URL (Conditional) */}
              {(provider === 'google_cloud' || provider === 'deepl') && (
                <div className="space-y-3 p-3 bg-surface-2/30 border border-[rgba(255,255,255,0.06)] rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      {provider === 'deepl' ? 'DeepL Auth Key' : 'Google Cloud API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          const value = e.target.value
                          setApiKey(value)
                          setCredentialsDirty(savedCredentials === null || value !== savedCredentials.apiKey || apiUrl !== savedCredentials.apiUrl)
                        }}
                        placeholder={
                          provider === 'deepl'
                            ? 'xxxx-xxxx-xxxx-xxxx:fx'
                            : 'AIzaSy...'
                        }
                        className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 pr-9 text-xs text-zinc-100 focus:outline-none focus:border-[#7C6FDD]/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                      >
                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      カスタム API エンドポイント URL (任意)
                    </label>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => {
                        const value = e.target.value
                        setApiUrl(value)
                        setCredentialsDirty(savedCredentials === null || apiKey !== savedCredentials.apiKey || value !== savedCredentials.apiUrl)
                      }}
                      placeholder="https://api-free.deepl.com/v2/translate (省略時は自動判別)"
                      className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-[#7C6FDD]/50"
                    />
                  </div>
                </div>
              )}

              {provider === 'fugumt' && (
                <div className="p-3 bg-surface-2/30 border border-[rgba(255,255,255,0.06)] rounded-lg text-xs text-zinc-400">
                  完全オフライン・CPU常駐推論のため、APIキーや外部URLの設定は不要です（初回利用時にモデルが自動配置されます）。
                </div>
              )}

              <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30 p-3 space-y-3">
                <h3 className="text-xs font-semibold text-zinc-200">翻訳プロバイダーと認証</h3>
                {(configDirty || !previewEnabled) && (
                  <p role="status" className="text-xs text-amber-300">設定を保存すると翻訳プレビューを利用できます。</p>
                )}
              </div>

              <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30 p-3">
                <TranslationPreviewCard provider={provider} enabled={previewEnabled} debounceMs={debounceMs} />
              </div>

              <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30 p-3 space-y-2">
                <button type="button" className="text-xs font-semibold text-zinc-200" aria-expanded={translationExpanded} onClick={() => setTranslationExpanded((value) => !value)}>
                  翻訳用LLM詳細設定
                </button>
                <div hidden={provider !== 'llm' || !translationExpanded}>
                  <LlmSettingsSection group="translation" isExpandedModel={translationExpanded} onToggleModel={() => setTranslationExpanded((value) => !value)} isExpandedPrompts={translationExpanded} onTogglePrompts={() => setTranslationExpanded((value) => !value)} isExpandedParams={translationExpanded} onToggleParams={() => setTranslationExpanded((value) => !value)} />
                </div>
              </div>

              <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30 p-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="translation-debounce" className="text-xs text-zinc-300">翻訳入力待ち時間</label>
                  <span>{debounceMs}ms</span>
                </div>
                <input id="translation-debounce" type="range" min={300} max={2000} step={50} value={debounceMs} onChange={(event) => void handleDebounceChange(Number(event.target.value))} className="w-full" />
              </div>

              {/* Action Buttons: Save & Test */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={saveSettingsMutation.isPending}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#7C6FDD] hover:bg-[#7C6FDD]/80 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-sm transition-all"
                  >
                    <Save size={13} />
                    <span>{saveSettingsMutation.isPending ? '保存中...' : '設定を保存'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 border border-[rgba(255,255,255,0.08)] hover:bg-surface-2/80 disabled:opacity-50 text-zinc-200 text-xs font-medium rounded-lg transition-all"
                  >
                    {isTesting ? (
                      <RefreshCw size={13} className="animate-spin text-[#7C6FDD]" />
                    ) : (
                      <Send size={13} />
                    )}
                    <span>{isTesting ? 'テスト中...' : '疎通テスト'}</span>
                  </button>
                </div>

                {/* Cache Clear */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 font-mono">
                    キャッシュ: {cacheStats?.cached_entries_count ?? 0} 件
                  </span>
                  <button
                    type="button"
                    onClick={() => clearCacheMutation.mutate()}
                    disabled={clearCacheMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-red-950/40 border border-red-800/40 hover:bg-red-900/40 text-red-300 rounded-lg transition-all"
                  >
                    <Trash2 size={11} />
                    <span>キャッシュクリア</span>
                  </button>
                </div>
              </div>

              {/* Test Connection Feedback */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs animate-fade-in ${
                    testResult.success
                      ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                      : 'bg-red-900/20 border-red-800/40 text-red-300'
                  }`}
                >
                  {testResult.success ? (
                    <div className="flex items-start gap-2">
                      <Check size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">疎通テスト成功</div>
                        <div className="text-[11px] text-zinc-300 mt-0.5">
                          サンプル翻訳結果: 「{testResult.sample_translation}」
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">疎通テスト失敗</div>
                        <div className="text-[11px] text-red-200 mt-0.5">
                          {testResult.error || 'エラーが発生しました'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  )
}
