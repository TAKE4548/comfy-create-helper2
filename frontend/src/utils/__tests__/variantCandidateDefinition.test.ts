// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { candidateDefinitionForVariant } from '../variantCandidateDefinition'

const empty = { expectedClassTypes: [], titlePatterns: [], paramNames: [], entryPairs: [], containsPatterns: [] }

describe('candidateDefinitionForVariant', () => {
  it('[REQ-419/AC-13] [REQ-419/AC-1] candidateDefinitionForVariant ignores master legacy columns', () => {
    const polluted = {
      expected_class_types: ['LegacyClass'],
      title_patterns: ['Legacy Title'],
      base_title_patterns: ['Base Legacy'],
      param_name: 'legacy_param',
      fallback_param_names: ['legacy_fallback'],
      extra_title_patterns: ['extra'],
    } as any
    expect(candidateDefinitionForVariant(polluted)).toEqual(empty)
    expect(candidateDefinitionForVariant({ ...polluted, rule_entries: [{ class_type: 'KSampler', param_name: 'steps' }] })).toEqual({
      expectedClassTypes: ['KSampler'],
      titlePatterns: [],
      paramNames: ['steps'],
      entryPairs: [{ classType: 'KSampler', paramName: 'steps' }],
      containsPatterns: [],
    })
    expect(candidateDefinitionForVariant(null)).toEqual(empty)
    expect(candidateDefinitionForVariant(undefined)).toEqual(empty)
    expect(candidateDefinitionForVariant({ rule_entries: [], selector_patterns: [{ pattern: 'x' }] })).toEqual(empty)
  })

  it('[REQ-419/AC-13] candidateDefinitionForVariant orders entries and splits patterns by match type', () => {
    const result = candidateDefinitionForVariant({
      rule_entries: [
        { class_type: 'B', param_name: 'p2', priority: 2 },
        { class_type: 'A', param_name: 'p1', priority: 1 },
        { class_type: 'A', param_name: 'p3', priority: 2 },
      ],
      selector_patterns: [
        { pattern: 'c2', match_type: 'contains', priority: 2 },
        { pattern: 'e1', match_type: 'exact', priority: 1 },
        { pattern: 'c0' },
        { pattern: 'c3', match_type: 'weird', priority: 3 },
      ],
    })
    expect(result.entryPairs).toEqual([
      { classType: 'A', paramName: 'p1' },
      { classType: 'B', paramName: 'p2' },
      { classType: 'A', paramName: 'p3' },
    ])
    expect(result.expectedClassTypes).toEqual(['A', 'B'])
    expect(result.paramNames).toEqual(['p1', 'p2', 'p3'])
    expect(result.titlePatterns).toEqual(['e1'])
    expect(result.containsPatterns).toEqual(['c0', 'c2', 'c3'])
  })
})
