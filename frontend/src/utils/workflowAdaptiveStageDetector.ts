import type { StageMaster } from '../api/types'

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

export function detectActiveStages(
  workflowJson: Record<string, any> | null | undefined,
  stages: StageMaster[]
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

    const rawKeywords = Array.isArray(stage.search_keywords) ? stage.search_keywords : []
    const validKeywords = rawKeywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim().toLowerCase())

    if (validKeywords.length > 0) {
      for (const node of nodes) {
        try {
          const tLower = node.title.toLowerCase()
          const cLower = node.classType.toLowerCase()
          const isMatch = validKeywords.some((kw) => tLower.includes(kw) || cLower.includes(kw))
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
