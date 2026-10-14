import { useState, useEffect, useCallback } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { useAppLifecycleSync } from '../../../hooks/useAppLifecycleSync'
import {
  Library, Loader2, Redo2, ImageOff, Download, Plus, Undo2, X,
  ChevronRight, ChevronDown, Zap, Camera, AlertTriangle
} from 'lucide-react'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'
import { PageHeader } from '../../../components/common/PageHeader'
import { WorkflowActionsMenu } from './WorkflowActionsMenu'
import { AddAssetModal } from './AddAssetModal'
import { AppliedAssetChips } from './AppliedAssetChips'
import { AuditPanel } from './AuditPanel'
import { MappingErrorPanel } from './MappingErrorPanel'
import { ParamPanel } from './ParamPanel'
import { TagChipEditor } from '../../../components/TagChipEditor'
import { PromptSectionClipboardMenu } from './PromptSectionClipboardMenu'
import { GenerateModalsOverlay } from '../sections/GenerateModalsOverlay'
import { GenerationGallerySection } from '../sections/GenerationGallerySection'
import { generateNextProfileName } from '../../../utils/profileUtils'
import { useSystemStats } from '../../../hooks/useSystemStats'
import { selectProgress, selectWait } from '../../../utils/generationSelectors'

import { useGalleryInteraction } from '../hooks/useGalleryInteraction'

type StateProps = ReturnType<typeof useGeneratePageState>

