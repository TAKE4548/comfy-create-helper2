/**
 * API types for Prompt Surgeon v2
 * Auto-generated shape: matches FastAPI schemas.py
 */

import type { BubbleShapeType, MangaTextEffectConfig, TextOrientation } from '../types/speechBubble'

// 笏笏笏 MappingMaster 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface MappingMaster {
  id: number
  role: string
  expected_class_types: string[] | null
  param_name: string
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean'
  display_name: string
  title_patterns: string[] | null
  sort_order: number
}

export interface MappingMasterCreate {
  role: string
  expected_class_types?: string[]
  param_name: string
  input_type: string
  display_name: string
  title_patterns?: string[]
}

export interface MappingMasterUsage {
  workflow_id: number
  workflow_name: string
  node_id: string
}

// 笏笏笏 Workflow 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface WorkflowMapping {
  id: number
  master_id: number
  node_id: string
  role: string | null
  param_name: string | null
  input_type: string | null
  display_name: string | null
}

export interface WorkflowSummary {
  id: number
  name: string
  created_at: string
}

export interface Workflow {
  id: number
  name: string
  json_body: Record<string, unknown>
  mappings: WorkflowMapping[]
  default_applied_assets?: string | null
  target_base_model_id?: number | null
  created_at: string
}

export interface WorkflowCreate {
  name: string
  json_body: Record<string, unknown>
  mappings: { master_id: number; node_id: string }[]
  target_base_model_id?: number | null
}

export interface WorkflowUpdate {
  name?: string
  json_body?: Record<string, unknown>
  default_applied_assets?: string | null
  mappings?: { master_id: number; node_id: string }[]
  target_base_model_id?: number | null
}


// 笏笏笏 Workflow Scan 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface ScanMatchedItem {
  master_id: number
  role: string
  node_id: string
  node_title: string
  status: string
  node_ids?: string[]
}

export interface ScanWarningItem {
  master_id: number
  role: string
  status: string
  node_ids?: string[]
  node_id?: string
  actual_class_type?: string
}

export interface ScanResult {
  matched: ScanMatchedItem[]
  warnings: ScanWarningItem[]
}

// ─── Workflow Diff & Rollback ────────────────────────────────────

export interface NodeTopologySlot {
  slot: string
  source_node_id?: string
  source_class?: string
  source_title?: string
  target_node_id?: string
  target_class?: string
  target_title?: string
}

export interface NodeTopology {
  node_id: string
  title: string
  class_type: string
  inputs: NodeTopologySlot[]
  outputs: NodeTopologySlot[]
}

export interface NodeCandidate {
  node_id: string
  title: string
  class_type: string
  score: number
}

export interface RoleMigration {
  master_id: number
  role: string
  display_name: string
  old_node_id: string
  new_node_id: string | null
  confidence: number
  reason: string
  status: 'ok' | 'renamed' | 'reindexed' | 'substituted' | 'false_reuse' | 'not_found'
  candidates: NodeCandidate[]
  old_topology?: NodeTopology | null
  new_topology?: NodeTopology | null
}

export interface DiffAnalyzeResponse {
  summary: {
    ok?: number
    renamed?: number
    reindexed?: number
    substituted?: number
    false_reuse?: number
    not_found?: number
    total?: number
    [key: string]: number | undefined
  }
  role_migrations: RoleMigration[]
  bypass_warnings: Array<{
    profile_id?: number
    profile_name?: string
    node_id?: string
    missing_node_id?: string
    suggested_node_id?: string
    warning?: string
  }>
  unmapped_new_nodes: Array<{ node_id: string; title: string; class_type: string }>
}

export interface WorkflowHistoryStatusResponse {
  has_rollback: boolean
  history_count: number
  latest_backup_at?: string | null
}

export interface WorkflowRollbackResponse {
  message: string
  workflow_id: number
  restored_at: string
}


// 笏笏笏 Snapshot 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface SnapshotLoraCreate {
  lora_id: number
  strength: number
  role?: string
}

