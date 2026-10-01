import type { BypassProfile, ParamSyncGroup, ParamSyncGroupCreate, ParamSyncGroupUpdate, WorkflowPreset } from '../api/types'
import type { TagChip } from '../components/TagChipEditor/useChipParser'

export interface BatchJob {
  promptId: string;
  setName: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface ComfyProgress {
  value: number;
  max: number;
  percentage: number;
}

export interface NodeProgress {
  value: number;
  max: number;
  percentage: number;
  nodeId?: string;
  nodeName?: string;
}

export interface ComfyHistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

export interface ComfyHistoryItem {
  outputs: Record<string, ComfyHistoryOutput>;
  prompt: [
    number,              // prompt index
    string,              // prompt_id
    Record<string, any>, // workflow JSON
    {
      client_id?: string;
      [key: string]: any;
    },                   // extra_data
    any[]                // outputs info
  ];
  status: {
    completed: boolean;
    [key: string]: any;
  };
}

export interface ComfyQueueResponse {
  queue_running: Array<[number, string, any, { client_id?: string }, any]>;
  queue_pending: Array<[number, string, any, { client_id?: string }, any]>;
}

export interface AppliedAsset {
  id: string;              // unique key (e.g. `lora-1-12345`)
  type: 'lora' | 'tagset';
  assetId: number;         // DB ID
  name: string;            // display name
  enabled: boolean;        // toggle state
  tags: string[];          // tagset tags or LoRA trigger words
  loraPromptString?: string; // LoRA prompt string `<lora:filename:strength>`
}

export interface GenerationSet {
  id: string | number;
  name: string;
  paramValues: Record<string, string>;
  appliedAssets: Record<string, AppliedAsset[]>;
  promptChips?: Record<string, TagChip[]>;
  batchSize: number;
  seedMode: 'random' | 'fixed';
  seed: number;
  checked: boolean;
}

export interface ComfyQueueDeletePayload {
  delete: string[];
}

export interface ComfyQueueClearPayload {
  clear: true;
}

export interface ComfyHistoryDeletePayload {
  delete: string[];
}

export interface QueuePromptOptions {
  skipQueueFetch?: boolean;
  signal?: AbortSignal;
  isBatchIntermediate?: boolean;
}

export interface ConnectionState {
  clientId: string;
  isConnected: boolean;
  isGenerating: boolean;
  progress: ComfyProgress | null;
  currentWorkflow: Record<string, any> | null;
  currentNode: { id: string; name: string } | null;
  nodeProgress: NodeProgress | null;
  generationStartTime: number | null;
  previewImage: string | null;
  currentPromptId: string | null;
  activeClientId: string | null;
  comfyUrl: string | null;
  submissionAbortController: AbortController | null;
}

export interface ConnectionActions {
  initialize: (options?: { force?: boolean }) => void;
  setComfyUrl: (url: string) => void;
  clearPreview: () => void;
  setSubmissionAbortController: (controller: AbortController | null) => void;
  abortSubmission: () => void;
}


export interface VramWaitStatus {
  isWaiting: boolean;
  freeGb: number | null;
  requiredGb: number;
  waitDurationSec: number;
}

export interface JobQueueState {
  filterOwnSession: boolean;
  batchImages: string[];
  selectedImg: string | null;
  comfyHistoryImages: string[];
  queueRunning: Array<[number, string, any, { client_id?: string }, any]>;
  queuePending: Array<[number, string, any, { client_id?: string }, any]>;
  isBatchSubmitting: boolean;
  activeBatch: BatchJob[] | null;
  previewAutoFollow: boolean;
  vramWaitStatus: VramWaitStatus | null;
}

export interface JobQueueActions {
  setFilterOwnSession: (filter: boolean) => void;
  setSelectedImg: (img: string | null) => void;
  setPreviewAutoFollow: (autoFollow: boolean) => void;
  togglePreviewAutoFollow: () => void;
  setIsBatchSubmitting: (value: boolean) => void;
  setActiveBatch: (batch: BatchJob[] | null) => void;
  updateBatchJobStatus: (promptId: string, status: BatchJob['status']) => void;
  setVramWaitStatus: (status: VramWaitStatus | null) => void;
  cancelVramWait: () => void;
  queuePrompt: (
    workflow: Record<string, unknown>,
    metadata?: {
      paramValues?: Record<string, string>;
      appliedAssets?: Record<string, AppliedAsset[]>;
    },
    options?: QueuePromptOptions
  ) => Promise<string | null>;
  cancelGeneration: () => Promise<void>;
  cancelJob: (promptId: string) => Promise<void>;
  clearPendingQueue: () => Promise<void>;
  cancelAllJobs: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  fetchQueue: () => Promise<void>;
}

export interface MultiSetState {
  selectedWorkflowId: number | null;
  paramValues: Record<string, string>;
  appliedAssets: Record<string, AppliedAsset[]>;
  promptChips: Record<string, TagChip[]>;
  isAnimaMode?: boolean;
  batchSize: number;
  seedMode: 'random' | 'fixed';
  seed: number;
  sets: GenerationSet[];
  activeSetId: string | number | null;
  openPresetIds: (string | number)[];
}

export interface MultiSetActions {
  setIsAnimaMode?: (isAnima: boolean) => void;
  setSelectedWorkflowId: (id: number | null) => void;
  setParamValues: (values: Record<string, string>) => void;
  setPromptChips: (role: string, chips: TagChip[]) => void;
  setAllPromptChips: (promptChips: Record<string, TagChip[]>) => void;
  getEffectiveParamValues: () => Record<string, string>;
  addAppliedAsset: (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => void;
  removeAppliedAsset: (role: string, id: string) => void;
  toggleAppliedAsset: (role: string, id: string) => void;
  setAppliedAssets: (assets: Record<string, AppliedAsset[]>) => void;
  setBatchSize: (size: number) => void;
  setSeedMode: (mode: 'random' | 'fixed') => void;
  setSeed: (seed: number) => void;
  initSets: (workflowId: number) => void;
  setActiveSetId: (id: string | number) => void;
  loadPresetData: (preset: WorkflowPreset, defaultParams: Record<string, string>) => void;
  addSet: () => void;
  removeSet: (id: string | number) => void;
  renameSet: (id: string | number, name: string) => void;
  toggleSetChecked: (id: string | number) => void;
  setAllSetsChecked: (checked: boolean) => void;
  updateActiveSet: (updates: Partial<Omit<GenerationSet, 'id' | 'name'>>) => void;
  setSets: (sets: GenerationSet[]) => void;
  openPreset: (id: string | number) => void;
  closePreset: (id: string | number) => void;
}

export interface BypassState {
  bypassProfiles: BypassProfile[];
  bypassProfilesCache: Record<number, BypassProfile[]>;
  errorToast: { message: string; type: 'error' | 'success' } | null;
}

export interface BypassActions {
  setErrorToast: (toast: { message: string; type: 'error' | 'success' } | null) => void;
  fetchBypassProfiles: (workflowId: number) => Promise<void>;
  createBypassProfile: (workflowId: number, name: string, nodeIds: string[]) => Promise<void>;
  updateBypassProfile: (profileId: number, data: { name?: string; bypassed_node_ids?: string[]; is_enabled?: boolean }) => Promise<void>;
  deleteBypassProfile: (profileId: number) => Promise<void>;
}

export interface ParamSyncState {
  paramSyncGroups: ParamSyncGroup[];
  paramSyncGroupsCache: Record<number, ParamSyncGroup[]>;
}

export interface ParamSyncActions {
  fetchParamSyncGroups: (workflowId: number) => Promise<void>;
  createParamSyncGroup: (workflowId: number, data: ParamSyncGroupCreate) => Promise<ParamSyncGroup>;
  updateParamSyncGroup: (id: number, data: ParamSyncGroupUpdate) => Promise<ParamSyncGroup>;
  deleteParamSyncGroup: (id: number) => Promise<void>;
  toggleParamSyncGroup: (id: number, isEnabled: boolean) => Promise<void>;
}

export interface SystemStats {
  cpu_pct: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_pct: number;
  gpu_pct: number | null;
  vram_used_gb: number | null;
  vram_total_gb: number | null;
  vram_pct: number | null;
  vram_free_gb?: number | null;
  vram_safe?: boolean;
  vram_min_free_gb?: number;
  ts: number;
}

export interface SystemStatsState {
  systemStats: SystemStats | null;
  systemWsConnected: boolean;
}

export interface SystemStatsActions {
  setSystemStats: (stats: SystemStats) => void;
  setSystemWsConnected: (connected: boolean) => void;
}

export type GenerationState = ConnectionState &
  ConnectionActions &
  JobQueueState &
  JobQueueActions &
  MultiSetState &
  MultiSetActions &
  BypassState &
  BypassActions &
  ParamSyncState &
  ParamSyncActions &
  SystemStatsState &
  SystemStatsActions;
