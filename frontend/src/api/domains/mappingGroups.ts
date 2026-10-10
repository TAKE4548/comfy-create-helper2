import { request } from '../core/base'
import type {
  MappingGroupMaster,
  MappingGroupMasterCreate,
  MappingGroupMasterUpdate,
} from '../types'

export const mappingGroupsApi = {
  list: (include_inactive: boolean = true): Promise<MappingGroupMaster[]> =>
    request<MappingGroupMaster[]>(`/mapping-groups?include_inactive=${include_inactive}`),

  get: (id: number): Promise<MappingGroupMaster> =>
    request<MappingGroupMaster>(`/mapping-groups/${id}`),

  create: (data: MappingGroupMasterCreate | Partial<MappingGroupMaster>): Promise<MappingGroupMaster> =>
    request<MappingGroupMaster>('/mapping-groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: MappingGroupMasterUpdate | Partial<MappingGroupMaster>): Promise<MappingGroupMaster> =>
    request<MappingGroupMaster>(`/mapping-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/mapping-groups/${id}`, {
      method: 'DELETE',
    }),

  reorder: (ordered_ids: number[]): Promise<void> =>
    request<void>('/mapping-groups/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids }),
    }),
}
