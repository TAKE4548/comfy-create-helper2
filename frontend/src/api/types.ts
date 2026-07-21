/**
 * API types for Prompt Surgeon v2
 * Auto-generated shape: matches FastAPI schemas.py
 */

// ─── MappingMaster ─────────────────────────────────────────────

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

// ─── Workflow ───────────────────────────────────────────────────

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


// ─── Workflow Scan ──────────────────────────────────────────────

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

// ─── Snapshot ───────────────────────────────────────────────────

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
  created_at: string
  source_snapshot_id?: number
}

export interface Snapshot {
  id: number
  workflow_id: number
  params: Record<string, unknown>
  image_path: string | null
  created_at: string
  source_snapshot_id?: number
  loras?: SnapshotLoraRead[]
  tag_sets?: SnapshotTagSetRead[]
}

export interface SnapshotCreate {
  workflow_id: number
  image_path?: string
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


// ─── Album ──────────────────────────────────────────────────────

export interface AlbumItem {
  snapshot_id: number
  sequence_order: number
  image_path: string | null
  created_at?: string | null
}

export type AlbumRead = Album;
export type AlbumItemRead = AlbumItem;

export interface AlbumSummary {
  id: number
  name: string
  created_at: string
}

export interface Album {
  id: number
  name: string
  created_at: string
  items: AlbumItem[]
}

export interface AlbumCreate {
  name: string
  snapshot_ids: number[]
}

// ─── Category ───────────────────────────────────────────────────

export interface Category {
  id: number
  name: string
  sort_order: number
}

// ─── LoRA ───────────────────────────────────────────────────────

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

// ─── TagSet ─────────────────────────────────────────────────────

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

// ─── LLM Audit ──────────────────────────────────────────────────

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

// ─── LLM Prompts ────────────────────────────────────────────────

export interface LlmPrompt {
  id: number
  key: string
  content: string
  description: string | null
  updated_at: string
}

// ─── Preset ─────────────────────────────────────────────────────

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
}

export interface WorkflowCopyRequest {
  name: string
}

export interface WorkflowPresetReorder {
  ordered_ids: number[]
}

export interface LoraReorder {
  ordered_ids: number[]
}

export interface TagSetReorder {
  ordered_ids: number[]
}


// ─── Scene Generator ─────────────────────────────────────────────

export interface SceneItem {
  id: string        // crypto.randomUUID() で生成
  summary: string   // ユーザーが入力する日本語の概要
  name?: string
}

export interface SceneGenerateRequest {
  target_fields: string[]                 // 選択されたフィールドの role 名リスト
  base_params: Record<string, string>     // フィールド名 → 現在の値（文脈情報）
  scenes: { id: string; summary: string }[]
  anima_mode?: boolean
}

export interface SceneDiffParams {
  scene_id: string
  diff_params: Record<string, string>     // フィールド名 → LLMが生成した英語プロンプト
}

// ─── BypassProfile ───────────────────────────────────────────────

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


// ─── BaseModel & CheckpointMapping ──────────────────────────────

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

// ─── ServerFont ─────────────────────────────────────────────────

export interface ServerFont {
  name: string
  file_name: string
}