export interface SnapshotLoraRead {
  id: number
  snapshot_id: number
  lora_id: number
  strength: number
  role: string
}

export interface SnapshotTagSetCreate {
  tag_set_id: number
  role?: string
}

export interface SnapshotTriggerAssociation {
  lora_id: number
  trigger_set_id: number
  role: string
}

export interface SnapshotTagSetRead {
  id: number
  snapshot_id: number
  tag_set_id: number
  role: string
}

export interface SnapshotSummary {
  id: number
  workflow_id: number
  image_path: string | null
  thumbnail_path?: string | null
  created_at: string
  source_snapshot_id?: number
}

export interface Snapshot {
  id: number
  workflow_id: number
  params: Record<string, unknown>
  image_path: string | null
  thumbnail_path?: string | null
  created_at: string
  source_snapshot_id?: number
  loras?: SnapshotLoraRead[]
  tag_sets?: SnapshotTagSetRead[]
}

export interface SnapshotCreate {
  workflow_id: number
  image_path?: string
  thumbnail_path?: string
  params: Record<string, unknown>
  album_id?: number
  new_album_name?: string
  source_snapshot_id?: number
  loras?: SnapshotLoraCreate[]
  tag_sets?: SnapshotTagSetCreate[]
}

export interface BubbleDetectResponse {
  bounding_box: { x: number; y: number; w: number; h: number } | null
  confidence: number
}

export interface BubbleCandidate {
  id: number
  x: number
  y: number
  w: number
  h: number
  area: number
  aspect_ratio: number
  mean_brightness: number
  status: 'PASS' | 'FAIL_AREA' | 'FAIL_ROI' | 'FAIL_ASPECT' | 'FAIL_BRIGHTNESS'
}

export interface SpeechDraftResponse {
  draft: string
}


// 笏笏笏 Album 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface AlbumItem {
  snapshot_id: number
  sequence_order: number
  image_path: string | null
  thumbnail_path?: string | null
  created_at?: string | null
}

export type AlbumRead = Album;
export type AlbumItemRead = AlbumItem;

export interface AlbumSummary {
  id: number
  name: string
  sort_order?: number
  created_at: string
}

export interface Album {
  id: number
  name: string
  sort_order?: number
  created_at: string
  items: AlbumItem[]
}

export interface AlbumCreate {
  name: string
  snapshot_ids: number[]
}

export interface AlbumUpdate {
  name?: string
  sort_order?: number
}

export interface AlbumReorder {
  ordered_ids: number[]
}

// 笏笏笏 Config 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export interface AppConfig {
  comfy_url: string
}

// 笏笏笏 Category 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface Category {
  id: number
  name: string
  sort_order: number
}

// 笏笏笏 LoRA 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface TriggerWordSet {
  id: number
  name: string
  words: string[]
}

export interface Lora {
  id: number
  model_name: string
  description: string | null
  recommended_strength_min: number | null
  recommended_strength_max: number | null
  category_id: number | null
  thumbnail_path: string | null
  file_path: string | null
  trigger_word_sets: TriggerWordSet[]
  snapshot_paths?: string[]
  target_base_model_ids?: number[]
  sort_order: number
  created_at: string
}

export interface ComfyLoraModel {
  model_name: string
  file_path: string
  is_registered: boolean
  lora_id: number | null
}


export interface LoraCreate {
  model_name: string
  description?: string
  recommended_strength_min?: number
  recommended_strength_max?: number
  category_id?: number
  thumbnail_path?: string
  file_path?: string
  trigger_word_sets: { name: string; words: string[] }[]
  target_base_model_ids?: number[]
}

// 笏笏笏 TagSet 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface TagSubset {
  id: number
  tag_set_id: number
  name: string
  tags: string[]
}

export interface TagSubsetCreate {
  name: string
  tags: string[]
}

export interface TagSet {
  id: number
  name: string
  description: string | null
  category_id: number | null
  tags: string[]
  thumbnail_path: string | null
  snapshot_paths?: string[]
  target_base_model_ids?: number[]
  sort_order: number
  created_at: string
  subsets?: TagSubset[]
}

