/**
 * API client for Prompt Surgeon FastAPI backend
 */

import type { SpeechBatchJob, SpeechBatchJobCreate, SpeechBatchItemRetryRequest, MappingMasterUsage, ComfyLoraModel, WorkflowPreset, WorkflowPresetCreate, WorkflowPresetUpdate, Category, Workflow, WorkflowSummary, Snapshot, SnapshotSummary, SceneGenerateRequest, SceneDiffParams, LlmPrompt, BypassProfile, BypassProfileCreate, BypassProfileUpdate, ParamSyncGroup, ParamSyncGroupCreate, ParamSyncGroupUpdate, BaseModel, BaseModelCreate, CheckpointMapping, CheckpointMappingCreate, Lora, TagSet, BubbleDetectResponse, SpeechDraftResponse, BubbleCandidate, ServerFont, ParamTypeMaster, ParamTypeMasterCreate, SpeechBubblePreset, SpeechBubblePresetCreate, SpeechBubblePresetUpdate, Album, SpeechTonePreset, SpeechTonePresetCreate, SpeechTonePresetUpdate, SpeechToneRewriteRequest, SpeechToneRewriteResponse, PromptTranslateRequest, PromptTranslateResponse, TranslateTestRequest, TranslateTestResponse, TranslateMeta, TranslationMode, DiffAnalyzeResponse, WorkflowRollbackResponse, WorkflowHistoryStatusResponse } from './types'
export type { PromptTranslateRequest, PromptTranslateResponse, TranslateTestRequest, TranslateTestResponse, TranslateMeta, TranslationMode, DiffAnalyzeResponse, WorkflowRollbackResponse, WorkflowHistoryStatusResponse }



const BASE_URL = '/api'


async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : ''
    throw new Error(`API error ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  if (typeof res.text === 'function') {
    const text = await res.text()
    if (!text || text.trim() === '') return undefined as T
    return JSON.parse(text)
  }
  if (typeof res.json === 'function') {
    return res.json()
  }
  return undefined as T
}

// 笏笏笏 Workflows 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const workflowsApi = {
  list: () => request<WorkflowSummary[]>('/workflows'),
  get: (id: number) => request<Workflow>(`/workflows/${id}`),
  create: (data: unknown) => request('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/workflows/${id}`, { method: 'DELETE' }),
  copy: (id: number, name: string) => request<WorkflowSummary>(`/workflows/${id}/copy`, { method: 'POST', body: JSON.stringify({ name }) }),
  scan: (json_body: unknown) => request('/workflows/scan', { method: 'POST', body: JSON.stringify({ json_body }) }),
  diffAnalyze: (workflowId: number, newJsonBody: Record<string, unknown>) =>
    request<DiffAnalyzeResponse>(`/workflows/${workflowId}/diff-analyze`, {
      method: 'POST',
      body: JSON.stringify({ new_json_body: newJsonBody }),
    }),
  rollback: (workflowId: number) =>
    request<WorkflowRollbackResponse>(`/workflows/${workflowId}/rollback`, { method: 'POST' }),
  getHistoryStatus: (workflowId: number) =>
    request<WorkflowHistoryStatusResponse>(`/workflows/${workflowId}/history-status`),
}

