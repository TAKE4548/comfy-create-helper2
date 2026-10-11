import { request } from '../core/base'
import type { ComfyObjectInfo } from '../types'

export const comfyApi = {
  getObjectInfoAll: (): Promise<ComfyObjectInfo> =>
    request<ComfyObjectInfo>('/comfy/object_info'),
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
