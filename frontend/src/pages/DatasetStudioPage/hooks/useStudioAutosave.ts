import { useState, useEffect, useRef, useCallback } from 'react'
import type { DatasetProject, DatasetProjectUpdate, StudioSaveStatus } from '../../../api/types'
import { datasetApi } from '../../../api/client'
import {
  type DatasetStudioDraft,
  loadStudioDraft,
  saveStudioDraft,
  clearStudioDraft,
  markStudioDraftSynced,
} from '../utils/studioDraftStorage'
import { useStudioStore } from '../useStudioStore'

export interface StudioFormData {
  name: string
  character_trigger: string
  outfit_trigger: string
  workflow_id: number
  prompt_meta: string
  prompt_physical: string
  prompt_exclusive_outfit: string
  prompt_negative: string
  selected_alt_outfits: string
}

export interface UseStudioAutosaveProps {
  activeProject: DatasetProject | null
  formData: StudioFormData
  onProjectUpdated?: (project: DatasetProject) => void
  onDraftRestored?: (draft: DatasetStudioDraft) => void
  debounceMs?: number // デフォルト 750ms
}

export interface UseStudioAutosaveReturn {
  saveStatus: StudioSaveStatus
  hasConflict: boolean
  flushAutoSave: () => Promise<void>
  resolveConflictWithDraft: () => Promise<void>
  resolveConflictWithServer: () => void
  isRestoredFromDraft: boolean
  clearDraftStatus: () => void
}

function isFormDataEqual(a: StudioFormData, b: StudioFormData): boolean {
  return (
    a.name === b.name &&
    a.character_trigger === b.character_trigger &&
    a.outfit_trigger === b.outfit_trigger &&
    a.workflow_id === b.workflow_id &&
    a.prompt_meta === b.prompt_meta &&
    a.prompt_physical === b.prompt_physical &&
    a.prompt_exclusive_outfit === b.prompt_exclusive_outfit &&
    a.prompt_negative === b.prompt_negative &&
    a.selected_alt_outfits === b.selected_alt_outfits
  )
}

