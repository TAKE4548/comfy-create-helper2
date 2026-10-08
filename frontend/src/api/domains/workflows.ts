import { request } from '../core/base'
import type {
  Workflow,
  WorkflowSummary,
  WorkflowPreset,
  WorkflowPresetCreate,
  WorkflowPresetUpdate,
  BypassProfile,
  BypassProfileCreate,
  BypassProfileUpdate,
  ParamSyncGroup,
  ParamSyncGroupCreate,
  ParamSyncGroupUpdate,
  MappingMasterUsage,
  ParamTypeMaster,
  ParamTypeMasterCreate,
  DiffAnalyzeResponse,
  WorkflowRollbackResponse,
  WorkflowHistoryStatusResponse,
} from '../types'

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

// 笏笏笏 ParamTypeMaster 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const paramTypeMastersApi = {
  list: () => request<ParamTypeMaster[]>('/param-type-masters'),
  create: (data: ParamTypeMasterCreate) =>
    request<ParamTypeMaster>('/param-type-masters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: ParamTypeMasterCreate) =>
    request<ParamTypeMaster>(`/param-type-masters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/param-type-masters/${id}`, { method: 'DELETE' }),
}
