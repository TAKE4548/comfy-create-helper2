import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStudioAutosave, type StudioFormData } from '../useStudioAutosave'
import { datasetApi } from '../../../../api/client'
import {
  loadStudioDraft,
  saveStudioDraft,
  clearStudioDraft,
  type DatasetStudioDraft,
} from '../../utils/studioDraftStorage'
import { useStudioStore } from '../../useStudioStore'
import type { DatasetProject } from '../../../../api/types'

describe('useStudioAutosave', () => {
  const dummyProject: DatasetProject = {
    id: 10,
    name: 'Initial Project',
    character_trigger: '1girl',
    outfit_trigger: 'school uniform',
    workflow_id: 1,
    prompt_meta: 'masterpiece',
    prompt_physical: 'black hair',
    prompt_exclusive_outfit: 'skirt',
    prompt_negative: 'bad quality',
    selected_alt_outfits: '[]',
    created_at: '2026-10-07T10:00:00.000Z',
    updated_at: '2026-10-07T12:00:00.000Z',
    items_count: 5,
  }

  const initialFormData: StudioFormData = {
    name: 'Initial Project',
    character_trigger: '1girl',
    outfit_trigger: 'school uniform',
    workflow_id: 1,
    prompt_meta: 'masterpiece',
    prompt_physical: 'black hair',
    prompt_exclusive_outfit: 'skirt',
    prompt_negative: 'bad quality',
    selected_alt_outfits: '[]',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    useStudioStore.getState().resetStudio()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('immediately syncs to sessionStorage on edit and autosaves after 750ms debounce (AC-2, AC-3)', async () => {
    const updatedProject: DatasetProject = {
      ...dummyProject,
      name: 'Auto Saved Project',
      updated_at: '2026-10-07T12:05:00.000Z',
    }
    const updateProjectSpy = vi
      .spyOn(datasetApi, 'updateProject')
      .mockResolvedValue(updatedProject)

    const onProjectUpdated = vi.fn()

    const { result, rerender } = renderHook(
      (props) => useStudioAutosave(props),
      {
        initialProps: {
          activeProject: dummyProject,
          formData: initialFormData,
          onProjectUpdated,
        },
      }
    )

    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.hasConflict).toBe(false)

    const changedFormData: StudioFormData = {
      ...initialFormData,
      name: 'Auto Saved Project',
    }

    // Trigger formData change
    act(() => {
      rerender({
        activeProject: dummyProject,
        formData: changedFormData,
        onProjectUpdated,
      })
    })

    // AC-3: Instant local draft write
    expect(result.current.saveStatus).toBe('unsaved')
    expect(useStudioStore.getState().saveStatus).toBe('unsaved')
    const draft = loadStudioDraft(dummyProject.id)
    expect(draft).not.toBeNull()
    expect(draft?.name).toBe('Auto Saved Project')
    expect(draft?.is_synced).toBe(false)
    expect(draft?.base_server_updated_at).toBe(dummyProject.updated_at)

    // Ensure API has NOT been called yet before debounce elapsed
    expect(updateProjectSpy).not.toHaveBeenCalled()

    // Fast forward by 740ms (should not fire yet)
    act(() => {
      vi.advanceTimersByTime(740)
    })
    expect(updateProjectSpy).not.toHaveBeenCalled()

    // Fast forward remaining 10ms to reach 750ms
    await act(async () => {
      vi.advanceTimersByTime(10)
    })

    // AC-2, AC-5: Sent and marked synced
    expect(updateProjectSpy).toHaveBeenCalledTimes(1)
    expect(updateProjectSpy).toHaveBeenCalledWith(dummyProject.id, changedFormData)
    expect(result.current.saveStatus).toBe('saved')
    expect(useStudioStore.getState().saveStatus).toBe('saved')
    expect(onProjectUpdated).toHaveBeenCalledWith(updatedProject)

    const syncedDraft = loadStudioDraft(dummyProject.id)
    expect(syncedDraft?.is_synced).toBe(true)
    expect(syncedDraft?.base_server_updated_at).toBe(updatedProject.updated_at)
  })

  it('transitions to error status and retains draft in sessionStorage on API error (AC-2, Red Team 2)', async () => {
    vi.spyOn(datasetApi, 'updateProject').mockRejectedValue(new Error('Network error'))

    const { result, rerender } = renderHook(
      (props) => useStudioAutosave(props),
      {
        initialProps: {
          activeProject: dummyProject,
          formData: initialFormData,
        },
      }
    )

    act(() => {
      rerender({
        activeProject: dummyProject,
        formData: { ...initialFormData, name: 'Failed Save Draft' },
      })
    })

    expect(result.current.saveStatus).toBe('unsaved')

    await act(async () => {
      vi.advanceTimersByTime(750)
    })

    expect(result.current.saveStatus).toBe('error')
    expect(useStudioStore.getState().saveStatus).toBe('error')

    // Draft is retained and not removed
    const draft = loadStudioDraft(dummyProject.id)
    expect(draft).not.toBeNull()
    expect(draft?.name).toBe('Failed Save Draft')
    expect(draft?.is_synced).toBe(false)
  })

  it('restores newer draft on mount and skips restoration for older draft (AC-4, Red Team 4)', () => {
    const onDraftRestored = vi.fn()

    // 1. Case with newer draft
    const newerDraft: DatasetStudioDraft = {
      projectId: dummyProject.id,
      name: 'Restored Newer Name',
      character_trigger: '1girl',
      outfit_trigger: 'school uniform',
      workflow_id: 1,
      prompt_meta: 'meta',
      prompt_physical: 'physical',
      prompt_exclusive_outfit: 'outfit',
      prompt_negative: 'neg',
      selected_alt_outfits: '[]',
      updated_at: '2026-10-07T13:00:00.000Z', // Newer than dummyProject.updated_at (12:00:00)
      base_server_updated_at: dummyProject.updated_at,
      is_synced: false,
    }
    saveStudioDraft(newerDraft)

    const { result, unmount } = renderHook(() =>
      useStudioAutosave({
        activeProject: dummyProject,
        formData: initialFormData,
        onDraftRestored,
      })
    )

    expect(onDraftRestored).toHaveBeenCalledTimes(1)
    expect(onDraftRestored).toHaveBeenCalledWith(newerDraft)
    expect(result.current.isRestoredFromDraft).toBe(true)

    // Clear draft status test
    act(() => {
      result.current.clearDraftStatus()
    })
    expect(result.current.isRestoredFromDraft).toBe(false)

    unmount()
    clearStudioDraft(dummyProject.id)
    onDraftRestored.mockClear()

    // 2. Case with older draft (updated_at <= server updated_at)
    const olderDraft: DatasetStudioDraft = {
      ...newerDraft,
      updated_at: '2026-10-07T11:00:00.000Z', // Older than dummyProject.updated_at (12:00:00)
    }
    saveStudioDraft(olderDraft)

    const { result: olderResult } = renderHook(() =>
      useStudioAutosave({
        activeProject: dummyProject,
        formData: initialFormData,
        onDraftRestored,
      })
    )

    expect(onDraftRestored).not.toHaveBeenCalled()
    expect(olderResult.current.isRestoredFromDraft).toBe(false)
  })

  it('detects conflict when base_server_updated_at differs, halts autosave, and resolves via draft or server (Red Team 5)', async () => {
    const conflictingDraft: DatasetStudioDraft = {
      projectId: dummyProject.id,
      name: 'Conflict Draft Name',
      character_trigger: '1girl',
      outfit_trigger: 'school uniform',
      workflow_id: 1,
      prompt_meta: 'meta',
      prompt_physical: 'physical',
      prompt_exclusive_outfit: 'outfit',
      prompt_negative: 'neg',
      selected_alt_outfits: '[]',
      updated_at: '2026-10-07T13:00:00.000Z',
      base_server_updated_at: '2026-10-07T11:00:00.000Z', // Different from dummyProject.updated_at (12:00:00)
      is_synced: false,
    }
    saveStudioDraft(conflictingDraft)

    const updateProjectSpy = vi.spyOn(datasetApi, 'updateProject').mockResolvedValue({
      ...dummyProject,
      name: 'Conflict Draft Name',
      updated_at: '2026-10-07T14:00:00.000Z',
    })

    const onProjectUpdated = vi.fn()

    const { result, rerender } = renderHook(
      (props) => useStudioAutosave(props),
      {
        initialProps: {
          activeProject: dummyProject,
          formData: initialFormData,
          onProjectUpdated,
        },
      }
    )

    // Red Team 5: Conflict detected on initial check
    expect(result.current.hasConflict).toBe(true)

    // Form edit while in conflict must NOT trigger autosave
    act(() => {
      rerender({
        activeProject: dummyProject,
        formData: { ...initialFormData, name: 'Attempted Edit In Conflict' },
        onProjectUpdated,
      })
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(updateProjectSpy).not.toHaveBeenCalled()

    // Test resolveConflictWithDraft: forces draft update
    await act(async () => {
      await result.current.resolveConflictWithDraft()
    })

    expect(updateProjectSpy).toHaveBeenCalledTimes(1)
    expect(updateProjectSpy).toHaveBeenCalledWith(dummyProject.id, {
      name: 'Conflict Draft Name',
      character_trigger: '1girl',
      outfit_trigger: 'school uniform',
      workflow_id: 1,
      prompt_meta: 'meta',
      prompt_physical: 'physical',
      prompt_exclusive_outfit: 'outfit',
      prompt_negative: 'neg',
      selected_alt_outfits: '[]',
    })
    expect(result.current.hasConflict).toBe(false)
    expect(result.current.saveStatus).toBe('saved')
  })

  it('resolves conflict with server by clearing draft and resetting form to server data (Red Team 5)', () => {
    const conflictingDraft: DatasetStudioDraft = {
      projectId: dummyProject.id,
      name: 'Conflict Draft Name',
      character_trigger: '1girl',
      outfit_trigger: 'school uniform',
      workflow_id: 1,
      prompt_meta: 'meta',
      prompt_physical: 'physical',
      prompt_exclusive_outfit: 'outfit',
      prompt_negative: 'neg',
      selected_alt_outfits: '[]',
      updated_at: '2026-10-07T13:00:00.000Z',
      base_server_updated_at: '2026-10-07T11:00:00.000Z',
      is_synced: false,
    }
    saveStudioDraft(conflictingDraft)

    const onProjectUpdated = vi.fn()

    const { result } = renderHook(() =>
      useStudioAutosave({
        activeProject: dummyProject,
        formData: initialFormData,
        onProjectUpdated,
      })
    )

    expect(result.current.hasConflict).toBe(true)

    // Resolve conflict with server
    act(() => {
      result.current.resolveConflictWithServer()
    })

    expect(result.current.hasConflict).toBe(false)
    expect(loadStudioDraft(dummyProject.id)).toBeNull()
    expect(onProjectUpdated).toHaveBeenCalledWith(dummyProject)
  })

  it('flushAutoSave cancels pending timer and immediately persists changes', async () => {
    const updateProjectSpy = vi.spyOn(datasetApi, 'updateProject').mockResolvedValue({
      ...dummyProject,
      name: 'Flushed Immediately',
      updated_at: '2026-10-07T12:10:00.000Z',
    })

    const { result, rerender } = renderHook(
      (props) => useStudioAutosave(props),
      {
        initialProps: {
          activeProject: dummyProject,
          formData: initialFormData,
        },
      }
    )

    act(() => {
      rerender({
        activeProject: dummyProject,
        formData: { ...initialFormData, name: 'Flushed Immediately' },
      })
    })

    expect(updateProjectSpy).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.flushAutoSave()
    })

    expect(updateProjectSpy).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('saved')
  })
})
