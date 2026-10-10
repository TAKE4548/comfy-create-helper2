import { request } from '../core/base'
import type {
  MappingMasterV2,
  MappingMasterV2Create,
  MappingMasterV2Update,
  MappingMasterUsage,
} from '../types'

export const mappingMastersApi = {
  list: (groupId?: number): Promise<MappingMasterV2[]> =>
    request<MappingMasterV2[]>(`/mapping-masters${groupId !== undefined ? `?group_id=${groupId}` : ''}`),

  get: (id: number): Promise<MappingMasterV2> =>
    request<MappingMasterV2>(`/mapping-masters/${id}`),

  create: (data: MappingMasterV2Create | Partial<MappingMasterV2> | unknown): Promise<MappingMasterV2> =>
    request<MappingMasterV2>('/mapping-masters', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: MappingMasterV2Update | Partial<MappingMasterV2> | unknown): Promise<MappingMasterV2> =>
    request<MappingMasterV2>(`/mapping-masters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/mapping-masters/${id}`, {
      method: 'DELETE',
    }),

  getUsages: (id: number): Promise<MappingMasterUsage[]> =>
    request<MappingMasterUsage[]>(`/mapping-masters/${id}/usages`),

  reorder: (ordered_ids: number[]): Promise<void> =>
    request<void>('/mapping-masters/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids }),
    }),
}