// 笏笏笏 Mapping Masters 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const mappingMastersApi = {
  list: () => request('/mapping-masters'),
  create: (data: unknown) => request('/mapping-masters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/mapping-masters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/mapping-masters/${id}`, { method: 'DELETE' }),
  getUsages: (id: number) => request<MappingMasterUsage[]>(`/mapping-masters/${id}/usages`),
  reorder: (ordered_ids: number[]) => request('/mapping-masters/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
}

// 笏笏笏 Snapshots 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const snapshotsApi = {
  list: (workflowIdOrParams?: number | { workflow_id?: number; lora_id?: number; tag_set_id?: number }) => {
    const query = new URLSearchParams()
    if (typeof workflowIdOrParams === 'number') {
      query.append('workflow_id', String(workflowIdOrParams))
    } else if (workflowIdOrParams) {
      if (workflowIdOrParams.workflow_id) query.append('workflow_id', String(workflowIdOrParams.workflow_id))
      if (workflowIdOrParams.lora_id) query.append('lora_id', String(workflowIdOrParams.lora_id))
      if (workflowIdOrParams.tag_set_id) query.append('tag_set_id', String(workflowIdOrParams.tag_set_id))
    }
    const queryString = query.toString()
    return request<SnapshotSummary[]>(`/snapshots${queryString ? `?${queryString}` : ''}`)
  },
  get: (id: number) => request<Snapshot>(`/snapshots/${id}`),
  create: (data: unknown) => request<SnapshotSummary>('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
  patch: (
    id: number,
    data: {
      lora_ids?: number[]
      tag_set_ids?: number[]
      image_path?: string
      thumbnail_path?: string
      params?: any
    }
  ) => request<Snapshot>(`/snapshots/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/snapshots/${id}`, { method: 'DELETE' }),
  detectBubble: (id: number) =>
    request<BubbleDetectResponse>(`/snapshots/${id}/detect-bubble`, { method: 'POST' }),
  detectBubbleROI: (id: number, roi: { x: number; y: number; w: number; h: number }) =>
    request<BubbleDetectResponse>(`/snapshots/${id}/detect-bubble-roi`, {
      method: 'POST',
      body: JSON.stringify({ roi }),
    }),
  detectBubbleDebug: (id: number, roi?: { x: number; y: number; w: number; h: number } | null) =>
    request<{ candidates: BubbleCandidate[] }>(`/snapshots/${id}/detect-bubble-debug`, {
      method: 'POST',
      body: JSON.stringify({ roi }),
    }),
  upload: (blob: Blob) => {
    const formData = new FormData()
    formData.append('file', blob, 'snapshot.png')
    return request<{ image_path: string; thumbnail_path?: string }>('/snapshots/upload', {
      method: 'POST',
      body: formData,
    })
  },
}

// 笏笏笏 Albums 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const albumsApi = {
  list: () => request<Album[]>('/albums'),
  get: (id: number) => request<Album>(`/albums/${id}`),
  create: (data: unknown) => request<Album>('/albums', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; sort_order?: number }) =>
    request<Album>(`/albums/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  reorder: (ordered_ids: number[]) =>
    request<void>('/albums/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
  updateOrder: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/order`, { method: 'PUT', body: JSON.stringify({ snapshot_ids }) }),
  delete: (id: number) => request('/albums/' + id, { method: 'DELETE' }),
  deleteItems: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/items/delete`, { method: 'POST', body: JSON.stringify({ snapshot_ids }) }),
  addItems: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/items`, { method: 'POST', body: JSON.stringify({ snapshot_ids }) }),
}


// 笏笏笏 LoRAs 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const lorasApi = {
  list: (category_id?: number, base_model_ids?: string) => {
    const params = new URLSearchParams()
    if (category_id !== undefined) params.append('category_id', String(category_id))
    if (base_model_ids !== undefined) params.append('base_model_ids', base_model_ids)
    const qs = params.toString()
    return request<Lora[]>(`/loras${qs ? `?${qs}` : ''}`)
  },
  create: (data: unknown) => request<Lora>('/loras', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request<Lora>(`/loras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/loras/${id}`, { method: 'DELETE' }),
  getComfyModels: () => request<ComfyLoraModel[]>('/loras/comfy-models'),
  reorder: (ordered_ids: number[], category_id?: number | null) => {
    const body: { ordered_ids: number[]; category_id?: number | null } = { ordered_ids }
    if (category_id !== undefined) {
      body.category_id = category_id
    }
    return request<void>('/loras/reorder', { method: 'PUT', body: JSON.stringify(body) })
  },
}

// 笏笏笏 Tag Sets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const tagSetsApi = {
  list: (category_id?: number, base_model_ids?: string) => {
    const params = new URLSearchParams()
    if (category_id !== undefined) params.append('category_id', String(category_id))
    if (base_model_ids !== undefined) params.append('base_model_ids', base_model_ids)
    const qs = params.toString()
    return request<TagSet[]>(`/tag-sets${qs ? `?${qs}` : ''}`)
  },
  create: (data: unknown) => request<TagSet>('/tag-sets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request<TagSet>(`/tag-sets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/tag-sets/${id}`, { method: 'DELETE' }),
  reorder: (ordered_ids: number[], category_id?: number | null) => {
    const body: { ordered_ids: number[]; category_id?: number | null } = { ordered_ids }
    if (category_id !== undefined) {
      body.category_id = category_id
    }
    return request<void>('/tag-sets/reorder', { method: 'PUT', body: JSON.stringify(body) })
  },
}

