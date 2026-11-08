import type { BindingRuleEntryCreate, NodeSelectorPatternCreate } from '../api/types'
import type { CandidateDefinition } from './workflowNodeUtils'

/**
 * Structurally equal to Pick<MappingVariant, 'rule_entries' | 'selector_patterns'> once REQ-419-T3 adds those fields.
 * Declared locally because MappingVariant in api/types.ts does not yet expose them.
 */
export type VariantDefinitionSource = {
  rule_entries?: BindingRuleEntryCreate[]
  selector_patterns?: NodeSelectorPatternCreate[] | null
}

const byPriority = <T extends { priority?: number }>(items: readonly T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.priority ?? 0) - (b.item.priority ?? 0) || a.index - b.index)
    .map(({ item }) => item)

/** Builds a candidate definition only from the variant's RuleSet entries and NodeSelector patterns. */
export function candidateDefinitionForVariant(
  variant: VariantDefinitionSource | null | undefined
): CandidateDefinition {
  const entries = variant?.rule_entries
  if (!entries || entries.length === 0) {
    return { expectedClassTypes: [], titlePatterns: [], paramNames: [], entryPairs: [], containsPatterns: [] }
  }
  const sortedEntries = byPriority(entries)
  const titlePatterns: string[] = []
  const containsPatterns: string[] = []
  for (const p of byPriority(variant?.selector_patterns ?? [])) {
    if (p.match_type === 'exact') titlePatterns.push(p.pattern)
    else containsPatterns.push(p.pattern)
  }
  return {
    expectedClassTypes: [...new Set(sortedEntries.map((e) => e.class_type))],
    titlePatterns,
    paramNames: [...new Set(sortedEntries.map((e) => e.param_name))],
    entryPairs: sortedEntries.map((e) => ({ classType: e.class_type, paramName: e.param_name })),
    containsPatterns,
  }
}
