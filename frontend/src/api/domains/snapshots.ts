import { request } from '../core/base'
import type {
  Snapshot,
  SnapshotSummary,
  SnapshotTagSetCreate,
  SnapshotTriggerAssociation,
  BubbleDetectResponse,
  BubbleCandidate,
  Album,
  TagSet,
  Category,
} from '../types'

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
      tag_sets?: SnapshotTagSetCreate[]
      lora_trigger_sets?: SnapshotTriggerAssociation[]
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

export const tagsetCategoriesApi = {
  list: () => request<Category[]>('/tagset-categories'),
  create: (name: string) => request<Category>('/tagset-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: number, name: string) => request<Category>('/tagset-categories/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: number) => request<void>(`/tagset-categories/${id}`, { method: 'DELETE' }),
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
