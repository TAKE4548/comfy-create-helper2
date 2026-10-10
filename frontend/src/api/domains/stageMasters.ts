import { request } from '../core/base'
import type {
  StageMaster,
  StageMasterCreate,
  StageMasterUpdate,
  CascadePreviewResult,
  CascadeRenamePayload,
} from '../types'

export const stageMastersApi = {
  list: (include_inactive: boolean = true): Promise<StageMaster[]> =>
    request<StageMaster[]>(`/stage-masters?include_inactive=${include_inactive}`),

  get: (id: number): Promise<StageMaster> =>
    request<StageMaster>(`/stage-masters/${id}`),

  create: (data: StageMasterCreate | Partial<StageMaster>): Promise<StageMaster> =>
    request<StageMaster>('/stage-masters', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: StageMasterUpdate | Partial<StageMaster>): Promise<StageMaster> =>
    request<StageMaster>(`/stage-masters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/stage-masters/${id}`, {
      method: 'DELETE',
    }),

  reorder: (ordered_ids: number[]): Promise<void> =>
    request<void>('/stage-masters/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ordered_ids }),
    }),

  getUsages: (id: number): Promise<Array<{
    mapping_id: number
    workflow_id: number
    workflow_name: string
    node_id: string
    variant_id: number
  }>> =>
    request(`/stage-masters/${id}/usages`),

  cascadePreview: (id: number, newSuffix: string): Promise<CascadePreviewResult> =>
    request<CascadePreviewResult>(`/stage-masters/${id}/cascade-preview?new_suffix=${encodeURIComponent(newSuffix)}`),

  cascadeRename: (id: number, payload: CascadeRenamePayload): Promise<StageMaster> =>
    request<StageMaster>(`/stage-masters/${id}/cascade-rename`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