export interface TagSetCreate {
  name: string
  description?: string
  category_id?: number
  tags: string[]
  thumbnail_path?: string
  subsets?: TagSubsetCreate[]
  target_base_model_ids?: number[]
}

// 笏笏笏 LLM Audit 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface AuditRequest {
  audit_types: ('interference' | 'vocabulary' | 'physical')[]
  positive: string
  negative: string
  intent: string
  model_hint?: string
}

export interface InterferenceItem {
  tag: string
  reason: string
}

export interface VocabularyItem {
  suggestion: string
  effect: string
}

export interface PhysicalResult {
  status: string
  note: string | null
  alternatives: string[]
}

export interface AuditResult {
  interference?: InterferenceItem[]
  vocabulary?: VocabularyItem[]
  physical?: PhysicalResult
}

// 笏笏笏 LLM Prompts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface LlmPrompt {
  id: number
  key: string
  content: string
  description: string | null
  updated_at: string
}

// 笏笏笏 Preset 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface WorkflowPreset {
  id: number
  workflow_id: number
  name: string
  param_values: Record<string, string>
  applied_assets: Record<string, any[]>
  batch_size: number
  seed_mode: string
  seed: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface WorkflowPresetCreate {
  workflow_id: number
  name: string
  param_values?: Record<string, string>
  applied_assets?: Record<string, any[]>
  batch_size: number
  seed_mode: string
  seed: number
  sort_order?: number
}

export interface WorkflowPresetUpdate {
  name?: string
  param_values?: Record<string, string>
  applied_assets?: Record<string, any[]>
  batch_size?: number
  seed_mode?: string
  seed?: number
  sort_order?: number
  base_updated_at?: string
}

export interface WorkflowCopyRequest {
  name: string
}

export interface WorkflowPresetReorder {
  ordered_ids: number[]
}

export interface WorkflowPresetBulkDeleteRequest {
  ids: number[]
}

export interface LoraReorder {
  category_id?: number | null
  ordered_ids: number[]
}

export interface TagSetReorder {
  category_id?: number | null
  ordered_ids: number[]
}


// 笏笏笏 Scene Generator 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface SceneItem {
  id: string        // crypto.randomUUID()
  summary: string   // 概要
  name?: string
}

export interface SceneGenerateRequest {
  target_fields: string[]
  base_params: Record<string, string>
  scenes: { id: string; summary: string }[]
  anima_mode?: boolean
}

export interface SceneDiffParams {
  scene_id: string
  diff_params: Record<string, string>     // 繝輔ぅ繝ｼ繝ｫ繝牙錐 竊・LLM縺檎函謌舌＠縺溯恭隱槭・繝ｭ繝ｳ繝励ヨ
}

// 笏笏笏 BypassProfile 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface BypassProfile {
  id: number
  workflow_id: number
  name: string
  bypassed_node_ids: string[]
  is_enabled: boolean
  created_at: string
}

export interface BypassProfileCreate {
  name: string
  bypassed_node_ids: string[]
}

export interface BypassProfileUpdate {
  name?: string
  bypassed_node_ids?: string[]
  is_enabled?: boolean
}


// 笏笏笏 ParamSyncGroup 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface ParamSyncGroup {
  id: number
  workflow_id: number
  name: string
  master_role: string
  slave_roles: string[]
  is_enabled: boolean
  created_at: string
}

export interface ParamSyncGroupCreate {
  name: string
  master_role: string
  slave_roles: string[]
  is_enabled?: boolean
}

export interface ParamSyncGroupUpdate {
  name?: string
  master_role?: string
  slave_roles?: string[]
  is_enabled?: boolean
}



// 笏笏笏 BaseModel & CheckpointMapping 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface BaseModel {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface BaseModelCreate {
  name: string
  description?: string
}

export interface CheckpointMapping {
  id: number
  checkpoint_name: string
  base_model_id: number
  created_at: string
  base_model?: BaseModel | null
}

export interface CheckpointMappingCreate {
  checkpoint_name: string
  base_model_id: number
}

