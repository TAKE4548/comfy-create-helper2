import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  GROUP_PARAMS,
  GROUP_PROMPTS,
  PROMPT_EDITOR_KEYS,
  promptParamGroupFor,
} from '../llmSettingsGroups'

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

describe('promptParamGroupFor', () => {
  it('[REQ-365/AC-5] maps each of the six prompt editor keys to a param group contained in GROUP_PARAMS.prompt', () => {
    expect(PROMPT_EDITOR_KEYS).toHaveLength(6)
    for (const key of PROMPT_EDITOR_KEYS) {
      const group = promptParamGroupFor(key)
      expect(group).not.toBeNull()
      expect(GROUP_PARAMS.prompt as readonly string[]).toContain(group)
    }
  })

  it('[REQ-365/AC-5] every PROMPT_EDITOR_KEYS entry equals GROUP_PROMPTS.prompt in order', () => {
    expect([...PROMPT_EDITOR_KEYS]).toEqual([...GROUP_PROMPTS.prompt])
  })

  it('[REQ-365/AC-5] PBT: returns null for any string outside PROMPT_EDITOR_KEYS and never throws', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(PROMPT_EDITOR_KEYS as readonly string[]).includes(s)),
        (s) => promptParamGroupFor(s) === null,
      ),
      { numRuns: 300 },
    )
  })

  it('[REQ-365/AC-5] PBT: result is total over PROMPT_EDITOR_KEYS (non-null) and idempotent', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROMPT_EDITOR_KEYS), (k) => {
        const a = promptParamGroupFor(k)
        return a !== null && a === promptParamGroupFor(k)
      }),
      { numRuns: 200 },
    )
  })

  it('[REQ-365/AC-5] two param groups are both reachable', () => {
    const images = new Set(PROMPT_EDITOR_KEYS.map((k) => promptParamGroupFor(k)))
    expect(images.has('llm_params_audit')).toBe(true)
    expect(images.has('llm_params_scene_generate')).toBe(true)
  })
})
