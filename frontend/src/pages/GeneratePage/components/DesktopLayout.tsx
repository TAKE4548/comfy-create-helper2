import {
  Zap, Settings, ScanLine, MoreHorizontal, Plus, ChevronRight, ChevronDown,
  Download, ImageOff, CheckSquare, Square, Camera, Loader2
} from 'lucide-react'
import type { useGeneratePageState } from '../hooks/useGeneratePageState'
import { SettingsPopover } from './SettingsPopover'
import { AssetDropdown } from './AssetDropdown'
import { AppliedAssetChips } from './AppliedAssetChips'
import { AuditPanel } from './AuditPanel'
import { MappingErrorPanel } from './MappingErrorPanel'
import { ParamPanel } from './ParamPanel'
import { TagChipEditor } from '../../../components/TagChipEditor'
import { formatDateTime, getPromptPrefix } from '../../../utils/formatUtils'

type StateProps = ReturnType<typeof useGeneratePageState>

export const DesktopLayout = ({
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
    appliedAssets,
    toggleAppliedAsset, removeAppliedAsset,
    setComfyUrl,
    sets, activeSetId, addSet, removeSet, renameSet,
    toggleSetChecked, setAllSetsChecked, setActiveSetId,
    activeBatch,
    
    // state properties
    setRescanOpen,
    selectedSnapshotId,
    selectedMasters, setSelectedMasters,
    openAddAssetRole, setOpenAddAssetRole,
    isSettingsOpen, setIsSettingsOpen,
    localComfyUrl, setLocalComfyUrl,
    thumbnailTab, setThumbnailTab,
    setSelectedTriggerSetId,
    setSelectedLoraForModal,
    setLoraStrength,
    setIsJobModalOpen,
    sortOrder, setSortOrder,
    isPresetOpen, setIsPresetOpen,
    newPresetName, setNewPresetName,
    setIsPresetManagerOpen,
    setWorkflowManageMode,
    isWorkflowMenuOpen, setIsWorkflowMenuOpen,
    
    // queries & derived state
    workflows,
    workflow,
    mappingMasters,
    loras,
    tagSets,
    presets,
    comfyObjectInfo,
    displayImages,
    sortedDisplayImages,
    getSetNameForImage,
    sortedSnapshots,
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
    isGeneratingHere, totalQueueCount,
    showStrip, hasHistory, invalidMappings, textMappings, paramMappings,
    
    // handlers
    handleLoadSnapshot,
    handleUpdateMapping,
    handleAddTagSetAsset,
    handleOpenModalPreview,
    handleGenerateSets,
    getIsRoleCollapsed,
    setRoleCollapsed,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    setIsSaveModalOpen,
    updateWorkflowMutation,
    handleLoadPreset,
    handleUpdatePreset,
    handleDeletePreset,
    handleCreatePreset,
    saveDefaultParamsMutation,
  } = state

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

  const activeSet = sets.find((s) => s.id === activeSetId)

  return (
    <div className="flex h-full overflow-hidden w-full">
      {/* Left Column */}
      <div className="w-[420px] xl:w-[480px] flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] flex flex-col overflow-hidden">
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
              {selectedWorkflowId && (
                <div className="relative flex-shrink-0">
                  <button
                    id="workflow-ops-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsWorkflowMenuOpen(!isWorkflowMenuOpen);
                    }}
                    className={`p-1.5 rounded-md border transition-all ${
                      isWorkflowMenuOpen
                        ? 'border-accent-green bg-accent-green/10 text-accent-green'
                        : 'border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5'
                    }`}
                    title="ワークフロー操作"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {isWorkflowMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-32 bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-lg shadow-xl py-1 z-50 animate-fade-in">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkflowManageMode('rename');
                          setIsWorkflowMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                      >
                        名前を変更
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWorkflowManageMode('copy');
                          setIsWorkflowMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                      >
                        コピー
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                />
              )}
            </div>
            <select id="snapshot-history-select" value={selectedSnapshotId}
              onChange={(e) => { if (e.target.value) handleLoadSnapshot(Number(e.target.value)) }}
              disabled={!hasHistory}
              className="text-xs bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/50 disabled:opacity-45 max-w-[140px] truncate">
              {!hasHistory ? <option value="">履歴なし</option> : (
                <>
                  <option value="">過去スナップショットを選択...</option>
                  {sortedSnapshots?.map((s) => <option key={s.id} value={s.id}>{formatDateTime(s.created_at)} - {getPromptPrefix(s.params)}</option>)}
                </>
              )}
            </select>
            <button id="rescan-btn" onClick={() => setRescanOpen(true)} disabled={!selectedWorkflowId} title="マッピングを再スキャン・修正"
              className="p-1.5 rounded-md border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:text-accent-green hover:border-accent-green/40 hover:bg-accent-green/5 disabled:opacity-30 transition-all flex-shrink-0">
              <ScanLine size={14} />
            </button>
          </div>
        </div>

        {/* Multi-Set Tab Bar (Desktop only) */}
        {selectedWorkflowId && (
          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-surface-2/40 px-5 py-2.5 flex-wrap gap-2.5">
            <div className="flex items-center gap-2 overflow-x-auto max-w-[70%] py-1 scrollbar-thin">
              {sets.map((s) => (
                <div key={s.id} onClick={() => setActiveSetId(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                    s.id === activeSetId
                      ? 'bg-accent-green/10 border-accent-green/40 text-accent-green font-bold'
                      : 'bg-surface-2 border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-400'
                  }`}>
                  <input type="checkbox" checked={s.checked} onChange={() => toggleSetChecked(s.id)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer" />
                  <span className="truncate max-w-[80px]">{s.name}</span>
                  {sets.length > 1 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeSet(s.id) }} className="text-zinc-500 hover:text-red-400 ml-1">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => {
                const checked = sets.some((s) => !s.checked)
                setAllSetsChecked(checked)
              }} className="text-[10px] text-zinc-500 hover:text-zinc-350 transition-colors">
                {sets.every((s) => s.checked) ? '全解除' : '全選択'}
              </button>
              <button type="button" id="add-set-btn" onClick={() => addSet()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-accent-green hover:border-accent-green/30 text-xs font-semibold transition-all">
                <Plus size={11} />Add Set
              </button>
            </div>
          </div>
        )}

        {/* Set Specific Settings / Param Sync (Desktop only) */}
        {selectedWorkflowId && activeSet && (
          <div className="border-b border-[rgba(255,255,255,0.06)] bg-surface-2/20 px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Set Settings</span>
              <input
                type="text"
                id="set-name-input"
                value={activeSet.name}
                onChange={(e) => renameSet(activeSet.id, e.target.value)}
                className="bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-xs text-zinc-300 font-semibold focus:outline-none focus:border-accent-green/40 max-w-[120px]"
              />
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <button
                  type="button"
                  id="preset-popover-btn"
                  onClick={() => setIsPresetOpen(!isPresetOpen)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    isPresetOpen
                      ? 'border-[#7C6FDD] bg-[rgba(124,111,221,0.1)] text-[#7C6FDD]'
                      : 'border-[rgba(255,255,255,0.08)] text-zinc-350 hover:bg-white/5'
                  }`}
                >
                  Presets
                </button>
                {isPresetOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl p-3 z-50 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.05)] pb-1.5">
                      <span className="text-xs font-semibold text-zinc-200">Presets</span>
                      <button 
                        onClick={() => setIsPresetManagerOpen(true)}
                        className="text-[10px] text-[#7C6FDD] hover:underline"
                      >
                        管理
                      </button>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {presets && presets.length > 0 ? presets.map((p) => (
                        <div key={p.id} className="flex items-center justify-between group/preset p-1 hover:bg-white/5 rounded">
                          <button
                            type="button"
                            onClick={() => handleLoadPreset(p)}
                            className="flex-1 text-left text-xs text-zinc-300 truncate font-medium hover:text-white"
                          >
                            {p.name}
                          </button>
                          <div className="flex gap-1 opacity-0 group-hover/preset:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleUpdatePreset(p.id, p.name)}
                              className="text-[9px] px-1 bg-zinc-800 text-zinc-400 hover:text-white rounded"
                              title="現在設定で上書き"
                            >
                              上書き
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePreset(p.id)}
                              className="text-[9px] px-1 bg-red-950/40 text-red-400 hover:bg-red-900/60 rounded"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )) : <p className="text-[10px] text-zinc-500 italic py-1">No presets found</p>}
                    </div>
                    <div className="flex gap-1.5 pt-1.5 border-t border-[rgba(255,255,255,0.05)]">
                      <input
                        type="text"
                        placeholder="New preset name..."
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="flex-1 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreatePreset}
                        className="px-2 py-1 rounded bg-[#7C6FDD] text-white text-[10px] font-semibold hover:bg-[#6d62cc]"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
            setAuditTypes={setAuditTypes}
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
                    <div className="relative">
                      <button type="button" id={`add-asset-btn-${m.role!}`}
                        onClick={() => setOpenAddAssetRole(openAddAssetRole === m.role ? null : m.role!)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all">
                        <Plus size={10} />Add Asset
                      </button>
                      {openAddAssetRole === m.role && (
                        <AssetDropdown
                          role={m.role!}
                          loras={loras}
                          tagSets={tagSets}
                          setLoraStrength={setLoraStrength}
                          setSelectedTriggerSetId={setSelectedTriggerSetId}
                          setSelectedLoraForModal={setSelectedLoraForModal}
                          setOpenAddAssetRole={setOpenAddAssetRole}
                          handleAddTagSetAsset={handleAddTagSetAsset}
                        />
                      )}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <>
                    <TagChipEditor id={`prompt-${m.role!}`} value={paramValues[m.role!] ?? ''}
                      onChange={(val) => setParamValues({ ...paramValues, [m.role!]: val })}
                      placeholder={`Enter ${m.display_name}…`}
                      variant={isNegative ? 'negative' : 'positive'} />
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
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            seedMode={seedMode}
            setSeedMode={setSeedMode}
            seed={seed}
            setSeed={setSeed}
            comfyObjectInfo={comfyObjectInfo}
          />
        </div>
      </div>

      {/* Right Column */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-surface/80 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)] px-4 py-2 flex flex-col gap-1.5">
            <div className="h-1 bg-surface-2 rounded-full overflow-hidden w-full border border-white/5">
              <div className="h-full bg-accent-green progress-shimmer transition-all duration-200" style={{ width: `${isGeneratingHere ? batchProgress.percentage : 0}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <div className="flex items-center gap-2">
                {isGeneratingHere ? <Loader2 size={12} className="animate-spin text-accent-green flex-shrink-0" /> : <div className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />}
                <span className="font-semibold text-zinc-300">{isGeneratingHere ? batchProgress.text : 'Ready'}</span>
                <span className="text-zinc-700">|</span>
                <span 
                  onClick={() => setIsJobModalOpen(true)}
                  className="text-zinc-300 cursor-pointer hover:text-white transition-colors font-semibold"
                >
                  Queue: {totalQueueCount}
                </span>
              </div>
              <span className="font-mono text-accent-green font-semibold">{isGeneratingHere ? batchProgress.percentage : 0}%</span>
            </div>
          </div>
        </div>

        {/* Thumbnail Strip */}
        {showStrip && (
          <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5">
              <div className="flex gap-4">
                {(['history', 'snapshots'] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setThumbnailTab(tab)}
                    className={`text-xs font-semibold pb-1 border-b-2 transition-all ${thumbnailTab === tab ? 'border-accent-green text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-350'}`}>
                    {tab === 'history' ? '履歴 (History)' : 'スナップショット (Snapshots)'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
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
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" id="session-filter-toggle" checked={filterOwnSession} onChange={(e) => setFilterOwnSession(e.target.checked)} className="w-3.5 h-3.5 rounded border-zinc-800 accent-accent-green cursor-pointer" />
                    <span className="text-[11px] text-zinc-400">自セッションのみ表示</span>
                  </label>
                )}
              </div>
            </div>
            {thumbnailTab === 'history' ? (
              sortedDisplayImages.length > 0 ? (
                <div className="space-y-2">
                  {isMultiSelectMode && (
                    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                      <div className="flex items-center gap-2">
                        <span>{selectedIds.size}枚選択中</span>
                        <button type="button" onClick={selectAll} className="text-purple-400 hover:text-purple-200 font-semibold underline">すべて選択</button>
                        <button type="button" onClick={clearSelection} className="text-purple-400 hover:text-purple-200 font-semibold underline">選択解除</button>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setIsSaveModalOpen(true)}
                          disabled={selectedIds.size === 0}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          選択した {selectedIds.size} 枚を保存
                        </button>
                        <button type="button" onClick={exitMultiSelectMode} className="text-zinc-400 hover:text-zinc-200 font-semibold">
                          ✕ 選択モード終了
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {sortedDisplayImages.map((img, i) => {
                      const longPressHandlers = getLongPressHandlers(i)
                      const isSel = isSelected(i)
                      return (
                        <button key={i} type="button" id={`thumb-${i}`}
                          onMouseDown={longPressHandlers.onMouseDown}
                          onMouseUp={longPressHandlers.onMouseUp}
                          onMouseLeave={longPressHandlers.onMouseLeave}
                          onTouchStart={longPressHandlers.onTouchStart}
                          onTouchEnd={longPressHandlers.onTouchEnd}
                          onClick={(e) => {
                            if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                              handleItemClick(i, e)
                            } else {
                              setSelectedImg(img)
                            }
                          }}
                          className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all relative ${
                            isMultiSelectMode
                              ? isSel
                                ? 'border-purple-500 ring-2 ring-purple-500/30'
                                : 'border-transparent'
                              : selectedImg === img
                                ? 'border-accent-green'
                                : 'border-transparent hover:border-zinc-650'
                          }`}>
                          <img src={img} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                          {getSetNameForImage(img) && (
                            <span className="absolute top-0.5 left-0.5 bg-black/75 text-accent-green text-[8px] font-bold px-1 rounded select-none truncate max-w-[90%] font-medium">
                              {getSetNameForImage(img)}
                            </span>
                          )}
                          {isMultiSelectMode && (
                            <div className="absolute top-0.5 right-0.5 z-10 p-0.5 rounded bg-black/60 text-purple-400 border border-[rgba(255,255,255,0.08)]">
                              {isSel ? <CheckSquare size={12} /> : <Square size={12} />}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : <p className="text-xs text-zinc-600 py-2">No history images found for this session.</p>
            ) : (
              sortedSnapshots && sortedSnapshots.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {sortedSnapshots.map((snap) => (
                    <button key={snap.id} type="button" onClick={() => handleLoadSnapshot(snap.id)}
                      className="flex-shrink-0 flex flex-col items-center gap-1.5 p-1 rounded-md border border-[rgba(255,255,255,0.06)] hover:border-accent-green/45 bg-surface-2/40 hover:bg-surface-2 transition-all w-24 group">
                      <div className="w-20 h-20 rounded overflow-hidden bg-black/40">
                        {snap.image_path ? <img src={snap.image_path} alt="Snapshot" className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center text-zinc-650"><ImageOff size={16} /></div>}
                      </div>
                      <span className="text-[9px] text-zinc-450 text-center truncate w-full font-mono">{getPromptPrefix(snap.params) || `Snap #${snap.id}`}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-xs text-zinc-555 py-2 italic">No snapshots available for this workflow.</p>
            )}
          </div>
        )}

        {/* Action Bar */}
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-surface px-4 py-3 flex items-center gap-3">
          <button id="generate-btn" onClick={handleGenerateSets} disabled={!selectedWorkflowId || !isConnected}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green active:scale-95">
            <Zap size={16} />{isGenerating ? 'Generate Batch (キュー追加)' : 'Generate Batch'}
          </button>
          <button id="save-snapshot-btn" onClick={() => setIsSaveModalOpen(true)} disabled={!selectedImg || isMultiSelectMode}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-zinc-300 text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Camera size={15} /><span className="hidden sm:inline">Save Snapshot</span>
          </button>
        </div>
      </div>
    </div>
  )
}
