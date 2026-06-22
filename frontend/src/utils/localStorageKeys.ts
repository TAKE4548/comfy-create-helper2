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
} as const;

export type LSKey = typeof LS_KEYS[keyof typeof LS_KEYS];
