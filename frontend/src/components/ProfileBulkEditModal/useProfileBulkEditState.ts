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

  // Preset Subset state
  const [subsetPresetIds, setSubsetPresetIds] = useState<Set<number>>(() => new Set(selectedPresets.map(p => p.id)));
  const [prevPresetsKey, setPrevPresetsKey] = useState<string>(() => selectedPresets.map(p => p.id).join(','));

  let currentSubsetPresetIds = subsetPresetIds;
  const currentPresetsKey = selectedPresets.map(p => p.id).join(',');
  if (currentPresetsKey !== prevPresetsKey) {
    setPrevPresetsKey(currentPresetsKey);
    const newSet = new Set(selectedPresets.map(p => p.id));
    setSubsetPresetIds(newSet);
    currentSubsetPresetIds = newSet;
  }

  const toggleSubsetPresetId = (id: number) => {
    setSubsetPresetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllSubsetPresets = () => {
    setSubsetPresetIds(new Set(selectedPresets.map(p => p.id)));
  };

  const clearAllSubsetPresets = () => {
    setSubsetPresetIds(new Set());
  };

  const textareaRoles = mappingMasters.filter(m => m.input_type === 'textarea');
  const paramRoles = mappingMasters.filter(m => !['textarea'].includes(m.input_type));
  const loraRoles = mappingMasters.filter(m => m.input_type === 'lora_stack');

  const effectivePromptRoles = promptTargetAll ? textareaRoles.map(m => m.role) : Array.from(promptTargetFields);
  const subsetPresets = selectedPresets.filter(p => currentSubsetPresetIds.has(p.id));
  const computedCommonTags = computeCommonTags(subsetPresets, effectivePromptRoles);

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

  const resetParamSelection = () => {
    setEnabledParams(new Set());
    setBatchSizeEnabled(false);
  };

  const handleSetPromptOp = (action: PromptOpType | ((prev: PromptOpType) => PromptOpType)) => {
    const nextOp = typeof action === 'function' ? action(promptOp) : action;
    setPromptOp(nextOp);
    if (nextOp === 'overwrite' || nextOp === 'prefix' || nextOp === 'suffix') {
      setPromptTargetAll(false);
      setPromptTargetFields(prev => {
        const firstField = Array.from(prev)[0] || textareaRoles[0]?.role;
        return firstField ? new Set([firstField]) : new Set();
      });
    }
  };

  const selectSinglePromptField = (role: string) => {
    setPromptTargetFields(new Set([role]));
  };

  return {
    promptOp, setPromptOp: handleSetPromptOp,
    promptFindText, setPromptFindText,
    promptReplaceText, setPromptReplaceText,
    promptValue, setPromptValue,
    promptTargetAll, setPromptTargetAll,
    promptTargetFields, togglePromptField, selectSinglePromptField,
    tagsToRemove, setTagsToRemove, toggleTagToRemove,
    commonTagItems, setCommonTagItems,
    subsetPresetIds: currentSubsetPresetIds, setSubsetPresetIds,
    subsetPresets,
    toggleSubsetPresetId, selectAllSubsetPresets, clearAllSubsetPresets,
    resetParamSelection,
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