// 笏笏笏 Categories 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const loraCategoriesApi = {
  list: () => request<Category[]>('/lora-categories'),
  create: (name: string) => request<Category>('/lora-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: number, name: string) => request<Category>('/lora-categories/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: number) => request<void>(`/lora-categories/${id}`, { method: 'DELETE' }),
}

export const tagsetCategoriesApi = {
  list: () => request<Category[]>('/tagset-categories'),
  create: (name: string) => request<Category>('/tagset-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: number, name: string) => request<Category>('/tagset-categories/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: number) => request<void>(`/tagset-categories/${id}`, { method: 'DELETE' }),
}

// 笏笏笏 LLM Audit 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const auditApi = {
  run: (data: unknown) => request('/audit', { method: 'POST', body: JSON.stringify(data) }),
}

// 笏笏笏 LLM Prompts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const llmPromptsApi = {
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
export const configApi = {
  get: () => request<{ comfy_url: string }>('/config'),
}

// 笏笏笏 Fonts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const fontsApi = {
  list: () => request<ServerFont[]>('/fonts'),
}


// 笏笏笏 Workflow Presets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const workflowPresetsApi = {
  list: (workflow_id?: number) =>
    request<WorkflowPreset[]>(`/workflow-presets${workflow_id ? `?workflow_id=${workflow_id}` : ''}`),
  create: (data: WorkflowPresetCreate) =>
    request<WorkflowPreset>('/workflow-presets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: WorkflowPresetUpdate) =>
    request<WorkflowPreset>(`/workflow-presets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`/workflow-presets/${id}`, { method: 'DELETE' }),
  reorder: (ordered_ids: number[]) =>
    request<void>('/workflow-presets/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
  bulkDelete: (ids: number[]) =>
    request<void>('/workflow-presets/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) }),
}

// 笏笏笏 Bypass Profiles 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const bypassProfilesApi = {
  list: (workflow_id: number) =>
    request<BypassProfile[]>(`/workflows/${workflow_id}/bypass-profiles`),
  create: (workflow_id: number, data: BypassProfileCreate) =>
    request<BypassProfile>(`/workflows/${workflow_id}/bypass-profiles`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: BypassProfileUpdate) =>
    request<BypassProfile>(`/bypass-profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`/bypass-profiles/${id}`, { method: 'DELETE' }),
}

// 笏笏笏 Param Sync Groups 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const paramSyncGroupsApi = {
  list: (workflow_id: number) =>
    request<ParamSyncGroup[]>(`/workflows/${workflow_id}/param-sync-groups`),
  create: (workflow_id: number, data: ParamSyncGroupCreate) =>
    request<ParamSyncGroup>(`/workflows/${workflow_id}/param-sync-groups`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: ParamSyncGroupUpdate) =>
    request<ParamSyncGroup>(`/param-sync-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`/param-sync-groups/${id}`, { method: 'DELETE' }),
}

// 笏笏笏 Base Models 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const baseModelsApi = {
  list: () => request<BaseModel[]>('/base-models'),
  create: (data: BaseModelCreate) => request<BaseModel>('/base-models', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: BaseModelCreate) => request<BaseModel>(`/base-models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/base-models/${id}`, { method: 'DELETE' }),
}

// 笏笏笏 Checkpoint Mappings 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const checkpointMappingsApi = {
  list: () => request<CheckpointMapping[]>('/checkpoint-mappings'),
  create: (data: CheckpointMappingCreate) => request<CheckpointMapping>('/checkpoint-mappings', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/checkpoint-mappings/${id}`, { method: 'DELETE' }),
  getComfyCheckpoints: () => request<string[]>('/comfy/checkpoints'),
}

// 笏笏笏 ParamTypeMaster 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const paramTypeMastersApi = {
  list: () => request<ParamTypeMaster[]>('/param-type-masters'),
  create: (data: ParamTypeMasterCreate) =>
    request<ParamTypeMaster>('/param-type-masters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: ParamTypeMasterCreate) =>
    request<ParamTypeMaster>(`/param-type-masters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/param-type-masters/${id}`, { method: 'DELETE' }),
}

