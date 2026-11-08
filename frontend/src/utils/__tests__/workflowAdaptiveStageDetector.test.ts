// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildStageSelectorPatterns, detectActiveStages } from '../workflowAdaptiveStageDetector'
import type { StageMaster } from '../../api/types'

const stage = (id: number, key: string, extra: Partial<StageMaster> = {}): StageMaster => ({
  id, key, name: key, suffix: '', search_keywords: null, previous_suffixes: null,
  is_builtin: false, is_active: true, sort_order: id, ...extra,
})

const workflow = {
  '1': { class_type: 'KSampler', _meta: { title: 'Rough Pass' } },
  '2': { class_type: 'LegacyClass', _meta: { title: 'Other' } },
  '3': { class_type: 'KSampler', _meta: { title: 'Fine' } },
}

describe('detectActiveStages', () => {
  it('[REQ-419/AC-13] detectActiveStages uses selector patterns and ignores search_keywords', () => {
    const stages = [
      stage(1, 'main', { is_builtin: true }),
      stage(2, 'kwonly', { search_keywords: ['rough', 'legacyclass'] }),
      stage(3, 'sel'),
      stage(4, 'disabled'),
      stage(5, 'exact'),
      stage(6, 'exactmiss'),
    ]
    const patterns = buildStageSelectorPatterns([{
      variants: [
        { stage_id: 3, is_enabled: true, selector_patterns: [{ pattern: ' ROUGH ', match_type: 'contains' }] },
        { stage_id: 4, is_enabled: false, selector_patterns: [{ pattern: 'rough' }] },
        { stage_id: 5, is_enabled: true, selector_patterns: [{ pattern: 'fine', match_type: 'exact' }] },
        { stage_id: 6, is_enabled: true, selector_patterns: [{ pattern: 'fin', match_type: 'exact' }] },
      ],
    }])
    const result = detectActiveStages(workflow, stages, patterns)
    const byKey = Object.fromEntries(result.map((r) => [r.stage.key, r]))
    expect(byKey.main.isAlwaysVisible).toBe(true)
    expect(byKey.kwonly).toBeUndefined()
    expect(byKey.disabled).toBeUndefined()
    expect(byKey.exactmiss).toBeUndefined()
    expect(byKey.sel.matchedNodeIds).toEqual(['1'])
    expect(byKey.exact.matchedNodeIds).toEqual(['3'])
    // legacy-only node '2' (class_type LegacyClass) is matched by no stage
    expect(result.every((r) => !r.matchedNodeIds.includes('2'))).toBe(true)
    // without patterns, only always-visible stages remain
    expect(detectActiveStages(workflow, stages).map((r) => r.stage.key)).toEqual(['main'])
  })

  it('[REQ-419/AC-13] buildStageSelectorPatterns aggregates enabled variants by stage', () => {
    const map = buildStageSelectorPatterns([
      { variants: [
        { stage_id: 1, is_enabled: true, selector_patterns: [{ pattern: 'a' }, { pattern: '  ' }, { pattern: 'a' }] },
        { stage_id: 1, is_enabled: true, selector_patterns: [{ pattern: 'b', match_type: 'exact' }] },
        { stage_id: 2, is_enabled: false, selector_patterns: [{ pattern: 'z' }] },
        { stage_id: 3, is_enabled: true, selector_patterns: null },
      ] },
      { variants: [{ stage_id: 1, is_enabled: true, selector_patterns: [{ pattern: 'a' }] }] },
      {},
    ])
    expect(map.get(1)).toEqual([{ pattern: 'a', match_type: 'contains' }, { pattern: 'b', match_type: 'exact' }])
    expect(map.has(2)).toBe(false)
    expect(map.has(3)).toBe(false)
  })
})
