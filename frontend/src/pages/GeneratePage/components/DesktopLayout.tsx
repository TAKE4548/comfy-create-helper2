import { useState, useEffect, useCallback, memo } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import {
  Zap, Plus, ChevronRight, ChevronDown, X, Undo2, Redo2, Library,
  ImageOff, Camera, Loader2, AlertTriangle
} from 'lucide-react'
import { ResizableSplitLayout } from '../../../components/layout/ResizableSplitLayout'
import { GenerateParallelPreview } from './GenerateParallelPreview'
import { LS_KEYS } from '../../../utils/localStorageKeys'
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
import { useGalleryInteraction } from '../hooks/useGalleryInteraction'
import { useSystemStats } from '../../../hooks/useSystemStats'
import { selectProgress, selectWait } from '../../../utils/generationSelectors'
import { useMappingStageGroups } from '../../../hooks/useMappingStageGroups'
import StageInputGroup from '../../../components/StageInputGroup'


interface SetTabItemProps {
  id: string | number
  name: string
  checked: boolean
  isActive: boolean
  onClick: () => void
  onToggleCheck: () => void
  onRemove: () => void
}

const SetTabItem = memo(function SetTabItem({
  name,
  checked,
  isActive,
  onClick,
  onToggleCheck,
  onRemove,
}: SetTabItemProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex-shrink-0 ${
        isActive
          ? 'bg-accent-green/10 border-accent-green/40 text-accent-green font-bold'
          : 'bg-surface-2 border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-400'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        onClick={(e) => e.stopPropagation()}
        className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer"
      />
      <span className="truncate max-w-[140px]">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="text-zinc-500 hover:text-red-400 ml-1"
        title="タブを閉じる (DBからは削除されません)"
        aria-label="タブを閉じる (DBからは削除されません)"
      >
        <X aria-hidden="true" size={12} />
      </button>
    </div>
  )
})

type StateProps = ReturnType<typeof useGeneratePageState>

