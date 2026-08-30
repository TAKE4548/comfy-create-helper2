import { useState, useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import {
  Loader2, Settings, ImageOff, Download, CheckSquare, Square, Plus,
  ChevronRight, ChevronDown, Zap, Camera, X
} from 'lucide-react'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'
import { SettingsPopover } from './SettingsPopover'
import { AddAssetModal } from './AddAssetModal'
import { AppliedAssetChips } from './AppliedAssetChips'
import { AuditPanel } from './AuditPanel'
import { MappingErrorPanel } from './MappingErrorPanel'
import { ParamPanel } from './ParamPanel'
import { TagChipEditor } from '../../../components/TagChipEditor'
import { PromptTranslationModal } from './PromptTranslationModal'
import { getPromptPrefix } from '../../../utils/formatUtils'
import { BypassSettingsModal } from '../../../components/BypassSettingsModal'
import { ParamSyncModal } from '../../../components/ParamSyncModal'
import { generateNextProfileName } from '../../../utils/profileUtils'

type StateProps = ReturnType<typeof useGeneratePageState>

export const MobileLayout = ({
  state,
}: {
  state: StateProps
}) => {
  const {
    isConnected, isGenerating, progress, previewImage, activeClientId,
    clientId, filterOwnSession, setFilterOwnSession,
    selectedWorkflowId, setSelectedWorkflowId,
    paramValues, setParamValues,
    batchSize, setBatchSize, seedMode, setSeedMode, seed, setSeed,
    selectedImg, setSelectedImg,
    comfyHistoryImages,
    appliedAssets,
    addAppliedAsset,
    toggleAppliedAsset, removeAppliedAsset,
    activeBatch,
    sets, activeSetId, removeSet,
    toggleSetChecked, setActiveSetId,
    openPresetIds, undo, redo, canUndo, canRedo,
    
    // state properties
    activePromptTab, setActivePromptTab,
    setRescanOpen,
    selectedMasters, setSelectedMasters,
    openAddAssetRole, setOpenAddAssetRole,
    isSettingsOpen, setIsSettingsOpen,
    localComfyUrl, setLocalComfyUrl,
    setComfyUrl,
    thumbnailTab, setThumbnailTab,
    setModalPreviewIndex,
    setIsModalPreviewOpen,
    setIsJobModalOpen,
    sortOrder, setSortOrder,
    setIsPresetManagerOpen,
    handleLoadPreset,
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
    sortedDisplayImages,
    getSetNameForImage,
    sortedSnapshots,
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
    handleCreatePreset,
    isAnimaMode,
    setIsAnimaMode,
    promptTranslation,
  } = state

  const [showCopyModal, setShowCopyModal] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [copySourceId, setCopySourceId] = useState<string | number>('default')

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

  const [isBypassSettingsOpen, setIsBypassSettingsOpen] = useState(false)
  const [isParamSyncSettingsOpen, setIsParamSyncSettingsOpen] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

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
    <div className="flex flex-col h-full overflow-y-auto pb-36 bg-surface relative w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-zinc-200">Generate</h1>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent-green animate-pulse' : 'bg-zinc-600'}`} />
            {isGenerating && activeClientId !== clientId && (
              <span className="text-[10px] text-zinc-555 bg-surface-2 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.06)] animate-pulse">他セッションで生成中...</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <select id="workflow-select-mobile" value={selectedWorkflowId ?? ''}
            onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
            className="flex-1 text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 truncate">
            <option value="">+ 新しいワークフローを追加 (Upload New...)</option>
            {workflows?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {selectedWorkflowId && (
            <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer select-none bg-surface border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 hover:bg-surface-2 transition-colors">
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
          <div className="relative flex-shrink-0 flex items-center">
            <button id="settings-toggle-btn-mobile" type="button" onClick={() => setIsSettingsOpen(!isSettingsOpen)}
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
                mobile
                baseModels={baseModels}
                updateWorkflowBaseModelMutation={updateWorkflowBaseModelMutation}
                setWorkflowManageMode={setWorkflowManageMode}
                setRescanOpen={setRescanOpen}
              />
            )}
          </div>
        </div>
      </div>

      {/* Progress Line */}
      <div className="w-full bg-surface-2 border-b border-[rgba(255,255,255,0.06)] px-4 py-2 flex flex-col gap-2">
        {isGeneratingHere ? (
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
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium pt-0.5">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-accent-green flex-shrink-0" />
                <span>経過: {elapsedTime}秒</span>
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
        ) : isOtherSessionGenerating ? (
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
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium pt-0.5">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-amber-400 flex-shrink-0" />
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
      <div className="bg-grid relative w-full aspect-video max-h-[300px] flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-surface-2">
        {(previewImage || selectedImg) ? (
          <div className="relative w-full h-full flex items-center justify-center cursor-pointer" onClick={handleOpenModalPreview}>
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

      {/* Thumbnail Strip */}
      {showStrip && (
        <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface px-4 py-2 space-y-2">
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1 flex-wrap gap-2">
            <div className="flex gap-3">
              {(['history', 'snapshots'] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setThumbnailTab(tab)}
                  className={`text-[11px] font-semibold pb-0.5 border-b-2 transition-all ${thumbnailTab === tab ? 'border-accent-green text-zinc-200' : 'border-transparent text-zinc-500'}`}>
                  {tab === 'history' ? '履歴' : 'スナップショット'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-[rgba(255,255,255,0.08)] bg-zinc-950/20">
                {(['desc', 'asc'] as const).map((order) => (
                  <button
                    key={order}
                    type="button"
                    onClick={() => setSortOrder(order)}
                    className={`px-2.5 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
                      sortOrder === order ? 'bg-surface-2 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {order === 'desc' ? '新しい順' : '古い順'}
                  </button>
                ))}
              </div>
              {thumbnailTab === 'history' && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" id="session-filter-toggle-mobile" checked={filterOwnSession} onChange={(e) => setFilterOwnSession(e.target.checked)} className="w-3.5 h-3.5 rounded accent-accent-green cursor-pointer" />
                  <span className="text-[10px] text-zinc-500">自セッションのみ</span>
                </label>
              )}
            </div>
          </div>
          {thumbnailTab === 'history' ? (
            sortedDisplayImages.length > 0 ? (
              <div className="space-y-2">
                {isMultiSelectMode && (
                  <div className="flex flex-col gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300">
                    <div className="flex items-center justify-between">
                      <span>{selectedIds.size}枚選択中</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={selectAll} className="text-purple-400 underline">すべて選択</button>
                        <button type="button" onClick={clearSelection} className="text-purple-400 underline">選択解除</button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSaveModalOpen(true)}
                        disabled={selectedIds.size === 0}
                        className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-center disabled:opacity-50"
                      >
                        選択した {selectedIds.size} 枚を保存
                      </button>
                      <button type="button" onClick={exitMultiSelectMode} className="text-zinc-400">
                        ✕ 閉じる
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {sortedDisplayImages.map((img, i) => {
                    const longPressHandlers = getLongPressHandlers(img)
                    const isSel = isSelected(img)
                    return (
                      <button key={img || i} type="button" id={`thumb-mobile-${i}`}
                        onMouseDown={longPressHandlers.onMouseDown}
                        onMouseUp={longPressHandlers.onMouseUp}
                        onMouseLeave={longPressHandlers.onMouseLeave}
                        onTouchStart={longPressHandlers.onTouchStart}
                        onTouchEnd={longPressHandlers.onTouchEnd}
                        onContextMenu={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
                        style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
                        onClick={(e) => {
                          handleItemClick(img, e)
                          if (!isMultiSelectMode && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                            setSelectedImg(img)
                            setModalPreviewIndex(i)
                            setIsModalPreviewOpen(true)
                          }
                        }}
                        className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all relative select-none ${
                          isMultiSelectMode
                            ? isSel
                              ? 'border-purple-500 ring-2 ring-purple-500/30'
                              : 'border-transparent'
                            : selectedImg === img
                              ? 'border-accent-green'
                              : 'border-transparent hover:border-zinc-600'
                        }`}>
                        <img
                          src={img}
                          alt={`Generated ${i + 1}`}
                          className="w-full h-full object-cover pointer-events-none select-none"
                          style={{ WebkitTouchCallout: 'none' }}
                        />
                        {getSetNameForImage(img) && (
                          <span className="absolute top-0.5 left-0.5 bg-black/75 text-accent-green text-[7px] font-bold px-1 rounded select-none truncate max-w-[90%] font-medium">
                            {getSetNameForImage(img)}
                          </span>
                        )}
                        {isMultiSelectMode && (
                          <div className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-black/60 text-purple-400 border border-[rgba(255,255,255,0.08)]">
                            {isSel ? <CheckSquare size={10} /> : <Square size={10} />}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : filterOwnSession && comfyHistoryImages.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-3 gap-1.5 text-center">
                <p className="text-[11px] text-zinc-400">他セッションの履歴（{comfyHistoryImages.length}件）があります</p>
                <button
                  type="button"
                  onClick={() => setFilterOwnSession(false)}
                  className="px-2.5 py-0.5 bg-surface-2 border border-accent-green/30 text-accent-green hover:bg-accent-green/10 rounded text-[10px] font-semibold transition-all"
                >
                  自セッションのみ表示を解除
                </button>
              </div>
            ) : <p className="text-[10px] text-zinc-500 py-1">No history images found for this session.</p>
          ) : (
            sortedSnapshots && sortedSnapshots.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                {sortedSnapshots.map((snap) => (
                  <button key={snap.id} type="button" onClick={() => handleLoadSnapshot(snap.id)}
                    className="flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded border border-[rgba(255,255,255,0.06)] bg-surface-2/40 hover:bg-surface-2 transition-all w-20 group">
                    <div className="w-16 h-16 rounded overflow-hidden bg-black/40">
                      {snap.image_path || snap.thumbnail_path ? <img src={snap.thumbnail_path || snap.image_path!} alt="Snapshot" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-650"><ImageOff size={14} /></div>}
                    </div>
                    <span className="text-[8px] text-zinc-450 text-center truncate w-full font-mono">{getPromptPrefix(snap.params) || `Snap #${snap.id}`}</span>
                  </button>
                ))}
              </div>
            ) : <p className="text-[10px] text-zinc-500 py-1 italic">No snapshots available.</p>
          )}
        </div>
      )}

      {/* Multi-Set Tab Bar (Mobile) */}
      {selectedWorkflowId && (
        <div className="flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-4 py-2.5 space-y-2.5">
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
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
                  >
                    ↩
                  </button>
                  <button
                    type="button"
                    id="redo-btn-mobile"
                    onClick={() => redo?.(activeSet.id)}
                    disabled={!canRedo}
                    title="Redo"
                    className="px-2 py-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none text-xs font-bold"
                  >
                    ↪
                  </button>
                </div>
              )}
              <button
                type="button"
                id="manage-presets-btn-mobile"
                onClick={() => setIsPresetManagerOpen(true)}
                className="px-2 py-0.5 rounded text-[10px] border border-[rgba(255,255,255,0.08)] text-zinc-350 hover:bg-white/5 font-semibold transition-all"
              >
                📑 管理
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none flex-1">
              {sets.filter((s) => (openPresetIds || []).map(String).includes(String(s.id))).map((s) => (
                <div key={s.id} onClick={() => {
                  const targetPreset = presets?.find(p => String(p.id) === String(s.id))
                  if (targetPreset) handleLoadPreset(targetPreset)
                  else setActiveSetId(s.id)
                }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex-shrink-0 ${
                    String(s.id) === String(activeSetId)
                      ? 'bg-accent-green/10 border-accent-green/40 text-accent-green font-bold'
                      : 'bg-surface-2 border-[rgba(255,255,255,0.04)] text-zinc-400'
                  }`}>
                  <input type="checkbox" checked={s.checked} onChange={() => toggleSetChecked(s.id)} onClick={(e) => e.stopPropagation()} className="w-3 h-3 rounded accent-accent-green cursor-pointer" />
                  <span className="truncate max-w-[70px]">{s.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeSet(s.id) }} className="text-zinc-500 hover:text-red-400 ml-0.5" title="タブを閉じる (DBからは削除されません)">✕</button>
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
        <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40">
          <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-1 no-scrollbar">
            {textMappings.map((m) => (
              <button key={m.id} type="button" onClick={() => setActivePromptTab(m.role || '')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${activePromptTab === m.role ? 'border-accent-green bg-accent-green/10 text-accent-green font-medium' : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200'}`}>
                {m.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {textMappings.length === 0 && !selectedWorkflowId && <div className="px-4 py-6">{renderUploadZone()}</div>}

      {/* Active Prompt Textarea (Mobile) */}
      {textMappings.length > 0 && activePromptTab && activePromptTabMapping && (
        <div className="px-4 py-3 space-y-2 border-b border-[rgba(255,255,255,0.06)] bg-surface-2/10">
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
                id={`prompt-mobile-${activePromptTabMapping.role!}`}
                value={paramValues[activePromptTabMapping.role!] ?? ''}
                onChange={(val) => setParamValues({ ...paramValues, [activePromptTabMapping.role!]: val })}
                placeholder={`Enter ${activePromptTabMapping.display_name}…`}
                variant={isNegative ? 'negative' : 'positive'}
                defaultTextMode={activePromptTabMapping.role === 'Main_Positive_Prompt' ? isAnimaMode : undefined}
                isAnimaMode={isAnimaMode}
                onTextModeToggle={() => setRoleCollapsed(activePromptTabMapping.role!, false)}
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

      {/* Mobile Settings & Parameters */}
      <div className="px-4 py-3 space-y-4">
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

      {/* Mobile Action Bar */}
      <div className="fixed bottom-16 left-0 right-0 z-45 bg-surface/90 backdrop-blur border-t border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3">
        <button id="generate-btn-mobile" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected || !workflow}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all active:scale-95">
          <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
        </button>
        <button id="save-snapshot-btn-mobile" onClick={() => setIsSaveModalOpen(true)} disabled={isMultiSelectMode ? selectedIds.size === 0 : !selectedImg}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 transition-all">
          <Camera size={15} />
        </button>
      </div>
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in px-4">
          <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl p-5 w-full max-w-sm space-y-4 text-left">
            <h3 className="text-sm font-bold text-zinc-200">新規プロファイル作成 (Add Set)</h3>
            <div className="space-y-1.5">
              <label htmlFor="new-profile-name-mobile" className="text-xs text-zinc-400 font-semibold">プロファイル名</label>
              <input
                id="new-profile-name-mobile"
                type="text"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="プロファイル名を入力..."
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/50"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="copy-source-select-mobile" className="text-xs text-zinc-400 font-semibold">コピー元 (ベース設定)</label>
              <select
                id="copy-source-select-mobile"
                value={copySourceId}
                onChange={(e) => {
                  const val = e.target.value
                  const allNames = presets?.map((p) => p.name) || []
                  if (val === 'default') {
                    setCopySourceId('default')
                    setNewSetName(generateNextProfileName('Set', allNames))
                  } else {
                    const numId = Number(val)
                    setCopySourceId(numId)
                    const selected = presets?.find((p) => p.id === numId)
                    if (selected) {
                      setNewSetName(generateNextProfileName(selected.name, allNames))
                    }
                  }
                }}
                className="w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-accent-green/50"
              >
                <option value="default">ワークフローのデフォルト設定</option>
                {presets?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                id="cancel-add-set-btn-mobile"
                onClick={() => setShowCopyModal(false)}
                className="px-4 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-350 hover:text-white text-xs font-semibold transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                id="confirm-add-set-btn-mobile"
                onClick={() => {
                  if (newSetName.trim()) {
                    handleCreatePreset(newSetName.trim(), copySourceId)
                    setShowCopyModal(false)
                  }
                }}
                disabled={!newSetName.trim()}
                className="px-4 py-1.5 rounded-lg bg-accent-green text-background hover:brightness-110 disabled:opacity-50 text-xs font-bold transition-all"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {isBypassSettingsOpen && (
        <BypassSettingsModal 
          onClose={() => setIsBypassSettingsOpen(false)} 
          workflowJson={workflow?.json_body}
        />
      )}

      {isParamSyncSettingsOpen && (
        <ParamSyncModal
          onClose={() => setIsParamSyncSettingsOpen(false)}
        />
      )}

      {errorToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-900 border border-red-800 text-red-100 px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in">
          <span className="text-sm font-medium">{errorToast.message}</span>
          <button
            onClick={() => setErrorToast(null)}
            className="p-1 hover:bg-white/10 rounded text-red-300 hover:text-red-100 transition-all"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {promptTranslation && (
        <PromptTranslationModal
          isOpen={promptTranslation.isOpen}
          onClose={promptTranslation.closeTranslation}
          roleDisplayName={
            textMappings.find((m) => m.role === promptTranslation.activeRole)?.display_name ||
            promptTranslation.activeRole ||
            ''
          }
          mode={promptTranslation.mode}
          onModeChange={promptTranslation.setMode}
          sourceText={promptTranslation.sourceText}
          onSourceTextChange={promptTranslation.setSourceText}
          translatedText={promptTranslation.translatedText}
          meta={promptTranslation.meta}
          isTranslating={promptTranslation.isTranslating}
          error={promptTranslation.error}
          onTranslate={promptTranslation.executeTranslate}
          onApply={promptTranslation.applyToPrompt}
        />
      )}
    </div>
  )
}
