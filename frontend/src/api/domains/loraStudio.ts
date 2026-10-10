import { request } from '../core/base'
import type {
  Lora,
  ComfyLoraModel,
  Category,
  BaseModel,
  BaseModelCreate,
  CheckpointMapping,
  CheckpointMappingCreate,
  DatasetProject,
  DatasetProjectCreate,
  DatasetProjectUpdate,
  DatasetItem,
  DatasetItemUpdate,
  OutfitMasterPreset,
  DatasetExportRequest,
  DatasetExportResponse,
  LoraTrainingJob,
  LoraTrainingJobCreate,
  GenerateStressTestPromptsRequest,
  GenerateStressTestPromptsResponse,
  EvaluateBenchmarkRequest,
  EvaluateBenchmarkResponse,
} from '../types'

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

// 笏笏笏 Categories 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export const loraCategoriesApi = {
  list: () => request<Category[]>('/lora-categories'),
  create: (name: string) => request<Category>('/lora-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: number, name: string) => request<Category>('/lora-categories/' + id, { method: 'PUT', body: JSON.stringify({ name }) }),
  delete: (id: number) => request<void>(`/lora-categories/${id}`, { method: 'DELETE' }),
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

// ─── LoRA Studio / Dataset API ─────────────────────────────────────
export const datasetApi = {
  getProjects: () => request<DatasetProject[]>('/dataset/projects'),
  getProject: (projectId: number) => request<DatasetProject>(`/dataset/projects/${projectId}`),
  getItems: (projectId: number) => request<DatasetItem[]>(`/dataset/projects/${projectId}/items`),
  createProject: (data: DatasetProjectCreate) =>
    request<DatasetProject>('/dataset/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProject: (projectId: number, data: DatasetProjectUpdate) =>
    request<DatasetProject>(`/dataset/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProject: (projectId: number) =>
    request<{ message: string; id: number }>(`/dataset/projects/${projectId}`, {
      method: 'DELETE',
    }),
  getOutfitMasters: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : ''
    return request<OutfitMasterPreset[]>(`/dataset/outfits${qs}`)
  },
  calculateMatrix: (projectId: number) =>
    request<DatasetItem[]>(`/dataset/projects/${projectId}/matrix`, {
      method: 'POST',
    }),
  updateItem: (itemId: number, data: DatasetItemUpdate) =>
    request<DatasetItem>(`/dataset/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  exportDataset: (projectId: number, data?: DatasetExportRequest) =>
    request<DatasetExportResponse>(`/dataset/projects/${projectId}/export`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
}

// ─── LoRA Studio / Training API ────────────────────────────────────
export const trainingApi = {
  createJob: (data: LoraTrainingJobCreate) =>
    request<LoraTrainingJob>('/training/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getJob: (jobId: number) => request<LoraTrainingJob>(`/training/jobs/${jobId}`),
  startJob: (jobId: number) =>
    request<{ status: string; job_id: number; pid?: number }>(`/training/jobs/${jobId}/start`, {
      method: 'POST',
    }),
  stopJob: (jobId: number) =>
    request<{ status: string; job_id: number }>(`/training/jobs/${jobId}/stop`, {
      method: 'POST',
    }),
  getJobStatus: () => request<{ is_training_active: boolean }>('/training/status'),
}

// ─── LoRA Studio / Benchmark API ───────────────────────────────────
export const benchmarkApi = {
  generatePrompts: (data: GenerateStressTestPromptsRequest) =>
    request<GenerateStressTestPromptsResponse>('/benchmark/generate-prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  evaluate: (data: EvaluateBenchmarkRequest) =>
    request<EvaluateBenchmarkResponse>('/benchmark/evaluate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
