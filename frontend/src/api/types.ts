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
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler'
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
  created_at: string
}

export interface WorkflowCreate {
  name: string
  json_body: Record<string, unknown>
  mappings: { master_id: number; node_id: string }[]
}

export interface WorkflowUpdate {
  name?: string
  json_body?: Record<string, unknown>
  default_applied_assets?: string | null
  mappings?: { master_id: number; node_id: string }[]
}


// ─── Workflow Scan ──────────────────────────────────────────────

export interface ScanMatchedItem {
  master_id: number
  role: string
  node_id: string
  node_title: string
  status: string
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
}

export interface Snapshot {
  id: number
  workflow_id: number
  params: Record<string, unknown>
  image_path: string | null
  created_at: string
  loras?: SnapshotLoraRead[]
  tag_sets?: SnapshotTagSetRead[]
}

export interface SnapshotCreate {
  workflow_id: number
  image_path?: string
  params: Record<string, unknown>
  album_id?: number
  new_album_name?: string
  loras?: SnapshotLoraCreate[]
  tag_sets?: SnapshotTagSetCreate[]
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
}

// ─── TagSet ─────────────────────────────────────────────────────

export interface TagSet {
  id: number
  name: string
  description: string | null
  category_id: number | null
  tags: string[]
  thumbnail_path: string | null
  snapshot_paths?: string[]
  created_at: string
}

export interface TagSetCreate {
  name: string
  description?: string
  category_id?: number
  tags: string[]
  thumbnail_path?: string
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
}

export interface WorkflowPresetUpdate {
  name?: string
  param_values?: Record<string, string>
  applied_assets?: Record<string, any[]>
  batch_size?: number
  seed_mode?: string
  seed?: number
}