// 笏笏笏 ServerFont 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface ServerFont {
  name: string
  file_name: string
}

// 笏笏笏 ParamTypeMaster 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface ParamTypeMaster {
  id: number
  name: string
  widget_type: 'select' | 'int' | 'float' | 'textarea' | 'boolean'
  combo_options: string[] | null
  min_value: number | null
  max_value: number | null
  step: number | null
  created_at: string
}

export interface ParamTypeMasterCreate {
  name: string
  widget_type: string
  combo_options?: string[]
  min_value?: number
  max_value?: number
  step?: number
}

// 笏笏笏 ComfyUI Object Info 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * ComfyUI /object_info/{class_type} 縺ｮ繝ｬ繧ｹ繝昴Φ繧ｹ縲・ * 繧ｭ繝ｼ縺ｯclass_type蜷阪∝､縺ｯ繝弱・繝牙ｮ夂ｾｩ縲・ * input.required 縺ｮ蜷・お繝ｳ繝医Μ:
 *   - combo: [string[], {}]
 *   - INT/FLOAT: ["INT"|"FLOAT", {min?, max?, default?, step?}]
 */
export type ComfyObjectInfo = Record<string, {
  input?: {
    required?: Record<string, [unknown, Record<string, unknown>]>
    optional?: Record<string, [unknown, Record<string, unknown>]>
  }
}>

// 笏笏笏 SpeechBubblePreset 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface SpeechBubblePreset {
  id: number
  name: string
  shape: BubbleShapeType
  orientation: TextOrientation
  font_family: string
  font_size: number
  text_color: string
  background_color: string
  border_color: string
  border_width: number
  sort_order: number
  effects?: MangaTextEffectConfig
  text?: string | null
  tag_set_id?: number | null
  is_default?: boolean
  tone_preset_id?: number | null
  created_at: string
}

export interface SpeechBubblePresetCreate {
  name: string
  shape?: BubbleShapeType
  orientation?: TextOrientation
  font_family?: string
  font_size?: number
  text_color?: string
  background_color?: string
  border_color?: string
  border_width?: number
  sort_order?: number
  effects?: MangaTextEffectConfig
  text?: string | null
  tag_set_id?: number | null
  is_default?: boolean
  tone_preset_id?: number | null
}

export interface SpeechBubblePresetUpdate {
  name?: string
  shape?: BubbleShapeType
  orientation?: TextOrientation
  font_family?: string
  font_size?: number
  text_color?: string
  background_color?: string
  border_color?: string
  border_width?: number
  sort_order?: number
  effects?: MangaTextEffectConfig
  text?: string | null
  tag_set_id?: number | null
  is_default?: boolean
  tone_preset_id?: number | null
}

// 笏笏笏 SpeechTonePreset 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface SpeechTonePreset {
  id: number
  name: string
  prompt: string
  description?: string | null
  sort_order: number
  created_at: string
}

export interface SpeechTonePresetCreate {
  name: string
  prompt: string
  description?: string | null
  sort_order?: number
}

export interface SpeechTonePresetUpdate {
  name?: string
  prompt?: string
  description?: string | null
  sort_order?: number
}

export interface SpeechToneRewriteRequest {
  text: string
  tone_prompt?: string
  preset_id?: number
  model?: string
  llm_params?: Record<string, any>
  snapshot_id?: number
  image_path?: string
  include_image?: boolean
  scene_hint?: string
  previous_rewritten_text?: string
  revision_instruction?: string
}

export interface SpeechToneRewriteResponse {
  rewritten_text: string
  scene_interpretation?: string | null
  reasoning?: string | null
}

// 笏笏笏 Translation Types 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export interface PromptTranslateRequest {
  prompt: string
  source_lang?: string
  target_lang?: string
  provider?: string
  repack?: boolean
}

export interface TranslateMeta {
  total_chunks: number
  cached_chunks: number
  api_requested_chunks: number
  billed_characters: number
  provider: string
}

export interface PromptTranslateResponse {
  translated_prompt: string
  meta: TranslateMeta
}

