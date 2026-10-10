import { useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { useWorkflowParams } from './useWorkflowParams'
import { useGenerateAction } from './useGenerateAction'
import { useSnapshotActions } from './useSnapshotActions'
import { useAuditAction } from './useAuditAction'
import { useWorkflowUpload } from './useWorkflowUpload'
import { usePromptTranslation } from './usePromptTranslation'
import { useWorkflowManagement } from './useWorkflowManagement'
import { usePresetState } from './usePresetState'
import { useAssetSelectionState } from './useAssetSelectionState'
import { useGenerateDisplayState } from './useGenerateDisplayState'
import { useGeneratePageModals } from './useGeneratePageModals'
import { useGenerateKeyboardShortcuts } from './useImageNavigation'

export type { SnapshotSummaryWithParams } from './useGenerateDisplayState'

export function useGeneratePageState() {
  const store = useGenerationStore()
  const {
    clientId,
    selectedWorkflowId,
    setSelectedWorkflowId,
    paramValues,
    setParamValues,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    appliedAssets,
    addAppliedAsset,
    removeAppliedAsset,
    toggleAppliedAsset,
    setAppliedAssets,
    comfyUrl,
    setComfyUrl,
    sets,
    updateActiveSet,
    isConnected,
    isGenerating,
    progress,
    previewImage,
    activeClientId,
    activeBatch,
    activeSetId,
    addSet,
    removeSet,
    renameSet,
    toggleSetChecked,
    setAllSetsChecked,
    setActiveSetId,
    openPresetIds,
    openPreset,
    closePreset,
    fetchParamSyncGroups,
    fetchBypassProfiles,
  } = store

  useEffect(() => {
    if (selectedWorkflowId) {
      if (fetchParamSyncGroups) fetchParamSyncGroups(selectedWorkflowId)
      if (fetchBypassProfiles) fetchBypassProfiles(selectedWorkflowId)
    }
  }, [selectedWorkflowId, fetchParamSyncGroups, fetchBypassProfiles])

  // 1. Workflow Management
  const workflowMgmt = useWorkflowManagement({
    selectedWorkflowId,
    setSelectedWorkflowId,
  })

  // 2. Workflow Params & Actions
  const { loadSnapshotParams, handleSaveDefaultParams, handleResetDefaultParams, saveDefaultParamsMutation } =
    useWorkflowParams(workflowMgmt.workflow, selectedWorkflowId)

  // 3. Preset State & Operations
  const presetState = usePresetState({
    selectedWorkflowId,
    workflow: workflowMgmt.workflow,
  })

  const { handleGenerateSets } = useGenerateAction(
    workflowMgmt.workflow,
    workflowMgmt.comfyObjectInfo,
    { onBeforeGenerate: presetState.flushAutoSave }
  )

  const promptTranslation = usePromptTranslation({ paramValues, setParamValues })

  const snapshotActions = useSnapshotActions(selectedWorkflowId)
  const auditAction = useAuditAction()
  const uploadAction = useWorkflowUpload()

  // 4. Asset Selection & Snapshot Rebuild
  const assetSelection = useAssetSelectionState({
    setRoleCollapsed: workflowMgmt.setRoleCollapsed,
    loadSnapshotParams,
  })

  // 5. Display & Gallery State
  const displayState = useGenerateDisplayState({
    selectedWorkflowId,
  })

  // 6. Modals & Responsive State
  const modals = useGeneratePageModals()

  useGenerateKeyboardShortcuts({
    onGenerate: handleGenerateSets,
    onSave: () => snapshotActions.setIsSaveModalOpen(true),
    onOpenPreview: displayState.handleOpenModalPreview,
    hasSelectedImage: Boolean(selectedImg),
    modalOpen: Boolean(
      modals.rescanOpen || modals.isSettingsOpen || modals.isJobModalOpen || modals.isSceneGeneratorOpen ||
      snapshotActions.isSaveModalOpen || displayState.isModalPreviewOpen
    ),
  })

  return {
    ...modals,
    ...workflowMgmt,
    ...presetState,
    ...assetSelection,
    ...displayState,
    ...snapshotActions,
    ...auditAction,
    ...uploadAction,

    // Store properties
    store,
    clientId,
    selectedWorkflowId,
    setSelectedWorkflowId,
    paramValues,
    setParamValues,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    appliedAssets,
    addAppliedAsset,
    removeAppliedAsset,
    toggleAppliedAsset,
    setAppliedAssets,
    comfyUrl,
    setComfyUrl,
    sets,
    updateActiveSet,
    isConnected,
    isGenerating,
    progress,
    previewImage,
    activeClientId,
    activeBatch,
    activeSetId,
    addSet,
    removeSet,
    renameSet,
    toggleSetChecked,
    setAllSetsChecked,
    setActiveSetId,
    openPresetIds,
    openPreset,
    closePreset,

    // Action handlers
    promptTranslation,
    saveDefaultParamsMutation,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    handleGenerateSets,
  }
}
