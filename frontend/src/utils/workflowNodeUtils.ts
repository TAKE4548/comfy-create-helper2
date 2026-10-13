export interface ResolvedNodeMetadata {
  id: string
  title: string
  classType: string
}

export interface CandidateDefinition {
  expectedClassTypes: readonly string[]
  titlePatterns: readonly string[]
  paramNames: readonly string[]
}

export interface RankedNodeCandidate {
  id: string
  title: string
  classType: string
  tier: 0 | 1 | 2 | 3 | 4
  stageRank: 0 | 1 | 2
  /** Semantic suitability, not a statistical probability. Optional for legacy callers. */
  score?: number
  recommended: boolean
  reasons: readonly string[]
}

const normalizeCandidateText = (value: string): string =>
  value.replace(/[A-Z]/g, (char) => char.toLowerCase()).replace(/[\x09-\x0D\x20_-]/g, '')

const characterPairs = (text: string): Set<string> =>
  new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)))

const scoreBands = [[75, 100], [75, 100], [50, 74], [20, 49], [0, 19]] as const

/** Shared normalized character pairs retain partial affinity for e.g. Face/Hand Detailer. */
function stageAffinity(normalizedStage: string, normalizedTitle: string, stagePairs: ReadonlySet<string>, rank: RankedNodeCandidate['stageRank']): number {
  if (!normalizedStage || !normalizedTitle) return 0.2
  if (rank === 0) return 1
  const titlePairs = characterPairs(normalizedTitle)
  let shared = 0
  for (const pair of stagePairs) if (titlePairs.has(pair)) shared++
  const similarity = stagePairs.size + titlePairs.size ? 2 * shared / (stagePairs.size + titlePairs.size) : 0
  return Math.max(rank === 2 ? 0 : 0.2, Math.min(0.8, similarity * 0.8))
}

export function candidateSuitabilityScore(candidate: Pick<RankedNodeCandidate, 'tier' | 'stageRank' | 'score'>): number {
  if (candidate.score != null) return Math.round(Math.max(0, Math.min(100, candidate.score)))
  const [min, max] = scoreBands[candidate.tier]
  return Math.round(min + (max - min) * (candidate.stageRank === 0 ? 1 : candidate.stageRank === 2 ? 0 : 0.2))
}

/** Ranks every workflow node without changing the workflow data. */
export function rankWorkflowNodeCandidates(
  workflowJson: unknown,
  definition: CandidateDefinition,
  stageName: string,
  allStageNames: readonly string[]
): RankedNodeCandidate[] {
  if (!workflowJson || typeof workflowJson !== 'object') return []

  const root = workflowJson as Record<string, any>
  let entries: Array<[string, any]> = []
  const prompt = root.nodes && typeof root.nodes === 'object' && !Array.isArray(root.nodes)
    ? root.nodes
    : root
  if (Array.isArray(root.nodes)) {
    entries = root.nodes
      .filter((node: any) => node && typeof node === 'object' && node.id != null)
      .map((node: any) => [String(node.id), node])
  } else {
    entries = Object.entries(prompt).filter(([, node]) => node && typeof node === 'object')
  }

  const expectedClasses = new Set(definition.expectedClassTypes)
  const normalizedPatterns = definition.titlePatterns.map(normalizeCandidateText).filter(Boolean)
  const registeredStages = [...new Set(allStageNames.map(normalizeCandidateText).filter(Boolean))]
  const normalizedStage = normalizeCandidateText(stageName)
  const stagePairs = characterPairs(normalizedStage)
  return entries.map(([id, node]) => {
    const classType = String(node.class_type || node.type || '').trim()
    const rawTitle = String(node._meta?.title || node.title || '').trim()
    const normalizedRawTitle = normalizeCandidateText(rawTitle)
    const title = rawTitle || classType
    const classMatch = expectedClasses.has(classType)
    const exactTitle = !!rawTitle && definition.titlePatterns.includes(rawTitle)
    const normalizedTitle = !!rawTitle && normalizedPatterns.includes(normalizedRawTitle)
    const inputs = node.inputs
    const inputNames = Array.isArray(inputs)
      ? inputs.map((input: any) => input && typeof input.name === 'string' ? input.name : '')
      : inputs && typeof inputs === 'object' ? Object.keys(inputs) : []
    const paramMatch = definition.paramNames.some((name) => inputNames.includes(name))
    const tier: RankedNodeCandidate['tier'] = classMatch
      ? exactTitle ? 0 : normalizedTitle ? 1 : 2
      : paramMatch ? 3 : 4
    const stageRank: RankedNodeCandidate['stageRank'] = normalizedStage.length > 0 && normalizedRawTitle.includes(normalizedStage) ? 0
        : registeredStages.some((stage) => normalizedRawTitle.includes(stage)) ? 2 : 1
    const reasons = tier === 0 ? ['class-and-title-exact']
      : tier === 1 ? ['class-and-title-normalized']
        : tier === 2 ? ['class-match']
          : tier === 3 ? ['parameter-match'] : ['all-nodes']
    const [min, max] = scoreBands[tier]
    const score = Math.round(min + (max - min) * stageAffinity(normalizedStage, normalizedRawTitle, stagePairs, stageRank))
    return { id, title, classType, tier, stageRank, score, recommended: tier <= 1, reasons }
  }).sort((a, b) => Math.max(1, a.tier) - Math.max(1, b.tier) || b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Resolves title and classType for a node ID from a ComfyUI workflow JSON.
 * Supports both API Prompt dictionary format (workflowJson[id])
 * and UI Graph array format (workflowJson.nodes).
 */
export function resolveNodeMetadata(
  id: string,
  workflowJson?: Record<string, any> | null
): ResolvedNodeMetadata {
  if (!workflowJson || typeof workflowJson !== 'object') {
    return { id, title: '', classType: '' }
  }

  let rawNode: Record<string, any> | undefined = undefined

  if (workflowJson[id] && typeof workflowJson[id] === 'object') {
    rawNode = workflowJson[id]
  } else if (Array.isArray(workflowJson.nodes)) {
    rawNode = workflowJson.nodes.find(
      (n: any) => n && typeof n === 'object' && String(n.id) === String(id)
    )
  }

  if (!rawNode) {
    return { id, title: '', classType: '' }
  }

  const classType = String(rawNode.class_type || rawNode.type || '').trim()
  const customTitle = String(
    rawNode._meta?.title || rawNode.title || ''
  ).trim()

  const title = customTitle || classType || ''

  return { id, title, classType }
}

/**
 * Formats a standardized node candidate label:
 * `${id} - [${title}] (${classType})`
 * Falls back gracefully if title, classType, or workflowJson are missing.
 */
export function getNodeLabel(
  id: string,
  workflowJson?: Record<string, any> | null
): string {
  const meta = resolveNodeMetadata(id, workflowJson)
  if (!meta.title && !meta.classType) {
    return id
  }
  if (meta.title && meta.classType) {
    return `${id} - [${meta.title}] (${meta.classType})`
  }
  if (meta.title) {
    return `${id} - [${meta.title}]`
  }
  return `${id} - (${meta.classType})`
}
