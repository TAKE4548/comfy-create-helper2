import React from 'react'
import { X, AlertTriangle, Loader2 } from 'lucide-react'
import { useGeneratePageState } from './GeneratePage/hooks/useGeneratePageState'
import { DesktopLayout } from './GeneratePage/components/DesktopLayout'
import { MobileLayout } from './GeneratePage/components/MobileLayout'
import { LazyModalHost } from '../components/common/LazyBoundary'
import { Modal } from '../components/common/Modal'
import { LS_KEYS } from '../utils/localStorageKeys'

// [REQ-309] Modal/panel chunks are loaded through LazyModalHost on first open (or on first mount for latch modals).
const loadProfileBulkEditModal = () => import('../components/ProfileBulkEditModal').then((m) => ({ default: m.ProfileBulkEditModal }))
const loadRescanModal = () => import('../components/RescanModal').then((m) => ({ default: m.RescanModal }))
const loadUploadWorkflowModal = () => import('../components/UploadWorkflowModal').then((m) => ({ default: m.UploadWorkflowModal }))
const loadWorkflowManageModal = () => import('../components/WorkflowManageModal').then((m) => ({ default: m.WorkflowManageModal }))
const loadPresetManagerPanel = () => import('../components/PresetManagerPanel').then((m) => ({ default: m.PresetManagerPanel }))
const loadHistoryModalPreview = () => import('../components/HistoryModalPreview').then((m) => ({ default: m.HistoryModalPreview }))
const loadJobManagementModal = () => import('../components/JobManagementModal').then((m) => ({ default: m.JobManagementModal }))
const loadAddSnapshotToAlbumModal = () => import('../components/AddSnapshotToAlbumModal').then((m) => ({ default: m.AddSnapshotToAlbumModal }))
const loadSceneGeneratorModal = () => import('../components/SceneGeneratorModal').then((m) => ({ default: m.SceneGeneratorModal }))
const loadPresetConflictModal = () => import('../components/PresetConflictModal').then((m) => ({ default: m.PresetConflictModal }))

interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
export class GeneratePageErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('GeneratePage error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-300">
          <div className="bg-[#1F1F25] border border-red-500/30 rounded-xl p-6 max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-red-400">画面の表示中にエラーが発生しました</h2>
            <p className="text-xs text-zinc-400 font-mono text-left bg-black/40 p-3 rounded overflow-auto max-h-32">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#7C6FDD] text-white rounded-lg text-sm hover:brightness-110 transition-all"
            >
              再読み込み
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function GeneratePage() {
  const state = useGeneratePageState()
  const {
    isMobile,
    rescanOpen, setRescanOpen,
    selectedWorkflowId, setSelectedWorkflowId,
    workflow,
    rawWorkflow,
    qc,
    uploadModalOpen, setUploadModalOpen, uploadedJson, uploadedFileName,
    isSaveModalOpen, setIsSaveModalOpen,
    isMultiSelectMode, selectedIds, sortedDisplayImages, selectedImg, saveSnapshot, exitMultiSelectMode,
    selectedLoraForModal, setSelectedLoraForModal, selectedTriggerSetId, setSelectedTriggerSetId,
    loraStrength, setLoraStrength, handleAddLoraAsset,
    workflowManageMode, setWorkflowManageMode, renameWorkflowMutation, copyWorkflowMutation, workflows,
    isPresetManagerOpen, setIsPresetManagerOpen, presets, renamePresetMutation, reorderPresetsMutation,
    isModalPreviewOpen, setIsModalPreviewOpen, modalPreviewIndex, setModalPreviewIndex, snapshotIdsForDisplay,
    previewAutoFollow, handleToggleAutoFollow,
    isJobModalOpen, setIsJobModalOpen,
    isSceneGeneratorOpen, setIsSceneGeneratorOpen, paramValues, textMappings,
    sets, toggleSetChecked, handleDeletePreset, handleUpdatePreset, handleCreatePreset, activeSetId,
    handleSelectPresetTab, openPresetIds, removeSet,
    isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen,
    isBulkEditOpen, setIsBulkEditOpen,
    bulkTargetIds, isBulkApplying,
    handleBulkDeleteRequest, handleBulkDeleteConfirm,
    handleBulkEditRequest, handleBulkEditApply,
    bulkDeletePresetsMutation,
    loras,
    tagSets,
  } = state

  return (
    <>
      <GeneratePageErrorBoundary>
        {isMobile ? (
          <MobileLayout state={state} />
        ) : (
          <DesktopLayout state={state} />
        )}
      </GeneratePageErrorBoundary>

      {/* Modals & Overlays */}
      <LazyModalHost
        mode="while-open"
        isOpen={rescanOpen && !!workflow}
        load={loadRescanModal}
        label="ワークフロー再スキャン"
        onClose={() => setRescanOpen(false)}
        modalProps={{
          workflowId: selectedWorkflowId!,
          workflowJson: workflow?.json_body ?? {},
          existingMappings: rawWorkflow?.mappings ?? workflow?.mappings ?? [],
          onClose: () => setRescanOpen(false),
          onSaved: () => { qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] }); setRescanOpen(false) },
        }}
      />
      <LazyModalHost
        mode="while-open"
        isOpen={uploadModalOpen && !!uploadedJson}
        load={loadUploadWorkflowModal}
        label="ワークフロー追加"
        onClose={() => setUploadModalOpen(false)}
        modalProps={{
          initialName: uploadedFileName,
          workflowJson: uploadedJson ?? {},
          onClose: () => { setUploadModalOpen(false) },
          onSaved: (newWorkflowId) => { qc.invalidateQueries({ queryKey: ['workflows'] }); setSelectedWorkflowId(newWorkflowId) },
        }}
      />
      <LazyModalHost
        mode="latch"
        isOpen={isSaveModalOpen}
        load={loadAddSnapshotToAlbumModal}
        label="スナップショット保存"
        onClose={() => setIsSaveModalOpen(false)}
        modalProps={{
          isOpen: isSaveModalOpen,
          onClose: () => setIsSaveModalOpen(false),
          onConfirm: (data) => {
            const urls = isMultiSelectMode
              ? [...selectedIds].filter(Boolean)
              : (selectedImg ? [selectedImg] : [])
            saveSnapshot.mutate({ ...data, imagePaths: urls }, {
              onSuccess: () => {
                if (isMultiSelectMode) {
                  exitMultiSelectMode()
                }
              }
            })
          },
          isPending: saveSnapshot.isPending,
          title: 'スナップショットを保存',
          confirmText: '保存',
          allowNone: true,
          storageKey: LS_KEYS.LAST_SAVE_ALBUM_ID_GENERATE,
        }}
      />
      <Modal
        isOpen={!!selectedLoraForModal}
        onClose={() => setSelectedLoraForModal(null)}
        size="sm"
        ariaLabel="LoRA設定"
        dialogClassName="bg-surface-2 border border-[rgba(255,255,255,0.08)] p-6 space-y-5 shadow-2xl relative"
      >
        {selectedLoraForModal && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-200">LoRA設定</h3>
                <p className="text-xs text-zinc-500 mt-1 truncate max-w-[320px]">{selectedLoraForModal.lora.description || selectedLoraForModal.lora.model_name.split('/').pop()?.replace('.safetensors', '')}</p>
              </div>
              <button id="close-lora-modal-btn" onClick={() => setSelectedLoraForModal(null)} className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">トリガーワードセット</label>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                  {selectedLoraForModal.lora.trigger_word_sets?.length ? (
                    <>
                      {selectedLoraForModal.lora.trigger_word_sets.map((set) => (
                        <label key={set.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTriggerSetId === set.id ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200' : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'}`}>
                          <input type="radio" name="trigger-word-set" checked={selectedTriggerSetId === set.id} onChange={() => setSelectedTriggerSetId(set.id)} className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800" />
                          <div className="flex-1 min-w-0"><p className="text-xs font-semibold">{set.name}</p><p className="text-[10px] text-zinc-555 truncate mt-0.5">{set.words.join(', ')}</p></div>
                        </label>
                      ))}
                      <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedTriggerSetId === 'default' ? 'bg-[rgba(124,111,221,0.08)] border-[#7C6FDD]/40 text-zinc-200' : 'bg-surface border-[rgba(255,255,255,0.04)] hover:bg-white/5 border-transparent text-zinc-450'}`}>
                        <input type="radio" name="trigger-word-set" checked={selectedTriggerSetId === 'default'} onChange={() => setSelectedTriggerSetId('default')} className="mt-0.5 w-4 h-4 text-[#7C6FDD] accent-[#7C6FDD] border-zinc-800" />
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold">トリガーワードなし（デフォルト）</p><p className="text-[10px] text-zinc-555 mt-0.5">LoRAタグのみをプロンプトに挿入します</p></div>
                      </label>
                    </>
                  ) : <div className="p-3 rounded-lg bg-surface border border-[rgba(255,255,255,0.04)] text-zinc-500 text-xs italic">登録されているトリガーワードセットはありません（デフォルト適用）</div>}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-400">LoRA強度 (Strength)</label>
                  <input type="number" min={0.0} max={2.0} step={0.1} value={loraStrength}
                    onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) setLoraStrength(Math.max(0, Math.min(2, val))) }}
                    className="w-16 bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-0.5 text-xs text-zinc-200 text-right focus:outline-none focus:border-[#7C6FDD]/50" />
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min={0.0} max={2.0} step={0.1} value={loraStrength} onChange={(e) => setLoraStrength(parseFloat(e.target.value))} className="flex-1 accent-[#7C6FDD] bg-surface h-1.5 rounded-lg appearance-none cursor-pointer" />
                  <span className="text-xs font-mono text-zinc-400 w-8 text-right">{loraStrength.toFixed(1)}</span>
                </div>
                {selectedLoraForModal.lora.recommended_strength_min != null && selectedLoraForModal.lora.recommended_strength_max != null && (
                  <p className="text-[10px] text-zinc-500 text-right">推奨強度: {selectedLoraForModal.lora.recommended_strength_min} 〜 {selectedLoraForModal.lora.recommended_strength_max}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button id="cancel-lora-modal-btn" onClick={() => setSelectedLoraForModal(null)} className="px-4 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-zinc-400 text-sm font-medium hover:bg-white/5 transition-all">キャンセル</button>
              <button id="confirm-lora-modal-btn" onClick={() => { handleAddLoraAsset(selectedLoraForModal.role, selectedLoraForModal.lora, loraStrength, selectedTriggerSetId); setSelectedLoraForModal(null) }}
                className="px-5 py-2.5 rounded-xl bg-accent-green text-background font-bold text-sm hover:brightness-110 transition-all glow-green flex items-center gap-2">適用</button>
            </div>
          </>
        )}
      </Modal>
      <LazyModalHost
        mode="while-open"
        isOpen={!!workflowManageMode && !!selectedWorkflowId}
        load={loadWorkflowManageModal}
        label="ワークフロー管理"
        onClose={() => setWorkflowManageMode(null)}
        modalProps={{
          mode: workflowManageMode ?? 'rename',
          currentName: workflows?.find((w) => w.id === selectedWorkflowId)?.name || '',
          onSubmit: async (newName: string) => {
            if (workflowManageMode === 'rename') {
              await renameWorkflowMutation.mutateAsync({ id: selectedWorkflowId!, name: newName })
            } else {
              await copyWorkflowMutation.mutateAsync({ id: selectedWorkflowId!, name: newName })
            }
          },
          onClose: () => setWorkflowManageMode(null),
          isPending: renameWorkflowMutation.isPending || copyWorkflowMutation.isPending,
        }}
      />
      {isPresetManagerOpen && selectedWorkflowId && (
        <Modal
          isOpen={isPresetManagerOpen && !!selectedWorkflowId}
          onClose={() => setIsPresetManagerOpen(false)}
          size="sm"
          sheetMaxHeightClass="max-h-[75dvh]"
          ariaLabel="プリセット管理"
          dialogClassName="bg-surface-2 border border-[rgba(255,255,255,0.08)] p-4 md:p-6 shadow-2xl relative"
        >
          <div data-testid="preset-manager-overlay" className="fixed inset-0 z-50 items-end md:items-center contents">
            <div 
              data-testid="preset-manager-modal"
              className="w-full max-h-[75dvh] rounded-t-2xl md:rounded-xl flex flex-col"
            >
              <button 
                onClick={() => setIsPresetManagerOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-all"
              >
                <X size={18} />
              </button>
              <h3 className="text-base font-semibold text-zinc-100 mb-3 shrink-0">プリセット管理</h3>
              <LazyModalHost
                mode="while-open"
                isOpen={true}
                load={loadPresetManagerPanel}
                label="プリセット管理"
                onClose={() => setIsPresetManagerOpen(false)}
                modalProps={{
                  presets: presets || [],
                  onRename: async (id: number, name: string) => {
                    await renamePresetMutation.mutateAsync({ id, name })
                  },
                  onReorder: async (ordered_ids: number[]) => {
                    await reorderPresetsMutation.mutateAsync(ordered_ids)
                  },
                  isPending: renamePresetMutation.isPending || reorderPresetsMutation.isPending,
                  sets,
                  activeSetId,
                  openPresetIds,
                  onToggleCheck: (id) => toggleSetChecked(id),
                  onDelete: (id) => handleDeletePreset(id),
                  onOpenAsTab: (id) => {
                    handleSelectPresetTab(id)
                  },
                  onCloseTab: (id) => removeSet(id),
                  onSaveOverwrite: (id: number, name: string) => handleUpdatePreset(id, name),
                  onSaveAsNew: (name: string) => handleCreatePreset(name),
                  onOpenSceneGenerator: () => {
                    setIsPresetManagerOpen(false)
                    setIsSceneGeneratorOpen(true)
                  },
                  onBulkDelete: (selectedIds: number[]) => {
                    handleBulkDeleteRequest(selectedIds)
                  },
                  onBulkEdit: (selectedIds: number[]) => {
                    handleBulkEditRequest(selectedIds)
                  },
                }}
              />
            </div>
          </div>
        </Modal>
      )}
      <LazyModalHost
        mode="latch"
        isOpen={isModalPreviewOpen}
        load={loadHistoryModalPreview}
        label="履歴プレビュー"
        onClose={() => setIsModalPreviewOpen(false)}
        modalProps={{
          isOpen: isModalPreviewOpen,
          onClose: () => setIsModalPreviewOpen(false),
          images: sortedDisplayImages,
          currentIndex: modalPreviewIndex,
          onChangeIndex: setModalPreviewIndex,
          snapshotIds: snapshotIdsForDisplay,
          previewAutoFollow,
          onToggleAutoFollow: handleToggleAutoFollow,
        }}
      />
      <LazyModalHost
        mode="latch"
        isOpen={isJobModalOpen}
        load={loadJobManagementModal}
        label="ジョブ管理"
        onClose={() => setIsJobModalOpen(false)}
        modalProps={{ isOpen: isJobModalOpen, onClose: () => setIsJobModalOpen(false) }}
      />
      <LazyModalHost
        mode="while-open"
        isOpen={isSceneGeneratorOpen && !!selectedWorkflowId}
        load={loadSceneGeneratorModal}
        label="シーン生成"
        onClose={() => setIsSceneGeneratorOpen(false)}
        modalProps={{
          isOpen: true,
          onClose: () => setIsSceneGeneratorOpen(false),
          workflow,
          workflowId: selectedWorkflowId!,
          baseParamValues: paramValues,
          textMappings,
          presets: presets || [],
          onSaved: () => {
            qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
            setIsSceneGeneratorOpen(false)
          },
        }}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <Modal
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
        size="sm"
        ariaLabel="一括削除の確認"
        dialogClassName="bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
          <h3 className="text-base font-semibold text-white">一括削除の確認</h3>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          選択した <span className="text-white font-semibold">{bulkTargetIds.length} 件</span>
          のプリセットを削除します。<br />
          <span className="text-red-400 font-medium">この操作は取り消せません。</span>
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setIsBulkDeleteConfirmOpen(false)}
            className="flex-1 py-2 text-sm text-gray-400 hover:text-white border border-[rgba(255,255,255,0.1)] rounded-lg hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleBulkDeleteConfirm}
            disabled={bulkDeletePresetsMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all disabled:opacity-50"
          >
            {bulkDeletePresetsMutation.isPending && <Loader2 size={14} className="animate-spin" />}
            削除する
          </button>
        </div>
      </Modal>

      {/* Bulk Edit Modal */}
      <LazyModalHost
        mode="latch"
        isOpen={isBulkEditOpen}
        load={loadProfileBulkEditModal}
        label="プロフィール一括編集"
        onClose={() => setIsBulkEditOpen(false)}
        modalProps={{
          isOpen: isBulkEditOpen,
          onClose: () => setIsBulkEditOpen(false),
          selectedPresets: (presets ?? []).filter(p => bulkTargetIds.includes(p.id)),
          mappingMasters: workflow?.mappings?.map(m => ({
            id: m.master_id ?? 0,
            role: m.role ?? '',
            expected_class_types: null,
            param_name: m.param_name ?? '',
            input_type: (m.input_type ?? 'textarea') as any,
            display_name: m.display_name ?? m.role ?? '',
            title_patterns: null,
            sort_order: 0,
          })) ?? [],
          paramTypeMasters: state.paramTypeMasters,
          comfyObjectInfo: state.comfyObjectInfo,
          loras: loras ?? [],
          tagSets: tagSets ?? [],
          onApply: handleBulkEditApply,
          isApplying: isBulkApplying,
          activeBaseModelId: workflow?.target_base_model_id ?? null,
        }}
      />

      {/* Preset Conflict Modal */}
      <LazyModalHost
        mode="latch"
        isOpen={!!state.conflictData}
        load={loadPresetConflictModal}
        label="プリセット競合確認"
        onClose={() => state.setConflictData(null)}
        modalProps={{
          isOpen: !!state.conflictData,
          conflictData: state.conflictData,
          onClose: () => state.setConflictData(null),
          onUseServer: state.handleResolveConflictUseServer,
          onOverwriteServer: state.handleResolveConflictOverwrite,
          onSaveAsNew: state.handleResolveConflictSaveAsNew,
        }}
      />
    </>
  )
}
