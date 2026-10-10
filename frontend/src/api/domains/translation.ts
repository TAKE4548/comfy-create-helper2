import { request } from '../core/base'
import type {
  PromptTranslateRequest,
  PromptTranslateResponse,
  TranslateTestRequest,
  TranslateTestResponse,
  LlmPrompt,
  SceneGenerateRequest,
  SceneDiffParams,
  SpeechDraftResponse,
} from '../types'

export interface PlaygroundRequest {
  system_prompt: string
  text: string
  variables?: Record<string, string>
  model?: string | null
  llm_params?: Record<string, unknown> | null
}

export interface PlaygroundResponse {
  rendered_prompt: string
  result: string
  token_limit: number | null
}

export interface TranslationDictionaryRule {
  source: string
  replacement: string
}

export interface TranslationDictionary {
  rules: TranslationDictionaryRule[]
}

export const translateApi = {
  getDictionary: () => request<TranslationDictionary>('/translate/dictionary'),
  saveDictionary: (rules: TranslationDictionaryRule[]) =>
    request<TranslationDictionary>('/translate/dictionary', {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    }),
  translatePrompt: (data: PromptTranslateRequest) =>
    request<PromptTranslateResponse>('/translate/prompt', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  testConnection: (data: TranslateTestRequest) =>
    request<TranslateTestResponse>('/translate/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStats: () =>
    request<{ cached_entries_count: number }>('/translate/stats'),
  clearCache: () =>
    request<{ message: string; cleared_count: number }>('/translate/clear-cache', {
      method: 'POST',
    }),
}

// ─── Speech Batch Rewrite ─────────────────────────────────────────

export const llmPromptsApi = {
  playground: (data: PlaygroundRequest) =>
    request<PlaygroundResponse>('/llm-prompts/playground', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  list: () => request<LlmPrompt[]>('/llm-prompts'),
  update: (key: string, data: unknown) => request<LlmPrompt>(`/llm-prompts/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
  sceneGenerate: (data: SceneGenerateRequest) =>
    request<SceneDiffParams[]>('/llm-prompts/scene-generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getModels: () => request<string[]>('/llm-prompts/models'),
  getCurrentModel: () => request<LlmPrompt>('/llm-prompts/current-model'),
  updateCurrentModel: (model: string) =>
    request<LlmPrompt>('/llm-prompts/current-model', {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  translate: (data: { text: string; direction: 'ja_to_en' | 'en_to_ja' }) =>
    request<string>('/llm-prompts/translate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  speechDraft: (snapshot_id: number) =>
    request<SpeechDraftResponse>('/llm-prompts/speech-draft', {
      method: 'POST',
      body: JSON.stringify({ snapshot_id }),
    }),
}

// 笏笏笏 Config 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
