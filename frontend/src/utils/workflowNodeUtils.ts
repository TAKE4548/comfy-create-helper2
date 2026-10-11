export interface ResolvedNodeMetadata {
  id: string
  title: string
  classType: string
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
