export interface DatasetStudioDraft {
  projectId: number
  name: string
  character_trigger: string
  outfit_trigger: string
  workflow_id: number
  prompt_meta: string
  prompt_physical: string
  prompt_exclusive_outfit: string
  prompt_negative: string
  selected_alt_outfits: string // JSON 文字列
  updated_at: string // ISO-8601 文字列 (下書き更新日時)
  base_server_updated_at?: string // 編集開始時のサーバー更新日時 (楽観的ロック・競合判定用)
  is_synced: boolean
}

export const DRAFT_STORAGE_PREFIX = 'dataset_studio_draft_'
export const ACTIVE_PROJECT_ID_KEY = 'dataset_studio_active_project_id'

export function getDraftStorageKey(projectId: number): string {
  return `${DRAFT_STORAGE_PREFIX}${projectId}`
}

export function saveStudioDraft(draft: DatasetStudioDraft): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return
    }
    const key = getDraftStorageKey(draft.projectId)
    const serialized = JSON.stringify(draft)
    sessionStorage.setItem(key, serialized)
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to save studio draft to sessionStorage:', err)
  }
}

export function loadStudioDraft(projectId: number): DatasetStudioDraft | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null
    }
    const key = getDraftStorageKey(projectId)
    const raw = sessionStorage.getItem(key)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as DatasetStudioDraft
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to load studio draft from sessionStorage:', err)
    return null
  }
}

export function clearStudioDraft(projectId: number): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return
    }
    const key = getDraftStorageKey(projectId)
    sessionStorage.removeItem(key)
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to clear studio draft from sessionStorage:', err)
  }
}

export function markStudioDraftSynced(projectId: number, serverUpdatedAt?: string): void {
  try {
    const existing = loadStudioDraft(projectId)
    if (!existing) {
      return
    }
    existing.is_synced = true
    if (serverUpdatedAt) {
      existing.base_server_updated_at = serverUpdatedAt
    }
    saveStudioDraft(existing)
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to mark draft as synced:', err)
  }
}

export function saveActiveProjectId(projectId: number | null): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return
    }
    if (projectId === null || projectId === undefined || isNaN(projectId)) {
      sessionStorage.removeItem(ACTIVE_PROJECT_ID_KEY)
    } else {
      sessionStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(projectId))
    }
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to save active project ID to sessionStorage:', err)
  }
}

export function loadActiveProjectId(): number | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null
    }
    const raw = sessionStorage.getItem(ACTIVE_PROJECT_ID_KEY)
    if (!raw) {
      return null
    }
    const parsed = parseInt(raw, 10)
    return isNaN(parsed) ? null : parsed
  } catch (err) {
    console.warn('[studioDraftStorage] Failed to load active project ID from sessionStorage:', err)
    return null
  }
}
