/**
 * API client for Prompt Surgeon FastAPI backend
 */

const BASE_URL = 'http://localhost:8000/api'

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
  list: () => request('/workflows'),
  get: (id: number) => request(`/workflows/${id}`),
  create: (data: unknown) => request('/workflows', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/workflows/${id}`, { method: 'DELETE' }),
  scan: (json_body: unknown) => request('/workflows/scan', { method: 'POST', body: JSON.stringify({ json_body }) }),
}

// ─── Mapping Masters ────────────────────────────────────────────
export const mappingMastersApi = {
  list: () => request('/mapping-masters'),
  create: (data: unknown) => request('/mapping-masters', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/mapping-masters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/mapping-masters/${id}`, { method: 'DELETE' }),
}

// ─── Snapshots ──────────────────────────────────────────────────
export const snapshotsApi = {
  list: (workflow_id?: number) => request(`/snapshots${workflow_id ? `?workflow_id=${workflow_id}` : ''}`),
  get: (id: number) => request(`/snapshots/${id}`),
  create: (data: unknown) => request('/snapshots', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/snapshots/${id}`, { method: 'DELETE' }),
}

// ─── Albums ─────────────────────────────────────────────────────
export const albumsApi = {
  list: () => request('/albums'),
  get: (id: number) => request(`/albums/${id}`),
  create: (data: unknown) => request('/albums', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id: number, snapshot_ids: number[]) =>
    request(`/albums/${id}/order`, { method: 'PUT', body: JSON.stringify({ snapshot_ids }) }),
  delete: (id: number) => request(`/albums/${id}`, { method: 'DELETE' }),
}

// ─── LoRAs ──────────────────────────────────────────────────────
export const lorasApi = {
  list: (category_id?: number) => request(`/loras${category_id ? `?category_id=${category_id}` : ''}`),
  create: (data: unknown) => request('/loras', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/loras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/loras/${id}`, { method: 'DELETE' }),
}

// ─── Tag Sets ───────────────────────────────────────────────────
export const tagSetsApi = {
  list: (category_id?: number) => request(`/tag-sets${category_id ? `?category_id=${category_id}` : ''}`),
  create: (data: unknown) => request('/tag-sets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) => request(`/tag-sets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/tag-sets/${id}`, { method: 'DELETE' }),
}

// ─── Categories ─────────────────────────────────────────────────
export const loraCategoriesApi = {
  list: () => request('/lora-categories'),
  create: (name: string) => request('/lora-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  delete: (id: number) => request(`/lora-categories/${id}`, { method: 'DELETE' }),
}

export const tagsetCategoriesApi = {
  list: () => request('/tagset-categories'),
  create: (name: string) => request('/tagset-categories', { method: 'POST', body: JSON.stringify({ name }) }),
  delete: (id: number) => request(`/tagset-categories/${id}`, { method: 'DELETE' }),
}

// ─── LLM Audit ──────────────────────────────────────────────────
export const auditApi = {
  run: (data: unknown) => request('/audit', { method: 'POST', body: JSON.stringify(data) }),
}

// ─── LLM Prompts ────────────────────────────────────────────────
export const llmPromptsApi = {
  list: () => request('/llm-prompts'),
  update: (key: string, data: unknown) => request(`/llm-prompts/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
}
