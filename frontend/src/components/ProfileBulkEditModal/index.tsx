import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { lorasApi } from '../../api/client';
import { AddAssetModal } from '../../pages/GeneratePage/components/AddAssetModal';
import { BulkEditConfirmView } from './BulkEditConfirmView';
import { PromptBulkEditTab } from './tabs/PromptBulkEditTab';
import { ParamBulkEditTab } from './tabs/ParamBulkEditTab';
import { buildBulkEditPayload } from './buildPayload';
import { useProfileBulkEditState } from './useProfileBulkEditState';
import type { ProfileBulkEditModalProps, Tab, BulkEditPayload } from './types';

// Backward compatibility re-exports
export * from './types';
export * from './utils';

export function ProfileBulkEditModal({
  isOpen,
  onClose,
  selectedPresets,
  mappingMasters,
  paramTypeMasters = [],
  loras,
  tagSets = [],
  comfyObjectInfo,
  onApply,
  isApplying = false,
  activeBaseModelId,
}: ProfileBulkEditModalProps) {
  const { data: comfyModels } = useQuery({
    queryKey: ['comfy-lora-models'],
    queryFn: lorasApi.getComfyModels,
    enabled: isOpen,
  });

  const [activeTab, setActiveTab] = useState<Tab>('prompt');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<BulkEditPayload | null>(null);

  const state = useProfileBulkEditState(selectedPresets, mappingMasters, activeTab);

  if (!isOpen) return null;
  const count = selectedPresets.length;

  const handleApplyClick = () => {
    const payload = buildBulkEditPayload({
      promptOp: state.promptOp,
      promptFindText: state.promptFindText,
      promptReplaceText: state.promptReplaceText,
      promptValue: state.promptValue,
      promptTargetAll: state.promptTargetAll,
      promptTargetFields: state.promptTargetFields,
      commonTagItems: state.commonTagItems,
      tagsToRemove: state.tagsToRemove,
      textareaRoles: state.textareaRoles,
      assetOps: state.assetOps,
      loraRoles: state.loraRoles,
      enabledParams: state.enabledParams,
      paramPatch: state.paramPatch,
      batchSizeEnabled: state.batchSizeEnabled,
      batchSizeInput: state.batchSizeInput,
      loraStackModes: state.loraStackModes,
      commonLoraOps: state.commonLoraOps,
      addLoraSlots: state.addLoraSlots,
    });
    if (!payload) return;
    setPendingPayload(payload);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (pendingPayload) {
      onApply(pendingPayload);
      setShowConfirm(false);
      setPendingPayload(null);
    }
  };

  if (showConfirm) {
    return (
      <BulkEditConfirmView
        count={count}
        isApplying={isApplying}
        onCancel={() => { setShowConfirm(false); setPendingPayload(null); }}
        onConfirm={handleConfirm}
      />
    );
  }

  return (
    <div className="modal-backdrop">
      <div
        className="relative w-full max-w-lg bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <div>
            <h3 className="text-lg font-semibold text-white">プロファイル一括編集</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="text-[#3ECF8E] font-bold">{count} 件</span> のプリセットに適用
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-[rgba(255,255,255,0.08)]">
          {([
            { id: 'prompt', label: 'プロンプト' },
            { id: 'params', label: 'パラメータ' },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-[#3ECF8E] border-[#3ECF8E]'
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'prompt' && (
            <PromptBulkEditTab
              promptOp={state.promptOp}
              setPromptOp={state.setPromptOp}
              promptFindText={state.promptFindText}
              setPromptFindText={state.setPromptFindText}
              promptReplaceText={state.promptReplaceText}
              setPromptReplaceText={state.setPromptReplaceText}
              promptValue={state.promptValue}
              setPromptValue={state.setPromptValue}
              onOpenAddAsset={() => {
                const defaultRole = state.textareaRoles[0]?.role || 'positive';
                state.setTargetAssetRole(defaultRole);
                state.setIsAddAssetOpen(true);
              }}
              commonTagItems={state.commonTagItems}
              setCommonTagItems={state.setCommonTagItems}
              tagsToRemove={state.tagsToRemove}
              setTagsToRemove={state.setTagsToRemove}
              toggleTagToRemove={state.toggleTagToRemove}
              textareaRoles={state.textareaRoles}
              promptTargetAll={state.promptTargetAll}
              setPromptTargetAll={state.setPromptTargetAll}
              promptTargetFields={state.promptTargetFields}
              togglePromptField={state.togglePromptField}
              assetOps={state.assetOps}
              onRemoveQueuedAsset={state.handleRemoveQueuedAsset}
            />
          )}

          {activeTab === 'params' && (
            <ParamBulkEditTab
              paramRoles={state.paramRoles}
              enabledParams={state.enabledParams}
              toggleParamEnabled={state.toggleParamEnabled}
              selectedPresets={selectedPresets}
              loras={loras}
              comfyModels={comfyModels}
              activeBaseModelId={activeBaseModelId}
              loraStackModes={state.loraStackModes}
              setLoraStackModes={state.setLoraStackModes}
              paramPatch={state.paramPatch}
              setParamPatch={state.setParamPatch}
              commonLoraOps={state.commonLoraOps}
              setCommonLoraOps={state.setCommonLoraOps}
              addLoraSlots={state.addLoraSlots}
              setAddLoraSlots={state.setAddLoraSlots}
              paramTypeMasters={paramTypeMasters}
              comfyObjectInfo={comfyObjectInfo}
              batchSizeEnabled={state.batchSizeEnabled}
              setBatchSizeEnabled={state.setBatchSizeEnabled}
              batchSizeInput={state.batchSizeInput}
              setBatchSizeInput={state.setBatchSizeInput}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#1F1F25] border-t border-[rgba(255,255,255,0.08)] rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
          >
            キャンセル
          </button>
          <button
            onClick={handleApplyClick}
            disabled={isApplying}
            className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-[#18181C] bg-[#3ECF8E] hover:bg-[#34b279] rounded-lg shadow-lg transition-all disabled:opacity-50"
          >
            {isApplying && <Loader2 size={16} className="animate-spin" />}
            {count} 件に適用...
          </button>
        </div>
      </div>

      {state.isAddAssetOpen && state.targetAssetRole && (
        <AddAssetModal
          role={state.targetAssetRole}
          loras={loras}
          tagSets={tagSets}
          onClose={() => state.setIsAddAssetOpen(false)}
          addAppliedAsset={state.handleAddAppliedAsset}
          setRoleCollapsed={() => {}}
        />
      )}
    </div>
  );
}
