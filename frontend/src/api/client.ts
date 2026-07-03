/**
 * API client for Prompt Surgeon FastAPI backend
 */

import type { MappingMasterUsage, ComfyLoraModel, WorkflowPreset, WorkflowPresetCreate, WorkflowPresetUpdate, Category, WorkflowSummary, Snapshot, SnapshotSummary, SceneGenerateRequest, SceneDiffParams } from './types'

const BASE_URL = '/api'

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Workflows ──────────────────────────────────────────────────
export const workflowsApi = {
  list: () => request<WorkflowSummary[]>('/workflows'),
  get: (id: number) => request(`/workflows/${id}`),
  create: (data: unknown) => request('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/workflows/${id}`, { method: 'DELETE' }),
  copy: (id: number, name: string) => request<WorkflowSummary>(`/workflows/${id}/copy`, { method: 'POST', body: JSON.stringify({ name }) }),
  scan: (json_body: unknown) => request('/workflows/scan', { method: 'POST', body: JSON.stringify({ json_body }) }),
}

// ─── Mapping Masters ────────────────────────────────────────────
export const mappingMastersApi = {
  list: () => request('/mapping-masters'),
  create: (data: unknown) => request('/mapping-masters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/mapping-masters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/mapping-masters/${id}`, { method: 'DELETE' }),
  getUsages: (id: number) => request<MappingMasterUsage[]>(`/mapping-masters/${id}/usages`),
  reorder: (ordered_ids: number[]) => request('/mapping-masters/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
}

// ─── Snapshots ──────────────────────────────────────────────────
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
  patch: (id: number, data: { lora_ids: number[]; tag_set_ids: number[] }) =>
    request<Snapshot>(`/snapshots/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/snapshots/${id}`, { method: 'DELETE' }),
}

// ─── Albums ─────────────────────────────────────────────────────
export const albumsApi = {
  list: () => request('/albums'),
  get: (id: number) => request(`/albums/${id}`),
  create: (data: unknown) => request('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/order`, { method: 'PUT', body: JSON.stringify({ snapshot_ids }) }),
  delete: (id: number) => request('/albums/' + id, { method: 'DELETE' }),
  deleteItems: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/items/delete`, { method: 'POST', body: JSON.stringify({ snapshot_ids }) }),
  addItems: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/items`, { method: 'POST', body: JSON.stringify({ snapshot_ids }) }),
}

// ─── LoRAs ──────────────────────────────────────────────────────
export const lorasApi = {
  list: (category_id?: number) => request(`/loras${category_id ? `?category_id=${category_id}` : ''}`),
  create: (data: unknown) => request('/loras', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/loras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/loras/${id}`, { method: 'DELETE' }),
  getComfyModels: () => request<ComfyLoraModel[]>('/loras/comfy-models'),
  reorder: (ordered_ids: number[]) => request('/loras/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
}

// ─── Tag Sets ───────────────────────────────────────────────────
export const tagSetsApi = {
  list: (category_id?: number) => request(`/tag-sets${category_id ? `?category_id=${category_id}` : ''}`),
  create: (data: unknown) => request('/tag-sets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/tag-sets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/tag-sets/${id}`, { method: 'DELETE' }),
  reorder: (ordered_ids: number[]) => request('/tag-sets/reorder', { method: 'PUT', body: JSON.stringify({ ordered_ids }) }),
}

// ─── Categories ─────────────────────────────────────────────────
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

// ─── LLM Audit ──────────────────────────────────────────────────
export const auditApi = {
  run: (data: unknown) => request('/audit', { method: 'POST', body: JSON.stringify(data) }),
}

// ─── LLM Prompts ────────────────────────────────────────────────
export const llmPromptsApi = {
  list: () => request('/llm-prompts'),
  update: (key: string, data: unknown) => request(`/llm-prompts/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
  sceneGenerate: (data: SceneGenerateRequest) =>
    request<SceneDiffParams[]>('/llm-prompts/scene-generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ─── Config ─────────────────────────────────────────────────────
export const configApi = {
  get: () => request<{ comfy_url: string }>('/config'),
}

// ─── Workflow Presets ───────────────────────────────────────────
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
}

