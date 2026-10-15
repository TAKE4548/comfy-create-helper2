export type LlmSettingsGroup = 'prompt' | 'dialogue' | 'translation'

export const GROUP_PROMPTS = {
  prompt: [
    'audit_interference',
    'audit_interference_anima',
    'audit_vocabulary',
    'audit_physical',
    'scene_generate',
    'scene_generate_anima',
  ],
  dialogue: ['speech_draft_vlm_prompt', 'speech_draft_llm_prompt', 'speech_rewrite_system_prompt'],
  translation: ['translation_ja_to_en', 'translation_en_to_ja'],
} as const

export const GROUP_PARAMS = {
  prompt: ['llm_params_audit', 'llm_params_scene_generate'],
  dialogue: ['llm_params_speech_draft'],
  translation: ['llm_params_translation'],
} as const

export type PromptParamGroup = (typeof GROUP_PARAMS.prompt)[number]

/** Unified editor kinds (= GROUP_PROMPTS.prompt, fixed order) */
export const PROMPT_EDITOR_KEYS: readonly (typeof GROUP_PROMPTS.prompt)[number][] =
  GROUP_PROMPTS.prompt

const PROMPT_PARAM_GROUP_MAP: Readonly<Record<string, PromptParamGroup>> = {
  audit_interference: 'llm_params_audit',
  audit_interference_anima: 'llm_params_audit',
  audit_vocabulary: 'llm_params_audit',
  audit_physical: 'llm_params_audit',
  scene_generate: 'llm_params_scene_generate',
  scene_generate_anima: 'llm_params_scene_generate',
}

/** Maps a prompt kind key to its LLM param group. Unknown keys return null. */
export function promptParamGroupFor(promptKey: string): PromptParamGroup | null {
  return Object.prototype.hasOwnProperty.call(PROMPT_PARAM_GROUP_MAP, promptKey)
    ? PROMPT_PARAM_GROUP_MAP[promptKey]
    : null
}