// 笏笏笏 Speech Bubble Presets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const speechBubblePresetsApi = {
  list: () => request<SpeechBubblePreset[]>('/speech-bubble-presets'),
  getByTagSetId: (tagSetId: number) =>
    request<SpeechBubblePreset | null>(`/speech-bubble-presets/by-tagset/${tagSetId}`),
  create: (data: SpeechBubblePresetCreate) =>
    request<SpeechBubblePreset>('/speech-bubble-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: SpeechBubblePresetUpdate) =>
    request<SpeechBubblePreset>(`/speech-bubble-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/speech-bubble-presets/${id}`, {
      method: 'DELETE',
    }),
}

// 笏笏笏 Speech Tone Presets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const speechTonePresetsApi = {
  list: () => request<SpeechTonePreset[]>('/speech-tone-presets'),
  create: (data: SpeechTonePresetCreate) =>
    request<SpeechTonePreset>('/speech-tone-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: SpeechTonePresetUpdate) =>
    request<SpeechTonePreset>(`/speech-tone-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/speech-tone-presets/${id}`, {
      method: 'DELETE',
    }),
  rewrite: (data: SpeechToneRewriteRequest) =>
    request<SpeechToneRewriteResponse>('/speech-tone-presets/rewrite', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// 笏笏笏 ComfyUI Proxy API 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const comfyApi = {
  getObjectInfo: (classType?: string) =>
    classType
      ? request<Record<string, any>>(`/comfy/object-info/${encodeURIComponent(classType)}`)
      : request<Record<string, any>>('/comfy/object_info'),
  queuePrompt: (data: { prompt: Record<string, any>; client_id?: string }) =>
    request<{ prompt_id?: string; number?: number; error?: any; node_errors?: any }>('/comfy/prompt', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getQueue: () => request<{ queue_running: any[]; queue_pending: any[] }>('/comfy/queue'),
  deleteQueue: (data: { delete?: string[]; clear?: boolean }) =>
    request('/comfy/queue', { method: 'POST', body: JSON.stringify(data) }),
  interrupt: () => request('/comfy/interrupt', { method: 'POST' }),
  getHistory: (max_items?: number) =>
    request<Record<string, any>>(`/comfy/history${max_items !== undefined ? `?max_items=${max_items}` : ''}`),
  getPromptHistory: (promptId: string) =>
    request<Record<string, any>>(`/comfy/history/${encodeURIComponent(promptId)}`),
  deleteHistory: (data: { delete?: string[]; clear?: boolean }) =>
    request('/comfy/history', { method: 'POST', body: JSON.stringify(data) }),
}

// 笏笏笏 Translation Proxy API 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const translateApi = {
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
export const speechBatchApi = {
  createJob: (data: SpeechBatchJobCreate) =>
    request<SpeechBatchJob>('/speech-batch/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getJob: (jobId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}`),
  getActiveJob: () =>
    request<SpeechBatchJob | null>('/speech-batch/jobs/active'),
  cancelJob: (jobId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),
  cancelItem: (jobId: string, itemId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/items/${itemId}/cancel`, {
      method: 'POST',
    }),
  retryItem: (jobId: string, itemId: string, payload?: SpeechBatchItemRetryRequest) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/items/${itemId}/retry`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
}

// ─── Prompt Metadata ──────────────────────────────────────────────
export interface PromptMetadataRead {
  prompt_id: string;
  workflow_id: number | null;
  param_values: Record<string, any>;
  applied_assets: Record<string, any> | null;
  created_at: string;
}

export const promptMetadataApi = {
  create: (data: {
    prompt_id: string;
    workflow_id?: number | null;
    param_values: Record<string, any>;
    applied_assets?: Record<string, any>;
  }) => request('/prompt-metadata', { method: 'POST', body: JSON.stringify(data) }),
  get: (promptId: string) =>
    request<PromptMetadataRead>(`/prompt-metadata/${encodeURIComponent(promptId)}`),
}

// ─── Settings API ──────────────────────────────────────────────────
export interface VramSettings {
  vram_min_free_gb: number
  vram_guard_enabled: boolean
  vram_free_gb?: number | null
  vram_total_gb?: number | null
}

export const settingsApi = {
  getVram: () => request<VramSettings>('/api/settings/vram'),
  updateVram: (data: { vram_min_free_gb: number; vram_guard_enabled?: boolean }) =>
    request<VramSettings>('/api/settings/vram', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}