export const MobileLayout = ({
  state,
}: {
  state: StateProps
}) => {
  useSystemStats()
  const {
    isConnected, isGenerating, progress, previewImage,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    selectedImg, setSelectedImg,
    appliedAssets,
    addAppliedAsset,
    toggleAppliedAsset, removeAppliedAsset,
    activeBatch,
    sets, activeSetId, removeSet,
    toggleSetChecked,
    openPresetIds, undo, redo, canUndo, canRedo,
    
    // state properties
    activePromptTab, setActivePromptTab,
    setRescanOpen,
    selectedMasters, setSelectedMasters,
    openAddAssetRole, setOpenAddAssetRole,
    setModalPreviewIndex,
    setIsModalPreviewOpen,
    setIsJobModalOpen,
    setIsPresetManagerOpen,
    handleSelectPresetTab,
    baseModels,
    updateWorkflowBaseModelMutation,
    setWorkflowManageMode,
    
    // queries & derived state
    workflows,
    workflow,
    mappingMasters,
    loras,
    paramTypeMasters,
    tagSets,
    presets,
    comfyObjectInfo,
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
    setIsSaveModalOpen,
    auditOpen, setAuditOpen,
    auditIntent, setAuditIntent,
    auditTypes, setAuditTypes,
    auditResult, auditStatus, runAudit,
    dragOver, handleFileSelect, handleDragOver, handleDragLeave, handleDrop,
    isGeneratingHere,
    isOtherSessionGenerating,
    allQueueCount,
    totalQueueCount,
    showStrip, invalidMappings, textMappings, paramMappings,
    
    // handlers
    handleLoadSnapshot,
    handleUpdateMapping,
    handleOpenModalPreview,
    handleGenerateSets,
    getIsRoleCollapsed,
    setRoleCollapsed,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    saveDefaultParamsMutation,
    updateWorkflowMutation,
    isAnimaMode,
    setIsAnimaMode,
    promptTranslation,
  } = state

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | number>('default')
  const [saveAsTagSetRole, setSaveAsTagSetRole] = useState<string | null>(null)

  const nodeProgress = useGenerationStore((state) => state.nodeProgress)
  const generationSnapshot = useGenerationStore((state) => state.generationSnapshot)
  const generationSyncIssue = useGenerationStore((state) => state.generationSyncIssue)
  const filterOwnSession = useGenerationStore((state) => state.filterOwnSession)
  const generationClientId = useGenerationStore((state) => state.clientId)
  const currentNode = useGenerationStore((state) => state.currentNode)
  const generationStartTime = useGenerationStore((state) => state.generationStartTime)
  const bypassProfiles = useGenerationStore((state) => state.bypassProfiles)
  const updateBypassProfile = useGenerationStore((state) => state.updateBypassProfile)
  const fetchBypassProfiles = useGenerationStore((state) => state.fetchBypassProfiles)
  const paramSyncGroups = useGenerationStore((state) => state.paramSyncGroups)
  const toggleParamSyncGroup = useGenerationStore((state) => state.toggleParamSyncGroup)
  const errorToast = useGenerationStore((state) => state.errorToast)
  const setErrorToast = useGenerationStore((state) => state.setErrorToast)
  const promptChips = useGenerationStore((state) => state.promptChips)
  const setPromptChips = useGenerationStore((state) => state.setPromptChips)
  const roleTextModes = useGenerationStore((state) => state.roleTextModes)
  const setRoleTextMode = useGenerationStore((state) => state.setRoleTextMode)
  const vramWaitStatus = useGenerationStore((state) => state.vramWaitStatus)
  const cancelVramWait = useGenerationStore((state) => state.cancelVramWait)

  useAppLifecycleSync({ debounceMs: 0 })

  const [isInputFocused, setIsInputFocused] = useState(false)

  const isTextInput = (target: unknown): target is HTMLElement => {
    if (!target || !(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    if (tag === 'textarea' || target.isContentEditable) return true
    if (tag === 'input') {
      const type = (target as HTMLInputElement).type?.toLowerCase()
      return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes(type || '')
    }
    return false
  }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const handleFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target)) {
        setIsInputFocused(true)
      }
    }

    const handleFocusOut = (e: FocusEvent) => {
      if (!isTextInput(e.relatedTarget)) {
        setIsInputFocused(false)
      }
    }

    const handleOrientationOrResize = () => {
      const activeEl = document.activeElement
      if (!isTextInput(activeEl)) {
        setIsInputFocused(false)
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    window.addEventListener('orientationchange', handleOrientationOrResize)
    window.addEventListener('resize', handleOrientationOrResize)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleOrientationOrResize)
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      window.removeEventListener('orientationchange', handleOrientationOrResize)
      window.removeEventListener('resize', handleOrientationOrResize)
      if (vv) {
        vv.removeEventListener('resize', handleOrientationOrResize)
      }
    }
  }, [])

  const handleChipsChange = useCallback((role: string, chips: any) => {
    setPromptChips(role, chips)
  }, [setPromptChips])

  const [isBypassSettingsOpen, setIsBypassSettingsOpen] = useState(false)
  const [isParamSyncSettingsOpen, setIsParamSyncSettingsOpen] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [mobileSegment, setMobileSegment] = useState<'prompt' | 'parameters' | 'history'>('prompt')
  const [isCompactPreview, setIsCompactPreview] = useState(true)

  const gallery = useGalleryInteraction({
    isMobile: true,
    selectedImg,
    setSelectedImg,
    multiSelect: {
      isMultiSelectMode,
      selectedIds,
      enterMultiSelectMode: () => {},
      exitMultiSelectMode,
      handleItemClick,
      toggleItem: () => {},
      selectAll,
      clearSelection,
      isSelected,
      getLongPressHandlers,
    },
    onOpenModalPreview: (i) => {
      setModalPreviewIndex(i)
      setIsModalPreviewOpen(true)
    },
    onLoadSnapshot: handleLoadSnapshot,
  })

  useEffect(() => {
    if (selectedWorkflowId !== null && typeof fetchBypassProfiles === 'function') {
      fetchBypassProfiles(selectedWorkflowId)
    }
  }, [selectedWorkflowId, fetchBypassProfiles])

  useEffect(() => {
    if (errorToast && errorToast.persistent !== true && typeof setErrorToast === 'function') {
      const timer = setTimeout(() => {
        setErrorToast(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [errorToast, setErrorToast])

  const normalSessionId = filterOwnSession ? generationClientId : null
  const normalProgress = generationSnapshot
    ? selectProgress(generationSnapshot, 'normal', normalSessionId)
    : null
  const normalJobs = generationSnapshot?.normal_group_id
    ? generationSnapshot.jobs.filter((job) => job.scope === 'normal' && job.normal_group_id === generationSnapshot.normal_group_id && (normalSessionId === null || job.session_id === normalSessionId))
    : []
  const normalRunningJob = normalJobs.find((job) => job.status === 'running')
  const normalUnfinished = normalJobs.some((job) => ['queued', 'submitting', 'running', 'unconfirmed'].includes(job.status))
  const normalWait = generationSnapshot && normalUnfinished && !normalRunningJob
    ? selectWait(generationSnapshot, 'normal', normalSessionId)
    : null
  const managedNodePercentage = normalRunningJob?.node && normalRunningJob.node.max > 0
    ? Math.min(100, Math.max(0, (normalRunningJob.node.value / normalRunningJob.node.max) * 100))
    : 0
  const managedStartTime = normalRunningJob?.started_at ? Date.parse(normalRunningJob.started_at) : NaN
  const managedElapsedTime = Number.isFinite(managedStartTime) ? Math.max(0, Math.floor((Date.now() - managedStartTime) / 1000)) : elapsedTime
  useEffect(() => {
    const startTime = Number.isFinite(managedStartTime) ? managedStartTime : generationStartTime
    if (!startTime) { setElapsedTime(0); return }
    const update = () => setElapsedTime(Math.max(0, Math.floor((Date.now() - startTime) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [managedStartTime, generationStartTime])
  const displayProgressActive = generationSnapshot ? (normalUnfinished && normalWait?.kind !== 'session') : isGeneratingHere
  const displayNodeName = generationSnapshot ? (normalRunningJob?.node?.name || (normalWait ? `${normalWait.label} 待機中 (${normalWait.remaining})` : '準備中...')) : currentNode?.name || '準備中...'
  const displayNodePercentage = generationSnapshot ? managedNodePercentage : nodeProgress?.percentage || 0
  const displayElapsedTime = generationSnapshot ? managedElapsedTime : elapsedTime
  const batchProgress = (() => {
    if (!activeBatch || activeBatch.length === 0) {
      return {
        percentage: progress ? progress.percentage : 0,
        text: 'Generating...'
      }
    }
    const n = activeBatch.length
    const finished = activeBatch.filter((j: any) => j.status === 'completed' || j.status === 'failed').length
    const hasGenerating = activeBatch.some((j: any) => j.status === 'generating')
    
    const currentFraction = (hasGenerating && progress && progress.max > 0)
      ? (progress.value / progress.max)
      : 0
      
    const rawPercentage = ((finished + currentFraction) / n) * 100
    const percentage = Math.min(100, Math.max(0, Math.round(rawPercentage)))
    
    return {
      percentage,
      text: `Generating (${finished}/${n} Complete)...`
    }
  })()

  const finishedBatchCount = activeBatch ? activeBatch.filter((j: any) => j.status === 'completed' || j.status === 'failed').length : 0
  const hasGeneratingJob = activeBatch ? activeBatch.some((j: any) => j.status === 'generating') : isGeneratingHere
  const totalBatchCount = activeBatch ? activeBatch.length : 1
  const currentBatchItemNumber = hasGeneratingJob ? Math.min(totalBatchCount, finishedBatchCount + 1) : Math.min(totalBatchCount, finishedBatchCount)

  const overallPercentage = isGeneratingHere ? batchProgress.percentage : 0
  const etaProgress = generationSnapshot
    ? (normalProgress?.fraction ?? 0) * 100
    : overallPercentage
  const etaElapsedTime = generationSnapshot ? managedElapsedTime : elapsedTime
  const etaElapsedKnown = generationSnapshot ? Boolean(normalRunningJob?.started_at) : Boolean(generationStartTime)
  const eta = (etaElapsedKnown && etaProgress > 0 && etaElapsedTime > 0)
    ? Math.round(etaElapsedTime * (100 - etaProgress) / etaProgress)
    : null

  const renderUploadZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('workflow-file-input')?.click()}
      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all min-h-[300px] ${
        dragOver
          ? 'border-accent-green bg-accent-green/5 text-zinc-200'
          : 'border-[rgba(255,255,255,0.15)] hover:border-accent-green/50 hover:bg-white/5 text-zinc-450'
      }`}
    >
      <input
        id="workflow-file-input"
        type="file"
        accept=".json"
        onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }}
        className="hidden"
      />
      <Plus size={36} className="text-zinc-500 mb-3 hover:text-accent-green transition-colors" />
      <p className="text-sm font-medium text-zinc-300 mb-1">ワークフロー JSON ファイルをドラッグ＆ドロップ</p>
      <p className="text-xs text-zinc-500">またはクリックしてファイルを選択してください (.json)</p>
    </div>
  )

  const activeSet = sets.find((s) => String(s.id) === String(activeSetId))
  const activePromptTabMapping = textMappings.find((m) => m.role === activePromptTab)
  const isCollapsed = activePromptTabMapping ? getIsRoleCollapsed(activePromptTabMapping.role!) : true
  const isNegative = activePromptTabMapping?.role?.toLowerCase().includes('negative')

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-y-auto overscroll-contain overscroll-y-contain scroll-pb-[calc(54px+env(safe-area-inset-bottom)+72px)] pb-[calc(54px+env(safe-area-inset-bottom)+72px)] bg-surface relative w-full"
      style={{ overscrollBehaviorY: 'contain' }}
      onFocus={(e) => {
        if (isTextInput(e.target)) {
          setIsInputFocused(true)
        }
      }}
      onBlur={(e) => {
        if (!isTextInput(e.relatedTarget)) {
          setIsInputFocused(false)
        }
      }}
    >
      {/* PageHeader (Tier 1: Title + status + VRAM pill + Kebab menu, Tier 2: actions) */}
      <PageHeader
        title="Generate"
        icon={Zap}
        actions={
          <div className="flex items-center gap-2 w-full">
            <select
              id="workflow-select-mobile"
              value={selectedWorkflowId ?? ''}
              onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
              className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 truncate min-w-[140px]"
            >
              <option value="">新しいワークフローを追加 (Upload New...)</option>
              {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <WorkflowActionsMenu
              workflowId={selectedWorkflowId}
              workflow={workflow}
              baseModels={baseModels}
              onSaveDefaults={handleSaveDefaultParams}
              isSavePending={saveDefaultParamsMutation.isPending}
              onResetDefaults={handleResetDefaultParams}
              onUpdateBaseModel={(baseModelId) => {
                if (selectedWorkflowId) {
                  updateWorkflowBaseModelMutation?.mutate({ id: selectedWorkflowId, target_base_model_id: baseModelId })
                }
              }}
              onRenameWorkflow={() => setWorkflowManageMode?.('rename')}
              onDuplicateWorkflow={() => setWorkflowManageMode?.('copy')}
              onRescanNodes={() => setRescanOpen?.(true)}
            />
            {selectedWorkflowId && (
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer select-none bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors shrink-0">
                <input
                  id="anima-mode-toggle-mobile"
                  type="checkbox"
                  checked={isAnimaMode}
                  onChange={(e) => setIsAnimaMode(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#7C6FDD] rounded border-zinc-800"
                />
                <span>Anima特化</span>
              </label>
            )}
          </div>
        }
      />

      {/* Compact progress stays visible below the scrolling header. */}
      <div data-testid="mobile-progress-line" className="sticky top-0 z-40 h-6 min-h-6 bg-surface-2/95 backdrop-blur border-b border-white/5 px-3 flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-300">
        <span className="truncate">{displayProgressActive ? displayNodeName : vramWaitStatus?.isWaiting ? 'VRAM解放待ち' : (generationSnapshot ? Boolean(normalWait?.kind === 'session') : isOtherSessionGenerating) ? '他セッションで生成中' : '待機中'}</span>
        <span className="shrink-0">{displayProgressActive ? '進行中' : '—'}</span>
        <span className="shrink-0 ux-numeric">ETA {displayProgressActive ? (eta === null ? '未取得' : `${eta}秒`) : '未取得'}</span>
        {displayProgressActive && <span className="absolute bottom-0 left-0 h-0.5 bg-accent-green" style={{ width: `${overallPercentage}%` }} />}
      </div>

      {/* Progress Line */}
      <div className="w-full bg-surface-2 border-b border-[rgba(255,255,255,0.06)] px-3 py-2.5 flex flex-col gap-2">
        {generationSyncIssue && <div role="status" className="text-[10px] text-amber-300">生成状態を同期できません: {generationSyncIssue.message}</div>}
        {vramWaitStatus?.isWaiting ? (
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
              <span className="font-semibold text-yellow-300 truncate">VRAM解放待ち</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400 truncate ux-numeric">
                空き: {vramWaitStatus.freeGb !== null && vramWaitStatus.freeGb !== undefined ? vramWaitStatus.freeGb.toFixed(1) : '--'}GB / 必要: {vramWaitStatus.requiredGb.toFixed(1)}GB ({vramWaitStatus.waitDurationSec}秒)
              </span>
            </div>
            <button
              type="button"
              onClick={() => cancelVramWait?.()}
              className="px-2 py-0.5 text-[9px] font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors flex-shrink-0"
            >
              キャンセル
            </button>
          </div>
        ) : displayProgressActive ? (
          <>
            {/* 全体バッチ進捗 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                <span>全体進捗: {generationSnapshot && normalProgress ? `${normalProgress.finished}/${normalProgress.total}` : `${currentBatchItemNumber}/${totalBatchCount}`} 枚目</span>
                <span>{generationSnapshot && normalProgress ? `${Math.round(normalProgress.fraction * 100)}%` : `${overallPercentage}%`}</span>
              </div>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
                <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${generationSnapshot && normalProgress ? normalProgress.fraction * 100 : overallPercentage}%` }} />
              </div>
            </div>

            {/* 詳細ノード進捗 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                <span>実行中: {displayNodeName}</span>
                <span>{Math.round(displayNodePercentage)}%</span>
              </div>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
                <div className="h-full bg-blue-500 progress-shimmer transition-all duration-200" style={{ width: `${displayNodePercentage}%` }} />
              </div>
            </div>

            {/* 時間情報・Queue情報 */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium pt-0.5">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-accent-green flex-shrink-0" />
                <span className="ux-numeric">経過: {displayElapsedTime}秒</span>
                {eta !== null && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="ux-numeric">残り約: {eta}秒</span>
                  </>
                )}
              </div>
              <span 
                onClick={() => setIsJobModalOpen(true)}
                className="text-zinc-300 cursor-pointer hover:text-white transition-colors font-semibold"
              >
                Queue: {totalQueueCount}
              </span>
            </div>
          </>
        ) : (generationSnapshot ? Boolean(normalWait?.kind === 'session') : isOtherSessionGenerating) ? (
          <>
            {/* ステータスバッジ & 進捗 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-amber-300 font-semibold">他セッションで生成中{normalWait?.kind === 'session' ? ` (${normalWait.remaining})` : '...'}</span>
                </span>
                <span>{Math.round(displayNodePercentage)}%</span>
              </div>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
                <div className="h-full bg-amber-500 progress-shimmer transition-all duration-200" style={{ width: `${displayNodePercentage}%` }} />
              </div>
            </div>

            {/* 実行中ノード */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
                <span>実行中: {displayNodeName}</span>
              </div>
            </div>

            {/* 時間情報・Queue情報 */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium pt-0.5">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-amber-400 flex-shrink-0" />
                <span className="ux-numeric">経過: {displayElapsedTime}秒</span>
              </div>
              <span 
                onClick={() => setIsJobModalOpen(true)}
                className="text-amber-300 cursor-pointer hover:text-white transition-colors font-semibold"
              >
                Queue: {allQueueCount} (他セッション)
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green flex-shrink-0" />
              <span className="truncate">Ready</span>
              <span className="text-zinc-600">|</span>
              <span 
                onClick={() => setIsJobModalOpen(true)}
                className="font-semibold text-zinc-300 cursor-pointer hover:text-white transition-colors"
              >
                Queue: {totalQueueCount}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[150px]">
              <div className="h-1 bg-surface-2 rounded-full border border-white/5 overflow-hidden flex-1">
                <div className="h-full bg-accent-green transition-all duration-200" style={{ width: '0%' }} />
              </div>
              <span className="font-mono text-accent-green whitespace-nowrap">0%</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Preview */}
      <div
        data-testid="mobile-main-preview"
        role="button"
        tabIndex={0}
        aria-expanded={!isCompactPreview}
        aria-label="プレビュートグル"
        onClick={() => setIsCompactPreview((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsCompactPreview((prev) => !prev)
          }
        }}
        className={`bg-grid relative w-full shrink-0 flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-surface-2 transition-all duration-200 cursor-pointer ${
          isCompactPreview ? 'h-[105px]' : 'aspect-[2/3] max-h-[42vh]'
        }`}
      >
        <button
          type="button"
          data-testid="preview-toggle-btn"
          aria-label={isCompactPreview ? "プレビューを展開" : "プレビューを縮小"}
          onClick={(e) => {
            e.stopPropagation()
            setIsCompactPreview((prev) => !prev)
          }}
          className="absolute top-2 left-2 z-10 text-[10px] px-2 py-0.5 rounded bg-surface/80 hover:bg-surface border border-white/10 text-zinc-300 font-medium transition-colors"
        >
          {isCompactPreview ? "展開 (220px)" : "縮小 (105px)"}
        </button>
        {(previewImage || selectedImg) ? (
          <div
            className="relative w-full h-full flex items-center justify-center"
            onClick={(e) => {
              if (!isCompactPreview) {
                e.stopPropagation()
                handleOpenModalPreview()
              }
            }}
          >
            <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
            {isGeneratingHere && <div className="absolute top-2 right-2 bg-surface-2/80 backdrop-blur p-1.5 rounded-full border border-white/5 shadow-md"><Loader2 size={16} className="animate-spin text-accent-green" /></div>}
            <a href={previewImage || selectedImg!} download="generated.png" id="download-btn-mobile"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface/80 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-xs font-medium hover:bg-surface">
              <Download size={12} />Download
            </a>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
            {isGeneratingHere ? <Loader2 size={24} className="animate-spin text-accent-green" /> : <ImageOff size={32} strokeWidth={1} />}
            <p className="text-xs">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
          </div>
        )}
        {isGeneratingHere && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-955 overflow-hidden">
            <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${batchProgress.percentage}%` }} />
          </div>
        )}
      </div>

      <div role="group" aria-label="表示セクション" className="grid grid-cols-3 gap-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2 px-3 py-2.5">
        {([
          ['prompt', 'プロンプト'],
          ['parameters', 'パラメータ'],
          ['history', '履歴'],
        ] as const).map(([segment, label]) => (
          <button key={segment} type="button" aria-pressed={mobileSegment === segment}
            aria-controls={`mobile-${segment}-panel`} onClick={() => setMobileSegment(segment)}
            className={`min-h-[44px] rounded-lg border px-2 text-sm font-medium transition-colors ${mobileSegment === segment ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-zinc-200'}`}>
            {label}
          </button>
        ))}
      </div>

      <section id="mobile-history-panel" data-testid="mobile-history-panel" aria-label="履歴"
        hidden={mobileSegment !== 'history'} style={{ display: mobileSegment === 'history' ? undefined : 'none' }}>
        {/* Keep the gallery mounted while switching segments so its selection survives. */}
        {showStrip && <GenerationGallerySection state={state} gallery={gallery} isMobile={true} />}
      </section>

      <section id="mobile-prompt-panel" data-testid="mobile-prompt-panel" aria-label="プロンプト"
        hidden={mobileSegment !== 'prompt'} style={{ display: mobileSegment === 'prompt' ? undefined : 'none' }}>

      {/* Multi-Set Tab Bar (Mobile) */}
      {selectedWorkflowId && (
        <div className="flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-3 py-2.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Profiles</span>
            <div className="flex items-center gap-2.5">
              {activeSet && (
                <div className="flex items-center gap-1 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg p-0.5">
                  <button
                    type="button"
                    id="undo-btn-mobile"
                    onClick={() => undo?.(activeSet.id)}
                    disabled={!canUndo}
                    title="Undo"
                    aria-label="Undo"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
                  >
                    <Undo2 size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    id="redo-btn-mobile"
                    onClick={() => redo?.(activeSet.id)}
                    disabled={!canRedo}
                    title="Redo"
                    aria-label="Redo"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
                  >
                    <Redo2 size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              <button
                type="button"
                id="manage-presets-btn-mobile"
                onClick={() => setIsPresetManagerOpen(true)}
                aria-label="管理"
                className="inline-flex min-h-11 items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-[rgba(255,255,255,0.08)] text-zinc-350 hover:bg-white/5 font-semibold transition-all"
              >
                <Library size={14} aria-hidden="true" />
                管理
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none flex-1">
              {sets.filter((s) => (openPresetIds || []).map(String).includes(String(s.id))).map((s) => (
                <div key={s.id} onClick={() => {
                  handleSelectPresetTab(s.id)
                }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex-shrink-0 ${
                    String(s.id) === String(activeSetId)
                      ? 'bg-accent-green/10 border-accent-green/40 text-accent-green font-bold'
                      : 'bg-surface-2 border-[rgba(255,255,255,0.04)] text-zinc-400'
                  }`}>
                  <input type="checkbox" checked={s.checked} onChange={() => toggleSetChecked(s.id)} onClick={(e) => e.stopPropagation()} className="w-3 h-3 rounded accent-accent-green cursor-pointer" />
                  <span className="truncate max-w-[70px]">{s.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeSet(s.id) }} className="inline-flex min-h-11 min-w-11 items-center justify-center text-zinc-500 hover:text-red-400 ml-0.5" title="タブを閉じる (DBからは削除されません)" aria-label={`${s.name}のタブを閉じる`}><X size={14} aria-hidden="true" /></button>
                </div>
              ))}
            </div>
            <button type="button" id="add-set-btn-mobile" onClick={() => {
              const allNames = presets?.map((p) => p.name) || []
              setNewSetName(generateNextProfileName('Set', allNames))
              setCopySourceId('default')
              setShowCopyModal(true)
            }}
              className="flex items-center justify-center p-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-accent-green hover:border-accent-green/30 transition-all flex-shrink-0">
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Prompt Tabs */}
      {textMappings.length > 0 && (
        <div className="px-3 py-2.5 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40">
          <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
            {textMappings.map((m) => (
              <button key={m.id} type="button" onClick={() => setActivePromptTab(m.role || '')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all shrink-0 whitespace-nowrap ${activePromptTab === m.role ? 'border-accent-green bg-accent-green/10 text-accent-green font-medium' : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200'}`}>
                {m.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {textMappings.length === 0 && !selectedWorkflowId && <div className="px-3 py-4">{renderUploadZone()}</div>}

      {/* Active Prompt Textarea (Mobile) */}
      {textMappings.length > 0 && activePromptTab && activePromptTabMapping && (
        <div className="px-3 py-2.5 space-y-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRoleCollapsed(activePromptTabMapping.role!, !isCollapsed)}
              className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span>{activePromptTabMapping.display_name} Input</span>
            </button>
            {!isCollapsed && (
              <div className="relative flex items-center gap-1.5">
                <PromptSectionClipboardMenu
                  role={activePromptTabMapping.role!}
                  currentValue={paramValues[activePromptTabMapping.role!] ?? ''}
                  onChangeValue={(val) => setParamValues({ ...paramValues, [activePromptTabMapping.role!]: val })}
                  onOpenSaveAsTagSet={() => setSaveAsTagSetRole(activePromptTabMapping.role!)}
                />
                {promptTranslation && (
                  <button
                    type="button"
                    onClick={() => promptTranslation.openTranslation(activePromptTabMapping.role!, paramValues[activePromptTabMapping.role!] || '')}
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 border rounded transition-all ${
                      promptTranslation.isOpen && promptTranslation.activeRole === activePromptTabMapping.role
                        ? 'border-[#7C6FDD] bg-[#7C6FDD]/15 text-[#7C6FDD]'
                        : 'bg-surface-2 border-[rgba(255,255,255,0.06)] text-zinc-400 hover:text-[#7C6FDD] hover:border-[#7C6FDD]/40'
                    }`}
                  >
                    <span>翻訳</span>
                  </button>
                )}
                <button type="button" id={`add-asset-btn-mobile-${activePromptTabMapping.role!}`}
                  onClick={() => setOpenAddAssetRole(openAddAssetRole === activePromptTabMapping.role ? null : activePromptTabMapping.role!)}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                  <Plus size={10} />Add Asset
                </button>
                {openAddAssetRole === activePromptTabMapping.role && (
                  <AddAssetModal
                    role={activePromptTabMapping.role!}
                    loras={loras}
                    tagSets={tagSets}
                    onClose={() => setOpenAddAssetRole(null)}
                    addAppliedAsset={addAppliedAsset}
                    setRoleCollapsed={setRoleCollapsed}
                    activeBaseModelId={workflow?.target_base_model_id}
                  />
                )}
              </div>
            )}
          </div>
          {!isCollapsed && (
            <>
              <TagChipEditor
                key={`${activeSetId}-${activePromptTabMapping.role!}`}
                id={`prompt-mobile-${activePromptTabMapping.role!}`}
                value={paramValues[activePromptTabMapping.role!] ?? ''}
                chips={promptChips?.[activePromptTabMapping.role!]}
                onChipsChange={(chips) => handleChipsChange(activePromptTabMapping.role!, chips)}
                onChange={(val) => setParamValues({ ...paramValues, [activePromptTabMapping.role!]: val })}
                placeholder={`Enter ${activePromptTabMapping.display_name}…`}
                variant={isNegative ? 'negative' : 'positive'}
                defaultTextMode={roleTextModes?.[activePromptTabMapping.role!] ?? false}
                isAnimaMode={isAnimaMode}
                onTextModeToggle={(isText) => {
                  setRoleCollapsed(activePromptTabMapping.role!, false)
                  setRoleTextMode?.(activePromptTabMapping.role!, isText)
                }}
              />
              <AppliedAssetChips
                role={activePromptTabMapping.role!}
                appliedAssets={appliedAssets}
                toggleAppliedAsset={toggleAppliedAsset}
                removeAppliedAsset={removeAppliedAsset}
              />
            </>
          )}
        </div>
      )}

      </section>

      {/* Mobile Settings & Parameters */}
      <section id="mobile-parameters-panel" data-testid="mobile-parameters-panel" aria-label="パラメータ"
        hidden={mobileSegment !== 'parameters'} style={{ display: mobileSegment === 'parameters' ? undefined : 'none' }}>
      <div className="px-3 py-2.5 space-y-2.5">
        <AuditPanel
          auditOpen={auditOpen}
          setAuditOpen={setAuditOpen}
          auditStatus={auditStatus}
          auditResult={auditResult}
          auditTypes={auditTypes}
          setAuditTypes={setAuditTypes as any}
          auditIntent={auditIntent}
          setAuditIntent={setAuditIntent}
          runAudit={() => runAudit.mutate()}
        />
        <MappingErrorPanel
          selectedWorkflowId={selectedWorkflowId}
          invalidMappings={invalidMappings}
          selectedMasters={selectedMasters}
          setSelectedMasters={setSelectedMasters}
          mappingMasters={mappingMasters}
          handleUpdateMapping={handleUpdateMapping}
          isUpdatingMapping={updateWorkflowMutation.isPending}
        />
        <ParamPanel
          mobile
          paramMappings={paramMappings}
          paramValues={paramValues}
          setParamValues={setParamValues}
          loras={loras}
          paramTypeMasters={paramTypeMasters}
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          seedMode={seedMode}
          setSeedMode={setSeedMode}
          seed={seed}
          setSeed={setSeed}
          comfyObjectInfo={comfyObjectInfo}
          bypassProfiles={bypassProfiles}
          onToggleBypass={(profileId, isEnabled) => updateBypassProfile(profileId, { is_enabled: isEnabled })}
          onOpenBypassSettings={() => setIsBypassSettingsOpen(true)}
          paramSyncGroups={paramSyncGroups}
          onToggleParamSync={(groupId, isEnabled) => toggleParamSyncGroup(groupId, isEnabled)}
          onOpenParamSyncSettings={() => setIsParamSyncSettingsOpen(true)}
        />
      </div>
      </section>

      {/* Mobile Action Bar */}
      {vramWaitStatus?.isWaiting && (
        <div
          data-testid="mobile-vram-wait-banner"
          className="fixed bottom-[136px] left-0 right-0 z-45 mx-3 px-3.5 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 backdrop-blur-md flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <AlertTriangle size={16} className="text-yellow-400 animate-pulse flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-yellow-300 truncate">
                VRAM解放待ち（待機中）
              </span>
              <span className="text-[10px] text-zinc-400 truncate ux-numeric">
                空き: {vramWaitStatus.freeGb !== null && vramWaitStatus.freeGb !== undefined ? vramWaitStatus.freeGb.toFixed(1) : '--'} GB / 必要: {vramWaitStatus.requiredGb.toFixed(1)} GB ({vramWaitStatus.waitDurationSec}s)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => cancelVramWait?.()}
            className="px-2.5 py-1 text-xs font-semibold text-yellow-200 hover:text-white bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded-lg transition-colors flex-shrink-0"
          >
            待機キャンセル
          </button>
        </div>
      )}
      <div
        data-testid="mobile-action-bar"
        className={`fixed bottom-[calc(54px+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))] left-0 right-0 z-45 bg-surface/90 backdrop-blur border-t border-[rgba(255,255,255,0.06)] px-3 py-2.5 items-center gap-2 ${
          isInputFocused ? 'hidden pointer-events-none' : 'flex'
        }`}
        style={{ maxHeight: '40vh' }}
      >
        <button id="generate-btn-mobile" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected || !workflow}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95">
          <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
        </button>
        <button id="save-snapshot-btn-mobile" onClick={() => setIsSaveModalOpen(true)} disabled={isMultiSelectMode ? selectedIds.size === 0 : !selectedImg}
          aria-label="Snapshot保存"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-all">
          <Camera size={15} />
        </button>
        <button id="queue-management-btn-mobile" type="button" onClick={() => setIsJobModalOpen(true)}
          aria-label={`キュー管理: ${(generationSnapshot ? Boolean(normalWait?.kind === 'session') : isOtherSessionGenerating) ? allQueueCount : totalQueueCount}件`}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center px-2 py-2 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-xs font-medium hover:bg-white/5 transition-all">
          Queue {(generationSnapshot ? Boolean(normalWait?.kind === 'session') : isOtherSessionGenerating) ? allQueueCount : totalQueueCount}
        </button>
      </div>

      {/* Tag Suggest Accessory Bar */}
      {isInputFocused && (
        <div
          data-testid="mobile-tag-suggest-bar"
          aria-label="タグサジェストバー"
          className="fixed bottom-[calc(env(keyboard-inset-height,0px))] left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-t border-[rgba(255,255,255,0.1)] px-3 py-2 flex items-center gap-2 overflow-x-auto shadow-lg"
        >
          <span className="text-[10px] text-zinc-400 font-medium shrink-0">Tags:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {['masterpiece', 'best quality', '1girl', 'solo', 'detailed'].map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                }}
                onClick={() => {
                  if (activePromptTab && activePromptTabMapping) {
                    const currentVal = paramValues[activePromptTabMapping.role!] ?? ''
                    const newVal = currentVal ? `${currentVal}, ${tag}` : tag
                    setParamValues({ ...paramValues, [activePromptTabMapping.role!]: newVal })
                  }
                }}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-2 border border-white/10 text-zinc-200 hover:text-accent-green hover:border-accent-green/40 whitespace-nowrap min-h-[32px] flex items-center"
              >
                +{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <GenerateModalsOverlay
        state={state}
        showCopyModal={showCopyModal}
        setShowCopyModal={setShowCopyModal}
        newSetName={newSetName}
        setNewSetName={setNewSetName}
        copySourceId={copySourceId}
        setCopySourceId={setCopySourceId}
        isBypassSettingsOpen={isBypassSettingsOpen}
        setIsBypassSettingsOpen={setIsBypassSettingsOpen}
        isParamSyncSettingsOpen={isParamSyncSettingsOpen}
        setIsParamSyncSettingsOpen={setIsParamSyncSettingsOpen}
        saveAsTagSetRole={saveAsTagSetRole}
        setSaveAsTagSetRole={setSaveAsTagSetRole}
        errorToast={errorToast}
        setErrorToast={setErrorToast}
      />
    </div>
  )
}