export interface TranslateTestRequest {
  provider: 'google_cloud' | 'deepl' | 'llm' | 'fugumt'
  api_key?: string
  api_url?: string
}

export interface TranslateTestResponse {
  success: boolean
  sample_translation: string
  error?: string
}

export type TranslationMode = 'en_to_ja' | 'ja_to_en'







// ─── Speech Batch Rewrite ─────────────────────────────────────────

export type SpeechBatchJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type SpeechBatchItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface SpeechBatchJobItemCreate {
  id: string // e.g. ${snapshotId}_${bubbleId}
  snapshot_id: number
  bubble_id: string
  bubble_index: number
  text: string
  scene_hint?: string
  include_image?: boolean
  image_path?: string | null
}

export interface SpeechBatchJobCreate {
  preset_id?: number | null
  tone_prompt?: string | null
  model?: string | null
  items: SpeechBatchJobItemCreate[]
}

export interface SpeechBatchItemRetryRequest {
  revision_instruction?: string
  scene_hint?: string
  include_image?: boolean
}

export interface SpeechBatchJobItem {
  id: string
  snapshot_id: number
  bubble_id: string
  bubble_index: number
  original_text: string
  rewritten_text?: string | null
  scene_interpretation?: string | null
  reasoning?: string | null
  previous_rewritten_text?: string | null
  revision_instruction?: string | null
  status: SpeechBatchItemStatus
  error?: string | null
  scene_hint?: string
  include_image?: boolean
  image_path?: string
}

export interface SpeechBatchJob {
  job_id: string
  preset_id?: number | null
  tone_prompt?: string | null
  model?: string | null
  status: SpeechBatchJobStatus
  total_count: number
  completed_count: number
  failed_count: number
  created_at: string
  items: SpeechBatchJobItem[]
}

// ─── Speech Scene Draft Types ─────────────────────────

export interface BubblePosition {
  x: number
  y: number
  w: number
  h: number
}

export interface BubbleTail {
  direction: 'top' | 'bottom' | 'left' | 'right' | 'none'
  tip_x: number
  tip_y: number
}

export interface BubbleStyleConfig {
  shape: 'oval' | 'round' | 'rounded-rect' | 'rect' | 'cloud' | 'burst' | 'none'
  textColor: string
  backgroundColor: string
  borderColor: string
  borderWidth: number
  fontFamily: string
  fontSize: number
}

export interface GeneratedSpeechBubbleRead {
  id: string
  text: string
  role: 'main' | 'sub' | 'se'
  speaker_name: string
  speaker_tag_set_id?: number | null
  is_se: boolean
  position: BubblePosition
  tail?: BubbleTail | null
  style: BubbleStyleConfig
}

export interface ToneSampleItem {
  snapshot_id?: number | null
  thumbnail_url?: string | null
  text: string
  similarity_tier: 'high' | 'mid' | 'low' | 'fallback'
}

export interface SimilarSceneCandidate {
  snapshot_id: number
  thumbnail_url: string
  score: number
  matched_stems: string[]
  prompt: string
  bubble_count: number
}

export interface SceneDraftRequest {
  snapshot_id: number
  target_tag_set_id?: number | null
  explicit_preset_id?: number | null
  scene_hint?: string | null
  override_similar_scene_snapshot_id?: number | null
}

export interface SceneDraftResponse {
  scene_interpretation: string
  bubbles: GeneratedSpeechBubbleRead[]
  vram_unloaded: boolean
  tone_samples: ToneSampleItem[]
  selected_similar_scene_id?: number | null
  candidate_similar_scenes: SimilarSceneCandidate[]
}

export type SceneSpeechStreamErrorKind =
  | 'lm_studio_400'
  | 'connection_refused'
  | 'timeout'
  | 'unknown'
  | 'invalid_request'
  | 'vram_unload_failed'

export type SceneSpeechProgressStep = 'reference' | 'vlm' | 'style' | 'vram'
export type SceneSpeechProgressStatus = 'active' | 'done' | 'error'

export interface SceneSpeechProgressEvent {
  type: 'progress'
  step: SceneSpeechProgressStep
  status: SceneSpeechProgressStatus
}

