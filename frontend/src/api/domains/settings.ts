import { request } from '../core/base'

export interface VramSettings {
  vram_min_free_gb: number
  vram_guard_enabled: boolean
  vram_free_gb?: number | null
  vram_total_gb?: number | null
}

export const settingsApi = {
  getVram: () => request<VramSettings>('/settings/vram'),
  updateVram: (data: { vram_min_free_gb: number; vram_guard_enabled?: boolean }) =>
    request<VramSettings>('/settings/vram', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

// ─── LoRA Studio / Dataset API ─────────────────────────────────────

export const configApi = {
  get: () => request<{ comfy_url: string }>('/config'),
}

// 笏笏笏 Fonts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export const auditApi = {
  run: (data: unknown) => request('/audit', { method: 'POST', body: JSON.stringify(data) }),
}

// 笏笏笏 LLM Prompts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

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
