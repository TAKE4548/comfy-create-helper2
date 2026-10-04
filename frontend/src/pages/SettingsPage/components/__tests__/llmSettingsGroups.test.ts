import { describe, expect, it } from 'vitest'
import { GROUP_PARAMS, GROUP_PROMPTS } from '../llmSettingsGroups'

describe('LLM settings group allowlists', () => {
  it('contains exactly the approved prompts and params for each group', () => {
    expect(GROUP_PROMPTS.prompt).toEqual([
      'audit_interference',
      'audit_interference_anima',
      'audit_vocabulary',
      'audit_physical',
      'scene_generate',
      'scene_generate_anima',
    ])
    expect(GROUP_PROMPTS.dialogue).toEqual([
      'speech_draft_vlm_prompt',
      'speech_draft_llm_prompt',
      'speech_rewrite_system_prompt',
    ])
    expect(GROUP_PROMPTS.translation).toEqual(['translation_ja_to_en', 'translation_en_to_ja'])
    expect(GROUP_PARAMS.prompt).toEqual(['llm_params_audit', 'llm_params_scene_generate'])
    expect(GROUP_PARAMS.dialogue).toEqual(['llm_params_speech_draft'])
    expect(GROUP_PARAMS.translation).toEqual(['llm_params_translation'])
  })

  it('has no duplicate keys and excludes model, provider, and unknown settings', () => {
    const promptKeys = Object.values(GROUP_PROMPTS).flat()
    const paramKeys = Object.values(GROUP_PARAMS).flat()
    expect(new Set(promptKeys).size).toBe(promptKeys.length)
    expect(new Set(paramKeys).size).toBe(paramKeys.length)
    expect([...promptKeys, ...paramKeys]).not.toContain('translation_model')
    expect([...promptKeys, ...paramKeys]).not.toContain('speech_draft_vlm_model')
    expect([...promptKeys, ...paramKeys]).not.toContain('speech_draft_llm_model')
    expect([...promptKeys, ...paramKeys]).not.toContain('translation_debounce')
    expect([...promptKeys, ...paramKeys]).not.toContain('provider')
    expect([...promptKeys, ...paramKeys]).not.toContain('unknown_setting')
  })
})
