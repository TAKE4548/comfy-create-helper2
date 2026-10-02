import type { WorkflowPreset, MappingMaster, Lora, TagSet, ParamTypeMaster } from '../../api/types';
import type { AppliedAsset } from '../../store/useGenerationStore';

export type PromptOpType = 'search_replace' | 'overwrite' | 'prefix' | 'suffix' | 'remove_tags';

export interface CommonTagOp {
  originalBase: string;
  newFormattedTag: string;
  action: 'update' | 'remove';
}

export interface CommonTagItem {
  id: string;
  originalBase: string;
  text: string;
  enabled: boolean;
}

export interface PromptOp {
  op: PromptOpType;
  fields: string[] | null;
  find?: string;
  replace?: string;
  value?: string;
  tags?: string[];
  commonTagOps?: CommonTagOp[];
}

export interface LoraOp {
  mode: 'append' | 'replace';
  role: string;
  asset: AppliedAsset;
}

export interface AppliedAssetOp {
  mode: 'append' | 'replace';
  role: string;
  assets: AppliedAsset[];
}

export interface PresetLoraSlot {
  name: string;
  weight: string;
  modelStrength: string;
  clipStrength: string;
}

export interface CommonLoraOp {
  name: string;
  action: 'update' | 'remove';
  weight?: string;
  modelStrength?: string;
  clipStrength?: string;
}

export interface LoraStackOp {
  role: string;
  mode: 'overwrite' | 'differential';
  slots?: PresetLoraSlot[];
  commonOps?: CommonLoraOp[];
  addSlots?: PresetLoraSlot[];
}

export interface BulkEditPayload {
  targetPresetIds?: number[];
  promptOps?: PromptOp[];
  paramPatch?: Record<string, string>;
  batchSize?: number;
  loraOps?: LoraOp[];
  assetOps?: AppliedAssetOp[];
  loraStackOps?: LoraStackOp[];
}

export interface BuildPayloadParams {
  promptOp: PromptOpType;
  promptFindText: string;
  promptReplaceText: string;
  promptValue: string;
  promptTargetAll: boolean;
  promptTargetFields: Set<string>;
  commonTagItems: CommonTagItem[];
  tagsToRemove: Set<string>;
  textareaRoles: MappingMaster[];
  assetOps: AppliedAssetOp[];
  loraRoles: MappingMaster[];
  enabledParams: Set<string>;
  paramPatch: Record<string, string>;
  batchSizeEnabled: boolean;
  batchSizeInput: string;
  loraStackModes: Record<string, 'differential' | 'overwrite'>;
  commonLoraOps: Record<string, CommonLoraOp[]>;
  addLoraSlots: Record<string, PresetLoraSlot[]>;
  subsetPresetIds?: Set<number>;
}

export interface ProfileBulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPresets: WorkflowPreset[];
  mappingMasters: MappingMaster[];
  paramTypeMasters?: ParamTypeMaster[];
  loras: Lora[];
  tagSets?: TagSet[];
  comfyObjectInfo?: Record<string, any>;
  onApply: (payload: BulkEditPayload) => void;
  isApplying?: boolean;
  activeBaseModelId?: number | null;
}

export type Tab = 'prompt' | 'params';

export const PROMPT_OP_LABELS: Record<PromptOpType, string> = {
  search_replace: '検索・置換',
  overwrite: '全置換（上書き）',
  prefix: '先頭に追加',
  suffix: '末尾に追加',
  remove_tags: '共通タグ編集・削除',
};