export const DesktopLayout = ({
  state,
}: {
  state: StateProps
}) => {
  const {
    isConnected, isGenerating, progress, previewImage,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    selectedImg, setSelectedImg,
    appliedAssets,
    addAppliedAsset,
    toggleAppliedAsset, removeAppliedAsset,
    sets, activeSetId, removeSet,
    toggleSetChecked,
    openPresetIds, undo, redo, canUndo, canRedo,
    activeBatch,
    
    // state properties
    setRescanOpen,
    selectedMasters, setSelectedMasters,
    openAddAssetRole, setOpenAddAssetRole,
    setIsJobModalOpen,
    setIsPresetManagerOpen,
    setWorkflowManageMode,
    baseModels,
    updateWorkflowBaseModelMutation,
    
    // queries & derived state
    workflows,
    workflow,
    mappingMasters,
    loras,
    paramTypeMasters,
    tagSets,
    presets,
    comfyObjectInfo,
    displayImages,
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
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
    setIsSaveModalOpen,
    updateWorkflowMutation,
    handleSelectPresetTab,
    saveDefaultParamsMutation,
    isAnimaMode,
    setIsAnimaMode,
    promptTranslation,
  } = state

  const textStageGroups = useMappingStageGroups(textMappings, mappingMasters, true)

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | number>('default')
  const [saveAsTagSetRole, setSaveAsTagSetRole] = useState<string | null>(null)
  const [isTabletViewport, setIsTabletViewport] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024,
  )

  useEffect(() => {
    const updateTabletViewport = () => setIsTabletViewport(window.innerWidth >= 768 && window.innerWidth < 1024)
    window.addEventListener('resize', updateTabletViewport)
    return () => window.removeEventListener('resize', updateTabletViewport)
  }, [])

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

  useSystemStats()  // システムWS接続ライフサイクル管理

  const handleChipsChange = useCallback((role: string, chips: any) => {
    setPromptChips(role, chips)
  }, [setPromptChips])


  const [isBypassSettingsOpen, setIsBypassSettingsOpen] = useState(false)
  const [isParamSyncSettingsOpen, setIsParamSyncSettingsOpen] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  const gallery = useGalleryInteraction({
    isMobile: false,
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
  const elapsedTimeKnown = generationSnapshot ? Boolean(normalRunningJob?.started_at) : Boolean(generationStartTime)
  const actionQueueCount = generationSnapshot
    ? normalWait?.kind === 'session' ? allQueueCount : totalQueueCount
    : isOtherSessionGenerating ? allQueueCount : totalQueueCount
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

  const renderStatusBar = () => {
    if (vramWaitStatus?.isWaiting) {
      return (
        <div className="flex items-center justify-between text-[11px] py-0.5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-yellow-400 animate-pulse flex-shrink-0" />
            <span className="font-semibold text-yellow-300">
              VRAM解放待ち（他プロセスの終了待機中）
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400 ux-numeric">
              空き: {vramWaitStatus.freeGb !== null && vramWaitStatus.freeGb !== undefined ? vramWaitStatus.freeGb.toFixed(1) : '--'} GB / 必要: {vramWaitStatus.requiredGb.toFixed(1)} GB (待機: {vramWaitStatus.waitDurationSec}秒)
            </span>
          </div>
          <button
            type="button"
            onClick={() => cancelVramWait?.()}
            className="px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
          >
            待機キャンセル
          </button>
        </div>
      )
    }

    if (displayProgressActive) {
      return (
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

          {/* 時間情報 */}
          <div className="flex items-center text-[11px] text-zinc-400 font-medium pt-1">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-accent-green flex-shrink-0" />
              <span className="ux-numeric">経過時間: {elapsedTimeKnown ? `${displayElapsedTime}秒` : '未取得'}</span>
              <span className="text-zinc-700">|</span>
              <span className="ux-numeric">残り約: {eta !== null ? `${eta}秒` : '未取得'}</span>
            </div>
          </div>
        </>
      )
    }

    if (generationSnapshot ? Boolean(normalWait?.kind === 'session') : isOtherSessionGenerating) {
      return (
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

          {/* 時間情報 */}
          <div className="flex items-center text-[11px] text-zinc-400 font-medium pt-1">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-amber-400 flex-shrink-0" />
              <span className="ux-numeric">経過: {elapsedTimeKnown ? `${displayElapsedTime}秒` : '未取得'}</span>
              <span className="text-zinc-700">|</span>
              <span>残り約: 未取得</span>
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
          <div className="h-full bg-accent-green transition-all duration-200" style={{ width: '0%' }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />
            <span className="font-semibold text-zinc-300">Ready</span>
          </div>
          <span className="font-mono text-accent-green font-semibold">0%</span>
        </div>
      </>
    )
  }

  const renderUploadZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('workflow-file-input')?.click()}
      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all min-h-[300px] ${
        dragOver
          ? 'border-accent-green bg-accent-green/5 text-zinc-200'
          : 'border-[rgba(255,255,255,0.15)] hover:border-accent-green/50 hover:bg-white/5 text-zinc-400'
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
      <p className="text-xs text-zinc-555">またはクリックしてファイルを選択してください (.json)</p>
    </div>
  )

  const activeSet = sets.find((s) => String(s.id) === String(activeSetId))

  const leftPane = (
    <div className="w-full h-full flex flex-col overflow-hidden bg-surface-2/10">
      {/* Left Pane Toolbar: Add Set / 管理 / Undo / Redo */}
      {selectedWorkflowId && (
        <div id="left-pane-toolbar" className="border-b border-[rgba(255,255,255,0.06)] bg-surface-2/30 px-4 py-2.5 flex items-center justify-start gap-2 flex-nowrap flex-shrink-0">
          {activeSet && (
            <span className="text-[10px] text-zinc-500 px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded font-medium truncate max-w-[110px] flex-shrink-0" title={activeSet.name}>
              {activeSet.name}
            </span>
          )}
          {activeSet && (
            <div className="flex items-center gap-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg p-0.5 flex-shrink-0">
              <button type="button" id="undo-btn" onClick={() => undo?.(activeSet.id)} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo (Ctrl+Z)" className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"><Undo2 aria-hidden="true" size={14} /></button>
              <button type="button" id="redo-btn" onClick={() => redo?.(activeSet.id)} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo (Ctrl+Y)" className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"><Redo2 aria-hidden="true" size={14} /></button>
            </div>
          )}
          <button type="button" id="add-set-btn" onClick={() => {
            const allNames = presets?.map((p) => p.name) || []
            setNewSetName(generateNextProfileName('Set', allNames))
            setCopySourceId('default')
            setShowCopyModal(true)
          }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-accent-green hover:border-accent-green/30 text-xs font-semibold transition-all flex-shrink-0">
            <Plus size={11} />Add Set
          </button>
          <button type="button" id="manage-presets-btn" onClick={() => setIsPresetManagerOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-[#7C6FDD] hover:border-[#7C6FDD]/30 text-xs font-semibold transition-all flex-shrink-0">
            <Library aria-hidden="true" size={14} />
            管理
          </button>
        </div>
      )}
      <ResizableSplitLayout
        direction="vertical"
        storageKey="prompt-surgeon-generate-left-ratio-v1"
        persistenceMode="ratio"
        resetCycle
        initialSize={0.55}
        minSize={120}
        first={(
          <div id="desktop-prompt-scroll" data-stage-scroll-root="" className="stage-input-scroll-root w-full h-full min-h-0 overflow-y-auto px-5 custom-scrollbar">
        <div className="space-y-0">
        {textStageGroups.map((group) => (
          <StageInputGroup key={group.key} groupKey={group.key} stageName={group.stageName} stageKey={group.stageKey}>
            <div className="space-y-0">
        {group.mappings.map((m) => {
          const isNegative = m.role?.toLowerCase().includes('negative')
          const isCollapsed = getIsRoleCollapsed(m.role!)
          const promptName = m.display_name?.trim()
            ? m.display_name
            : m.param_name?.trim() || m.role?.trim() || 'プロンプト'
          const promptDescriptionId = `prompt-description-${m.id}`
          return (
            <div key={m.id} data-prompt-mapping-id={m.id} className="space-y-1.5 relative">
              <span id={promptDescriptionId} className="sr-only">{group.stageKey} / {m.role}</span>
              <h4 data-prompt-item-heading="" className="m-0 min-w-0 w-full break-words text-base leading-6 font-semibold text-zinc-200">
                <button
                  type="button"
                  onClick={() => setRoleCollapsed(m.role!, !isCollapsed)}
                  aria-label={promptName}
                  aria-expanded={!isCollapsed}
                  aria-controls={`prompt-${m.role!}`}
                  aria-describedby={promptDescriptionId}
                  className="flex min-w-0 w-full items-center gap-1.5 break-words text-left text-base leading-6 font-semibold text-zinc-200 hover:text-zinc-100 transition-colors focus:outline-none"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="min-w-0 break-words">{promptName}</span>
                </button>
              </h4>
              {!isCollapsed && (
                <>
                  <TagChipEditor
                    key={`${activeSetId}-${m.role!}`}
                    id={`prompt-${m.role!}`}
                    value={paramValues[m.role!] ?? ''}
                    chips={promptChips?.[m.role!]}
                    onChipsChange={(chips) => handleChipsChange(m.role!, chips)}
                    onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                    showModeStatus={false}
                    toolbarStart={(
                      <div className="relative flex w-full min-w-0 flex-wrap items-center gap-1.5">
                        <PromptSectionClipboardMenu
                          role={m.role!}
                          currentValue={paramValues[m.role!] ?? ''}
                          onChangeValue={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                          onOpenSaveAsTagSet={() => setSaveAsTagSetRole(m.role!)}
                          menuAlign="start"
                        />
                        <button
                          type="button"
                          onClick={() => promptTranslation.openTranslation(m.role!, paramValues[m.role!] || '')}
                          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 border rounded transition-all ${
                            promptTranslation.isOpen && promptTranslation.activeRole === m.role
                              ? 'border-[#7C6FDD] bg-[#7C6FDD]/15 text-[#7C6FDD]'
                              : 'bg-surface-2 border-[rgba(255,255,255,0.06)] text-zinc-400 hover:text-[#7C6FDD] hover:border-[#7C6FDD]/40'
                          }`}
                        >
                          <span>翻訳</span>
                        </button>
                        <button type="button" id={`add-asset-btn-${m.role!}`}
                          onClick={() => setOpenAddAssetRole(openAddAssetRole === m.role ? null : m.role!)}
                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                          <Plus size={10} />Add Asset
                        </button>
                        {openAddAssetRole === m.role && (
                          <AddAssetModal
                            role={m.role!}
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
                    placeholder={`Enter ${promptName}…`}
                    variant={isNegative ? 'negative' : 'positive'}
                    defaultTextMode={roleTextModes?.[m.role!] ?? false}
                    isAnimaMode={isAnimaMode}
                    onTextModeToggle={(isText) => {
                      setRoleCollapsed(m.role!, false)
                      setRoleTextMode?.(m.role!, isText)
                    }}
                  />
                </>
              )}
            </div>
          )
        })}
            </div>
          </StageInputGroup>
        ))}
        </div>
          </div>
        )}
        second={(
          <div id="desktop-controls-scroll" data-stage-scroll-root="" className="stage-input-scroll-root w-full h-full min-h-0 overflow-y-auto px-5 custom-scrollbar">
        <div className="space-y-5 py-4">
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

        {textMappings.length === 0 && !selectedWorkflowId && <div className="flex-1 flex flex-col pt-4">{renderUploadZone()}</div>}
            {textMappings.map((m) => (
              <AppliedAssetChips key={`assets-${m.id}`} role={m.role!} appliedAssets={appliedAssets} toggleAppliedAsset={toggleAppliedAsset} removeAppliedAsset={removeAppliedAsset} />
            ))}
        <ParamPanel
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
          stageGrouping={true}
        />
          </div>
          </div>
        )}
        className="w-full flex-1 min-h-0"
      />
    </div>
  )

  const currentDisplayImages = Array.isArray(displayImages) ? displayImages : []
  const previewImages = previewImage
    ? [previewImage]
    : currentDisplayImages.length > 0
      ? currentDisplayImages
      : selectedImg
        ? [selectedImg]
        : []
  const previewContent = previewImages.length > 0 ? (
    <GenerateParallelPreview
      images={previewImages}
      selectedImage={previewImage || selectedImg}
      onSelect={setSelectedImg}
      onOpen={handleOpenModalPreview}
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
      {isGeneratingHere ? <Loader2 size={40} className="animate-spin text-accent-green" /> : <ImageOff size={40} strokeWidth={1} />}
      <p className="text-sm">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
    </div>
  )

  const rightPane = (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {showStrip ? (
          <ResizableSplitLayout
            direction="vertical"
            storageKey={LS_KEYS.LAYOUT_PREVIEW_SPLIT}
            initialSize={550}
            minSize={250}
            first={
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                {/* Main Preview */}
                <div className="flex-1 relative overflow-hidden bg-grid flex items-center justify-center outline-none" tabIndex={0}>
                  {previewContent}
                  {/* Status bar */}
                  <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex flex-col gap-2">
                    {generationSyncIssue && <div role="status" className="text-[10px] text-amber-300">生成状態を同期できません: {generationSyncIssue.message}</div>}
                    {renderStatusBar()}
                  </div>
                </div>
              </div>
            }
            second={
              <GenerationGallerySection state={state} gallery={gallery} isMobile={false} />
            }
          />
        ) : (
          <div className="w-full h-full relative overflow-hidden flex flex-col">
            {/* Main Preview */}
            <div className="flex-1 relative overflow-hidden bg-grid flex items-center justify-center outline-none" tabIndex={0}>
              {previewContent}
              {/* Status bar */}
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex flex-col gap-2">
                {generationSyncIssue && <div role="status" className="text-[10px] text-amber-300">生成状態を同期できません: {generationSyncIssue.message}</div>}
                {renderStatusBar()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div id="desktop-action-bar" className="sticky bottom-0 z-30 flex-shrink-0 border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-2">
        <button id="queue-open-btn" type="button" onClick={() => setIsJobModalOpen(true)} aria-label="ジョブキュー一覧・管理を開く" title="ジョブキュー一覧・管理を開く"
          className="min-h-11 px-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[11px] font-mono text-zinc-300 hover:bg-white/5 transition-colors">
          Queue: {actionQueueCount}
        </button>
        <button id="generate-btn" type="button" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected || !workflow}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95">
          <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
        </button>
        <button id="save-snapshot-btn" type="button" onClick={() => setIsSaveModalOpen(true)} disabled={isMultiSelectMode ? selectedIds.size === 0 : !selectedImg}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Camera size={15} /><span className="hidden sm:inline">Save Snapshot</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden w-full relative">
    {/* PageHeader with Left Clustering */}
    <PageHeader
      title="Generate"
      icon={Zap}
      actions={
        <div className="flex items-center gap-2">
          {/* Workflow Selector & Actions Menu */}
          <div className="relative flex items-center gap-1">
            <select
              id="workflow-select"
              value={selectedWorkflowId ?? ''}
              onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
              className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[130px] truncate"
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
          </div>

          {/* Anima Mode Toggle */}
          {selectedWorkflowId && (
            <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer select-none bg-surface-2/60 border border-[rgba(255,255,255,0.06)] rounded-md px-2 py-1 hover:bg-surface-2 transition-colors">
              <input
                id="anima-mode-toggle"
                type="checkbox"
                checked={isAnimaMode}
                onChange={(e) => setIsAnimaMode(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#7C6FDD] rounded border-zinc-800"
              />
              <span>Anima特化</span>
            </label>
          )}

          {/* Undo / Redo */}
          {activeSet && (
            <div className="flex items-center gap-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg p-0.5 flex-shrink-0">
              <button
                type="button"
                id="header-undo-btn"
                onClick={() => undo?.(activeSet.id)}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo (Ctrl+Z)"
                className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
              >
                <Undo2 aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                id="header-redo-btn"
                onClick={() => redo?.(activeSet.id)}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                aria-label="Redo (Ctrl+Y)"
                className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
              >
                <Redo2 aria-hidden="true" size={14} />
              </button>
            </div>
          )}
        </div>
      }
    />

      {/* Full-Width Preset Tabs Bar */}
      {selectedWorkflowId && (
        <div id="desktop-preset-tabs-bar" className="flex items-center border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-5 py-2 w-full overflow-hidden flex-shrink-0 relative z-10">
          <div className="flex items-center gap-2 overflow-x-auto w-full py-1 scrollbar-thin">
            {sets.filter((s) => (openPresetIds || []).map(String).includes(String(s.id))).map((s) => (
              <SetTabItem key={s.id} id={s.id} name={s.name} checked={s.checked} isActive={String(s.id) === String(activeSetId)} onClick={() => handleSelectPresetTab(s.id)} onToggleCheck={() => toggleSetChecked(s.id)} onRemove={() => removeSet(s.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Dual-Pane Content Area */}
      <div className="flex-1 min-h-0 relative w-full overflow-hidden">
        <ResizableSplitLayout
          direction="horizontal"
          storageKey={LS_KEYS.LAYOUT_MAIN_SPLIT}
          initialSize={typeof window !== 'undefined' && window.innerWidth < 1024 ? 330 : 420}
          minSize={isTabletViewport ? 330 : typeof window !== 'undefined' && window.innerWidth < 1024 ? 300 : 380}
          maxSize={isTabletViewport ? 330 : 700}
          first={leftPane}
          second={rightPane}
          className="w-full h-full"
        />
      </div>

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
