/**
 * Global Stale Time configuration constants for React Query
 */
export const STALE_TIMES = {
  // Static / immutable data (only invalidated on explicit mutation)
  CONFIG: Infinity,
  FONTS: Infinity,

  // Semi-static master data (10 min)
  BASE_MODELS: 10 * 60 * 1000,
  LORA_CATEGORIES: 10 * 60 * 1000,
  TAGSET_CATEGORIES: 10 * 60 * 1000,
  LLM_PROMPTS: 10 * 60 * 1000,

  // Master settings data (5 min)
  PARAM_TYPE_MASTERS: 5 * 60 * 1000,
  MAPPING_MASTERS: 5 * 60 * 1000,
  SPEECH_BUBBLE_PRESETS: 5 * 60 * 1000,
  SPEECH_TONE_PRESETS: 5 * 60 * 1000,
  SNAPSHOT_DETAIL: 5 * 60 * 1000,


  // Frequent assets and workflow data (1 min)
  WORKFLOWS: 60 * 1000,
  LORAS: 60 * 1000,
  TAG_SETS: 60 * 1000,
  ALBUMS: 60 * 1000,
  WORKFLOW_PRESETS: 30 * 1000,

  // Highly dynamic data (15 sec)
  SNAPSHOTS: 15 * 1000,
} as const
