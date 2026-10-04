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