export type SceneSpeechStreamEvent =
  | SceneSpeechProgressEvent
  | { type: 'result'; data: SceneDraftResponse }
  | { type: 'error'; error_kind: SceneSpeechStreamErrorKind; message: string }

export interface SceneSpeechStreamOptions {
  onProgress?: (event: SceneSpeechProgressEvent) => void
  signal?: AbortSignal
}

// ─── LoRA Studio / Dataset & Training & Benchmark Types ──────────

export interface DatasetProject {
  id: number
  name: string
  character_trigger: string
  outfit_trigger: string
  workflow_id: number
  prompt_meta: string
  prompt_physical: string
  prompt_exclusive_outfit: string
  selected_alt_outfits: string
  created_at: string
  updated_at: string
}

export interface DatasetProjectCreate {
  name: string
  character_trigger: string
  outfit_trigger: string
  workflow_id: number
  prompt_meta: string
  prompt_physical: string
  prompt_exclusive_outfit: string
  selected_alt_outfits?: string
}

export interface DatasetProjectUpdate {
  name?: string
  character_trigger?: string
  outfit_trigger?: string
  workflow_id?: number
  prompt_meta?: string
  prompt_physical?: string
  prompt_exclusive_outfit?: string
  selected_alt_outfits?: string
}

export interface DatasetItemFactors {
  shot: string
  angle: string
  expression: string
  pose: string
  outfit_type: 'default' | 'alt'
}

export interface DatasetItem {
  id: number
  project_id: number
  slot_index: number
  factors_json: string
  raw_prompt: string
  caption_text: string
  image_path?: string | null
  seed: number
  status: 'APPROVED' | 'REJECTED' | 'REROLLING' | string
}

export interface DatasetItemUpdate {
  factors_json?: string
  raw_prompt?: string
  caption_text?: string
  image_path?: string | null
  seed?: number
  status?: string
}

export interface OutfitMasterPreset {
  id: number
  name: string
  category: string
  prompt_tags: string
  is_builtin: boolean
}

export interface OutfitMasterPresetCreate {
  name: string
  category: string
  prompt_tags: string
  is_builtin?: boolean
}

export interface DatasetExportRequest {
  export_dir?: string
  output_dir?: string
  status_filter?: string
}

export interface DatasetExportResponse {
  status: string
  project_id: number
  export_dir: string
  item_count: number
  exported_files: string[]
}

export interface LoraTrainingJob {
  id: number
  project_id: number
  lora_name: string
  model_type: string
  config_toml_content: string
  epochs: number
  repeats: number
  batch_size: number
  total_steps: number
  network_dim: number
  network_alpha: number
  learning_rate: string
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED' | string
  final_loss?: number | null
  pid?: number | null
}

export interface LoraTrainingJobCreate {
  project_id: number
  lora_name: string
  model_type?: string
  config_toml_content: string
  epochs: number
  repeats: number
  batch_size: number
  total_steps: number
  network_dim: number
  network_alpha: number
  learning_rate: string
  status?: string
}

export interface TrainingTelemetryMessage {
  job_id: number
  step: number
  total_steps: number
  epoch: number
  epochs: number
  loss: number
  vram_used_gb?: number
  gpu_temp?: number
  status: string
  log?: string
}

export interface StressTestPrompt {
  axis_id: string
  axis_title: string
  weight: number
  prompt: string
  seed: number
}

export interface GenerateStressTestPromptsRequest {
  lora_name: string
  character_trigger: string
  outfit_trigger: string
}

export interface GenerateStressTestPromptsResponse {
  prompts: StressTestPrompt[]
  total: number
}

export interface SweetSpotResult {
  recommended_weight_min: number
  recommended_weight_max: number
  recommended_weight_display: string
  reason: string
}

export interface EvaluateBenchmarkRequest {
  results: Record<string, unknown>[]
}

export interface EvaluateBenchmarkResponse {
  sweet_spot: SweetSpotResult
  results: Record<string, unknown>[]
}

