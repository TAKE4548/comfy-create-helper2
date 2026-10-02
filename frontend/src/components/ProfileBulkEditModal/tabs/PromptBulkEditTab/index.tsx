import React from 'react';
import { Trash2 } from 'lucide-react';
import type { MappingMaster, WorkflowPreset } from '../../../../api/types';
import type { CommonTagItem, PromptOpType, AppliedAssetOp } from '../../types';
import { PromptOperationForm } from './PromptOperationForm';
import { CommonTagsSection } from './CommonTagsSection';
import { TargetFieldsSelector } from './TargetFieldsSelector';

export interface PromptBulkEditTabProps {
  promptOp: PromptOpType;
  setPromptOp: (op: PromptOpType) => void;
  promptFindText: string;
  setPromptFindText: (text: string) => void;
  promptReplaceText: string;
  setPromptReplaceText: (text: string) => void;
  promptValue: string;
  setPromptValue: (text: string) => void;
  onOpenAddAsset: () => void;
  // Common tags state
  commonTagItems: CommonTagItem[];
  setCommonTagItems: React.Dispatch<React.SetStateAction<CommonTagItem[]>>;
  tagsToRemove: Set<string>;
  setTagsToRemove: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleTagToRemove: (tag: string) => void;
  selectedPresets?: WorkflowPreset[];
  subsetPresetIds?: Set<number>;
  toggleSubsetPresetId?: (id: number) => void;
  selectAllSubsetPresets?: () => void;
  clearAllSubsetPresets?: () => void;
  // Target fields state
  textareaRoles: MappingMaster[];
  promptTargetAll: boolean;
  setPromptTargetAll: (val: boolean) => void;
  promptTargetFields: Set<string>;
  togglePromptField: (role: string) => void;
  selectSinglePromptField?: (role: string) => void;
  // Asset ops queued
  assetOps: AppliedAssetOp[];
  onRemoveQueuedAsset: (role: string, assetId: string) => void;
}

export const PromptBulkEditTab: React.FC<PromptBulkEditTabProps> = ({
  promptOp,
  setPromptOp,
  promptFindText,
  setPromptFindText,
  promptReplaceText,
  setPromptReplaceText,
  promptValue,
  setPromptValue,
  onOpenAddAsset,
  commonTagItems,
  setCommonTagItems,
  tagsToRemove,
  setTagsToRemove,
  toggleTagToRemove,
  selectedPresets,
  subsetPresetIds,
  toggleSubsetPresetId,
  selectAllSubsetPresets,
  clearAllSubsetPresets,
  textareaRoles,
  promptTargetAll,
  setPromptTargetAll,
  promptTargetFields,
  togglePromptField,
  selectSinglePromptField,
  assetOps,
  onRemoveQueuedAsset,
}) => {
  return (
    <div className="space-y-5">
      <PromptOperationForm
        promptOp={promptOp}
        setPromptOp={setPromptOp}
        promptFindText={promptFindText}
        setPromptFindText={setPromptFindText}
        promptReplaceText={promptReplaceText}
        setPromptReplaceText={setPromptReplaceText}
        promptValue={promptValue}
        setPromptValue={setPromptValue}
        onOpenAddAsset={onOpenAddAsset}
      />

      {promptOp === 'remove_tags' && (
        <CommonTagsSection
          selectedPresets={selectedPresets}
          subsetPresetIds={subsetPresetIds}
          toggleSubsetPresetId={toggleSubsetPresetId}
          selectAllSubsetPresets={selectAllSubsetPresets}
          clearAllSubsetPresets={clearAllSubsetPresets}
          commonTagItems={commonTagItems}
          setCommonTagItems={setCommonTagItems}
          tagsToRemove={tagsToRemove}
          setTagsToRemove={setTagsToRemove}
          toggleTagToRemove={toggleTagToRemove}
        />
      )}

      {/* Queued assets badge in prompt tab */}
      {assetOps.length > 0 && (
        <div className="p-2.5 bg-[#1F1F25] border border-[rgba(255,255,255,0.08)] rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-300">
              適用・登録予定のアセット ({assetOps.reduce((sum, op) => sum + op.assets.length, 0)}件)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {assetOps.map(op =>
              op.assets.map(asset => (
                <span
                  key={asset.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-gray-200"
                >
                  <span className="font-medium">{asset.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveQueuedAsset(op.role, asset.id)}
                    className="text-gray-400 hover:text-red-400 ml-1 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {/* Target fields */}
      <TargetFieldsSelector
        textareaRoles={textareaRoles}
        promptTargetAll={promptTargetAll}
        setPromptTargetAll={setPromptTargetAll}
        promptTargetFields={promptTargetFields}
        togglePromptField={togglePromptField}
        promptOp={promptOp}
        onSelectSingleField={selectSinglePromptField}
      />
    </div>
  );
};
