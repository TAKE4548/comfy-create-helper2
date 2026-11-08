import type { MappingVariant, NodeSelectorPatternCreate, StageMaster } from '../api/types'

export interface ActiveStageInfo {
  stage: StageMaster
  matchingNodesCount: number
  matchedNodeIds: string[]
  isAlwaysVisible: boolean
}

export interface ExtractedWorkflowNode {
  id: string
  title: string
  classType: string
}

export function extractWorkflowNodes(workflowJson: unknown): ExtractedWorkflowNode[] {
  if (!workflowJson || typeof workflowJson !== 'object' || Array.isArray(workflowJson)) {
    return []
  }

  const record = workflowJson as Record<string, any>
  const result: ExtractedWorkflowNode[] = []

  try {
    if (record.nodes && typeof record.nodes === 'object' && !Array.isArray(record.nodes)) {
      for (const [id, node] of Object.entries(record.nodes)) {
        if (!node || typeof node !== 'object') continue
        const rawNode = node as Record<string, any>
        const metaTitle = typeof rawNode._meta?.title === 'string' ? rawNode._meta.title : ''
        const nodeTitle = typeof rawNode.title === 'string' ? rawNode.title : ''
        const title = metaTitle || nodeTitle
        const classType =
          typeof rawNode.class_type === 'string'
            ? rawNode.class_type
            : typeof rawNode.type === 'string'
              ? rawNode.type
              : ''
        result.push({ id: String(id), title, classType })
      }
      return result
    }

    if (Array.isArray(record.nodes)) {
      for (let i = 0; i < record.nodes.length; i++) {
        const node = record.nodes[i]
        if (!node || typeof node !== 'object') continue
        const rawNode = node as Record<string, any>
        const id = rawNode.id != null ? String(rawNode.id) : String(i)
        const metaTitle = typeof rawNode._meta?.title === 'string' ? rawNode._meta.title : ''
        const nodeTitle = typeof rawNode.title === 'string' ? rawNode.title : ''
        const title = metaTitle || nodeTitle
        const classType =
          typeof rawNode.class_type === 'string'
            ? rawNode.class_type
            : typeof rawNode.type === 'string'
              ? rawNode.type
              : ''
        result.push({ id, title, classType })
      }
      return result
    }

    for (const [id, node] of Object.entries(record)) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue
      const rawNode = node as Record<string, any>
      if ('class_type' in rawNode || '_meta' in rawNode || 'type' in rawNode) {
        const metaTitle = typeof rawNode._meta?.title === 'string' ? rawNode._meta.title : ''
        const nodeTitle = typeof rawNode.title === 'string' ? rawNode.title : ''
        const title = metaTitle || nodeTitle
        const classType =
          typeof rawNode.class_type === 'string'
            ? rawNode.class_type
            : typeof rawNode.type === 'string'
              ? rawNode.type
              : ''
        result.push({ id: String(id), title, classType })
      }
    }
  } catch {
    // Dirty node guard: safely return collected nodes
  }

  return result
}

export type StageSelectorPatterns = ReadonlyMap<number, ReadonlyArray<{ pattern: string; match_type: string }>>

export function buildStageSelectorPatterns(
  masters: ReadonlyArray<{ variants?: ReadonlyArray<Pick<MappingVariant, 'stage_id' | 'is_enabled'> & { selector_patterns?: NodeSelectorPatternCreate[] | null }> }>
): Map<number, Array<{ pattern: string; match_type: string }>> {
  const result = new Map<number, Array<{ pattern: string; match_type: string }>>()
  for (const master of masters ?? []) {
    for (const variant of master?.variants ?? []) {
      if (!variant || variant.is_enabled === false) continue
      for (const p of variant.selector_patterns ?? []) {
        if (!p || typeof p.pattern !== 'string' || p.pattern.trim().length === 0) continue
        const match_type = p.match_type ?? 'contains'
        const list = result.get(variant.stage_id) ?? []
        if (!list.some((q) => q.pattern === p.pattern && q.match_type === match_type)) {
          list.push({ pattern: p.pattern, match_type })
        }
        result.set(variant.stage_id, list)
      }
    }
  }
  return result
}

export function detectActiveStages(
  workflowJson: Record<string, any> | null | undefined,
  stages: StageMaster[],
  stagePatterns: StageSelectorPatterns = new Map()
): ActiveStageInfo[] {
  if (!workflowJson || typeof workflowJson !== 'object' || !Array.isArray(stages) || stages.length === 0) {
    return []
  }

  const nodes = extractWorkflowNodes(workflowJson)
  const activeStages: ActiveStageInfo[] = []

  for (const stage of stages) {
    if (!stage || typeof stage !== 'object') continue
    if (stage.is_active === false) continue

    const isAlwaysVisible = Boolean(stage.is_builtin || stage.key?.toLowerCase() === 'main')
    const matchedNodeIdSet = new Set<string>()

    const patterns = (stagePatterns.get(stage.id) ?? [])
      .filter((p) => typeof p.pattern === 'string' && p.pattern.trim().length > 0)
      .map((p) => ({ pattern: p.pattern.trim().toLowerCase(), exact: p.match_type === 'exact' }))

    if (patterns.length > 0) {
      for (const node of nodes) {
        try {
          const text = (node.title.trim() || node.classType.trim()).toLowerCase()
          const isMatch = patterns.some((p) => (p.exact ? text === p.pattern : text.includes(p.pattern)))
          if (isMatch) {
            matchedNodeIdSet.add(node.id)
          }
        } catch {
          // ignore error in comparison
        }
      }
    }

    const matchedNodeIds = Array.from(matchedNodeIdSet)
    const matchingNodesCount = matchedNodeIds.length

    if (isAlwaysVisible || matchingNodesCount > 0) {
      activeStages.push({
        stage,
        matchingNodesCount,
        matchedNodeIds,
        isAlwaysVisible,
      })
    }
  }

  return activeStages
}
