import { useState, useEffect, useCallback, memo } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import {
  Zap, Settings, Plus, ChevronRight, ChevronDown,
  Download, ImageOff, Camera, Loader2
} from 'lucide-react'
import { ResizableSplitLayout } from '../../../components/layout/ResizableSplitLayout'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'
import { SettingsPopover } from './SettingsPopover'
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
import { ResourceGaugeHUD } from '../../../components/ResourceGauge/ResourceGaugeHUD'
import { useSystemStats } from '../../../hooks/useSystemStats'


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
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
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
      <span className="truncate max-w-[80px]">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="text-zinc-500 hover:text-red-400 ml-1"
        title="タブを閉じる (DBからは削除されません)"
      >
        ✕
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
    isConnected, isGenerating, progress, previewImage, activeClientId,
    clientId,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    selectedImg, setSelectedImg,
    appliedAssets,
    addAppliedAsset,
    toggleAppliedAsset, removeAppliedAsset,
    setComfyUrl,
    sets, activeSetId, removeSet,
    toggleSetChecked,
    openPresetIds, undo, redo, canUndo, canRedo,
    activeBatch,
    
    // state properties
    setRescanOpen,
    selectedMasters, setSelectedMasters,
    openAddAssetRole, setOpenAddAssetRole,
    isSettingsOpen, setIsSettingsOpen,
    localComfyUrl, setLocalComfyUrl,
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
    handlePrevImg,
    handleNextImg,
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

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | number>('default')
  const [saveAsTagSetRole, setSaveAsTagSetRole] = useState<string | null>(null)

  const nodeProgress = useGenerationStore((state) => state.nodeProgress)
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
    if (errorToast && typeof setErrorToast === 'function') {
      const timer = setTimeout(() => {
        setErrorToast(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [errorToast, setErrorToast])

  useEffect(() => {
    if (!generationStartTime) {
      setElapsedTime(0)
      return
    }
    setElapsedTime(Math.round((Date.now() - generationStartTime) / 1000))
    const timer = setInterval(() => {
      setElapsedTime(Math.round((Date.now() - generationStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [generationStartTime])

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
  const eta = (overallPercentage > 0 && elapsedTime > 0)
    ? Math.round(elapsedTime * (100 - overallPercentage) / overallPercentage)
    : null

  const renderStatusBar = () => {
    if (isGeneratingHere) {
      return (
        <>
          {/* 全体バッチ進捗 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
              <span>全体進捗: {currentBatchItemNumber}/{totalBatchCount} 枚目</span>
              <span>{overallPercentage}%</span>
            </div>
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
              <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${overallPercentage}%` }} />
            </div>
          </div>

          {/* 詳細ノード進捗 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
              <span>実行中: {currentNode?.name || '準備中...'}</span>
              <span>{nodeProgress?.percentage || 0}%</span>
            </div>
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
              <div className="h-full bg-blue-500 progress-shimmer transition-all duration-200" style={{ width: `${nodeProgress?.percentage || 0}%` }} />
            </div>
          </div>

          {/* 時間情報・Queue情報 */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium pt-1">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-accent-green flex-shrink-0" />
              <span>経過時間: {elapsedTime}秒</span>
              {eta !== null && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span>残り約: {eta}秒</span>
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
      )
    }

    if (isOtherSessionGenerating) {
      return (
        <>
          {/* ステータスバッジ & 進捗 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-300 font-semibold">他セッションで生成中...</span>
              </span>
              <span>{nodeProgress?.percentage || 0}%</span>
            </div>
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
              <div className="h-full bg-amber-500 progress-shimmer transition-all duration-200" style={{ width: `${nodeProgress?.percentage || 100}%` }} />
            </div>
          </div>

          {/* 実行中ノード */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-zinc-400 font-medium">
              <span>実行中: {currentNode?.name || '処理中...'}</span>
            </div>
          </div>

          {/* 時間情報・Queue情報 */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium pt-1">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-amber-400 flex-shrink-0" />
              <span>経過: {elapsedTime}秒</span>
            </div>
            <span 
              onClick={() => setIsJobModalOpen(true)}
              className="text-amber-300 cursor-pointer hover:text-white transition-colors font-semibold"
            >
              Queue: {allQueueCount} (他セッション)
            </span>
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
            <span className="text-zinc-700">|</span>
            <span 
              onClick={() => setIsJobModalOpen(true)}
              className="text-zinc-300 cursor-pointer hover:text-white transition-colors font-semibold"
            >
              Queue: {totalQueueCount}
            </span>
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
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-zinc-200">Generate</h1>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
          {isGenerating && activeClientId !== clientId && (
            <span className="text-[10px] text-zinc-555 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">他セッションで生成中...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-1">
            <select id="workflow-select" value={selectedWorkflowId ?? ''}
              onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
              className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 max-w-[130px] truncate">
              <option value="">+ 新しいワークフローを追加 (Upload New...)</option>
              {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
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
          <div className="relative flex-shrink-0 flex items-center">
            <button id="settings-toggle-btn" type="button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-1.5 rounded-md border transition-all ${isSettingsOpen ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5'}`} title="ComfyUI設定">
              <Settings size={14} />
            </button>
            {isSettingsOpen && (
              <SettingsPopover
                setIsSettingsOpen={setIsSettingsOpen}
                localComfyUrl={localComfyUrl}
                setLocalComfyUrl={setLocalComfyUrl}
                setComfyUrl={setComfyUrl}
                selectedWorkflowId={selectedWorkflowId}
                workflow={workflow}
                handleSaveDefaultParams={handleSaveDefaultParams}
                isSavePending={saveDefaultParamsMutation.isPending}
                handleResetDefaultParams={handleResetDefaultParams}
                baseModels={baseModels}
                updateWorkflowBaseModelMutation={updateWorkflowBaseModelMutation}
                setWorkflowManageMode={setWorkflowManageMode}
                setRescanOpen={setRescanOpen}
              />
            )}
          </div>
        </div>
      </div>

      {/* Multi-Set Tab Bar (Desktop only) */}
      {selectedWorkflowId && (
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-5 py-2.5 flex-wrap gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 py-1 scrollbar-thin">
            {sets
              .filter((s) => (openPresetIds || []).map(String).includes(String(s.id)))
              .map((s) => (
                <SetTabItem
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  checked={s.checked}
                  isActive={String(s.id) === String(activeSetId)}
                  onClick={() => {
                    handleSelectPresetTab(s.id)
                  }}
                  onToggleCheck={() => toggleSetChecked(s.id)}
                  onRemove={() => removeSet(s.id)}
                />
              ))}
          </div>
          <div className="flex gap-2">
            <button type="button" id="add-set-btn" onClick={() => {
              const allNames = presets?.map((p) => p.name) || []
              setNewSetName(generateNextProfileName('Set', allNames))
              setCopySourceId('default')
              setShowCopyModal(true)
            }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-accent-green hover:border-accent-green/30 text-xs font-semibold transition-all">
              <Plus size={11} />Add Set
            </button>
            <button
              type="button"
              id="manage-presets-btn"
              onClick={() => setIsPresetManagerOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-[#7C6FDD] hover:border-[#7C6FDD]/30 text-xs font-semibold transition-all"
            >
              📑 管理
            </button>
          </div>
        </div>
      )}

      {/* Set Specific Settings / Param Sync (Desktop only) */}
      {selectedWorkflowId && activeSet && (
        <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface-2/20 px-5 py-3.5 flex items-center gap-3">
          {activeSet && (
            <span className="text-[10px] text-zinc-500 px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded font-medium truncate max-w-[120px]">
              {activeSet.name}
            </span>
          )}
          <div className="flex items-center gap-1 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg p-0.5">
            <button
              type="button"
              id="undo-btn"
              onClick={() => undo?.(activeSet.id)}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
            >
              ↩
            </button>
            <button
              type="button"
              id="redo-btn"
              onClick={() => redo?.(activeSet.id)}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="px-2 py-1 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
            >
              ↪
            </button>
          </div>
        </div>
      )}

      {/* Scrollable inputs panel */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
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

        {textMappings.map((m) => {
          const isNegative = m.role?.toLowerCase().includes('negative')
          const isCollapsed = getIsRoleCollapsed(m.role!)
          return (
            <div key={m.id} className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRoleCollapsed(m.role!, !isCollapsed)}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{m.display_name}</span>
                </button>
                {!isCollapsed && (
                  <div className="relative flex items-center gap-1.5">
                    <PromptSectionClipboardMenu
                      role={m.role!}
                      currentValue={paramValues[m.role!] ?? ''}
                      onChangeValue={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                      onOpenSaveAsTagSet={() => setSaveAsTagSetRole(m.role!)}
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
              </div>
              {!isCollapsed && (
                <>
                  <TagChipEditor
                    key={`${activeSetId}-${m.role!}`}
                    id={`prompt-${m.role!}`}
                    value={paramValues[m.role!] ?? ''}
                    chips={promptChips?.[m.role!]}
                    onChipsChange={(chips) => handleChipsChange(m.role!, chips)}
                    onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                    placeholder={`Enter ${m.display_name}…`}
                    variant={isNegative ? 'negative' : 'positive'}
                    defaultTextMode={m.role === 'Main_Positive_Prompt' ? isAnimaMode : undefined}
                    isAnimaMode={isAnimaMode}
                    onTextModeToggle={() => setRoleCollapsed(m.role!, false)}
                  />
                  <AppliedAssetChips
                    role={m.role!}
                    appliedAssets={appliedAssets}
                    toggleAppliedAsset={toggleAppliedAsset}
                    removeAppliedAsset={removeAppliedAsset}
                  />
                </>
              )}
            </div>
          )
        })}

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
        />
      </div>
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
                  {/* ★ ResourceGaugeHUD をプレビューエリア右上に配置 */}
                  <ResourceGaugeHUD />
                  {(previewImage || selectedImg) ? (

                    <div className="relative h-[70%] w-[70%] flex items-center justify-center border border-zinc-800 shadow-2xl rounded-lg bg-surface-2 overflow-hidden group cursor-pointer" onClick={handleOpenModalPreview}>
                      <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6 gap-3 bg-black/40">
                        <a href={previewImage || selectedImg!} download="generated.png" id="download-btn"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface/90 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-sm font-medium hover:bg-surface">
                          <Download size={15} />Download
                        </a>
                      </div>
                      {displayImages.length > 1 && (
                        <>
                          {displayImages.indexOf(selectedImg || '') > 0 && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handlePrevImg() }}
                              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight size={20} className="rotate-180" />
                            </button>
                          )}
                          {displayImages.indexOf(selectedImg || '') < displayImages.length - 1 && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleNextImg() }}
                              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight size={20} />
                            </button>
                          )}
                        </>
                      )}
                      {isGeneratingHere && <div className="absolute top-4 right-4 bg-surface-2/80 backdrop-blur p-2 rounded-full border border-white/10 shadow-lg"><Loader2 size={20} className="animate-spin text-accent-green" /></div>}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
                      {isGeneratingHere ? <Loader2 size={40} className="animate-spin text-accent-green" /> : <ImageOff size={40} strokeWidth={1} />}
                      <p className="text-sm">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
                    </div>
                  )}
                  {/* Status bar */}
                  <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex flex-col gap-2">
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
              {(previewImage || selectedImg) ? (
                <div className="relative h-[70%] w-[70%] flex items-center justify-center border border-zinc-800 shadow-2xl rounded-lg bg-surface-2 overflow-hidden group cursor-pointer" onClick={handleOpenModalPreview}>
                  <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6 gap-3 bg-black/40">
                    <a href={previewImage || selectedImg!} download="generated.png" id="download-btn"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface/90 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-sm font-medium hover:bg-surface">
                      <Download size={15} />Download
                    </a>
                  </div>
                  {displayImages.length > 1 && (
                    <>
                      {displayImages.indexOf(selectedImg || '') > 0 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handlePrevImg() }}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={20} className="rotate-180" />
                        </button>
                      )}
                      {displayImages.indexOf(selectedImg || '') < displayImages.length - 1 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleNextImg() }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={20} />
                        </button>
                      )}
                    </>
                  )}
                  {isGeneratingHere && <div className="absolute top-4 right-4 bg-surface-2/80 backdrop-blur p-2 rounded-full border border-white/10 shadow-lg"><Loader2 size={20} className="animate-spin text-accent-green" /></div>}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
                  {isGeneratingHere ? <Loader2 size={40} className="animate-spin text-accent-green" /> : <ImageOff size={40} strokeWidth={1} />}
                  <p className="text-sm">{isGeneratingHere ? 'Generating...' : 'No image yet'}</p>
                </div>
              )}
              {/* Status bar */}
              <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2.5 flex flex-col gap-2">
                {renderStatusBar()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-3">
        <button id="generate-btn" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected || !workflow}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95">
          <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
        </button>
        <button id="save-snapshot-btn" onClick={() => setIsSaveModalOpen(true)} disabled={isMultiSelectMode ? selectedIds.size === 0 : !selectedImg}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Camera size={15} /><span className="hidden sm:inline">Save Snapshot</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden w-full relative">
      <ResizableSplitLayout
        direction="horizontal"
        storageKey={LS_KEYS.LAYOUT_MAIN_SPLIT}
        initialSize={420}
        minSize={380}
        maxSize={700}
        first={leftPane}
        second={rightPane}
        className="w-full h-full"
      />

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
