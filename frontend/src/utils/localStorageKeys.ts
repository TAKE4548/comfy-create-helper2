/**
 * Centralized localStorage key constants.
 * All localStorage accesses in the app MUST use these keys.
 */
export const LS_KEYS = {
  CLIENT_ID: 'prompt-surgeon-client-id',
  COMFY_URL: 'prompt-surgeon-comfy-url',
  FILTER_OWN: 'prompt-surgeon-filter-own',
  WORKFLOW_ID: 'prompt-surgeon-workflow-id',
  PARAMS_PREFIX: 'prompt-surgeon-params-wf-', // + workflowId
  APPLIED_ASSETS: 'prompt-surgeon-applied-assets',
  BATCH_SIZE: 'prompt-surgeon-batch-size',
  SEED_MODE: 'prompt-surgeon-seed-mode',
  SEED: 'prompt-surgeon-seed',
  BATCH_IMAGES: 'prompt-surgeon-batch-images',
  SELECTED_IMG: 'prompt-surgeon-selected-img',
  CURRENT_PROMPT_ID: 'prompt-surgeon-current-prompt-id',
  SIDEBAR_COLLAPSED: 'prompt-surgeon-sidebar-collapsed',
  // New LocalStorage Keys:
  SET_LONG_PRESS_MULTI_SELECT: 'prompt-surgeon-long-press-multi-select', // seconds
  SET_LONG_PRESS_CARD_MOVE: 'prompt-surgeon-long-press-card-move', // seconds
  LONG_PRESS_DELAY_MULTI_SELECT: 'prompt-surgeon-longpress-delay-multiselect', // seconds
  LONG_PRESS_DELAY_CARD_MOVE: 'prompt-surgeon-longpress-delay-cardmove', // seconds
  SETS_PREFIX: 'prompt-surgeon-sets-wf-', // + workflowId
  ACTIVE_SET_PREFIX: 'prompt-surgeon-active-set-wf-', // + workflowId
  LAYOUT_MAIN_SPLIT: 'prompt-surgeon-layout-main-split',
  LAYOUT_PREVIEW_SPLIT: 'prompt-surgeon-layout-preview-split',
  SETTINGS_SECTIONS_EXPANDED: 'prompt-surgeon-settings-sections-expanded',
  SETTINGS_ACTIVE_TAB: 'prompt-surgeon-settings-active-tab',
  SETTINGS_DETAILS_EXPANDED_V2: 'prompt-surgeon-settings-details-expanded-v2',
  ACTIVE_PROMPT_TAB_PREFIX: 'prompt-surgeon-active-prompt-tab-',
  LAST_SAVE_ALBUM_ID: 'prompt-surgeon-last-save-album-id',
  LAST_SAVE_ALBUM_ID_GENERATE: 'prompt-surgeon-last-save-album-id-generate',
  LAST_SAVE_ALBUM_ID_SPEECH: 'prompt-surgeon-last-save-album-id-speech',
  GENERATE_SECTIONS_EXPANDED: 'prompt-surgeon-generate-sections-expanded',
  THUMBNAIL_ASPECT_RATIO: 'prompt-surgeon-thumbnail-aspect-ratio',
  THUMBNAIL_ASPECT_RATIO_CUSTOM: 'prompt-surgeon-thumbnail-aspect-ratio-custom',
  ACTIVE_SPEECH_BATCH_JOB_ID: 'prompt-surgeon-active-speech-batch-job-id',
  PREVIEW_AUTO_FOLLOW: 'prompt-surgeon-preview-auto-follow',
} as const;

export type LSKey = typeof LS_KEYS[keyof typeof LS_KEYS];