export function useStudioAutosave({
  activeProject,
  formData,
  onProjectUpdated,
  onDraftRestored,
  debounceMs = 750,
}: UseStudioAutosaveProps): UseStudioAutosaveReturn {
  const [saveStatus, setSaveStatusState] = useState<StudioSaveStatus>('idle')
  const [hasConflict, setHasConflict] = useState<boolean>(false)
  const [isRestoredFromDraft, setIsRestoredFromDraft] = useState<boolean>(false)

  const updateSaveStatus = useCallback((status: StudioSaveStatus) => {
    setSaveStatusState(status)
    try {
      useStudioStore.getState().setSaveStatus(status)
    } catch {
      // Store update fallback if store unmounted or mocked
    }
  }, [])

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevProjectIdRef = useRef<number | null>(activeProject?.id ?? null)
  const prevFormDataRef = useRef<StudioFormData>(formData)
  const isInitializedRef = useRef<boolean>(false)

  const formDataRef = useRef<StudioFormData>(formData)
  formDataRef.current = formData

  const activeProjectRef = useRef<DatasetProject | null>(activeProject)
  activeProjectRef.current = activeProject

  const onProjectUpdatedRef = useRef(onProjectUpdated)
  onProjectUpdatedRef.current = onProjectUpdated

  const onDraftRestoredRef = useRef(onDraftRestored)
  onDraftRestoredRef.current = onDraftRestored

  // Project change / initial mount effect for draft & conflict check
  useEffect(() => {
    const isNewProject =
      !isInitializedRef.current || prevProjectIdRef.current !== (activeProject?.id ?? null)

    if (isNewProject) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      prevProjectIdRef.current = activeProject?.id ?? null
      prevFormDataRef.current = formDataRef.current
      isInitializedRef.current = true

      if (!activeProject) {
        setHasConflict(false)
        setIsRestoredFromDraft(false)
        updateSaveStatus('idle')
        return
      }

      const draft = loadStudioDraft(activeProject.id)
      if (
        draft &&
        draft.base_server_updated_at &&
        activeProject.updated_at &&
        draft.base_server_updated_at !== activeProject.updated_at
      ) {
        setHasConflict(true)
        setIsRestoredFromDraft(false)
        updateSaveStatus('idle')
      } else if (
        draft &&
        activeProject.updated_at &&
        new Date(draft.updated_at).getTime() > new Date(activeProject.updated_at).getTime()
      ) {
        setHasConflict(false)
        setIsRestoredFromDraft(true)
        prevFormDataRef.current = {
          name: draft.name,
          character_trigger: draft.character_trigger,
          outfit_trigger: draft.outfit_trigger,
          workflow_id: draft.workflow_id,
          prompt_meta: draft.prompt_meta,
          prompt_physical: draft.prompt_physical,
          prompt_exclusive_outfit: draft.prompt_exclusive_outfit,
          prompt_negative: draft.prompt_negative,
          selected_alt_outfits: draft.selected_alt_outfits,
        }
        onDraftRestoredRef.current?.(draft)
        updateSaveStatus('idle')
      } else {
        setHasConflict(false)
        setIsRestoredFromDraft(false)
        updateSaveStatus('idle')
      }
    }
  }, [activeProject, updateSaveStatus])

  // formData change effect (triggering debounce autosave and sessionStorage write)
  useEffect(() => {
    if (!activeProject) {
      return
    }

    if (hasConflict) {
      prevFormDataRef.current = formData
      return
    }

    if (isFormDataEqual(prevFormDataRef.current, formData)) {
      return
    }

    prevFormDataRef.current = formData

    // AC-3: Immediately save to sessionStorage
    saveStudioDraft({
      projectId: activeProject.id,
      name: formData.name,
      character_trigger: formData.character_trigger,
      outfit_trigger: formData.outfit_trigger,
      workflow_id: formData.workflow_id,
      prompt_meta: formData.prompt_meta,
      prompt_physical: formData.prompt_physical,
      prompt_exclusive_outfit: formData.prompt_exclusive_outfit,
      prompt_negative: formData.prompt_negative,
      selected_alt_outfits: formData.selected_alt_outfits,
      updated_at: new Date().toISOString(),
      base_server_updated_at: activeProject.updated_at,
      is_synced: false,
    })

    updateSaveStatus('unsaved')

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(async () => {
      const currentProject = activeProjectRef.current
      if (!currentProject) return

      updateSaveStatus('saving')
      try {
        const payload: DatasetProjectUpdate = {
          name: formDataRef.current.name,
          character_trigger: formDataRef.current.character_trigger,
          outfit_trigger: formDataRef.current.outfit_trigger,
          workflow_id: formDataRef.current.workflow_id,
          prompt_meta: formDataRef.current.prompt_meta,
          prompt_physical: formDataRef.current.prompt_physical,
          prompt_exclusive_outfit: formDataRef.current.prompt_exclusive_outfit,
          prompt_negative: formDataRef.current.prompt_negative,
          selected_alt_outfits: formDataRef.current.selected_alt_outfits,
        }
        const res = await datasetApi.updateProject(currentProject.id, payload)
        updateSaveStatus('saved')
        markStudioDraftSynced(currentProject.id, res.updated_at)
        onProjectUpdatedRef.current?.(res)
      } catch (err) {
        console.warn('[useStudioAutosave] Auto-save failed:', err)
        updateSaveStatus('error')
      }
    }, debounceMs)
  }, [formData, activeProject, hasConflict, debounceMs, updateSaveStatus])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const flushAutoSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const currentProject = activeProjectRef.current
    if (!currentProject || hasConflict) {
      return
    }

    updateSaveStatus('saving')
    try {
      const payload: DatasetProjectUpdate = {
        name: formDataRef.current.name,
        character_trigger: formDataRef.current.character_trigger,
        outfit_trigger: formDataRef.current.outfit_trigger,
        workflow_id: formDataRef.current.workflow_id,
        prompt_meta: formDataRef.current.prompt_meta,
        prompt_physical: formDataRef.current.prompt_physical,
        prompt_exclusive_outfit: formDataRef.current.prompt_exclusive_outfit,
        prompt_negative: formDataRef.current.prompt_negative,
        selected_alt_outfits: formDataRef.current.selected_alt_outfits,
      }
      const res = await datasetApi.updateProject(currentProject.id, payload)
      updateSaveStatus('saved')
      markStudioDraftSynced(currentProject.id, res.updated_at)
      onProjectUpdatedRef.current?.(res)
    } catch (err) {
      console.warn('[useStudioAutosave] flushAutoSave failed:', err)
      updateSaveStatus('error')
    }
  }, [hasConflict, updateSaveStatus])

  const resolveConflictWithDraft = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const currentProject = activeProjectRef.current
    if (!currentProject) {
      return
    }

    const draft = loadStudioDraft(currentProject.id)
    const payload: DatasetProjectUpdate = draft
      ? {
          name: draft.name,
          character_trigger: draft.character_trigger,
          outfit_trigger: draft.outfit_trigger,
          workflow_id: draft.workflow_id,
          prompt_meta: draft.prompt_meta,
          prompt_physical: draft.prompt_physical,
          prompt_exclusive_outfit: draft.prompt_exclusive_outfit,
          prompt_negative: draft.prompt_negative,
          selected_alt_outfits: draft.selected_alt_outfits,
        }
      : {
          name: formDataRef.current.name,
          character_trigger: formDataRef.current.character_trigger,
          outfit_trigger: formDataRef.current.outfit_trigger,
          workflow_id: formDataRef.current.workflow_id,
          prompt_meta: formDataRef.current.prompt_meta,
          prompt_physical: formDataRef.current.prompt_physical,
          prompt_exclusive_outfit: formDataRef.current.prompt_exclusive_outfit,
          prompt_negative: formDataRef.current.prompt_negative,
          selected_alt_outfits: formDataRef.current.selected_alt_outfits,
        }

    prevFormDataRef.current = formDataRef.current

    updateSaveStatus('saving')
    try {
      const res = await datasetApi.updateProject(currentProject.id, payload)
      markStudioDraftSynced(currentProject.id, res.updated_at)
      setHasConflict(false)
      updateSaveStatus('saved')
      onProjectUpdatedRef.current?.(res)
    } catch (err) {
      console.warn('[useStudioAutosave] resolveConflictWithDraft failed:', err)
      updateSaveStatus('error')
    }
  }, [updateSaveStatus])

  const resolveConflictWithServer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const currentProject = activeProjectRef.current
    if (!currentProject) {
      return
    }

    clearStudioDraft(currentProject.id)
    setHasConflict(false)
    updateSaveStatus('idle')

    prevFormDataRef.current = {
      name: currentProject.name,
      character_trigger: currentProject.character_trigger,
      outfit_trigger: currentProject.outfit_trigger,
      workflow_id: currentProject.workflow_id,
      prompt_meta: currentProject.prompt_meta,
      prompt_physical: currentProject.prompt_physical,
      prompt_exclusive_outfit: currentProject.prompt_exclusive_outfit,
      prompt_negative: currentProject.prompt_negative ?? '',
      selected_alt_outfits: currentProject.selected_alt_outfits,
    }

    onProjectUpdatedRef.current?.(currentProject)
  }, [updateSaveStatus])

  const clearDraftStatus = useCallback(() => {
    setIsRestoredFromDraft(false)
  }, [])

  return {
    saveStatus,
    hasConflict,
    flushAutoSave,
    resolveConflictWithDraft,
    resolveConflictWithServer,
    isRestoredFromDraft,
    clearDraftStatus,
  }
}
