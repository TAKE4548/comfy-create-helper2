import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveStudioDraft,
  loadStudioDraft,
  clearStudioDraft,
  markStudioDraftSynced,
  saveActiveProjectId,
  loadActiveProjectId,
  getDraftStorageKey,
  DRAFT_STORAGE_PREFIX,
  ACTIVE_PROJECT_ID_KEY,
  type DatasetStudioDraft,
} from '../studioDraftStorage'

describe('studioDraftStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  const dummyDraft: DatasetStudioDraft = {
    projectId: 123,
    name: 'Test Project',
    character_trigger: '1girl',
    outfit_trigger: 'school uniform',
    workflow_id: 1,
    prompt_meta: 'masterpiece',
    prompt_physical: 'blue eyes',
    prompt_exclusive_outfit: 'pleated skirt',
    prompt_negative: 'worst quality',
    selected_alt_outfits: '[]',
    updated_at: '2026-10-07T12:00:00.000Z',
    base_server_updated_at: '2026-10-07T11:00:00.000Z',
    is_synced: false,
  }

  it('generates correct storage key with prefix', () => {
    expect(getDraftStorageKey(123)).toBe(DRAFT_STORAGE_PREFIX + '123')
  })

  it('saves and loads a studio draft accurately', () => {
    saveStudioDraft(dummyDraft)

    const loaded = loadStudioDraft(123)
    expect(loaded).toEqual(dummyDraft)
  })

  it('returns null when loading non-existent draft or corrupt JSON', () => {
    expect(loadStudioDraft(999)).toBeNull()

    sessionStorage.setItem(getDraftStorageKey(999), '{invalid json')
    expect(loadStudioDraft(999)).toBeNull()
  })

  it('clears draft from sessionStorage', () => {
    saveStudioDraft(dummyDraft)
    expect(loadStudioDraft(123)).not.toBeNull()

    clearStudioDraft(123)
    expect(loadStudioDraft(123)).toBeNull()
  })

  it('marks draft as synced and updates base_server_updated_at if provided', () => {
    saveStudioDraft(dummyDraft)

    markStudioDraftSynced(123, '2026-10-07T13:00:00.000Z')

    const updated = loadStudioDraft(123)
    expect(updated).not.toBeNull()
    expect(updated?.is_synced).toBe(true)
    expect(updated?.base_server_updated_at).toBe('2026-10-07T13:00:00.000Z')
  })

  it('saves and loads active project ID correctly', () => {
    saveActiveProjectId(456)
    expect(loadActiveProjectId()).toBe(456)

    saveActiveProjectId(null)
    expect(loadActiveProjectId()).toBeNull()
    expect(sessionStorage.getItem(ACTIVE_PROJECT_ID_KEY)).toBeNull()
  })

  describe('Exception safety & QuotaExceededError handling (Red Team 1)', () => {
    it('does not throw when sessionStorage.setItem encounters QuotaExceededError', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        throw err
      })

      expect(() => {
        saveStudioDraft(dummyDraft)
      }).not.toThrow()

      expect(warnSpy).toHaveBeenCalled()
    })

    it('does not throw when sessionStorage.getItem throws security or access errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Access denied to sessionStorage')
      })

      expect(() => {
        const result = loadStudioDraft(123)
        expect(result).toBeNull()
      }).not.toThrow()

      expect(warnSpy).toHaveBeenCalled()
    })

    it('does not throw when clearStudioDraft or saveActiveProjectId encounters errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage disabled')
      })

      expect(() => {
        clearStudioDraft(123)
      }).not.toThrow()

      expect(() => {
        saveActiveProjectId(null)
      }).not.toThrow()

      expect(warnSpy).toHaveBeenCalled()
    })
  })
})
