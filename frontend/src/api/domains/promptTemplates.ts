import { request } from '../core/base'
import type { PromptTemplate, PromptTemplateCreate, PromptTemplateUpdate } from '../types'

export const promptTemplatesApi = {
  list: () => request<PromptTemplate[]>('/prompt-templates'),
  create: (data: PromptTemplateCreate) =>
    request<PromptTemplate>('/prompt-templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: PromptTemplateUpdate) =>
    request<PromptTemplate>(`/prompt-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`/prompt-templates/${id}`, { method: 'DELETE' }),
}
