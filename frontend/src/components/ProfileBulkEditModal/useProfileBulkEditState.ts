import { useState } from 'react';
import type { MappingMaster, WorkflowPreset } from '../../api/types';
import type { AppliedAsset } from '../../store/useGenerationStore';
import type {
  Tab,
  PromptOpType,
  CommonTagItem,
  AppliedAssetOp,
  CommonLoraOp,
  PresetLoraSlot,
} from './types';
import { computeCommonTags, parseTagWeight } from './utils';

export function useProfileBulkEditState(
  selectedPresets: WorkflowPreset[],
  mappingMasters: MappingMaster[],
  activeTab: Tab
) {
  // Prompt tab state
  const [promptOp, setPromptOp] = useState<PromptOpType>('search_replace');
  const [promptFindText, setPromptFindText] = useState('');
  const [promptReplaceText, setPromptReplaceText] = useState('');
  const [promptValue, setPromptValue] = useState('');
  const [promptTargetAll, setPromptTargetAll] = useState(true);
  const [promptTargetFields, setPromptTargetFields] = useState<Set<string>>(new Set());
  const [tagsToRemove, setTagsToRemove] = useState<Set<string>>(new Set());
  const [commonTagItems, setCommonTagItems] = useState<CommonTagItem[]>([]);
  const [lastCommonTagsKey, setLastCommonTagsKey] = useState<string>('');

  // Params tab state
  const [enabledParams, setEnabledParams] = useState<Set<string>>(new Set());
  const [paramPatch, setParamPatch] = useState<Record<string, string>>({});
  const [batchSizeEnabled, setBatchSizeEnabled] = useState(false);
  const [batchSizeInput, setBatchSizeInput] = useState('');

  // LoRA Stack state
  const [loraStackModes, setLoraStackModes] = useState<Record<string, 'differential' | 'overwrite'>>({});
  const [commonLoraOps, setCommonLoraOps] = useState<Record<string, CommonLoraOp[]>>({});
  const [addLoraSlots, setAddLoraSlots] = useState<Record<string, PresetLoraSlot[]>>({});

  // AssetOps state
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [targetAssetRole, setTargetAssetRole] = useState<string>('');
  const [assetOps, setAssetOps] = useState<AppliedAssetOp[]>([]);

  const textareaRoles = mappingMasters.filter(m => m.input_type === 'textarea');
  const paramRoles = mappingMasters.filter(m => !['textarea'].includes(m.input_type));
  const loraRoles = mappingMasters.filter(m => m.input_type === 'lora_stack');

  const effectivePromptRoles = promptTargetAll ? textareaRoles.map(m => m.role) : Array.from(promptTargetFields);
  const computedCommonTags = computeCommonTags(selectedPresets, effectivePromptRoles);

  // Sync commonTagItems when computedCommonTags change
  const currentKey = computedCommonTags.join('|||');
  if (currentKey !== lastCommonTagsKey) {
    setLastCommonTagsKey(currentKey);
    setCommonTagItems(
      computedCommonTags.map((tag, idx) => {
        const { base } = parseTagWeight(tag);
        return {
          id: `common-tag-${idx}-${base}`,
          originalBase: base.toLowerCase(),
          text: tag,
          enabled: true,
        };
      })
    );
  }

  const toggleTagToRemove = (tag: string) => {
    setTagsToRemove(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleAddAppliedAsset = (role: string, assetData: Omit<AppliedAsset, 'id' | 'enabled'>) => {
    const asset: AppliedAsset = {
      ...assetData,
      id: `${assetData.type}-${assetData.assetId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      enabled: true,
    };

    const targetRoles = activeTab === 'prompt'
      ? (promptTargetAll ? textareaRoles.map(m => m.role) : Array.from(promptTargetFields))
      : [role];
    const rolesToApply = targetRoles.length > 0 ? targetRoles : [role];
    const effectiveMode = promptOp === 'overwrite' ? 'replace' : 'append';

    setAssetOps(prev => {
      let updated = [...prev];
      for (const r of rolesToApply) {
        const existingOpIndex = updated.findIndex(op => op.role === r);
        if (existingOpIndex >= 0) {
          updated[existingOpIndex] = {
            ...updated[existingOpIndex],
            mode: effectiveMode,
            assets: effectiveMode === 'replace' ? [asset] : [...updated[existingOpIndex].assets, asset],
          };
        } else {
          updated.push({ mode: effectiveMode, role: r, assets: [asset] });
        }
      }
      return updated;
    });

    const textToAdd = asset.loraPromptString ?? (asset.tags ? asset.tags.join(', ') : '');
    if (textToAdd) {
      if (promptOp === 'search_replace') {
        setPromptReplaceText(prev => (prev ? `${prev}, ${textToAdd}` : textToAdd));
      } else {
        setPromptValue(prev => (prev ? `${prev}, ${textToAdd}` : textToAdd));
      }
    }
  };

  const handleRemoveQueuedAsset = (role: string, assetId: string) => {
    setAssetOps(prev =>
      prev
        .map(op => (op.role !== role ? op : { ...op, assets: op.assets.filter(a => a.id !== assetId) }))
        .filter(op => op.assets.length > 0)
    );
  };

  const toggleParamEnabled = (role: string) => {
    setEnabledParams(prev => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  const togglePromptField = (role: string) => {
    setPromptTargetFields(prev => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  return {
    promptOp, setPromptOp,
    promptFindText, setPromptFindText,
    promptReplaceText, setPromptReplaceText,
    promptValue, setPromptValue,
    promptTargetAll, setPromptTargetAll,
    promptTargetFields, togglePromptField,
    tagsToRemove, setTagsToRemove, toggleTagToRemove,
    commonTagItems, setCommonTagItems,
    enabledParams, toggleParamEnabled,
    paramPatch, setParamPatch,
    batchSizeEnabled, setBatchSizeEnabled,
    batchSizeInput, setBatchSizeInput,
    loraStackModes, setLoraStackModes,
    commonLoraOps, setCommonLoraOps,
    addLoraSlots, setAddLoraSlots,
    isAddAssetOpen, setIsAddAssetOpen,
    targetAssetRole, setTargetAssetRole,
    assetOps, handleAddAppliedAsset, handleRemoveQueuedAsset,
    textareaRoles, paramRoles, loraRoles,
  };
}
